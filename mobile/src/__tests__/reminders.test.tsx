import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { NexdoTask } from '../api';
import { useCoordinator, scheduledWork } from '../actions/coordinator';
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
}));

// The coordinator persists to disk, so the saved file has to go between tests: a cancelled action
// left behind by an earlier test would be RESTORED by `activate` and then kept by `reconcile`,
// which is correct behaviour and would quietly empty the queue here.
const fileStore = (jest.requireMock('expo-file-system') as { __store: Map<string, string> }).__store;

const mockResolve = jest.fn();
jest.mock('../actions/contacts', () => ({ resolveContacts: (...args: unknown[]) => mockResolve(...args) }));

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

/** `TaskActionView` body (ios/App/TaskActionView.swift:133-236). */
describe('the action screen', () => {
  it('renders the heading, the three channels and the footer actions', async () => {
    const id = await seedAction();
    mockParams = { id };

    await show(<TaskActionScreen />);

    expect(screen.getByText('Nexdo Action')).toBeTruthy();
    expect(screen.getByTestId('action-title')).toHaveTextContent(/Time to contact Damien/);
    expect(screen.getByText('How would you like to get in touch?')).toBeTruthy();
    expect(screen.getByTestId('action-call')).toBeTruthy();
    expect(screen.getByTestId('action-message')).toBeTruthy();
    expect(screen.getByTestId('action-email')).toBeTruthy();
    expect(screen.getByText('Remind me in 15 minutes')).toBeTruthy();
    expect(screen.getByText('Dismiss')).toBeTruthy();
  });

  /** A guard against inventing controls Swift does not have on this screen. */
  it('has nothing Swift keeps elsewhere', async () => {
    const id = await seedAction();
    mockParams = { id };

    await show(<TaskActionScreen />);

    expect(screen.queryByText('Mark task complete')).toBeNull();
    expect(screen.queryByText('Choose a different contact')).toBeNull();
    expect(screen.queryByText(/Snooze until/)).toBeNull();
    expect(screen.queryByText('Delete')).toBeNull();
  });

  it('shows the unavailable state when the task is gone', async () => {
    useCoordinator.getState().reset();
    mockParams = { id: 'nope' };

    await show(<TaskActionScreen />);

    expect(screen.getByTestId('action-unavailable')).toBeTruthy();
    expect(screen.getByText('Task unavailable')).toBeTruthy();
  });

  it('resolves a single contact straight to its only phone number and confirms the call', async () => {
    const id = await seedAction();
    mockParams = { id };
    mockResolve.mockResolvedValue([
      { id: 'c1', name: 'Damien Hall', phones: [{ id: 'p1', label: 'mobile', value: '+15551234567' }], emails: [] },
    ]);
    await show(<TaskActionScreen />);

    fireEvent.press(screen.getByTestId('action-call'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(Alert.alert).toHaveBeenCalledWith('Call Damien Hall?', '+15551234567', expect.any(Array));
  });

  it('asks which person when the name matches more than one', async () => {
    const id = await seedAction();
    mockParams = { id };
    mockResolve.mockResolvedValue([
      { id: 'c1', name: 'Damien Hall', phones: [], emails: [] },
      { id: 'c2', name: 'Damien Ross', phones: [], emails: [] },
    ]);
    await show(<TaskActionScreen />);

    fireEvent.press(screen.getByTestId('action-call'));

    await waitFor(() => expect(screen.getByText('Choose the correct contact')).toBeTruthy());
    expect(screen.getByTestId('action-contact-c1')).toBeTruthy();
    expect(screen.getByTestId('action-contact-c2')).toBeTruthy();
  });

  it('reports a contact with no number for the chosen channel', async () => {
    const id = await seedAction();
    mockParams = { id };
    mockResolve.mockResolvedValue([{ id: 'c1', name: 'Damien Hall', phones: [], emails: [] }]);
    await show(<TaskActionScreen />);

    fireEvent.press(screen.getByTestId('action-call'));

    await waitFor(() => expect(screen.getByTestId('action-error')).toHaveTextContent(/This contact has no phone number/));
  });

  it('surfaces a refused Contacts permission', async () => {
    const id = await seedAction();
    mockParams = { id };
    mockResolve.mockRejectedValue(new Error('Allow Nexdo to access Contacts in Settings, then try again.'));
    await show(<TaskActionScreen />);

    fireEvent.press(screen.getByTestId('action-call'));

    await waitFor(() => expect(screen.getByTestId('action-error')).toHaveTextContent(/Allow Nexdo to access Contacts/));
  });

  it('snoozes fifteen minutes and closes', async () => {
    const id = await seedAction();
    mockParams = { id };
    await show(<TaskActionScreen />);

    fireEvent.press(screen.getByTestId('action-snooze'));

    await waitFor(() => expect(useCoordinator.getState().actions[0].snoozedUntil).toBeGreaterThan(Date.now()));
    expect(mockBack).toHaveBeenCalled();
  });

  it('dismisses and closes', async () => {
    const id = await seedAction();
    mockParams = { id };
    await show(<TaskActionScreen />);

    fireEvent.press(screen.getByTestId('action-dismiss'));

    await waitFor(() => expect(useCoordinator.getState().actions[0].status).toBe('cancelled'));
    expect(mockBack).toHaveBeenCalled();
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

  it('lists the action under Upcoming with its channel line', async () => {
    const id = await seedAction();

    await show(<ActionQueue />);

    await waitFor(() => expect(screen.getByTestId(`queue-action-${id}`)).toBeTruthy());
    expect(screen.getByText('Nexdo Actions')).toBeTruthy();
    expect(screen.getByText('UPCOMING')).toBeTruthy();
    expect(screen.getByText('DUE NOW')).toBeTruthy();
    // "Contact Damien" has no preferred channel, so Swift prints all three.
    expect(screen.getByText('Call • Message • Email')).toBeTruthy();
  });

  it('opening a row asks the coordinator for that action', async () => {
    const id = await seedAction();
    await show(<ActionQueue />);
    await waitFor(() => expect(screen.getByTestId(`queue-action-${id}`)).toBeTruthy());

    fireEvent.press(screen.getByTestId(`queue-action-${id}`));

    await waitFor(() => expect(useCoordinator.getState().route).toEqual({ id, preferred: null }));
  });
});
