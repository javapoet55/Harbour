import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';
import { palettes } from '../theme';

import type { NexdoTask } from '../api';
import { useCoordinator, scheduledWork } from '../actions/coordinator';
import { TaskActionError } from '../actions/errors';
import { addDays, startOfDay } from '../lib/taskQuery';
import { queryKeys } from '../query/keys';
import { useSession } from '../store/session';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  useFocusEffect: jest.fn(),
}));

// The coordinator persists to disk, so the saved file has to go between tests: a cancelled action
// left behind by an earlier test would be RESTORED by `activate` and then kept by `reconcile`,
// which is correct behaviour and would quietly empty the queue here.
const fileStore = (jest.requireMock('expo-file-system') as { __store: Map<string, string> }).__store;

const mockResolve = jest.fn();
jest.mock('../actions/contacts', () => ({
  ...jest.requireActual('../actions/contacts'),
  resolveContacts: (...args: unknown[]) => mockResolve(...args),
}));

// The task's business research (`model.loadTaskAgent`); nothing here reaches a server.
const mockAgent = jest.fn();
jest.mock('../api/taskAgent', () => ({ taskAgentApi: { load: (...args: unknown[]) => mockAgent(...args), update: jest.fn() } }));

// The system contact picker.
const mockPick = jest.fn();
jest.mock('../features/moments/device', () => ({ pickContact: (...args: unknown[]) => mockPick(...args) }));

const mockTasks = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: { tasks: (...args: unknown[]) => mockTasks(...args) },
}));

import TaskActionScreen from '../../app/action/[id]';
import ActionQueue from '../../app/action/queue';
import { handleNotificationResponse } from '../actions/useActionNotifications';

const ZONE = 'America/Los_Angeles';
const OWNER = 'user-1';
const OWNER_KEY = 'digest';

/**
 * A time that is always in the future AND always still "today" in the account zone.
 *
 * `buildActionQueue` only covers the rest of today, so a fixture at a fixed offset (say now + 1h)
 * silently leaves the queue whenever the suite runs within that offset of local midnight. Halving
 * the remaining day removes the dependency on the wall clock.
 */
function laterToday(zone: string): string {
  const now = Date.now();
  const endOfDay = addDays(startOfDay(now, zone), 1, zone);
  return new Date(now + Math.min(3_600_000, (endOfDay - now) / 2)).toISOString();
}

function task(overrides: Partial<NexdoTask> & { id: string }): NexdoTask {
  return {
    title: 'Contact Damien at 10 AM',
    status: 'PLANNED',
    priority: 'NORMAL',
    durationMin: 30,
    startAt: laterToday(ZONE),
    ...overrides,
  };
}

const TASKS = [task({ id: 't1' })];

function show(node: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  queryClient.setQueryData(queryKeys.tasks.all(), { tasks: TASKS, timeZone: ZONE });
  queryClient.setQueryData(queryKeys.me(), { id: OWNER, name: 'Ada', email: 'a@b.c', timeZone: ZONE });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

async function seedAction() {
  useCoordinator.getState().reset();
  await useCoordinator.getState().synchronize(TASKS, OWNER, ZONE);
  await scheduledWork();
  return useCoordinator.getState().actions[0].id;
}

beforeEach(() => {
  mockParams = {};
  fileStore.clear();
  jest.clearAllMocks();
  mockTasks.mockResolvedValue({ tasks: TASKS, timeZone: ZONE });
  (Notifications as unknown as Record<string, jest.Mock>).getAllScheduledNotificationsAsync.mockResolvedValue([]);
  (Notifications as unknown as Record<string, jest.Mock>).getPresentedNotificationsAsync.mockResolvedValue([]);
  (Notifications as unknown as Record<string, jest.Mock>).getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
  useSession.setState({ status: 'signedIn', profile: { id: OWNER, name: 'Ada', email: 'a@b.c', timeZone: ZONE } });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined).mockClear();
  mockAgent.mockResolvedValue({ run: null, intent: { eligible: false } });
  mockResolve.mockResolvedValue([]);
  mockPick.mockResolvedValue(null);
});

/**
 * Routing from a notification payload to the right screen and task
 * (ios/App/TaskActionNotifications.swift:65-72 → TaskActionCoordinator.receive → RootView.swift:60).
 */
