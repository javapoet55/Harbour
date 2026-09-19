import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, BackHandler } from 'react-native';

import type { NexdoTask } from '../api/types';
import { resetRevisions } from '../query/taskRevision';
import { useAttentionSheet } from '../store/attention';
import { useFocus } from '../store/focus';
import { useSession } from '../store/session';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockSetOptions = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = require('react') as typeof import('react');
  return {
    router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
    useLocalSearchParams: () => ({}),
    useNavigation: () => ({ setOptions: mockSetOptions, getParent: () => undefined }),
    // Focus is the mount here: there is no navigator to blur and refocus.
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

const mockTasks = jest.fn();
const mockUpdateTask = jest.fn();
const mockIntelligence = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    tasks: (...args: unknown[]) => mockTasks(...args),
    updateTask: (...args: unknown[]) => mockUpdateTask(...args),
    scheduleIntelligence: (...args: unknown[]) => mockIntelligence(...args),
  },
}));

import AttentionSheet from '../../app/attention';
import RescheduleAll from '../../app/reschedule-all';

const ZONE = 'Asia/Kolkata';
/** 2026-09-16 09:00 in Asia/Kolkata. */
const NOW = Date.parse('2026-09-16T03:30:00.000Z');

function task(overrides: Partial<NexdoTask> & { id: string }): NexdoTask {
  return { title: 'A task', status: 'PLANNED', priority: 'NORMAL', durationMin: 30, ...overrides };
}

const LATE = task({ id: 'late', title: 'Renew passport', dueAt: '2026-08-10T04:30:00.000Z' });
const LATER = task({ id: 'later', title: 'File taxes', startAt: '2026-09-01T04:30:00.000Z', durationMin: 45 });
const FUTURE = task({ id: 'future', title: 'Pack boxes', startAt: '2026-09-17T04:30:00.000Z' });

const INTELLIGENCE = {
  today: {
    day: '2026-09-16',
    timeZone: ZONE,
    commitments: 0,
    appointments: 0,
    tasks: 0,
    overdue: 2,
    availableMinutes: 0,
    timeline: [],
    attention: [
      { id: 'overdue', label: 'Overdue', title: '2 overdue tasks', explanation: '', recommendedAction: '', kind: 'OVERDUE', taskIds: [] },
      {
        id: 'gap',
        label: 'Schedule check',
        title: 'Not enough time before Friday',
        explanation: 'Two tasks need 90 minutes before their deadline.',
        recommendedAction: 'Move one task earlier.',
        kind: 'GAP',
        taskIds: ['future'],
      },
    ],
    recommendation: { title: '', explanation: '', additionalAdvice: null, kind: '', taskId: null },
  },
};

function wrap(node: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  resetRevisions();
  useFocus.getState().clear();
  useAttentionSheet.getState().reset();
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Sri Ram', email: 'a@b.com', timeZone: ZONE } });
  mockTasks.mockResolvedValue({ tasks: [LATE, LATER, FUTURE], timeZone: ZONE });
  mockIntelligence.mockResolvedValue(INTELLIGENCE);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => jest.useRealTimers());

