import * as Notifications from 'expo-notifications';

import { Alert, Platform } from 'react-native';

import { desiredNotifications, NOTIFICATION_ID_PREFIX, type StoredTaskAction } from '../lib/taskAction';
import {
  ACTION_BUTTONS,
  ACTION_CATEGORY,
  ensureNotificationPermission,
  FOREGROUND_PRESENTATION,
  readActionPayload,
  registerActionCategory,
  replaceScheduledNotifications,
} from './notifications';

const mocked = Notifications as unknown as Record<string, jest.Mock>;

function action(overrides: Partial<StoredTaskAction> = {}): StoredTaskAction {
  return {
    id: 'a1',
    taskId: 't1',
    type: 'contact',
    contactName: 'Damien',
    preferredAction: null,
    status: 'pending',
    scheduledAt: Date.now() + 3_600_000,
    snoozedUntil: null,
    contactIdentifier: null,
    context: null,
    sourceTitle: 'Contact Damien at 10 AM',
    executedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  for (const value of Object.values(mocked)) if (typeof value?.mockClear === 'function') value.mockClear();
  mocked.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  mocked.getPresentedNotificationsAsync.mockResolvedValue([]);
  mocked.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
});

/**
 * The category and its four buttons (ios/App/TaskActionNotifications.swift:7, `:47-57`).
 *
 * These identifiers are a contract with the notification itself: `receive(actionID:owner:choice:)`
 * lowercases the identifier and matches it against `TaskActionChannel`, so renaming one would
 * silently stop that button choosing a channel.
 */
describe('the notification category', () => {
  it('uses Swift’s identifier and its four buttons, in order', async () => {
    await registerActionCategory();

    expect(ACTION_CATEGORY).toBe('CONTACT_TASK');
    expect(ACTION_BUTTONS.map((button) => button.identifier)).toEqual(['CALL', 'MESSAGE', 'EMAIL', 'REMIND_LATER']);
    expect(ACTION_BUTTONS.map((button) => button.title)).toEqual(['Call', 'Message', 'Email', 'Remind me later']);

    const [identifier, actions, options] = mocked.setNotificationCategoryAsync.mock.calls[0];
    expect(identifier).toBe('CONTACT_TASK');
    // `[.foreground, .authenticationRequired]` on every one.
    expect(actions).toEqual(
      ACTION_BUTTONS.map((button) => ({
        identifier: button.identifier,
        buttonTitle: button.title,
        options: { opensAppToForeground: true },
      })),
    );
    // `options: [.customDismissAction]`
    expect(options).toEqual({ customDismissAction: true });
  });

  /** `willPresent` returns `[.banner, .list, .sound]` (TaskActionNotifications.swift:63). */
  it('shows a reminder that fires while the app is open, with sound and no badge', () => {
    expect(FOREGROUND_PRESENTATION).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });
});

/**
 * There is NO device-token registration to test, on either side.
 *
 * The Swift app never calls `registerForRemoteNotifications` and posts no token anywhere, and the
 * server's only push path is Web Push over VAPID (`src/app/api/push-subscriptions/route.ts`), which
 * takes a browser `PushSubscription`, not an APNs or FCM token. So this module registers nothing.
 */
it('exports no token-registration function', () => {
  const module = jest.requireActual('./notifications') as Record<string, unknown>;
  expect(Object.keys(module).filter((key) => /token|register(Device|Push)/i.test(key))).toEqual([]);
});

