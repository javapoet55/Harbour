import * as Notifications from 'expo-notifications';

import type { NexdoTask } from '../api/types';
import { NOTIFICATION_ID_PREFIX } from '../lib/taskAction';
import { useCoordinator, scheduledWork, DEFAULT_SNOOZE_MS } from './coordinator';
import { ACTION_NOTICES } from './errors';
import { readActions } from './persistence';

const mockedNotifications = Notifications as unknown as Record<string, jest.Mock>;
const fileStore = (jest.requireMock('expo-file-system') as { __store: Map<string, string> }).__store;

const ZONE = 'America/Los_Angeles';
const OWNER = 'user-1';
/** The global `expo-crypto` mock answers every digest with "digest". */
const OWNER_KEY = 'digest';

function task(overrides: Partial<NexdoTask> & { id: string }): NexdoTask {
  return {
    title: 'Contact Damien at 10 AM',
    status: 'PLANNED',
    priority: 'NORMAL',
    durationMin: 30,
    startAt: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides,
  };
}

async function settle() {
  await scheduledWork();
  await Promise.resolve();
}

beforeEach(async () => {
  fileStore.clear();
  for (const value of Object.values(mockedNotifications)) if (typeof value?.mockClear === 'function') value.mockClear();
  mockedNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  mockedNotifications.getPresentedNotificationsAsync.mockResolvedValue([]);
  mockedNotifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
  mockedNotifications.scheduleNotificationAsync.mockResolvedValue('ok');
  useCoordinator.getState().reset();
});

