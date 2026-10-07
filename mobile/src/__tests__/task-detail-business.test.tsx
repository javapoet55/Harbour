import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';

import type { TaskAgentEnvelope } from '../api/taskAgent';
import type { NexdoTask } from '../api/types';
import { GREEN_GRADIENT } from '../components/TaskDetailParts';
import { resetRevisions } from '../query/taskRevision';
import { useFocus } from '../store/focus';
import { useSession } from '../store/session';

/**
 * Task Details in business mode (ios/App/TaskDetailsView.swift:39-56, :117-131, :174-233, :314-350),
 * and the footer that hides while a field has focus (`:95-97`). The agent API is mocked.
 */

const mockBack = jest.fn();
const mockParams = jest.fn(() => ({ id: 't1' }) as Record<string, string>);
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => mockParams(),
}));

const mockTasks = jest.fn();
const mockProjects = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    tasks: (...args: unknown[]) => mockTasks(...args),
    projects: (...args: unknown[]) => mockProjects(...args),
    updateTask: jest.fn(),
  },
}));

const mockAgentLoad = jest.fn();
jest.mock('../api/taskAgent', () => ({
  taskAgentApi: { load: (...args: unknown[]) => mockAgentLoad(...args), update: jest.fn() },
}));
jest.mock('../config', () => ({ getApiUrl: () => 'https://api.example.test' }));

import TaskDetail from '../../app/task/[id]';

const ZONE = 'UTC';

function task(overrides: Partial<NexdoTask> = {}): NexdoTask {
  return { id: 't1', title: 'Call a plumber', status: 'PLANNED', priority: 'NORMAL', durationMin: 30, startAt: '2026-09-16T03:30:00.000Z', ...overrides };
}

const eligible: TaskAgentEnvelope = { run: null, intent: { eligible: true, category: 'SERVICE', reason: null } };
const locationStep: TaskAgentEnvelope = {
  intent: { eligible: true },
  run: {
    id: 'r1',
    status: 'NEEDS_INPUT',
    version: 1,
    service: 'plumber',
    urgency: 'flexible',
    slots: { location: '', budget: '', constraints: '' },
    steps: [],
    candidates: [],
    warnings: [],
    question: { key: 'location', text: 'Which city or ZIP code should I search?' },
    error: null,
  },
};

async function renderDetail(agent: TaskAgentEnvelope) {
  mockAgentLoad.mockResolvedValue(agent);
  mockTasks.mockResolvedValue({ tasks: [task()], timeZone: ZONE });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={queryClient}>
      <TaskDetail />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('detail-title')).toBeTruthy());
  await waitFor(() => expect(mockAgentLoad).toHaveBeenCalledWith('t1'));
}

