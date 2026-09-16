import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { NexdoProject, NexdoTask } from '../api/types';
import { MonthCalendar } from '../components/MonthCalendar';
import { resetRevisions } from '../query/taskRevision';
import { useFocus } from '../store/focus';
import { useSession } from '../store/session';

const mockBack = jest.fn();
const mockParams = jest.fn(() => ({}) as Record<string, string>);
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => mockParams(),
}));

const mockTasks = jest.fn();
const mockProjects = jest.fn();
const mockCreateTask = jest.fn();
const mockUpdateTask = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    tasks: (...args: unknown[]) => mockTasks(...args),
    projects: (...args: unknown[]) => mockProjects(...args),
    createTask: (...args: unknown[]) => mockCreateTask(...args),
    updateTask: (...args: unknown[]) => mockUpdateTask(...args),
  },
}));

import NewTask from '../../app/task/new';
import TaskDetail from '../../app/task/[id]';

const ZONE = 'Asia/Kolkata';
/** 2026-09-16 09:00 in Asia/Kolkata (a Wednesday). */
const NOW = Date.parse('2026-09-16T03:30:00.000Z');

function project(overrides: Partial<NexdoProject> & { id: string }): NexdoProject {
  return {
    name: 'A project',
    color: '#8875ff',
    createdAt: '',
    updatedAt: '2026-09-01T00:00:00.000Z',
    completedTaskCount: 0,
    totalTaskCount: 0,
    ...overrides,
  };
}

function task(overrides: Partial<NexdoTask> & { id: string }): NexdoTask {
  return { title: 'A task', status: 'PLANNED', priority: 'MEDIUM', durationMin: 30, ...overrides };
}

function wrap(node: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  resetRevisions();
  useFocus.getState().clear();
  mockParams.mockReturnValue({});
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Sri Ram', email: 'a@b.com', timeZone: ZONE } });
  mockProjects.mockResolvedValue({
    projects: [project({ id: 'p1', name: 'Home move' }), project({ id: 'p2', name: 'Zurich trip', color: '#35bce6' })],
    unassignedTaskCount: 0,
  });
  mockTasks.mockResolvedValue({ tasks: [], timeZone: ZONE });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => jest.useRealTimers());

/** `MonthCalendar`, standing in for `DatePicker(.graphical)` (ios/App/RootView.swift:2038-2049). */
describe('MonthCalendar', () => {
  it('renders the month of the selected date, Monday first', async () => {
    await render(<MonthCalendar selected={NOW} onSelect={jest.fn()} timeZone={ZONE} now={NOW} />);

    expect(screen.getByTestId('calendar-month').props.children).toBe('September 2026');
    expect(screen.getByTestId('calendar-day-2026-09-16')).toBeTruthy();
    // September 2026 has 30 days, so the 31st must not be drawn.
    expect(screen.queryByTestId('calendar-day-2026-09-31')).toBeNull();
  });

  it('marks the selected day for assistive technology', async () => {
    await render(<MonthCalendar selected={NOW} onSelect={jest.fn()} timeZone={ZONE} now={NOW} />);
    expect(screen.getByTestId('calendar-day-2026-09-16').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('calendar-day-2026-09-17').props.accessibilityState.selected).toBe(false);
  });

  it('selects a day while keeping the current time of day', async () => {
    const onSelect = jest.fn();
    await render(<MonthCalendar selected={NOW} onSelect={onSelect} timeZone={ZONE} now={NOW} />);

    await fireEvent.press(screen.getByTestId('calendar-day-2026-09-25'));

    // 09:00 local is preserved, so the task is not silently scheduled at midnight.
    expect(new Date(onSelect.mock.calls[0][0] as number).toISOString()).toBe('2026-09-25T03:30:00.000Z');
  });

  it('steps between months', async () => {
    const onSelect = jest.fn();
    const { rerender } = await render(<MonthCalendar selected={NOW} onSelect={onSelect} timeZone={ZONE} now={NOW} />);

    await fireEvent.press(screen.getByTestId('calendar-next'));
    const october = onSelect.mock.calls[0][0] as number;
    await rerender(<MonthCalendar selected={october} onSelect={onSelect} timeZone={ZONE} now={NOW} />);

    expect(screen.getByTestId('calendar-month').props.children).toBe('October 2026');
  });

  it('clamps the day when stepping into a shorter month', async () => {
    const onSelect = jest.fn();
    // 31 October, stepping forward into a 30-day November.
    const halloween = Date.parse('2026-10-31T03:30:00.000Z');
    await render(<MonthCalendar selected={halloween} onSelect={onSelect} timeZone={ZONE} now={NOW} />);

    await fireEvent.press(screen.getByTestId('calendar-next'));

    const next = onSelect.mock.calls[0][0] as number;
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date(next))).toBe('2026-11-30');
  });
});