describe('a notification response routes to the action', () => {
  it.each([
    ['CALL', 'call'],
    ['MESSAGE', 'message'],
    ['EMAIL', 'email'],
  ])('%s opens that action with the channel preselected', async (identifier, channel) => {
    const id = await seedAction();

    handleNotificationResponse({
      actionIdentifier: identifier,
      notification: { request: { content: { data: { actionID: id, owner: OWNER_KEY } } } },
    } as never);

    expect(useCoordinator.getState().route).toEqual({ id, preferred: channel });
  });

  /** A COLD START: the payload arrives before the account's actions exist. */
  it('holds a payload for an action that has not loaded, then replays it', async () => {
    useCoordinator.getState().reset();

    handleNotificationResponse({
      actionIdentifier: 'CALL',
      notification: { request: { content: { data: { actionID: 'unknown', owner: OWNER_KEY } } } },
    } as never);

    expect(useCoordinator.getState().route).toBeNull();
    expect(useCoordinator.getState().pending).toMatchObject({ id: 'unknown', choice: 'CALL' });
  });

  it('ignores a notification that carries no action payload', async () => {
    await seedAction();

    handleNotificationResponse({
      actionIdentifier: 'CALL',
      notification: { request: { content: { data: { something: 'else' } } } },
    } as never);

    expect(useCoordinator.getState().route).toBeNull();
  });
});

