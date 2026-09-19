import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { Agenda, NexdoTask } from '../api';
import { useCoordinator, scheduledWork } from '../actions/coordinator';
import { addDays, startOfDay } from '../lib/taskQuery';
import { queryKeys } from '../query/keys';
import { useSession } from '../store/session';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));

const fileStore = (jest.requireMock('expo-file-system') as { __store: Map<string, string> }).__store;

// The global mock answers every `randomUUID` with the same string; two actions in one queue need
// distinct ids, because the queue filters `nextActions` by `action.id !== primaryAction.id`.
let mockIds = 0;
jest.mock('expo-crypto', () => ({
  ...(jest.requireActual('expo-crypto') as object),
  randomUUID: () => `action-${++mockIds}`,
  digestStringAsync: async () => 'digest',
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
}));

const mockTasks = jest.fn();
const mockAgenda = jest.fn();
const mockIntelligence = jest.fn();
jest.mock('../api/shopping', () => ({ shoppingEndpoints: { list: async () => ({ lists: [] }) } }));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    tasks: (...args: unknown[]) => mockTasks(...args),
    agenda: (...args: unknown[]) => mockAgenda(...args),
    scheduleIntelligence: (...args: unknown[]) => mockIntelligence(...args),
  },
}));

import Today from '../../app/(tabs)/today/index';

const ZONE = 'America/Los_Angeles';
const OWNER = 'user-1';

function task(overrides: Partial<NexdoTask> & { id: string }): NexdoTask {
  return { title: 'Contact Damien at 10 AM', status: 'PLANNED', priority: 'NORMAL', durationMin: 30, ...overrides };
}

/** Due 30 seconds ago, so the queue treats it as an immediate action. */
const DUE_TASK = task({ id: 't1', startAt: new Date(Date.now() - 30_000).toISOString() });
/**
 * Ten minutes out: inside the queue's 15-minute window (`TodayActionQueue.windowMinutes`), so it is
 * a "Next up" row. Beyond the window it would be a `laterAction`, which only the queue sheet shows.
 */
const LATER_TASK = task({ id: 't2', title: 'Call Ana at 4 PM', startAt: soonToday(ZONE) });

/**
 * Ten minutes out, but never past local midnight: the queue covers only the rest of today, so a fixed
 * offset makes the test fail for the last ten minutes of every day.
 */
function soonToday(zone: string): string {
  const now = Date.now();
  const endOfDay = addDays(startOfDay(now, zone), 1, zone);
  return new Date(now + Math.min(600_000, (endOfDay - now) / 2)).toISOString();
}

const AGENDA: Agenda = { timeZone: ZONE, range: { days: [] }, tasks: [], events: [], overdue: [] };