/** "Select Date" on the creation form (RootView.swift:2055-2066, 2038-2049). */
describe('Creation editor date picker', () => {
  it('opens the picker when Select Date is chosen, and closes it on Done', async () => {
    await wrap(<NewTask />);

    expect(screen.queryByTestId('calendar-month')).toBeNull();

    await fireEvent.press(screen.getByTestId('date-Select Date'));
    await waitFor(() => expect(screen.getByTestId('calendar-month')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('date-picker-done'));
    await waitFor(() => expect(screen.queryByTestId('calendar-month')).toBeNull());
  });

  it('labels the button with the chosen date, as customDateLabel does', async () => {
    await wrap(<NewTask />);

    await fireEvent.press(screen.getByTestId('date-Select Date'));
    await fireEvent.press(screen.getByTestId('calendar-day-2026-09-25'));
    await fireEvent.press(screen.getByTestId('date-picker-done'));

    await waitFor(() => expect(screen.getByText('Sep 25, 2026')).toBeTruthy());
  });

  it('submits the chosen date as startAt', async () => {
    mockCreateTask.mockResolvedValue({ task: task({ id: 'new' }) });
    await wrap(<NewTask />);

    await fireEvent.changeText(screen.getByTestId('task-title'), 'Renew passport');
    await fireEvent.press(screen.getByTestId('date-Select Date'));
    await fireEvent.press(screen.getByTestId('calendar-day-2026-09-25'));
    await fireEvent.press(screen.getByTestId('date-picker-done'));
    await fireEvent.press(screen.getByTestId('create-task'));

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled());
    const body = mockCreateTask.mock.calls[0][0] as { startAt: string };
    expect(body.startAt).toBe('2026-09-25T03:30:00.000Z');
  });
});