/** `synchronize(tasks:userID:)` (ios/App/TaskActionCoordinator.swift:62-72). */
describe('synchronize', () => {
  it('builds one action per contact-shaped task and schedules its reminder', async () => {
    await useCoordinator.getState().synchronize([task({ id: 't1' }), task({ id: 't2', title: 'Buy groceries' })], OWNER, ZONE);
    await settle();

    const state = useCoordinator.getState();
    expect(state.actions).toHaveLength(1);
    expect(state.actions[0]).toMatchObject({ taskId: 't1', contactName: 'Damien' });
    expect(mockedNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    // Everything that was scheduled moves pending → scheduled (TaskActionCoordinator.swift:146-148).
    expect(useCoordinator.getState().actions[0].status).toBe('scheduled');
  });

  it('never keeps two actions for one task', async () => {
    await useCoordinator.getState().synchronize([task({ id: 't1' })], OWNER, ZONE);
    await settle();
    await useCoordinator.getState().synchronize([task({ id: 't1' })], OWNER, ZONE);
    await settle();

    expect(useCoordinator.getState().actions).toHaveLength(1);
  });

  it('drops the action, and its reminder, when the task is completed', async () => {
    await useCoordinator.getState().synchronize([task({ id: 't1' })], OWNER, ZONE);
    await settle();
    const id = useCoordinator.getState().actions[0].id;
    // The reminder scheduled above is now pending on the device.
    mockedNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([{ identifier: `${NOTIFICATION_ID_PREFIX}${id}` }]);

    await useCoordinator.getState().synchronize([task({ id: 't1', status: 'COMPLETED' })], OWNER, ZONE);
    await settle();

    expect(useCoordinator.getState().actions).toEqual([]);
    expect(mockedNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(`${NOTIFICATION_ID_PREFIX}${id}`);
  });
});

/** `persist()` / `activate(userID:)` (TaskActionCoordinator.swift:46-61, `:126-138`). */
describe('persistence', () => {
  it('round-trips the actions through the per-account file', async () => {
    await useCoordinator.getState().synchronize([task({ id: 't1' })], OWNER, ZONE);
    await settle();
    const saved = useCoordinator.getState().actions;

    expect(await readActions(OWNER_KEY)).toEqual(saved);

    // A relaunch: a fresh store activates and reads the same file back.
    useCoordinator.getState().reset();
    await useCoordinator.getState().activate(OWNER);
    await settle();

    expect(useCoordinator.getState().actions).toEqual(saved);
  });

  /** "A process cannot know whether an interrupted call or composer sent anything." (`:54-56`). */
  it('drops an interrupted executing or approved action back to awaiting approval', async () => {
    await useCoordinator.getState().synchronize([task({ id: 't1' })], OWNER, ZONE);
    await settle();
    const id = useCoordinator.getState().actions[0].id;
    useCoordinator.getState().transitionTo(id, 'awaitingApproval');
    expect(useCoordinator.getState().approveExecution(id)).toBe(true);
    expect(useCoordinator.getState().actions[0].status).toBe('executing');
    await settle();

    useCoordinator.getState().reset();
    await useCoordinator.getState().activate(OWNER);
    await settle();

    expect(useCoordinator.getState().actions[0].status).toBe('awaitingApproval');
  });

  /**
   * `activate` sets the "couldn't be read" notice (TaskActionCoordinator.swift:52) and then calls
   * `queueSchedule()`, whose successful pass clears every notice (`:145`). So in Swift too the
   * message survives only until the next scheduling pass finishes — which, with no actions to
   * schedule, is immediately. What must NOT happen is a half-read file being treated as real data.
   */
  it('does not treat an unreadable file as data', async () => {
    fileStore.set(`document/TaskActions/${OWNER_KEY}.json`, 'not json at all');

    expect(await readActions(OWNER_KEY).then(() => 'resolved').catch(() => 'threw')).toBe('threw');

    await useCoordinator.getState().activate(OWNER);
    expect(useCoordinator.getState().notice).toBe(ACTION_NOTICES.unreadable);

    await settle();
    expect(useCoordinator.getState().actions).toEqual([]);
  });

  it('starts empty and quiet when nothing has been saved', async () => {
    await useCoordinator.getState().activate(OWNER);
    await settle();

    expect(useCoordinator.getState().actions).toEqual([]);
    expect(useCoordinator.getState().notice).toBeNull();
  });
});

/** `approveExecution(_:)` (TaskActionCoordinator.swift:95-102). */
describe('approval', () => {
  it('refuses to execute an action that has not been opened for approval', async () => {
    await useCoordinator.getState().synchronize([task({ id: 't1' })], OWNER, ZONE);
    await settle();
    const id = useCoordinator.getState().actions[0].id;

    expect(useCoordinator.getState().approveExecution(id)).toBe(false);
    expect(useCoordinator.getState().actions[0].status).toBe('scheduled');
  });

  it('executes once the action is awaiting approval', async () => {
    await useCoordinator.getState().synchronize([task({ id: 't1' })], OWNER, ZONE);
    await settle();
    const id = useCoordinator.getState().actions[0].id;
    useCoordinator.getState().open(id);

    expect(useCoordinator.getState().approveExecution(id)).toBe(true);
    expect(useCoordinator.getState().actions[0].status).toBe('executing');
    expect(useCoordinator.getState().actions[0].executedAt).toBeGreaterThan(0);
  });
});

/** `snooze` and `dismiss` (TaskActionCoordinator.swift:103-117). */
describe('deferral', () => {
  it('defaults to fifteen minutes and clears the route', async () => {
    await useCoordinator.getState().synchronize([task({ id: 't1' })], OWNER, ZONE);
    await settle();
    const id = useCoordinator.getState().actions[0].id;
    useCoordinator.getState().open(id);
    expect(useCoordinator.getState().route).not.toBeNull();

    const before = Date.now();
    useCoordinator.getState().snooze(id);
    await settle();

    const snoozed = useCoordinator.getState().actions[0];
    expect(snoozed.snoozedUntil).toBeGreaterThanOrEqual(before + DEFAULT_SNOOZE_MS);
    expect(snoozed.status).toBe('scheduled');
    expect(useCoordinator.getState().route).toBeNull();
  });

  it('reschedules the reminder for the snoozed time', async () => {
    await useCoordinator.getState().synchronize([task({ id: 't1' })], OWNER, ZONE);
    await settle();
    const id = useCoordinator.getState().actions[0].id;
    mockedNotifications.scheduleNotificationAsync.mockClear();
    const until = Date.now() + 1_800_000;

    useCoordinator.getState().snooze(id, until);
    await settle();

    const request = mockedNotifications.scheduleNotificationAsync.mock.calls.at(-1)?.[0];
    expect(request.identifier).toBe(`${NOTIFICATION_ID_PREFIX}${id}`);
    expect(request.trigger.date).toEqual(new Date(until));
  });

  it('refuses a snooze into the past', async () => {
    await useCoordinator.getState().synchronize([task({ id: 't1' })], OWNER, ZONE);
    await settle();
    const id = useCoordinator.getState().actions[0].id;

    useCoordinator.getState().snooze(id, Date.now() - 1000);

    expect(useCoordinator.getState().actions[0].snoozedUntil).toBeNull();
  });

  it('dismissing cancels the action and clears the route', async () => {
    await useCoordinator.getState().synchronize([task({ id: 't1' })], OWNER, ZONE);
    await settle();
    const id = useCoordinator.getState().actions[0].id;
    useCoordinator.getState().open(id);

    useCoordinator.getState().dismiss(id);
    await settle();

    expect(useCoordinator.getState().actions[0].status).toBe('cancelled');
    expect(useCoordinator.getState().route).toBeNull();
  });
});

/** `receive(actionID:owner:choice:)` (TaskActionCoordinator.swift:80-90). */
describe('a notification response', () => {
  async function seeded() {
    await useCoordinator.getState().synchronize([task({ id: 't1' })], OWNER, ZONE);
    await settle();
    return useCoordinator.getState().actions[0].id;
  }

  it.each([
    ['CALL', 'call'],
    ['MESSAGE', 'message'],
    ['EMAIL', 'email'],
  ])('%s opens the action with that channel preselected', async (choice, channel) => {
    const id = await seeded();

    useCoordinator.getState().receive({ actionID: id, owner: OWNER_KEY, choice });

    expect(useCoordinator.getState().route).toEqual({ id, preferred: channel });
    expect(useCoordinator.getState().actions[0].status).toBe('awaitingApproval');
  });

  /** "Snooze from a notification still opens the authenticated action screen." (`:88`). */
  it('REMIND_LATER snoozes fifteen minutes AND clears the route', async () => {
    const id = await seeded();

    useCoordinator.getState().receive({ actionID: id, owner: OWNER_KEY, choice: 'REMIND_LATER' });
    await settle();

    expect(useCoordinator.getState().actions[0].snoozedUntil).toBeGreaterThan(Date.now());
    expect(useCoordinator.getState().route).toBeNull();
  });

  it('a body tap opens the action with no channel chosen', async () => {
    const id = await seeded();

    useCoordinator.getState().receive({ actionID: id, owner: OWNER_KEY, choice: 'expo.modules.notifications.actions.DEFAULT' });

    expect(useCoordinator.getState().route).toEqual({ id, preferred: null });
  });

  it('a dismissal cancels the action and opens nothing', async () => {
    const id = await seeded();

    useCoordinator.getState().receive({ actionID: id, owner: OWNER_KEY, choice: 'com.apple.UNNotificationDismissActionIdentifier' });
    await settle();

    expect(useCoordinator.getState().actions[0].status).toBe('cancelled');
    expect(useCoordinator.getState().route).toBeNull();
  });

  /** A COLD START: the response arrives before the account's actions are loaded (`:76-79`). */
  it('holds a response for an unknown action and replays it once the tasks arrive', async () => {
    useCoordinator.getState().receive({ actionID: 'not-loaded-yet', owner: OWNER_KEY, choice: 'CALL' });
    expect(useCoordinator.getState().route).toBeNull();
    expect(useCoordinator.getState().pending).toEqual({ id: 'not-loaded-yet', owner: OWNER_KEY, choice: 'CALL' });

    // The id the reconciler generates is the mocked UUID, so the held response now matches.
    await useCoordinator.getState().synchronize([task({ id: 't1' })], OWNER, ZONE);
    await settle();
    const id = useCoordinator.getState().actions[0].id;
    useCoordinator.getState().receive({ actionID: id, owner: OWNER_KEY, choice: 'CALL' });

    expect(useCoordinator.getState().route).toEqual({ id, preferred: 'call' });
  });

  it('ignores a response addressed to a different account', async () => {
    const id = await seeded();

    useCoordinator.getState().receive({ actionID: id, owner: 'someone-else', choice: 'CALL' });

    expect(useCoordinator.getState().route).toBeNull();
  });
});

/** The failure path in `queueSchedule()` (TaskActionCoordinator.swift:155). */
it('surfaces a notification failure as a notice instead of throwing', async () => {
  mockedNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });

  await useCoordinator.getState().synchronize([task({ id: 't1' })], OWNER, ZONE);
  await settle();

  expect(useCoordinator.getState().notice).toMatch(/Enable notifications for Nexdo in Settings/);
  // The action itself still exists; only its reminder is missing.
  expect(useCoordinator.getState().actions).toHaveLength(1);
});

/** `activate(userID:)` on sign-out (TaskActionCoordinator.swift:49). */
it('clears everything when the account goes away', async () => {
  await useCoordinator.getState().synchronize([task({ id: 't1' })], OWNER, ZONE);
  await settle();

  await useCoordinator.getState().activate(null);
  await settle();

  expect(useCoordinator.getState()).toMatchObject({ owner: null, actions: [], route: null, notice: null });
});