function show(tasks: NexdoTask[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  queryClient.setQueryData(queryKeys.tasks.all(), { tasks, timeZone: ZONE });
  return render(
    <QueryClientProvider client={queryClient}>
      <Today />
    </QueryClientProvider>,
  );
}

async function seed(tasks: NexdoTask[]) {
  useCoordinator.getState().reset();
  await useCoordinator.getState().synchronize(tasks, OWNER, ZONE);
  await scheduledWork();
}

beforeEach(() => {
  mockPush.mockClear();
  fileStore.clear();
  mockIds = 0;
  mockTasks.mockResolvedValue({ tasks: [], timeZone: ZONE });
  mockAgenda.mockResolvedValue(AGENDA);
  mockIntelligence.mockRejectedValue(new Error('not in this test'));
  useSession.setState({ status: 'signedIn', profile: { id: OWNER, name: 'Ada Lovelace', email: 'a@b.c', timeZone: ZONE } });
  useCoordinator.getState().reset();
});

/** Section 6 of the Today dashboard: `TodayActionsView` (ios/App/RootView.swift:1136-1143). */
describe('the action queue on Today', () => {
  it('renders nothing when there are no contact actions', async () => {
    mockTasks.mockResolvedValue({ tasks: [task({ id: 't9', title: 'Buy groceries' })], timeZone: ZONE });

    await show([task({ id: 't9', title: 'Buy groceries' })]);

    expect(screen.queryByTestId('today-actions-primary')).toBeNull();
    expect(screen.queryByTestId('today-actions-next')).toBeNull();
  });

  it('shows the Action Needed card for the due action', async () => {
    await seed([DUE_TASK]);
    mockTasks.mockResolvedValue({ tasks: [DUE_TASK], timeZone: ZONE });

    await show([DUE_TASK]);

    await waitFor(() => expect(screen.getByTestId('today-actions-primary')).toBeTruthy());
    expect(screen.getByText('Action Needed')).toBeTruthy();
    expect(screen.getByText('Time to contact Damien')).toBeTruthy();
    // No contact resolved yet (TodayActionsView.swift:88).
    expect(screen.getByText('Choose an action to find this contact')).toBeTruthy();
    expect(screen.getByTestId('today-actions-call')).toBeTruthy();
    // `channel == .message ? "iMessage" : …` (`:112`).
    expect(screen.getByText('iMessage')).toBeTruthy();
    expect(screen.getByText('Email')).toBeTruthy();
  });

  it('a channel button asks the coordinator to open that action with the channel', async () => {
    await seed([DUE_TASK]);
    mockTasks.mockResolvedValue({ tasks: [DUE_TASK], timeZone: ZONE });
    await show([DUE_TASK]);
    await waitFor(() => expect(screen.getByTestId('today-actions-call')).toBeTruthy());

    fireEvent.press(screen.getByTestId('today-actions-call'));

    await waitFor(() => expect(useCoordinator.getState().route).toMatchObject({ preferred: 'call' }));
  });

  it('the task context row opens the task', async () => {
    await seed([DUE_TASK]);
    mockTasks.mockResolvedValue({ tasks: [DUE_TASK], timeZone: ZONE });
    await show([DUE_TASK]);
    await waitFor(() => expect(screen.getByTestId('today-actions-context')).toBeTruthy());

    fireEvent.press(screen.getByTestId('today-actions-context'));

    expect(mockPush).toHaveBeenCalledWith('/task/t1');
  });

  it('lists later actions under Next up, with View all', async () => {
    await seed([DUE_TASK, LATER_TASK]);
    mockTasks.mockResolvedValue({ tasks: [DUE_TASK, LATER_TASK], timeZone: ZONE });

    await show([DUE_TASK, LATER_TASK]);

    await waitFor(() => expect(screen.getByTestId('today-actions-next')).toBeTruthy());
    expect(screen.getByText('Next up')).toBeTruthy();
    expect(screen.getByText('1 actions')).toBeTruthy();
  });

  it('View all opens the queue', async () => {
    await seed([DUE_TASK, LATER_TASK]);
    mockTasks.mockResolvedValue({ tasks: [DUE_TASK, LATER_TASK], timeZone: ZONE });
    await show([DUE_TASK, LATER_TASK]);
    await waitFor(() => expect(screen.getByTestId('today-actions-view-all')).toBeTruthy());

    fireEvent.press(screen.getByTestId('today-actions-view-all'));

    expect(mockPush).toHaveBeenCalledWith('/action/queue');
  });

  it('snoozing from the card defers the reminder', async () => {
    await seed([DUE_TASK]);
    mockTasks.mockResolvedValue({ tasks: [DUE_TASK], timeZone: ZONE });
    await show([DUE_TASK]);
    await waitFor(() => expect(screen.getByTestId('today-actions-snooze')).toBeTruthy());

    fireEvent.press(screen.getByTestId('today-actions-snooze'));
    await waitFor(() => expect(screen.getByTestId('snooze-30')).toBeTruthy());
    fireEvent.press(screen.getByTestId('snooze-30'));

    await waitFor(() => expect(useCoordinator.getState().actions[0].snoozedUntil).toBeGreaterThan(Date.now()));
  });
});

/**
 * The Daily Briefing row that replaced the Weekly Summary card while an action was due was removed in
 * d444b37: Quick Access is shown whatever the queue holds.
 */
describe('Quick Access does not depend on the action queue', () => {
  it('keeps Quick Access and shows no Daily Briefing row when an action is due', async () => {
    await seed([DUE_TASK]);
    mockTasks.mockResolvedValue({ tasks: [DUE_TASK], timeZone: ZONE });

    await show([DUE_TASK]);

    await waitFor(() => expect(screen.getByText('Action Needed')).toBeTruthy());
    expect(screen.getByTestId('today-quick-access')).toBeTruthy();
    expect(screen.queryByText('Daily Briefing')).toBeNull();
  });
});