/** `TodayAttentionSheet.body` (ios/App/TodayAttentionSheet.swift:17-100). */
describe('Needs attention sheet', () => {
  it('lists overdue tasks oldest first under a counted header, then the schedule checks', async () => {
    await wrap(<AttentionSheet />);

    await waitFor(() => expect(screen.getByTestId('attention-overdue-header').props.children).toBe('2 overdue tasks'));
    expect(screen.getByText('Needs attention')).toBeTruthy();
    const rows = screen.getAllByTestId(/^attention-task-/).map((row) => row.props.testID);
    expect(rows).toEqual(['attention-task-late', 'attention-task-later']);
    expect(screen.getByText('Complete a task or choose a new date.')).toBeTruthy();
    expect(screen.getByText('Schedule checks')).toBeTruthy();
    expect(screen.getByText('Not enough time before Friday')).toBeTruthy();
    // The "overdue" intelligence item is not a schedule check.
    expect(screen.queryByText('2 overdue tasks', { exact: true })).toBeTruthy();
    expect(screen.queryByTestId('attention-check-overdue')).toBeNull();
  });

  it('shows "All caught up" when nothing needs attention', async () => {
    mockTasks.mockResolvedValue({ tasks: [FUTURE], timeZone: ZONE });
    mockIntelligence.mockResolvedValue({ ...INTELLIGENCE, today: { ...INTELLIGENCE.today, attention: [] } });
    await wrap(<AttentionSheet />);

    await waitFor(() => expect(screen.getByText('All caught up')).toBeTruthy());
    expect(screen.getByText('Nothing needs attention right now.')).toBeTruthy();
  });

  it('completes a task with COMPLETED, then refreshes intelligence', async () => {
    mockUpdateTask.mockResolvedValue({ task: { ...LATE, status: 'COMPLETED' } });
    await wrap(<AttentionSheet />);
    await waitFor(() => expect(screen.getByLabelText('Complete Renew passport')).toBeTruthy());
    const before = mockIntelligence.mock.calls.length;

    await fireEvent.press(screen.getByLabelText('Complete Renew passport'));

    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledWith('late', { status: 'COMPLETED' }));
    await waitFor(() => expect(mockIntelligence.mock.calls.length).toBeGreaterThan(before));
  });

  it('shows a completion failure in red under the list', async () => {
    mockUpdateTask.mockRejectedValue(new Error('The server said no.'));
    await wrap(<AttentionSheet />);
    await waitFor(() => expect(screen.getByLabelText('Complete Renew passport')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Complete Renew passport'));

    await waitFor(() => expect(screen.getByTestId('attention-failure').props.children).toBe('The server said no.'));
  });

  it('opens the task editor from the title and from the calendar button', async () => {
    await wrap(<AttentionSheet />);
    await waitFor(() => expect(screen.getByLabelText('Reschedule Renew passport')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Reschedule Renew passport'));
    expect(mockPush).toHaveBeenCalledWith('/task/late');
    await fireEvent.press(screen.getByTestId('attention-open-later'));
    expect(mockPush).toHaveBeenCalledWith('/task/later');
  });

  it('presents Reschedule all', async () => {
    await wrap(<AttentionSheet />);
    await waitFor(() => expect(screen.getByTestId('attention-reschedule-all')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('attention-reschedule-all'));
    expect(mockPush).toHaveBeenCalledWith('/reschedule-all');
  });

  it('pushes a schedule check inside the sheet, and comes back', async () => {
    await wrap(<AttentionSheet />);
    await waitFor(() => expect(screen.getByTestId('attention-check-gap')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('attention-check-gap'));

    expect(screen.getByTestId('attention-check-details')).toBeTruthy();
    expect(screen.getByText('Two tasks need 90 minutes before their deadline.')).toBeTruthy();
    expect(screen.getByText('Move one task earlier.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('attention-check-task-future'));
    expect(mockPush).toHaveBeenCalledWith('/task/future');

    await fireEvent.press(screen.getByTestId('attention-check-back'));
    expect(screen.getByText('Needs attention')).toBeTruthy();
    expect(screen.queryByTestId('attention-check-details')).toBeNull();
  });

  it('says when tasks could not be refreshed', async () => {
    mockTasks.mockRejectedValue(new Error('offline'));
    await wrap(<AttentionSheet />);
    await waitFor(() => expect(screen.getByText('Couldn’t refresh tasks. Pull down to retry.')).toBeTruthy());
  });

  it('closes, and cannot be closed or backed out of while a reschedule is saving', async () => {
    await wrap(<AttentionSheet />);
    await waitFor(() => expect(screen.getByTestId('attention-close')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('attention-close'));
    expect(mockBack).toHaveBeenCalledTimes(1);

    const listener = jest.spyOn(BackHandler, 'addEventListener');
    await waitFor(() => useAttentionSheet.getState().setSaving(true));

    await waitFor(() => expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: false }));
    expect(listener).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
    expect(screen.getByTestId('attention-close').props.accessibilityState).toMatchObject({ disabled: true });
  });
});

/** The Reschedule all form (TodayAttentionSheet.swift:87-98). */
describe('Reschedule all sheet', () => {
  it('explains itself and counts the overdue tasks', async () => {
    await wrap(<RescheduleAll />);

    await waitFor(() => expect(screen.getByText('Reschedule 2 tasks')).toBeTruthy());
    expect(screen.getByText('Start at')).toBeTruthy();
    expect(
      screen.getByText('Schedule overdue tasks one after another, using each task’s duration. Existing calendar events are not moved.'),
    ).toBeTruthy();
  });

  it('reschedules oldest first from an hour from now, back to back, then closes', async () => {
    mockUpdateTask.mockImplementation(async (id: string) => ({ task: id === 'late' ? LATE : LATER }));
    await wrap(<RescheduleAll />);
    await waitFor(() => expect(screen.getByTestId('reschedule-submit').props.accessibilityState).toMatchObject({ disabled: false }));

    await fireEvent.press(screen.getByTestId('reschedule-submit'));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const start = NOW + 3_600_000;
    expect(mockUpdateTask).toHaveBeenNthCalledWith(1, 'late', { startAt: new Date(start).toISOString(), durationMin: 30 });
    expect(mockUpdateTask).toHaveBeenNthCalledWith(2, 'later', { startAt: new Date(start + 30 * 60_000).toISOString(), durationMin: 45 });
    expect(useAttentionSheet.getState().saving).toBe(false);
  });

  it('stops at the first failure, stays open, and shows the failure', async () => {
    mockUpdateTask.mockImplementation(async (id: string) => {
      if (id === 'later') throw new Error('network');
      return { task: LATE };
    });
    await wrap(<RescheduleAll />);
    await waitFor(() => expect(screen.getByTestId('reschedule-submit').props.accessibilityState).toMatchObject({ disabled: false }));

    await fireEvent.press(screen.getByTestId('reschedule-submit'));

    await waitFor(() => expect(screen.getByTestId('reschedule-failure')).toBeTruthy());
    expect(screen.getByTestId('reschedule-failure').props.children).toMatch(/^Couldn’t reschedule File taxes: .*Earlier changes were saved\.$/);
    expect(mockBack).not.toHaveBeenCalled();
    // The shared failure also shows on the Needs attention sheet.
    expect(useAttentionSheet.getState().failure).toMatch(/^Couldn’t reschedule File taxes/);
  });

  it('is disabled with nothing overdue', async () => {
    mockTasks.mockResolvedValue({ tasks: [FUTURE], timeZone: ZONE });
    await wrap(<RescheduleAll />);

    await waitFor(() => expect(screen.getByText('Reschedule 0 tasks')).toBeTruthy());
    expect(screen.getByTestId('reschedule-submit').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('Cancel dismisses', async () => {
    await wrap(<RescheduleAll />);
    await fireEvent.press(screen.getByTestId('reschedule-cancel'));
    expect(mockBack).toHaveBeenCalled();
  });
});
