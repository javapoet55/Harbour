import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { NexdoTask } from '../api/types';
import { DEFAULT_TASK_QUERY } from '../lib/taskQuery';
import { resetRevisions } from '../query/taskRevision';
import { useSession } from '../store/session';
import { useTaskQuery } from '../store/taskQuery';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: jest.fn() },
}));

const mockTasks = jest.fn();
const mockProjects = jest.fn();
const mockUpdateTask = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    tasks: (...args: unknown[]) => mockTasks(...args),
    projects: (...args: unknown[]) => mockProjects(...args),
    updateTask: (...args: unknown[]) => mockUpdateTask(...args),
  },
}));

import Tasks from '../../app/(tabs)/(tasks)/tasks';

const ZONE = 'Asia/Kolkata';
/** 2026-09-16 09:00 in Asia/Kolkata. */
const NOW = Date.parse('2026-09-16T03:30:00.000Z');

function task(overrides: Partial<NexdoTask> & { id: string }): NexdoTask {
  return { title: 'A task', status: 'PLANNED', priority: 'MEDIUM', durationMin: 30, ...overrides };
}

/** A local wall time in the account zone, as the server sends it. */
function atLocal(ymd: string, hm = '10:00'): string {
  const [hour, minute] = hm.split(':').map(Number);
  return new Date(Date.parse(`${ymd}T00:00:00.000Z`) - 5.5 * 3_600_000 + (hour * 60 + minute) * 60_000).toISOString();
}

const FIXTURE = [
  task({ id: 'a', title: 'Renew passport', startAt: atLocal('2026-09-16', '09:00') }),
  task({ id: 'b', title: 'Client meeting', startAt: atLocal('2026-09-16', '14:00') }),
  task({ id: 'c', title: 'Book the dentist', startAt: atLocal('2026-09-17', '09:00') }),
  task({ id: 'd', title: 'Pay the rent', status: 'COMPLETED', startAt: atLocal('2026-09-16', '08:00') }),
];

async function renderTasks() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  const view = await render(
    <QueryClientProvider client={queryClient}>
      <Tasks />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(mockTasks).toHaveBeenCalled());
  return { ...view, queryClient };
}