/** `ProjectAssignmentField` (ios/App/ProjectsView.swift:295-315). */
describe('ProjectAssignmentField on the creation editor', () => {
  it('starts on No project', async () => {
    await wrap(<NewTask />);
    await waitFor(() => expect(mockProjects).toHaveBeenCalled());

    expect(screen.getByTestId('project-field').props.accessibilityValue.text).toBe('No project');
  });

  it('lists every project by name, plus No project', async () => {
    await wrap(<NewTask />);
    await waitFor(() => expect(mockProjects).toHaveBeenCalled());

    await fireEvent.press(screen.getByTestId('project-field'));

    await waitFor(() => expect(screen.getByTestId('project-option-p1')).toBeTruthy());
    expect(screen.getByTestId('project-option-p2')).toBeTruthy();
    expect(screen.getByTestId('project-option-none')).toBeTruthy();
  });

  it('sets a real projectId on the submitted body', async () => {
    mockCreateTask.mockResolvedValue({ task: task({ id: 'new' }) });
    await wrap(<NewTask />);
    await waitFor(() => expect(mockProjects).toHaveBeenCalled());

    await fireEvent.changeText(screen.getByTestId('task-title'), 'Pack boxes');
    await fireEvent.press(screen.getByTestId('project-field'));
    await fireEvent.press(screen.getByTestId('project-option-p1'));
    await fireEvent.press(screen.getByTestId('create-task'));

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled());
    expect(mockCreateTask.mock.calls[0][0]).toMatchObject({ title: 'Pack boxes', projectId: 'p1' });
  });

  it('shows the chosen project name on the field', async () => {
    await wrap(<NewTask />);
    await waitFor(() => expect(mockProjects).toHaveBeenCalled());

    await fireEvent.press(screen.getByTestId('project-field'));
    await fireEvent.press(screen.getByTestId('project-option-p2'));

    await waitFor(() => expect(screen.getByTestId('project-field').props.accessibilityValue.text).toBe('Zurich trip'));
  });

  it('can be set back to No project', async () => {
    mockCreateTask.mockResolvedValue({ task: task({ id: 'new' }) });
    await wrap(<NewTask />);
    await waitFor(() => expect(mockProjects).toHaveBeenCalled());

    await fireEvent.changeText(screen.getByTestId('task-title'), 'A');
    await fireEvent.press(screen.getByTestId('project-field'));
    await fireEvent.press(screen.getByTestId('project-option-p1'));
    await fireEvent.press(screen.getByTestId('project-field'));
    await fireEvent.press(screen.getByTestId('project-option-none'));
    await fireEvent.press(screen.getByTestId('create-task'));

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalled());
    expect(mockCreateTask.mock.calls[0][0]).toMatchObject({ projectId: null });
  });

  it('preselects the project passed from the project detail Add task button', async () => {
    mockParams.mockReturnValue({ projectId: 'p2' });
    await wrap(<NewTask />);
    await waitFor(() => expect(mockProjects).toHaveBeenCalled());

    await waitFor(() => expect(screen.getByTestId('project-field').props.accessibilityValue.text).toBe('Zurich trip'));
  });
});

/** The `actions` section (ios/App/TaskDetailsView.swift:114-127), over the Phase 4 focus stub. */
describe('Task detail actions', () => {
  async function renderDetail(overrides: Partial<NexdoTask> = {}) {
    const open = task({ id: 't1', title: 'Pack boxes', ...overrides });
    mockTasks.mockResolvedValue({ tasks: [open], timeZone: ZONE });
    mockParams.mockReturnValue({ id: 't1' });
    const view = await wrap(<TaskDetail />);
    await waitFor(() => expect(mockTasks).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('detail-start-focus')).toBeTruthy());
    return view;
  }

  it('renders both buttons with Swift’s copy', async () => {
    await renderDetail();

    expect(screen.getByText('Start a 25-minute focus session')).toBeTruthy();
    expect(screen.getByText('Start task')).toBeTruthy();
  });

  it('reads "Task in progress" once the task is running', async () => {
    await renderDetail({ status: 'IN_PROGRESS' });

    expect(screen.getByText('Task in progress')).toBeTruthy();
    expect(screen.getByTestId('detail-start-task').props.accessibilityState.disabled).toBe(true);
    // The focus session stays available for an IN_PROGRESS task.
    expect(screen.getByTestId('detail-start-focus').props.accessibilityState.disabled).toBe(false);
  });

  it('disables both on a completed task', async () => {
    await renderDetail({ status: 'COMPLETED' });

    expect(screen.getByTestId('detail-start-focus').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('detail-start-task').props.accessibilityState.disabled).toBe(true);
  });

  it('disables the focus session for a status outside INBOX/PLANNED/IN_PROGRESS', async () => {
    await renderDetail({ status: 'WAITING' });

    expect(screen.getByTestId('detail-start-focus').props.accessibilityState.disabled).toBe(true);
  });

  it('records the intent in the stub store and sends nothing to the server', async () => {
    await renderDetail();

    await fireEvent.press(screen.getByTestId('detail-start-focus'));
    await fireEvent.press(screen.getByTestId('detail-start-task'));

    expect(useFocus.getState().intents).toEqual([
      expect.objectContaining({ taskId: 't1', kind: 'focus-session', minutes: 25 }),
      expect.objectContaining({ taskId: 't1', kind: 'start-task' }),
    ]);
    // TODO(phase4) replaces the stub; until then nothing may reach the network.
    expect(mockUpdateTask).not.toHaveBeenCalled();
    expect(useFocus.getState().session).toBeNull();
  });
});