/** `TaskActionView` body (ios/App/TaskActionView.swift:146-302). */
describe('the action screen', () => {
  const DAMIEN = { id: 'c1', name: 'Damien Hall', phones: [{ id: 'p1', label: 'mobile', value: '+15551234567' }], emails: [] };
  const run = (candidates: object[]) => ({
    id: 'r1', status: 'READY_FOR_REVIEW', version: 2, service: 'plumber', urgency: 'normal',
    slots: { location: '94582', budget: '', constraints: '' }, steps: [], candidates, warnings: [], question: null, error: null,
  });
  const ACE = { id: 'place-1', name: 'Ace Plumbing', address: '1 Main St', phone: '+15550001111', reason: '', draft: 'Hello there,\n\nI’m looking for a plumber.', evidence: [] };

  async function open(params: Record<string, string> = {}) {
    const id = await seedAction();
    mockParams = { id, ...params };
    await show(<TaskActionScreen />);
    return id;
  }

  it('finds the one matching person and offers only what they can take', async () => {
    mockResolve.mockResolvedValue([DAMIEN]);
    await open();

    await waitFor(() => expect(screen.getByTestId('action-title')).toHaveTextContent('Contact Damien Hall'));
    expect(screen.getByText('Nexdo Action')).toBeTruthy();
    expect(screen.getByText('Choose how to contact Damien Hall.')).toBeTruthy();
    expect(screen.getByTestId('action-call')).toBeTruthy();
    expect(screen.getByTestId('action-message')).toBeTruthy();
    expect(screen.queryByTestId('action-email')).toBeNull();
    expect(screen.getByText('Choose contact')).toBeTruthy();
    expect(screen.getByText('Enter contact details')).toBeTruthy();
    // A plain Button under `.foregroundStyle(Color.nexdoInk)` (TaskActionView.swift:239): ink, not the tint.
    expect(StyleSheet.flatten(screen.getByText('Enter contact details').props.style).color).toBe(palettes.light.ink);
    expect(screen.getByText('Remind me in 15 minutes')).toBeTruthy();
    expect(screen.getByText('Dismiss')).toBeTruthy();
    expect(useCoordinator.getState().actions[0].contactIdentifier).toBe('c1');
    // "the plumber" is searched without its article; Damien has none.
    expect(mockResolve).toHaveBeenCalledWith(expect.objectContaining({ name: 'Damien' }));
  });

  /** A guard against inventing controls Swift does not have on this screen. */
  it('has nothing Swift keeps elsewhere', async () => {
    await open();
    await waitFor(() => expect(screen.queryByTestId('action-checking')).toBeNull());

    expect(screen.queryByText('How would you like to get in touch?')).toBeNull();
    expect(screen.queryByText('Mark task complete')).toBeNull();
    expect(screen.queryByText('Choose a different contact')).toBeNull();
    expect(screen.queryByText(/Snooze until/)).toBeNull();
    expect(screen.queryByText('Delete')).toBeNull();
  });

  it('says "No contact selected" and offers no channel when nobody matches', async () => {
    mockResolve.mockRejectedValue(new TaskActionError('noContact'));
    await open();

    await waitFor(() => expect(screen.getByTestId('action-error')).toHaveTextContent('No contact selected. Choose a contact or enter details below.'));
    expect(screen.getByTestId('action-title')).toHaveTextContent('Contact Damien');
    expect(screen.getByText('Choose a contact or enter a phone number or email address.')).toBeTruthy();
    expect(screen.queryByTestId('action-call')).toBeNull();
    expect(screen.queryByTestId('action-email')).toBeNull();
  });

  it('tells a refused Contacts access and a failed lookup apart from "no contact", above the buttons', async () => {
    mockResolve.mockRejectedValue(new TaskActionError('contactsDenied'));
    await open();
    await waitFor(() => expect(screen.getByTestId('action-error')).toHaveTextContent('Allow Nexdo to access Contacts in Settings, then try again.'));
    // The message says "below", so it sits above Choose contact and Enter contact details.
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('"action-error"')).toBeLessThan(tree.indexOf('"action-pick-contact"'));
    expect(tree.indexOf('"action-error"')).toBeLessThan(tree.indexOf('"action-enter-details"'));
  });

  it('says a lookup failed when Contacts could not be searched', async () => {
    mockResolve.mockRejectedValue(new Error('Contacts store unavailable'));
    await open();
    await waitFor(() => expect(screen.getByTestId('action-error')).toHaveTextContent('Couldn’t look up this contact. Choose a contact or enter details below.'));
  });

  it('asks which person when the name matches more than one, then waits for a channel', async () => {
    mockResolve.mockResolvedValue([DAMIEN, { id: 'c2', name: 'Damien Ross', phones: [], emails: [{ id: 'e1', label: 'work', value: 'd@r.co' }] }]);
    await open();

    await waitFor(() => expect(screen.getByText('Choose the correct contact')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('action-contact-c2'));

    expect(screen.getByText('Choose how to contact Damien Ross.')).toBeTruthy();
    expect(screen.getByTestId('action-email')).toBeTruthy();
    expect(screen.queryByTestId('action-call')).toBeNull();
    expect(useCoordinator.getState().actions[0].contactIdentifier).toBe('c2');
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('confirms before calling the only phone number', async () => {
    mockResolve.mockResolvedValue([DAMIEN]);
    await open();
    await waitFor(() => expect(screen.getByTestId('action-call')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('action-call'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Call Damien Hall?', '+15551234567', expect.any(Array)));
  });

  it('goes straight to the preferred channel when opened from a reminder button', async () => {
    mockResolve.mockResolvedValue([DAMIEN]);
    await open({ preferred: 'call', start: '1' });

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Call Damien Hall?', '+15551234567', expect.any(Array)));
  });

  it('asks for a retry when the task cannot be checked', async () => {
    mockAgent.mockRejectedValueOnce(new Error('offline'));
    await open();

    await waitFor(() => expect(screen.getByText('Couldn’t check this task. Please retry.')).toBeTruthy());
    expect(screen.queryByText('Choose contact')).toBeNull();

    mockResolve.mockResolvedValue([DAMIEN]);
    await fireEvent.press(screen.getByTestId('action-retry'));
    await waitFor(() => expect(screen.getByText('Choose how to contact Damien Hall.')).toBeTruthy());
  });

  it('offline, a personal task found in Contacts carries on without the business check', async () => {
    mockAgent.mockRejectedValueOnce(new Error('offline'));
    mockResolve.mockResolvedValue([DAMIEN]);
    await open();
    await waitFor(() => expect(screen.getByText('Choose how to contact Damien Hall.')).toBeTruthy());
    expect(screen.queryByText('Couldn’t check this task. Please retry.')).toBeNull();
    expect(screen.getByTestId('action-call')).toBeTruthy();
  });

  it('offline, a task with a chosen business still asks for a retry', async () => {
    const id = await seedAction();
    useCoordinator.getState().update(id, (item) => ({ ...item, businessCandidateID: 'place-1' }));
    mockAgent.mockRejectedValueOnce(new Error('offline'));
    mockResolve.mockResolvedValue([DAMIEN]);
    mockParams = { id };
    await show(<TaskActionScreen />);
    await waitFor(() => expect(screen.getByText('Couldn’t check this task. Please retry.')).toBeTruthy());
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('sends a business task to Task Details to choose a business', async () => {
    mockAgent.mockResolvedValue({ run: run([ACE]), intent: { eligible: true } });
    await open();

    await waitFor(() => expect(screen.getByText('Choose a business before calling or sending a message.')).toBeTruthy());
    expect(screen.queryByTestId('action-call')).toBeNull();
    expect(screen.queryByText('Enter contact details')).toBeNull();
    expect(screen.queryByText('Change business')).toBeNull();
    expect(screen.getByText('Choose someone from Contacts')).toBeTruthy();
    expect(mockResolve).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Choose a business'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/task/[id]', params: { id: 't1' } });
  });

  it('offers "Find businesses" before any search has run', async () => {
    mockAgent.mockResolvedValue({ run: null, intent: { eligible: true } });
    await open();

    await waitFor(() => expect(screen.getByText('Find businesses')).toBeTruthy());
  });

  it('texts the chosen business its outreach draft, through the composer only', async () => {
    const SMS = jest.requireMock('expo-sms') as { sendSMSAsync: jest.Mock };
    const id = await seedAction();
    useCoordinator.getState().update(id, (item) => ({ ...item, businessCandidateID: 'place-1' }));
    mockAgent.mockResolvedValue({ run: run([ACE]), intent: { eligible: true } });
    mockParams = { id };
    await show(<TaskActionScreen />);

    await waitFor(() => expect(screen.getByTestId('action-title')).toHaveTextContent('Contact Ace Plumbing'));
    expect(screen.getByText('Change business')).toBeTruthy();
    expect(screen.queryByTestId('action-email')).toBeNull();

    await fireEvent.press(screen.getByTestId('action-message'));
    await waitFor(() => expect(SMS.sendSMSAsync).toHaveBeenCalledWith(['+15550001111'], ACE.draft));
    // A business is never remembered as a Contacts person.
    expect(useCoordinator.getState().actions[0].contactIdentifier ?? null).toBeNull();
  });

  it('saves typed contact details as the recipient', async () => {
    mockResolve.mockRejectedValue(new Error('No matching contact'));
    await open();
    await waitFor(() => expect(screen.getByText('Enter contact details')).toBeTruthy());

    await fireEvent.press(screen.getByText('Enter contact details'));
    // A large title over the form, not a bar title (`task-action-contact-details`).
    expect(StyleSheet.flatten(screen.getByText('Contact details').props.style).fontSize).toBe(34);
    // Prefilled with the name as the task wrote it.
    expect(screen.getByTestId('contact-details-name').props.value).toBe('Damien');
    expect(screen.getByText('Enter a name and a valid phone number or email address.')).toBeTruthy();
    expect(screen.getByTestId('contact-details-save').props.accessibilityState).toEqual({ disabled: true });

    await fireEvent.changeText(screen.getByTestId('contact-details-phone'), ' 925 555 0100 ');
    expect(screen.queryByText('Enter a name and a valid phone number or email address.')).toBeNull();
    await fireEvent.press(screen.getByTestId('contact-details-save'));

    expect(useCoordinator.getState().actions[0].manualRecipient).toEqual({ name: 'Damien', phone: '925 555 0100', email: '' });
    expect(screen.queryByText('Contact details')).toBeNull();
    expect(screen.getByText('Choose how to contact Damien.')).toBeTruthy();
    expect(screen.getByTestId('action-call')).toBeTruthy();
  });

  it('prefills the form with the name as searched, not the phrase ("the plumber")', async () => {
    const id = await seedAction();
    useCoordinator.getState().update(id, (item) => ({ ...item, contactName: 'the plumber' }));
    mockResolve.mockRejectedValue(new TaskActionError('noContact'));
    mockParams = { id };
    await show(<TaskActionScreen />);
    await waitFor(() => expect(screen.getByText('Enter contact details')).toBeTruthy());
    await fireEvent.press(screen.getByText('Enter contact details'));
    expect(screen.getByTestId('contact-details-name').props.value).toBe('plumber');
  });

  it('closes the form on Cancel without saving', async () => {
    await open();
    await waitFor(() => expect(screen.getByText('Enter contact details')).toBeTruthy());
    await fireEvent.press(screen.getByText('Enter contact details'));
    await fireEvent.press(screen.getByTestId('contact-details-cancel'));

    expect(screen.queryByText('Contact details')).toBeNull();
    expect(useCoordinator.getState().actions[0].manualRecipient ?? null).toBeNull();
  });

  it('uses typed details without looking anything up', async () => {
    const id = await seedAction();
    useCoordinator.getState().update(id, (item) => ({ ...item, manualRecipient: { name: 'Damien', phone: '', email: 'd@h.co' } }));
    mockParams = { id };
    await show(<TaskActionScreen />);

    await waitFor(() => expect(screen.getByTestId('action-email')).toBeTruthy());
    expect(mockAgent).not.toHaveBeenCalled();
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('takes the person picked in Contacts, clearing a business or typed choice', async () => {
    const id = await seedAction();
    useCoordinator.getState().update(id, (item) => ({ ...item, businessCandidateID: 'gone' }));
    mockAgent.mockResolvedValue({ run: run([]), intent: { eligible: true } });
    mockPick.mockResolvedValue({ id: 'c9', name: 'Asha Rao', phoneNumbers: [{ id: 'n1', label: 'mobile', number: '+15552223333' }], emails: [] });
    mockParams = { id };
    await show(<TaskActionScreen />);
    await waitFor(() => expect(screen.getByText('Choose someone from Contacts')).toBeTruthy());

    await fireEvent.press(screen.getByText('Choose someone from Contacts'));

    await waitFor(() => expect(screen.getByText('Choose how to contact Asha Rao.')).toBeTruthy());
    const stored = useCoordinator.getState().actions[0];
    expect(stored).toMatchObject({ contactIdentifier: 'c9', businessCandidateID: null, manualRecipient: null });
    // The picked number keeps its own label (Android ahead of iOS; Swift fixes it to "Phone").
    expect(useCoordinator.getState().resolvedContacts.c9.phones[0].label).toBe('mobile');
  });

  it('shows the unavailable state when the task is gone', async () => {
    useCoordinator.getState().reset();
    mockParams = { id: 'nope' };

    await show(<TaskActionScreen />);

    expect(screen.getByTestId('action-unavailable')).toBeTruthy();
    expect(screen.getByText('Task unavailable')).toBeTruthy();
  });

  it('snoozes fifteen minutes and closes', async () => {
    await open();

    await fireEvent.press(screen.getByTestId('action-snooze'));

    await waitFor(() => expect(useCoordinator.getState().actions[0].snoozedUntil).toBeGreaterThan(Date.now()));
    expect(mockBack).toHaveBeenCalled();
  });

  it('dismisses and closes', async () => {
    await open();

    await fireEvent.press(screen.getByTestId('action-dismiss'));

    await waitFor(() => expect(useCoordinator.getState().actions[0].status).toBe('cancelled'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('counts itself open while showing, and puts an early action back on its schedule when it closes', async () => {
    const id = await open();
    await waitFor(() => expect(useCoordinator.getState().openScreens[id]).toBe(1));
    expect(useCoordinator.getState().actions[0].status).toBe('awaitingApproval');

    await screen.unmount();
    expect(useCoordinator.getState().openScreens[id]).toBeUndefined();
    expect(useCoordinator.getState().actions[0].status).toBe('scheduled');
  });
});

/** `ActionQueueSheet` body (ios/App/TodayActionsView.swift:193-220). */
describe('the action queue', () => {
  it('shows the empty state when nothing is due', async () => {
    useCoordinator.getState().reset();

    await show(<ActionQueue />);

    expect(screen.getByTestId('queue-empty')).toBeTruthy();
    expect(screen.getByText('No actions today')).toBeTruthy();
  });

  it('lists the action under Upcoming, and a row opens its task', async () => {
    const id = await seedAction();

    await show(<ActionQueue />);

    await waitFor(() => expect(screen.getByTestId(`queue-action-${id}`)).toBeTruthy());
    expect(screen.getByText('Nexdo Actions')).toBeTruthy();
    expect(screen.getByText('Upcoming')).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`queue-action-${id}`));
    expect(mockPush).toHaveBeenCalledWith('/task/t1');
  });
});
