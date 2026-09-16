import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { Agenda, NexdoTask } from '../api/types';
import { resetRevisions } from '../query/taskRevision';
import { useFocus } from '../store/focus';
import { useSession } from '../store/session';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

const mockTasks = jest.fn();
const mockAgenda = jest.fn();
const mockUpdateTask = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    tasks: (...args: unknown[]) => mockTasks(...args),
    agenda: (...args: unknown[]) => mockAgenda(...args),
    updateTask: (...args: unknown[]) => mockUpdateTask(...args),
  },
}));

// The weather chip calls open-meteo directly, not the Nexdo API.
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import Today from '../../app/(tabs)/today';

const ZONE = 'Asia/Kolkata';
/** 2026-09-16 09:00 in Asia/Kolkata (a Wednesday). */
const NOW = Date.parse('2026-09-16T03:30:00.000Z');

function task(overrides: Partial<NexdoTask> & { id: string }): NexdoTask {
  return { title: 'A task', status: 'PLANNED', priority: 'NORMAL', durationMin: 30, ...overrides };
}

function atLocal(ymd: string, hm = '10:00'): string {
  const [hour, minute] = hm.split(':').map(Number);
  return new Date(Date.parse(`${ymd}T00:00:00.000Z`) - 5.5 * 3_600_000 + (hour * 60 + minute) * 60_000).toISOString();
}

const AGENDA: Agenda = {
  timeZone: ZONE,
  range: { days: ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'] },
  tasks: [
    task({ id: 't1', title: 'Pack boxes', startAt: atLocal('2026-09-16', '11:00') }),
    task({ id: 't2', title: 'Ship the deck', startAt: atLocal('2026-09-18', '09:00') }),
  ],
  events: [{ id: 'e1', title: 'Standup', startAt: atLocal('2026-09-16', '09:30'), endAt: atLocal('2026-09-16', '10:00') }],
  overdue: [task({ id: 'old', title: 'Renew passport' })],
};

const FORECAST = {
  current: { temperature_2m: 71.4, weather_code: 0 },
  daily: {
    time: ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'],
    weather_code: [0, 1, 2, 3, 45],
    temperature_2m_max: [80, 81, 82, 83, 84],
    temperature_2m_min: [60, 61, 62, 63, 64],
    precipitation_probability_max: [0, 10, 20, 30, 40],
  },
};

async function renderToday() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  const view = await render(
    <QueryClientProvider client={queryClient}>
      <Today />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(mockAgenda).toHaveBeenCalled());
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  resetRevisions();
  useFocus.getState().clear();
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Sri Ram', email: 'a@b.com', timeZone: ZONE } });
  mockTasks.mockResolvedValue({ tasks: AGENDA.tasks, timeZone: ZONE });
  mockAgenda.mockResolvedValue(AGENDA);
  mockFetch.mockResolvedValue({ ok: true, json: async () => FORECAST });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => jest.useRealTimers());

/**
 * `TodayView.body` (ios/App/RootView.swift:1017-1198), section by section in Swift's order.
 */
