import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { NexdoProject, NexdoTask } from '../api/types';
import { resetRevisions } from '../query/taskRevision';
import { useFocus } from '../store/focus';
import { useSession } from '../store/session';

const mockBack = jest.fn();
const mockParams = jest.fn(() => ({ id: 't1' }) as Record<string, string>);
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => mockParams(),
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

import TaskDetail from '../../app/task/[id]';

const ZONE = 'Asia/Kolkata';
/** 2026-09-16 09:00 in Asia/Kolkata. */
const NOW = Date.parse('2026-09-16T03:30:00.000Z');

function task(overrides: Partial<NexdoTask> = {}): NexdoTask {
  return {
    id: 't1',
    title: 'Kitchen',
    status: 'PLANNED',
    priority: 'NORMAL',
    durationMin: 30,
    startAt: '2026-09-16T03:30:00.000Z',
    ...overrides,
  };
}

function project(id: string, name: string): NexdoProject {
  return { id, name, color: '#8875ff', createdAt: '', updatedAt: '2026-09-01T00:00:00.000Z', completedTaskCount: 0, totalTaskCount: 0 };
}

async function renderDetail(overrides: Partial<NexdoTask> = {}) {
  mockTasks.mockResolvedValue({ tasks: [task(overrides)], timeZone: ZONE });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  const view = await render(
    <QueryClientProvider client={queryClient}>
      <TaskDetail />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(mockTasks).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByTestId('detail-title')).toBeTruthy());
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  resetRevisions();
  useFocus.getState().clear();
  mockParams.mockReturnValue({ id: 't1' });
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Sri Ram', email: 'a@b.com', timeZone: ZONE } });
  mockProjects.mockResolvedValue({ projects: [project('p1', 'Home move')], unassignedTaskCount: 0 });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => jest.useRealTimers());

/**
 * Every section of `TaskDetailsView`'s body (ios/App/TaskDetailsView.swift:28-90), top to bottom.
 * This test exists because the first port was built from `TaskDraft`'s field list instead of the view,
 * and shipped a screen that shared almost nothing with the iPhone.
 */
