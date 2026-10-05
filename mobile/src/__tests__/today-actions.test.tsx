import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { palettes } from '../theme';

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
jest.mock('../api/shopping', () => ({ ...jest.requireActual('../api/shopping'), shoppingApi: { lists: async () => ({ lists: [] }) } }));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    tasks: (...args: unknown[]) => mockTasks(...args),
    agenda: (...args: unknown[]) => mockAgenda(...args),
    scheduleIntelligence: (...args: unknown[]) => mockIntelligence(...args),
  },
}));

// The task's business research; nothing here reaches a server.
const mockAgent = jest.fn();
jest.mock('../api/taskAgent', () => ({ taskAgentApi: { load: (...args: unknown[]) => mockAgent(...args), update: jest.fn() } }));

import * as Contacts from 'expo-contacts/legacy';

import Today from '../../app/(tabs)/(today)/today/index';
import ActionQueue from '../../app/action/queue';
import { actionDurationLabel, actionTimeLabel } from '../components/TodayActions';
import type { StoredTaskAction } from '../lib/taskAction';

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
  mockAgent.mockResolvedValue({ run: null, intent: { eligible: false } });
  (Contacts.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true, canAskAgain: true });
  (Contacts.getContactsAsync as jest.Mock).mockClear().mockResolvedValue({ data: [] });
  (Contacts.requestPermissionsAsync as jest.Mock).mockClear();
});

const run = (candidates: object[]) => ({
  id: 'r1', status: 'READY_FOR_REVIEW', version: 2, service: 'plumber', urgency: 'normal',
  slots: { location: '94582', budget: '', constraints: '' }, steps: [], candidates, warnings: [], question: null, error: null,
});
const ACE = { id: 'place-1', name: 'Ace Plumbing', address: '1 Main St', phone: '+15550001111', reason: '', draft: 'Hello', evidence: [] };
const DAMIEN = { id: 'c1', name: 'Damien Hall', phoneNumbers: [{ id: 'n1', label: 'mobile', number: '+15551234567' }], emails: [{ id: 'e1', label: 'work', email: 'd@h.co' }] };

async function showDue(tasks: NexdoTask[] = [DUE_TASK]) {
  await seed(tasks);
  mockTasks.mockResolvedValue({ tasks, timeZone: ZONE });
  await show(tasks);
  await waitFor(() => expect(screen.getByTestId('today-actions-primary')).toBeTruthy());
}