describe('Today dashboard sections', () => {
  it('renders the greeting and the date in the ACCOUNT zone', async () => {
    await renderToday();

    expect(screen.getByTestId('today-greeting').props.children).toBe('Good morning, Sri');
    expect(screen.getByTestId('today-date').props.children).toBe('Wed, Sep 16, 2026');
  });

  it('renders the three range options with Today selected', async () => {
    await renderToday();

    expect(screen.getByLabelText('Show Today')).toBeTruthy();
    expect(screen.getByLabelText('Show 3 days')).toBeTruthy();
    expect(screen.getByLabelText('Show 5 days')).toBeTruthy();
    expect(screen.getByTestId('today-range-1').props.accessibilityState.selected).toBe(true);
  });

  it('renders the Weekly Summary card with Swift’s copy', async () => {
    await renderToday();

    expect(screen.getByText('Weekly Summary')).toBeTruthy();
    expect(screen.getByText('Review progress, focus time, and accomplishments')).toBeTruthy();
  });

  it('renders the intelligence card with the commitment counts', async () => {
    await renderToday();

    // One event and one task fall on today.
    await waitFor(() => expect(screen.getByTestId('today-commitments').props.children).toBe('2 commitments today'));
    expect(screen.getByText('1 Task · 1 Appointment')).toBeTruthy();
    expect(screen.getByText('Your day, in focus')).toBeTruthy();
  });

  it('lists the schedule rows for the selected range', async () => {
    await renderToday();

    await waitFor(() => expect(screen.getByText('Standup')).toBeTruthy());
    expect(screen.getByText('Pack boxes')).toBeTruthy();
    // The 18th is outside the Today range.
    expect(screen.queryByText('Ship the deck')).toBeNull();
  });

  it('widens the schedule when a longer range is chosen', async () => {
    await renderToday();
    await waitFor(() => expect(screen.getByText('Pack boxes')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('today-range-5'));

    await waitFor(() => expect(screen.getByText('Ship the deck')).toBeTruthy());
    expect(screen.getByText('Your next 5 days')).toBeTruthy();
    expect(screen.getByTestId('today-commitments').props.children).toBe('3 commitments ahead');
  });

  it('shows the attention chip from the overdue count', async () => {
    await renderToday();
    await waitFor(() => expect(screen.getByText('1 thing needs attention')).toBeTruthy());
  });

  it('says nothing needs attention when there is no overdue work', async () => {
    mockAgenda.mockResolvedValue({ ...AGENDA, overdue: [] });
    await renderToday();
    await waitFor(() => expect(screen.getByText('Nothing needs attention')).toBeTruthy());
  });

  it('shows the empty schedule state with Swift’s copy', async () => {
    mockAgenda.mockResolvedValue({ ...AGENDA, tasks: [], events: [], overdue: [] });
    await renderToday();

    await waitFor(() => expect(screen.getByText('Your schedule is clear')).toBeTruthy());
    expect(screen.getByText('Add a task or enjoy the open space.')).toBeTruthy();
  });

  it('renders the "What should I do now?" entry', async () => {
    await renderToday();

    expect(screen.getByLabelText('What should I do now?')).toBeTruthy();
    expect(screen.getByText('Find the best task for the time you have, and start focusing.')).toBeTruthy();
  });

  it('renders the weather chip from the open-meteo forecast', async () => {
    await renderToday();

    await waitFor(() => expect(screen.getByLabelText('San Ramon weather, 71 degrees Fahrenheit')).toBeTruthy());
    // Fahrenheit, rounded, exactly as `Int($0.current.temperature.rounded())` does.
    expect(screen.getByText('71°')).toBeTruthy();
  });

  it('falls back to a dash when the forecast fails, without surfacing an error', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    await renderToday();

    await waitFor(() => expect(screen.getByLabelText('Weather temporarily unavailable')).toBeTruthy());
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('renders no focus strip until a session is live', async () => {
    await renderToday();
    expect(screen.queryByTestId('focus-strip')).toBeNull();
  });

  it('renders the focus strip once a session starts', async () => {
    mockUpdateTask.mockResolvedValue({
      task: task({ id: 't1', title: 'Pack boxes', status: 'IN_PROGRESS' }),
      focus: { minutes: 25, workSessionId: 'w1', focusToken: 'tok-1' },
    });
    await renderToday();
    await waitFor(() => expect(screen.getByText('Pack boxes')).toBeTruthy());

    await useFocus.getState().startFocus(task({ id: 't1', title: 'Pack boxes' }));

    await waitFor(() => expect(screen.getByTestId('focus-strip')).toBeTruthy());
    // `remainingSeconds` rounds UP, so a sub-millisecond gap between the strip's tick and the
    // session start reads 25:01 rather than 25:00; the minute is the part that matters.
    expect(screen.getByTestId('focus-clock').props.children).toMatch(/^25:0[01]$/);
    expect(screen.getByTestId('focus-title').props.children).toBe('Pack boxes');
  });
});

describe('Today navigation', () => {
  it('opens the task editor from the add button', async () => {
    await renderToday();
    await fireEvent.press(screen.getByLabelText('Add a task'));
    expect(mockPush).toHaveBeenCalledWith('/task/new');
  });

  it('opens Do Now from the intelligence card', async () => {
    await renderToday();
    await fireEvent.press(screen.getByLabelText('What should I do now?'));
    expect(mockPush).toHaveBeenCalledWith('/today/do-now');
  });

  it('opens a task from a schedule row', async () => {
    await renderToday();
    await waitFor(() => expect(screen.getByText('Pack boxes')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('today-row-task:t1'));
    expect(mockPush).toHaveBeenCalledWith('/task/t1');
  });

  it('opens Calendar from an event row and from View day', async () => {
    await renderToday();
    await waitFor(() => expect(screen.getByText('Standup')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('today-row-event:e1'));
    expect(mockPush).toHaveBeenCalledWith('/calendar');

    mockPush.mockClear();
    await fireEvent.press(screen.getByLabelText('Open Calendar'));
    expect(mockPush).toHaveBeenCalledWith('/calendar');
  });
});

describe('Today search', () => {
  it('filters the schedule by keyword across the selected range', async () => {
    await renderToday();
    await waitFor(() => expect(screen.getByText('Standup')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Search tasks'));
    await fireEvent.changeText(screen.getByLabelText('Search tasks by keywords'), 'pack');

    await waitFor(() => expect(screen.queryByText('Standup')).toBeNull());
    expect(screen.getByText('Pack boxes')).toBeTruthy();
  });

  it('shows the search empty state, which differs from the clear-schedule one', async () => {
    await renderToday();
    await fireEvent.press(screen.getByLabelText('Search tasks'));
    await fireEvent.changeText(screen.getByLabelText('Search tasks by keywords'), 'zzzz');

    await waitFor(() => expect(screen.getByText('No matching tasks')).toBeTruthy());
    expect(screen.getByText('Try different keywords or select a wider date range.')).toBeTruthy();
  });

  it('matches only tasks, never calendar events', async () => {
    await renderToday();
    await fireEvent.press(screen.getByLabelText('Search tasks'));
    await fireEvent.changeText(screen.getByLabelText('Search tasks by keywords'), 'standup');

    // "Standup" is an event, and `visibleSchedule` requires `item.task`.
    await waitFor(() => expect(screen.getByText('No matching tasks')).toBeTruthy());
  });
});

/** The Phase 3 lesson, as an assertion: nothing may appear that `body` does not render. */
describe('Today renders no invented section', () => {
  it('has none of the sections a model-first port would have produced', async () => {
    await renderToday();

    for (const invented of ['Overview', 'Statistics', 'Quick actions', 'Upcoming', 'Inbox', 'Streak']) {
      expect(screen.queryByText(invented)).toBeNull();
    }
  });

  it('does not render the Run B sections yet, and does not fake them', async () => {
    await renderToday();

    // The action queue, protected time and the persistent next-action card are Run B.
    expect(screen.queryByText('Make room for important work')).toBeNull();
    expect(screen.queryByText('Needs your attention')).toBeNull();
    expect(screen.queryByText('Daily Briefing')).toBeNull();
  });

  it('keeps sign-out off the dashboard itself', async () => {
    await renderToday();
    // It moved into the __DEV__ menu, which is collapsed until the version text is long-pressed.
    expect(screen.queryByTestId('sign-out')).toBeNull();
  });
});