describe('Task detail sections, in Swift order', () => {
  it('renders the header, its eyebrow and the close button', async () => {
    await renderDetail();

    expect(screen.getByText('TASK DETAILS')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Kitchen' })).toBeTruthy();
    expect(screen.getByLabelText('Close task details')).toBeTruthy();
  });

  it('renders the clarify card for a vague title', async () => {
    await renderDetail();

    expect(screen.getByText('What would you like to do about “Kitchen”?')).toBeTruthy();
    expect(screen.getByLabelText('Work on it')).toBeTruthy();
    expect(screen.getByLabelText('Contact someone')).toBeTruthy();
    expect(screen.getByLabelText('First step')).toBeTruthy();
    expect(screen.getByLabelText('Save next step')).toBeTruthy();
    expect(
      screen.getByText('Describe one small action. Save it, then use Start Focus Session below when you’re ready.'),
    ).toBeTruthy();
  });

  it('renders the two action buttons', async () => {
    await renderDetail();

    expect(screen.getByText('Start a 25-minute focus session')).toBeTruthy();
    expect(screen.getByText('Start task')).toBeTruthy();
  });

  it('renders every field label in order', async () => {
    await renderDetail();

    for (const label of ['TASK', 'PRIORITY', 'ESTIMATE', 'PROJECT', 'SCHEDULE', 'REPEAT', 'STEPS', 'NOTES']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('shows priority and estimate with their Swift display values', async () => {
    await renderDetail();

    // `.capitalized` on "NORMAL".
    expect(screen.getByTestId('detail-priority').props.accessibilityValue.text).toBe('Normal');
    expect(screen.getByTestId('detail-estimate').props.accessibilityValue.text).toBe('30 min');
  });

  it('shows the repeat menu reading "Does not repeat" when there is no rule', async () => {
    await renderDetail();
    expect(screen.getByTestId('detail-repeat').props.accessibilityValue.text).toBe('Does not repeat');
  });

  it('shows the schedule date and time chips for a scheduled task', async () => {
    await renderDetail();

    expect(screen.getByTestId('detail-schedule-date').props.accessibilityValue.text).toBe('Sep 16, 2026');
    expect(screen.getByTestId('detail-schedule-time').props.accessibilityValue.text).toBe('9:00 AM');
  });

  it('offers "Set date and start time" for an unscheduled task', async () => {
    await renderDetail({ startAt: null, dueAt: null });

    expect(screen.getByText('Set date and start time')).toBeTruthy();
    expect(screen.queryByTestId('detail-schedule-date')).toBeNull();
  });

  it('renders the important-reminders checkbox with both lines', async () => {
    await renderDetail();

    expect(screen.getByText('Important reminders')).toBeTruthy();
    expect(screen.getByText('Use escalation channels')).toBeTruthy();
    // `.accessibilityRepresentation { Toggle(...) }` — a switch, not a button.
    expect(screen.getByTestId('detail-critical').props.accessibilityState.checked).toBe(false);
  });

  it('renders the footer with Mark complete and Save changes', async () => {
    await renderDetail();

    expect(screen.getByLabelText('Mark task complete')).toBeTruthy();
    expect(screen.getByLabelText('Save task changes')).toBeTruthy();
  });

  it('renders NO section the Swift view does not have', async () => {
    await renderDetail();

    // These were invented by the first port, from TaskDraft's model fields.
    expect(screen.queryByText('ENERGY')).toBeNull();
    expect(screen.queryByText('Critical')).toBeNull();
    expect(screen.queryByText('TIME ESTIMATE')).toBeNull();
    expect(screen.queryByText('REPEATS')).toBeNull();
  });

  it('lists existing steps', async () => {
    await renderDetail({ subtasks: [{ id: 's1', title: 'Clear the counters', sortOrder: 0 }] });

    expect(screen.getByText('Clear the counters')).toBeTruthy();
    expect(screen.getByLabelText('Remove step Clear the counters')).toBeTruthy();
    // With a step present, the clarify card no longer shows.
    expect(screen.queryByTestId('clarify-card')).toBeNull();
  });

  it('hides the clarify card for a title that is already actionable', async () => {
    await renderDetail({ title: 'Pay the rent' });
    expect(screen.queryByTestId('clarify-card')).toBeNull();
  });
});

/** `ClarifyTaskActionCard` → `model.saveClarifiedStep` (ios/App/NexdoApp.swift:507-517). */
describe('Save next step', () => {
  it('stays disabled until the step has at least two words', async () => {
    await renderDetail();
    expect(screen.getByLabelText('Save next step').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByLabelText('First step'), 'Draft');
    await waitFor(() => expect(screen.getByLabelText('Save next step').props.accessibilityState.disabled).toBe(true));

    await fireEvent.changeText(screen.getByLabelText('First step'), 'Draft three slides');
    await waitFor(() => expect(screen.getByLabelText('Save next step').props.accessibilityState.disabled).toBe(false));
  });

  it('posts the step as BOTH the title and the sole subtask', async () => {
    mockUpdateTask.mockResolvedValue({ task: task({ title: 'Draft three slides' }) });
    await renderDetail();

    await fireEvent.changeText(screen.getByLabelText('First step'), '  Draft three slides  ');
    await fireEvent.press(screen.getByLabelText('Save next step'));

    await waitFor(() =>
      expect(mockUpdateTask).toHaveBeenCalledWith('t1', { title: 'Draft three slides', subtasks: ['Draft three slides'] }),
    );
  });

  it('surfaces a failure without closing the screen', async () => {
    mockUpdateTask.mockRejectedValue(new Error('offline'));
    await renderDetail();

    await fireEvent.changeText(screen.getByLabelText('First step'), 'Draft three slides');
    await fireEvent.press(screen.getByLabelText('Save next step'));

    await waitFor(() => expect(screen.getByText('Couldn’t save your next step. Please try again.')).toBeTruthy());
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('switches to the contact branch and builds the "Call <name>" title', async () => {
    mockUpdateTask.mockResolvedValue({ task: task({ title: 'Call Damien' }) });
    await renderDetail();

    await fireEvent.press(screen.getByTestId('clarify-mode-contact'));
    await fireEvent.changeText(screen.getByLabelText('Person or business to contact'), 'Damien');
    await fireEvent.press(screen.getByTestId('clarify-call'));

    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledWith('t1', { title: 'Call Damien' }));
  });
});

/** `footer` (TaskDetailsView.swift:203-227). */
describe('Footer actions', () => {
  it('Mark complete flips the status when nothing is dirty', async () => {
    mockUpdateTask.mockResolvedValue({ task: task({ status: 'COMPLETED' }) });
    await renderDetail();

    await fireEvent.press(screen.getByLabelText('Mark task complete'));

    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledWith('t1', { status: 'COMPLETED' }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('reads "Mark incomplete" for a completed task and restores it', async () => {
    mockUpdateTask.mockResolvedValue({ task: task({ status: 'PLANNED' }) });
    await renderDetail({ status: 'COMPLETED' });

    expect(screen.getByLabelText('Mark task incomplete')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Mark task incomplete'));

    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledWith('t1', { status: 'PLANNED' }));
  });

  it('saves the edit buffer BEFORE flipping the status, as Swift does', async () => {
    mockUpdateTask.mockResolvedValue({ task: task() });
    await renderDetail();

    await fireEvent.changeText(screen.getByTestId('detail-title'), 'Kitchen deep clean');
    await fireEvent.press(screen.getByLabelText('Mark task complete'));

    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledTimes(2));
    // The details body first, the status flip second.
    expect(mockUpdateTask.mock.calls[0]).toEqual(['t1', { title: 'Kitchen deep clean' }]);
    expect(mockUpdateTask.mock.calls[1]).toEqual(['t1', { status: 'COMPLETED' }]);
  });

  it('keeps Save changes disabled until something is dirty', async () => {
    await renderDetail();
    expect(screen.getByTestId('detail-save').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('detail-title'), 'Kitchen deep clean');
    await waitFor(() => expect(screen.getByTestId('detail-save').props.accessibilityState.disabled).toBe(false));
  });

  it('Save changes sends only the changed fields', async () => {
    mockUpdateTask.mockResolvedValue({ task: task() });
    await renderDetail();

    await fireEvent.press(screen.getByTestId('detail-priority'));
    await fireEvent.press(screen.getByTestId('detail-priority-HIGH'));
    await fireEvent.press(screen.getByTestId('detail-save'));

    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledWith('t1', { priority: 'HIGH' }));
  });

  it('flushes an unsent step into the save, as persist() does', async () => {
    mockUpdateTask.mockResolvedValue({ task: task() });
    await renderDetail();

    await fireEvent.changeText(screen.getByTestId('detail-new-step'), 'Clear the counters');
    await fireEvent.press(screen.getByTestId('detail-save'));

    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledWith('t1', { subtasks: ['Clear the counters'] }));
  });
});