beforeEach(() => {
  jest.clearAllMocks();
  resetRevisions();
  useFocus.getState().clear();
  mockParams.mockReturnValue({ id: 't1' });
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Sri Ram', email: 'a@b.com', timeZone: ZONE } });
  mockProjects.mockResolvedValue({ projects: [], unassignedTaskCount: 0 });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('Task Details with business research', () => {
  it('puts the agent card first and switches to the business layout', async () => {
    await renderDetail(eligible);
    expect(await screen.findByText('TASK INFORMATION')).toBeTruthy();

    // Header: Task Details | Close. The duplicate Back is gone (Android ahead of iOS); system Back still closes.
    expect(screen.getByTestId('detail-business-header')).toBeTruthy();
    expect(screen.queryByLabelText('Back')).toBeNull();
    expect(screen.getByRole('header', { name: 'Task Details' })).toBeTruthy();
    expect(screen.getByLabelText('Close task details')).toBeTruthy();
    expect(screen.queryByText('TASK DETAILS')).toBeNull();

    // The agent card is there; the action card and focus/start buttons are not.
    expect(screen.getByText('Find local businesses')).toBeTruthy();
    expect(screen.queryByText('Start a 25-minute focus session')).toBeNull();
    expect(screen.queryByText('Start task')).toBeNull();
    expect(screen.queryByLabelText('Contact someone')).toBeNull();

    // The information card replaces TASK / metadata / PROJECT.
    expect(screen.queryByText('TASK')).toBeNull();
    expect(screen.queryByText('PRIORITY')).toBeNull();
    for (const label of ['Task', 'Priority', 'Estimate', 'Project']) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByLabelText('Task title').props.value).toBe('Call a plumber');

    // schedule … notes wait behind the menu.
    expect(screen.queryByTestId('detail-schedule')).toBeNull();
    expect(screen.queryByTestId('detail-notes')).toBeNull();
  });

  it('shows and hides the additional details from the menu', async () => {
    await renderDetail(eligible);
    const menu = await screen.findByLabelText('Additional task details');
    expect(menu.props.accessibilityValue).toEqual({ text: 'Hidden' });

    await fireEvent.press(menu);
    await fireEvent.press(screen.getByLabelText('Show additional details'));
    expect(screen.getByLabelText('Additional task details').props.accessibilityValue).toEqual({ text: 'Shown' });
    expect(screen.getByTestId('detail-schedule')).toBeTruthy();
    expect(screen.getByTestId('detail-notes')).toBeTruthy();
    expect(screen.getByText('Important reminders')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Additional task details'));
    await fireEvent.press(screen.getByLabelText('Hide additional details'));
    expect(screen.queryByTestId('detail-notes')).toBeNull();
  });

  it('opens with the additional details shown for an initial section', async () => {
    mockParams.mockReturnValue({ id: 't1', section: 'schedule' });
    await renderDetail(eligible);
    expect(await screen.findByText('TASK INFORMATION')).toBeTruthy();
    expect(screen.getByTestId('detail-schedule')).toBeTruthy();
  });

  it('puts an outlined Save before Mark complete, and no gradient Save', async () => {
    await renderDetail(eligible);
    await screen.findByText('TASK INFORMATION');
    const footer = screen.getByTestId('detail-footer');
    const labels = screen.getAllByRole('button').filter((node) => {
      let parent = node.parent;
      while (parent && parent !== footer) parent = parent.parent;
      return parent === footer;
    });
    expect(labels.map((node) => node.props.accessibilityLabel)).toEqual(['Save task changes', 'Mark task complete']);
    expect(screen.getByTestId('detail-save-surface')).toBeTruthy();
    expect(screen.getByLabelText('Save task changes').props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.changeText(screen.getByLabelText('Task title'), 'Call a plumber today');
    expect(screen.getByLabelText('Save task changes').props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('Close dismisses; there is no second button that does the same', async () => {
    await renderDetail(eligible);
    await fireEvent.press(await screen.findByLabelText('Close task details'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('detail-back')).toBeNull();
  });

  it('hides the footer while the agent’s location field has focus', async () => {
    await renderDetail(locationStep);
    const field = await screen.findByLabelText('City or ZIP code');
    expect(screen.getByTestId('detail-footer')).toBeTruthy();
    await fireEvent(field, 'focus');
    expect(screen.queryByTestId('detail-footer')).toBeNull();
    await fireEvent(field, 'blur');
    expect(screen.getByTestId('detail-footer')).toBeTruthy();
  });
});

describe('Task Details without business research', () => {
  it('keeps the regular layout, hides the footer while a field has focus', async () => {
    await renderDetail({ run: null, intent: null });
    expect(screen.getByText('TASK DETAILS')).toBeTruthy();
    expect(screen.queryByText('TASK INFORMATION')).toBeNull();
    expect(screen.getByText('Start task')).toBeTruthy();

    await fireEvent(screen.getByTestId('detail-notes'), 'focus');
    expect(screen.queryByTestId('detail-footer')).toBeNull();
    await fireEvent(screen.getByTestId('detail-notes'), 'blur');
    await fireEvent(screen.getByTestId('detail-title'), 'focus');
    expect(screen.queryByTestId('detail-footer')).toBeNull();
    await fireEvent(screen.getByTestId('detail-title'), 'blur');
    expect(screen.getByTestId('detail-footer')).toBeTruthy();
  });

  it('draws Mark complete in the new green with a checkmark', async () => {
    await renderDetail({ run: null, intent: null });
    expect(GREEN_GRADIENT).toEqual(['#00AD63', '#007D75']);
    const complete = screen.getByTestId('detail-complete');
    const gradient = complete.children[0] as unknown as { props: { colors: string[] } };
    expect(gradient.props.colors).toEqual(['#00AD63', '#007D75']);
    expect(StyleSheet.flatten(screen.getByText('Mark complete').props.style).color).toBe('#FFFFFF');
    // The gradient Save keeps its place after Mark complete.
    expect(screen.getByTestId('detail-save')).toBeTruthy();
    expect(screen.queryByTestId('detail-save-surface')).toBeNull();
  });
});