describe('Tasks screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
    resetRevisions();
    useTaskQuery.setState({ query: DEFAULT_TASK_QUERY });
    useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Sri Ram', email: 'a@b.com', timeZone: ZONE } });
    mockTasks.mockResolvedValue({ tasks: FIXTURE, timeZone: ZONE });
    mockProjects.mockResolvedValue({ projects: [], unassignedTaskCount: 0 });
  });

  afterEach(() => jest.useRealTimers());

  it('renders the Swift header copy and both creation cards', async () => {
    await renderTasks();

    // "Tasks" is both the large title and the segment label, as it is in Swift.
    expect(screen.getByRole('header', { name: 'Tasks' })).toBeTruthy();
    expect(screen.getByText('Turn intent into action.')).toBeTruthy();
    expect(screen.getByText('Add by Voice')).toBeTruthy();
    expect(screen.getByText('Add Manually')).toBeTruthy();
  });

  it('sections the fixture by day and shows only today under the Today pill', async () => {
    await renderTasks();

    await waitFor(() => expect(screen.getByText('Renew passport')).toBeTruthy());
    expect(screen.getByText('Client meeting')).toBeTruthy();
    // Tomorrow's task and the completed one are filtered out by date and by the Open status.
    expect(screen.queryByText('Book the dentist')).toBeNull();
    expect(screen.queryByText('Pay the rent')).toBeNull();

    // "Today" is both the date pill and the section header; the header is the one with a count.
    expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
    expect(screen.getByText('2 tasks')).toBeTruthy();
  });

  it('draws a life-reminder task as a plain row, with no reminder badge (RootView.swift:1860-1890)', async () => {
    mockTasks.mockResolvedValue({
      tasks: [task({ id: 'r', title: 'Return the jacket by Friday', durationMin: 5, startAt: atLocal('2026-09-16', '12:24'), lifeReminderType: 'returnItem', reminderAt: atLocal('2026-09-16', '12:24') })],
      timeZone: ZONE,
    });
    await renderTasks();

    await waitFor(() => expect(screen.getByText('Return the jacket by Friday')).toBeTruthy());
    // `TaskRow`'s badge (RootView.swift:1601-1603) is dead code on the iPhone; the live `taskCard` has none.
    expect(screen.queryByText(/^return$/i)).toBeNull();
    expect(screen.queryByLabelText(/Smart reminder/)).toBeNull();
  });

  it('counts each date pill from the same filtered pass', async () => {
    await renderTasks();

    await waitFor(() => expect(screen.getByLabelText('Today, 2 tasks')).toBeTruthy());
    expect(screen.getByLabelText('Tomorrow, 1 tasks')).toBeTruthy();
    expect(screen.getByLabelText('This Week, 3 tasks')).toBeTruthy();
  });

  it('switches the list when another date pill is chosen', async () => {
    await renderTasks();
    await waitFor(() => expect(screen.getByText('Renew passport')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('date-pill-Tomorrow'));

    await waitFor(() => expect(screen.getByText('Book the dentist')).toBeTruthy());
    expect(screen.queryByText('Renew passport')).toBeNull();
  });

  it('filters by the search term across title and notes', async () => {
    await renderTasks();
    await waitFor(() => expect(screen.getByText('Renew passport')).toBeTruthy());

    // Swift gives the header button and the field the same label; the button is the only one on
    // screen before the field opens.
    await fireEvent.press(screen.getByLabelText('Search tasks'));
    const field = screen.getAllByLabelText('Search tasks').find((node) => node.props.placeholder === 'Search your tasks');
    await fireEvent.changeText(field!, 'passport');

    await waitFor(() => expect(screen.queryByText('Client meeting')).toBeNull());
    expect(screen.getByText('Renew passport')).toBeTruthy();
  });

  it('shows the empty state with the Swift copy for the chosen filter', async () => {
    mockTasks.mockResolvedValue({ tasks: [], timeZone: ZONE });
    await renderTasks();

    await waitFor(() => expect(screen.getByText('Nothing scheduled for today')).toBeTruthy());
    expect(screen.getByText('Try another filter or add a task.')).toBeTruthy();
  });

  it('shows the retry affordance when the list fails to load', async () => {
    mockTasks.mockRejectedValue(new Error('offline'));
    await renderTasks();

    await waitFor(() => expect(screen.getByText('Couldn’t load your tasks.')).toBeTruthy());
    expect(screen.getByLabelText('Retry')).toBeTruthy();
  });

  it('routes to the creation editor, the voice shell and the filter sheet', async () => {
    await renderTasks();

    await fireEvent.press(screen.getByTestId('add-manually'));
    expect(mockPush).toHaveBeenCalledWith('/task/new');

    await fireEvent.press(screen.getByTestId('add-by-voice'));
    expect(mockPush).toHaveBeenCalledWith('/task/voice-capture');

    await fireEvent.press(screen.getByLabelText('Task filters'));
    expect(mockPush).toHaveBeenCalledWith('/task/filters');
  });

  it('opens a task through its row', async () => {
    await renderTasks();
    await waitFor(() => expect(screen.getByText('Renew passport')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('task-open-a'));
    expect(mockPush).toHaveBeenCalledWith('/task/a');
  });

  it('completes a task through the toggle, sending the PATCH Swift sends', async () => {
    mockUpdateTask.mockResolvedValue({ task: { ...FIXTURE[0], status: 'COMPLETED' } });
    await renderTasks();
    await waitFor(() => expect(screen.getByText('Renew passport')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('task-toggle-a'));

    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledWith('a', { status: 'COMPLETED' }));
  });

  it('toggles a completed task back to PLANNED, matching AppModel.complete', async () => {
    useTaskQuery.setState({ query: { ...DEFAULT_TASK_QUERY, status: 'All' } });
    mockUpdateTask.mockResolvedValue({ task: { ...FIXTURE[3], status: 'PLANNED' } });
    await renderTasks();
    await waitFor(() => expect(screen.getByText('Pay the rent')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('task-toggle-d'));

    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledWith('d', { status: 'PLANNED' }));
  });

  it('prefixes a completed section with "Completed ·" only under the All status', async () => {
    useTaskQuery.setState({ query: { ...DEFAULT_TASK_QUERY, status: 'All' } });
    await renderTasks();

    await waitFor(() => expect(screen.getByText('Completed · Today')).toBeTruthy());
  });

  it('switches to the Projects segment and renders the projects list', async () => {
    mockProjects.mockResolvedValue({
      projects: [
        { id: 'p1', name: 'Home move', color: '#8875ff', createdAt: '', updatedAt: '2026-09-10T00:00:00.000Z', completedTaskCount: 1, totalTaskCount: 4 },
      ],
      unassignedTaskCount: 2,
    });
    await renderTasks();

    await fireEvent.press(screen.getByTestId('segment-Projects'));

    await waitFor(() => expect(screen.getByText('Home move')).toBeTruthy());
    // The header button and the "No project" folder, both from ProjectsView.swift.
    expect(screen.getByLabelText('New project')).toBeTruthy();
    expect(screen.getByText('No project')).toBeTruthy();
  });
});