/** The permission moment (TaskActionNotifications.swift:20-25). */
describe('permission', () => {
  it('asks only when the status is still undetermined', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    mocked.requestPermissionsAsync.mockResolvedValue({ granted: true });

    await ensureNotificationPermission();

    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('does not re-ask an app that is already allowed', async () => {
    await ensureNotificationPermission();
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('throws Swift’s message when permission is refused and cannot be asked again', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });

    await expect(ensureNotificationPermission()).rejects.toThrow(/Enable notifications for Nexdo in Settings/);
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

/** `replace(with:actions:owner:)` (TaskActionNotifications.swift:9-38). */
describe('replacing the scheduled set', () => {
  it('cancels only the identifiers it owns', async () => {
    mocked.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: `${NOTIFICATION_ID_PREFIX}old` },
      { identifier: 'someone.elses.notification' },
    ]);

    await replaceScheduledNotifications({ notifications: [], actions: [], owner: 'owner-1' });

    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith(`${NOTIFICATION_ID_PREFIX}old`);
  });

  it('clears a delivered reminder whose action is no longer live', async () => {
    mocked.getPresentedNotificationsAsync.mockResolvedValue([
      { request: { identifier: `${NOTIFICATION_ID_PREFIX}gone` } },
      { request: { identifier: `${NOTIFICATION_ID_PREFIX}a1` } },
      { request: { identifier: 'other' } },
    ]);

    await replaceScheduledNotifications({ notifications: [], actions: [action()], owner: 'owner-1' });

    expect(mocked.dismissNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mocked.dismissNotificationAsync).toHaveBeenCalledWith(`${NOTIFICATION_ID_PREFIX}gone`);
  });

  it('asks for nothing and schedules nothing when the plan is empty', async () => {
    await replaceScheduledNotifications({ notifications: [], actions: [action()], owner: 'owner-1' });

    expect(mocked.getPermissionsAsync).not.toHaveBeenCalled();
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules with Swift’s exact content, category and payload', async () => {
    const fireAt = Date.now() + 3_600_000;

    await replaceScheduledNotifications({
      notifications: [{ id: `${NOTIFICATION_ID_PREFIX}a1`, actionId: 'a1', taskId: 't1', fireAt }],
      actions: [action()],
      owner: 'owner-1',
    });

    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: `${NOTIFICATION_ID_PREFIX}a1`,
      content: {
        title: 'Time to contact Damien',
        body: 'Choose Call, Message, Email, or remind me later.',
        categoryIdentifier: 'CONTACT_TASK',
        // `true`, not `'default'`: the system default on both platforms, and on iOS the very same
        // `UNNotificationSound.default` the string mapped to. Android takes its sound from the channel.
        sound: true,
        data: { actionID: 'a1', owner: 'owner-1' },
      },
      trigger: { type: 'date', date: new Date(fireAt) },
    });
  });

  it('skips a notification whose action has disappeared', async () => {
    await replaceScheduledNotifications({
      notifications: [{ id: `${NOTIFICATION_ID_PREFIX}ghost`, actionId: 'ghost', taskId: 't9', fireAt: Date.now() + 1000 }],
      actions: [action()],
      owner: 'owner-1',
    });

    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

/** `content.userInfo = ["actionID": …, "owner": …]` (TaskActionNotifications.swift:32). */
describe('reading the payload back', () => {
  it('accepts a well-formed payload', () => {
    expect(readActionPayload({ actionID: 'a1', owner: 'o1' })).toEqual({ actionID: 'a1', owner: 'o1' });
  });

  it.each([null, undefined, 'string', {}, { actionID: 'a1' }, { owner: 'o1' }, { actionID: 1, owner: 'o1' }])(
    'refuses %j',
    (data) => {
      expect(readActionPayload(data)).toBeNull();
    },
  );
});

/**
 * "Remind me in 15 minutes" on a task with no schedule (the Redmi report): the snooze is the only date,
 * and it must still become a DATE trigger on the reminders channel. The dev-only Metro log says what
 * was scheduled or skipped and why, with no task or contact detail.
 */
describe('reminder scheduling log (dev only)', () => {
  let lines: string[] = [];
  beforeEach(() => {
    lines = [];
    jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });
    jest.replaceProperty(Platform, 'OS', 'android');
    // Android reads `status`, not `granted` (notificationPermission.ts).
    mocked.getPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted', canAskAgain: true });
  });
  afterEach(() => jest.restoreAllMocks());

  it('schedules a snoozed action that has no schedule, and logs it and what the system holds', async () => {
    const fireAt = Date.now() + 15 * 60_000;
    const snoozed = action({ id: 'abcdef12-3456', scheduledAt: null, snoozedUntil: fireAt, status: 'scheduled', contactName: 'the plumber' });
    mocked.getAllScheduledNotificationsAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ identifier: `${NOTIFICATION_ID_PREFIX}abcdef12-3456`, content: {}, trigger: { type: 'date', value: fireAt, channelId: 'reminders' } }]);
    await replaceScheduledNotifications({ notifications: desiredNotifications([snoozed], Date.now()), actions: [snoozed], owner: 'o' });

    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: `${NOTIFICATION_ID_PREFIX}abcdef12-3456`, trigger: expect.objectContaining({ type: 'date', date: new Date(fireAt), channelId: 'reminders' }) }),
    );
    expect(lines[0]).toBe(`[reminders] scheduled action abcdef12 at ${new Date(fireAt).toISOString()} (in 15 min)`);
    expect(lines[1]).toBe(`[reminders] after task-action scheduling: 1 pending\n  nexdo.action.abcdef12… → date ${new Date(fireAt).toISOString()} channel=reminders`);
    expect(lines.join('\n')).not.toMatch(/plumber|Contact|Damien/);
  });

  it('logs why an action gets no reminder, and asks for nothing', async () => {
    const unscheduled = action({ id: 'noplan00-1', scheduledAt: null, snoozedUntil: null });
    const past = action({ id: 'passed00-1', scheduledAt: Date.now() - 60_000 });
    await replaceScheduledNotifications({ notifications: [], actions: [unscheduled, past], owner: 'o' });
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(lines[0]).toBe('[reminders] skipped action noplan00: no schedule and no snooze');
    expect(lines[1]).toMatch(/^\[reminders\] skipped action passed00: reminder time has passed at .+ \(1 min ago\)$/);
    expect(lines[2]).toBe('[reminders] after task-action scheduling: 0 pending');
  });

  it('logs each reminder skipped when notifications are not allowed', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied', canAskAgain: false });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const pending = action({ id: 'denied00-1' });
    await expect(replaceScheduledNotifications({ notifications: desiredNotifications([pending], Date.now()), actions: [pending], owner: 'o' })).rejects.toThrow();
    expect(alert).toHaveBeenCalled();
    expect(lines.some((line) => line.startsWith('[reminders] skipped action denied00: notifications are not allowed at '))).toBe(true);
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('logs nothing outside development builds', async () => {
    const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    try {
      const pending = action({ id: 'release0-1' });
      await replaceScheduledNotifications({ notifications: desiredNotifications([pending], Date.now()), actions: [pending], owner: 'o' });
      expect(mocked.scheduleNotificationAsync).toHaveBeenCalled();
      expect(lines).toEqual([]);
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
    }
  });
});