/** Section 6 of the Today dashboard: `TodayActionsView` (ios/App/RootView.swift:1136-1143). */
describe('the action queue on Today', () => {
  it('renders nothing when there are no contact actions', async () => {
    mockTasks.mockResolvedValue({ tasks: [task({ id: 't9', title: 'Buy groceries' })], timeZone: ZONE });

    await show([task({ id: 't9', title: 'Buy groceries' })]);

    expect(screen.queryByTestId('today-actions-primary')).toBeNull();
    expect(screen.queryByTestId('today-actions-next')).toBeNull();
  });

  it('checks the task, then asks for a contact when none is known', async () => {
    await showDue();

    expect(screen.getByText('Action Needed')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('today-actions-choose-contact')).toBeTruthy());
    expect(screen.getByText('Time to contact Damien')).toBeTruthy();
    expect(screen.getByText('Choose a contact or enter their details')).toBeTruthy();
    expect(screen.getByText('Choose contact or enter details')).toBeTruthy();
    // No recipient, no channel (ActionNeededState).
    expect(screen.queryByTestId('today-actions-call')).toBeNull();
    expect(screen.getByText('Remind later')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('today-actions-choose-contact'));
    const id = useCoordinator.getState().actions[0].id;
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/action/[id]', params: { id } });
  });

  it('shows "Checking next action…" until the task has been checked', async () => {
    let answer: (value: unknown) => void = () => undefined;
    mockAgent.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await showDue();

    expect(screen.getByText('Checking next action…')).toBeTruthy();
    expect(screen.queryByTestId('today-actions-choose-contact')).toBeNull();
    // Answer, so nothing is left pending when the suite ends.
    answer({ run: null, intent: { eligible: false } });
    await waitFor(() => expect(screen.getByTestId('today-actions-choose-contact')).toBeTruthy());
  });

  it('finds the one matching person quietly and offers their channels', async () => {
    (Contacts.getContactsAsync as jest.Mock).mockResolvedValue({ data: [DAMIEN] });
    await showDue();

    await waitFor(() => expect(screen.getByTestId('today-actions-call')).toBeTruthy());
    expect(screen.getByText('Time to contact Damien Hall')).toBeTruthy();
    expect(screen.getByText('+15551234567')).toBeTruthy();
    // `channel.rawValue.capitalized`: "Message", not "iMessage".
    expect(screen.getByText('Message')).toBeTruthy();
    expect(screen.queryByText('iMessage')).toBeNull();
    expect(screen.getByText('Email')).toBeTruthy();
    expect(useCoordinator.getState().actions[0].contactIdentifier).toBe('c1');

    await fireEvent.press(screen.getByTestId('today-actions-call'));
    const id = useCoordinator.getState().actions[0].id;
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/action/[id]', params: { id, preferred: 'call', start: '1' } });
  });

  it('never asks for Contacts access from Today', async () => {
    (Contacts.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: true });
    await showDue();

    await waitFor(() => expect(screen.getByTestId('today-actions-choose-contact')).toBeTruthy());
    expect(Contacts.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Contacts.getContactsAsync).not.toHaveBeenCalled();
  });

  it('sends a business task to Task Details to find businesses', async () => {
    mockAgent.mockResolvedValue({ run: null, intent: { eligible: true } });
    await showDue();

    await waitFor(() => expect(screen.getByText('Find businesses')).toBeTruthy());
    expect(screen.getByText('Find a business to contact')).toBeTruthy();
    expect(screen.getByText('Choose a nearby business for this task')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('today-actions-business'));
    expect(mockPush).toHaveBeenCalledWith('/task/t1');
  });

  it('asks to choose a business once the search has results', async () => {
    mockAgent.mockResolvedValue({ run: run([ACE]), intent: { eligible: true } });
    await showDue();

    await waitFor(() => expect(screen.getByText('Choose a business')).toBeTruthy());
  });

  it('offers the chosen business’s phone channels, and Change business', async () => {
    mockAgent.mockResolvedValue({ run: run([ACE]), intent: { eligible: true } });
    await seed([DUE_TASK]);
    const id = useCoordinator.getState().actions[0].id;
    useCoordinator.getState().update(id, (item) => ({ ...item, businessCandidateID: 'place-1' }));
    mockTasks.mockResolvedValue({ tasks: [DUE_TASK], timeZone: ZONE });
    await show([DUE_TASK]);

    await waitFor(() => expect(screen.getByText('Time to contact Ace Plumbing')).toBeTruthy());
    expect(screen.getByTestId('today-actions-call')).toBeTruthy();
    expect(screen.getByTestId('today-actions-message')).toBeTruthy();
    expect(screen.queryByTestId('today-actions-email')).toBeNull();
    expect(screen.getByText('Change business')).toBeTruthy();
  });

  it('offers a retry when the task cannot be checked', async () => {
    mockAgent.mockRejectedValueOnce(new Error('offline'));
    await showDue();

    await waitFor(() => expect(screen.getByText('Couldn’t check this task. Retry or open task details.')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('today-actions-retry'));
    await waitFor(() => expect(screen.getByTestId('today-actions-choose-contact')).toBeTruthy());
  });

  it('steps through every due action, and Next up leaves them out', async () => {
    const older = task({ id: 't3', title: 'Call Ana at 9 AM', startAt: new Date(Date.now() - 90 * 60_000).toISOString() });
    await showDue([DUE_TASK, older]);

    expect(screen.getByText('2 Actions need attention')).toBeTruthy();
    expect(screen.getByTestId('today-actions-position')).toHaveTextContent('1 of 2');
    expect(screen.getByTestId('today-actions-previous').props.accessibilityState).toEqual({ disabled: true });
    // The oldest is first, with its overdue age.
    expect(screen.getByTestId('today-actions-time')).toHaveTextContent('1 hr 30 min overdue');
    expect(screen.queryByTestId('today-actions-next')).toBeNull();

    await fireEvent.press(screen.getByTestId('today-actions-next-due'));
    expect(screen.getByTestId('today-actions-position')).toHaveTextContent('2 of 2');
    expect(screen.getByTestId('today-actions-next-due').props.accessibilityState).toEqual({ disabled: true });
    expect(screen.getByTestId('today-actions-time')).toHaveTextContent('Due now');

    // The pager and the card are in `ActionGlass` (`.foregroundStyle(Color.nexdoInk)`): their buttons are ink.
    expect(StyleSheet.flatten(screen.getByText('View all').props.style).color).toBe(palettes.light.ink);
    expect(StyleSheet.flatten(screen.getAllByText('Dismiss')[0].props.style).color).toBe(palettes.light.ink);
    await fireEvent.press(screen.getByTestId('today-actions-view-all-due'));
    expect(mockPush).toHaveBeenCalledWith('/action/queue');
  });

  it('a single due action has no pager', async () => {
    await showDue();
    expect(screen.queryByTestId('today-actions-pager')).toBeNull();
  });

  it('the task context row opens the task', async () => {
    await seed([DUE_TASK]);
    mockTasks.mockResolvedValue({ tasks: [DUE_TASK], timeZone: ZONE });
    await show([DUE_TASK]);
    await waitFor(() => expect(screen.getByTestId('today-actions-context')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('today-actions-context'));

    expect(mockPush).toHaveBeenCalledWith('/task/t1');
  });

  it('lists actions not yet due under Next up, with View all', async () => {
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

    await fireEvent.press(screen.getByTestId('today-actions-view-all'));

    expect(mockPush).toHaveBeenCalledWith('/action/queue');
  });

  it('snoozing from the card defers the reminder', async () => {
    await seed([DUE_TASK]);
    mockTasks.mockResolvedValue({ tasks: [DUE_TASK], timeZone: ZONE });
    await show([DUE_TASK]);
    await waitFor(() => expect(screen.getByTestId('today-actions-snooze')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('today-actions-snooze'));
    await waitFor(() => expect(screen.getByTestId('snooze-30')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('snooze-30'));

    await waitFor(() => expect(useCoordinator.getState().actions[0].snoozedUntil).toBeGreaterThan(Date.now()));
  });

  it('snoozes to a chosen time, fifteen minutes out by default', async () => {
    await showDue();
    await fireEvent.press(screen.getByTestId('today-actions-snooze'));
    await fireEvent.press(screen.getByTestId('snooze-choose'));

    expect(screen.getByText('Remind me at')).toBeTruthy();
    const before = Date.now();
    await fireEvent.press(screen.getByTestId('snooze-save'));

    const until = useCoordinator.getState().actions[0].snoozedUntil ?? 0;
    expect(until).toBeGreaterThan(before + 14 * 60_000);
    expect(until).toBeLessThanOrEqual(before + 15 * 60_000);
  });

  it('closes the time picker on Cancel without snoozing', async () => {
    await showDue();
    await fireEvent.press(screen.getByTestId('today-actions-snooze'));
    await fireEvent.press(screen.getByTestId('snooze-choose'));
    await fireEvent.press(screen.getByTestId('snooze-cancel'));

    expect(screen.queryByText('Remind me at')).toBeNull();
    expect(useCoordinator.getState().actions[0].snoozedUntil ?? null).toBeNull();
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

/** `actionTimeLabel` and `actionDurationLabel` (TodayActionsView.swift:328-340). */
describe('action time labels', () => {
  const NOW = Date.parse('2026-09-25T16:00:00Z');
  const at = (offsetMs: number) => ({ scheduledAt: NOW + offsetMs, snoozedUntil: null }) as unknown as StoredTaskAction;

  it('words durations in minutes and hours', () => {
    expect(actionDurationLabel(45)).toBe('45 min');
    expect(actionDurationLabel(120)).toBe('2 hr');
    expect(actionDurationLabel(15_421)).toBe('257 hr 1 min');
  });

  it('rounds the future up, truncates the past, and calls the last minute "Due now"', () => {
    expect(actionTimeLabel(at(30_000), NOW)).toBe('in 1 min');
    expect(actionTimeLabel(at(61 * 60_000), NOW)).toBe('in 1 hr 1 min');
    expect(actionTimeLabel(at(-59_000), NOW)).toBe('Due now');
    expect(actionTimeLabel(at(-(257 * 60 + 1) * 60_000 - 30_000), NOW)).toBe('257 hr 1 min overdue');
  });
});

/** `ActionQueueSheet` (TodayActionsView.swift:287-323). */
describe('the action queue sheet', () => {
  async function showQueue(tasks: NexdoTask[]) {
    await seed(tasks);
    // The sheet's own tasks query refetches; an empty answer would empty the queue mid-test.
    mockTasks.mockResolvedValue({ tasks, timeZone: ZONE });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    queryClient.setQueryData(queryKeys.tasks.all(), { tasks, timeZone: ZONE });
    queryClient.setQueryData(queryKeys.me(), { id: OWNER, name: 'Ada', email: 'a@b.c', timeZone: ZONE });
    await render(
      <QueryClientProvider client={queryClient}>
        <ActionQueue />
      </QueryClientProvider>,
    );
  }

  it('leaves out an empty section and opens Task Details from a row', async () => {
    await showQueue([LATER_TASK]);
    const id = useCoordinator.getState().actions[0].id;

    await waitFor(() => expect(screen.getByTestId(`queue-action-${id}`)).toBeTruthy());
    expect(screen.getByText('Upcoming')).toBeTruthy();
    expect(screen.queryByText('Due now')).toBeNull();
    expect(screen.queryByText('Call • Message • Email')).toBeNull();
    expect(screen.getByTestId(`queue-action-${id}`).props.accessibilityHint).toBe('Open task details');

    await fireEvent.press(screen.getByTestId(`queue-action-${id}`));
    expect(mockPush).toHaveBeenCalledWith('/task/t2');
    expect(useCoordinator.getState().route).toBeNull();
  });
});
