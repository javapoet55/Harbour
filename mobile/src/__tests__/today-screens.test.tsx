import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { NexdoTask, WeeklySummary } from '../api/types';
import { resetRevisions } from '../query/taskRevision';
import { useSession } from '../store/session';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockParams = jest.fn(() => ({}) as Record<string, string>);
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), replace: (...args: unknown[]) => mockReplace(...args), back: jest.fn() },
  useLocalSearchParams: () => mockParams(),
}));

const mockTasks = jest.fn();
const mockWeekly = jest.fn();
const mockIntelligence = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    tasks: (...args: unknown[]) => mockTasks(...args),
    weeklySummary: (...args: unknown[]) => mockWeekly(...args),
    scheduleIntelligence: (...args: unknown[]) => mockIntelligence(...args),
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import Attention from '../../app/today/attention';
import Overdue from '../../app/today/overdue';
import ScheduleCheck from '../../app/today/schedule-check';
import Weather from '../../app/today/weather';
import WeeklySummaryScreen from '../../app/today/weekly-summary';
import WeeklyTasks from '../../app/today/weekly-tasks';

const ZONE = 'Asia/Kolkata';
/** 2026-09-16 09:00 in Asia/Kolkata (a Wednesday). */
const NOW = Date.parse('2026-09-16T03:30:00.000Z');

function task(overrides: Partial<NexdoTask> & { id: string }): NexdoTask {
  return { title: 'A task', status: 'PLANNED', priority: 'NORMAL', durationMin: 30, ...overrides };
}

function wrap(node: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

/**
 * Render the weather screen and wait for the forecast to be ON SCREEN. Waiting for the fetch call, or
 * for "San Ramon", is not enough: both happen before the query resolves.
 */
async function renderWeather() {
  const view = await wrap(<Weather />);
  await waitFor(() => expect(screen.getByTestId('weather-current')).toBeTruthy());
  return view;
}

const SUMMARY: WeeklySummary = {
  timeZone: ZONE,
  start: '2026-09-14',
  end: '2026-09-20',
  generatedAt: '2026-09-16T03:30:00.000Z',
  headline: 'A steady week',
  summary: 'You finished most of what you planned.',
  metrics: { completed: 7, planned: 10, completionRate: 70, overdue: 2, focusMinutes: 150 },
  taskGroups: {
    planned: [task({ id: 'p1', title: 'Planned one' })],
    completed: [task({ id: 'c1', title: 'Completed one', status: 'COMPLETED' })],
    overdue: [task({ id: 'o1', title: 'Overdue one' })],
  },
  days: [
    { date: '2026-09-14', planned: 3, completed: 2 },
    { date: '2026-09-15', planned: 2, completed: 2 },
    { date: '2026-09-16', planned: 5, completed: 3 },
  ],
  accomplishments: [{ id: 'c1', title: 'Completed one', priority: 'HIGH' }],
  productivityInsight: 'Mornings are your strongest block.',
  limitations: [],
};

/**
 * What open-meteo actually returns for the hardcoded San Ramon coordinates with `timezone=auto`: the
 * forecast is in AMERICA/LOS_ANGELES, so at 2026-09-16 09:00 Kolkata it is still the 15th there, and
 * the first row is the one that reads "Today". Swift resolves it the same way
 * (`WeatherForecastView.swift:85-95` defaults to America/Los_Angeles).
 */
const FORECAST = {
  current: { temperature_2m: 71.4, weather_code: 0 },
  timezone: 'America/Los_Angeles',
  daily: {
    time: ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19'],
    weather_code: [0, 61, 2, 3, 45],
    temperature_2m_max: [80, 81, 82, 83, 84],
    temperature_2m_min: [60, 61, 62, 63, 64],
    precipitation_probability_max: [0, 80, 20, 30, 40],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  resetRevisions();
  mockParams.mockReturnValue({});
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Sri Ram', email: 'a@b.com', timeZone: ZONE } });
  mockTasks.mockResolvedValue({ tasks: [], timeZone: ZONE });
  mockWeekly.mockResolvedValue(SUMMARY);
  mockIntelligence.mockRejectedValue(new Error('unavailable'));
  mockFetch.mockResolvedValue({ ok: true, json: async () => FORECAST });
});

afterEach(() => jest.useRealTimers());

/** `OverdueTasksView` (ios/App/OverdueTasksView.swift:15-69). */
describe('Overdue screen', () => {
  it('lists overdue tasks oldest first, with a due label', async () => {
    mockTasks.mockResolvedValue({
      tasks: [
        task({ id: 'a', title: 'Renew passport', startAt: '2026-09-15T03:30:00.000Z' }),
        task({ id: 'b', title: 'Pay rent', startAt: '2026-09-10T03:30:00.000Z' }),
        task({ id: 'c', title: 'Future work', startAt: '2026-09-20T03:30:00.000Z' }),
      ],
      timeZone: ZONE,
    });
    await wrap(<Overdue />);

    await waitFor(() => expect(screen.getByTestId('overdue-count').props.children).toBe('2 UNFINISHED DEADLINES'));
    expect(screen.getByText('Due Sep 10, 2026, 9:00 AM')).toBeTruthy();
    expect(screen.queryByText('Future work')).toBeNull();
  });

  it('singularises one deadline', async () => {
    mockTasks.mockResolvedValue({ tasks: [task({ id: 'a', startAt: '2026-09-15T03:30:00.000Z' })], timeZone: ZONE });
    await wrap(<Overdue />);
    await waitFor(() => expect(screen.getByTestId('overdue-count').props.children).toBe('1 UNFINISHED DEADLINE'));
  });

  it('shows the empty state with Swift’s copy', async () => {
    await wrap(<Overdue />);
    await waitFor(() => expect(screen.getByText('No unfinished deadlines')).toBeTruthy());
    expect(screen.getByText('You have no overdue tasks.')).toBeTruthy();
  });

  it('opens a task', async () => {
    mockTasks.mockResolvedValue({ tasks: [task({ id: 'a', startAt: '2026-09-15T03:30:00.000Z' })], timeZone: ZONE });
    await wrap(<Overdue />);
    await waitFor(() => expect(screen.getByTestId('overdue-row-a')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('overdue-row-a'));
    expect(mockPush).toHaveBeenCalledWith('/task/a');
  });
});

/** `WeatherForecastView` (ios/App/WeatherForecastView.swift:11-72). */
describe('Weather forecast screen', () => {
  it('renders the hardcoded location, the current reading and five days', async () => {
    await renderWeather();

    expect(screen.getByText('San Ramon')).toBeTruthy();
    expect(screen.getByText('5-day forecast · °F')).toBeTruthy();
    expect(screen.getByText('71°')).toBeTruthy();
    for (const day of FORECAST.daily.time) {
      expect(screen.getByTestId(`weather-day-${day}`)).toBeTruthy();
    }
  });

  it('labels the first day "Today" and names each condition', async () => {
    await renderWeather();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Rain')).toBeTruthy();
    expect(screen.getByText('80% chance of precipitation')).toBeTruthy();
  });

  it('shows the high and low for each day', async () => {
    await renderWeather();
    expect(screen.getByText('H 80°')).toBeTruthy();
    expect(screen.getByText('L 60°')).toBeTruthy();
  });

  it('shows the load failure wording when nothing is cached', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    await wrap(<Weather />);
    await waitFor(() => expect(screen.getByText('Couldn’t load the forecast. Please try again.')).toBeTruthy());
  });

  it('credits Open-Meteo', async () => {
    await renderWeather();
    expect(screen.getByLabelText('Weather by Open-Meteo')).toBeTruthy();
  });
});

/** `WeeklySummaryView` (ios/App/WeeklySummaryView.swift:24-73). */
describe('Weekly summary screen', () => {
  it('renders every section in Swift’s order', async () => {
    await wrap(<WeeklySummaryScreen />);

    await waitFor(() => expect(screen.getByTestId('weekly-range')).toBeTruthy());
    expect(screen.getByTestId('weekly-range').props.children).toBe('Sep 14–Sep 20, 2026');
    expect(screen.getByTestId('weekly-headline').props.children).toBe('A steady week');
    expect(screen.getByText('7 of 10')).toBeTruthy();
    expect(screen.getByText('70%')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('2.5h')).toBeTruthy();
    expect(screen.getByText('Planned vs completed')).toBeTruthy();
    expect(screen.getByText('Top accomplishments')).toBeTruthy();
    expect(screen.getByTestId('weekly-insight')).toBeTruthy();
    expect(screen.getByText('Plan next week with Nexdo AI →')).toBeTruthy();
  });

  it('disables Next week on the current week and allows Previous', async () => {
    await wrap(<WeeklySummaryScreen />);
    await waitFor(() => expect(screen.getByTestId('weekly-next')).toBeTruthy());

    expect(screen.getByTestId('weekly-next').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(screen.getByTestId('weekly-previous'));
    await waitFor(() => expect(mockWeekly).toHaveBeenCalledWith('2026-09-07'));
    await waitFor(() => expect(screen.getByTestId('weekly-next').props.accessibilityState.disabled).toBe(false));
  });

  it('shows a day breakdown when a chart day is chosen', async () => {
    await wrap(<WeeklySummaryScreen />);
    await waitFor(() => expect(screen.getByTestId('weekly-day-2026-09-16')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('weekly-day-2026-09-16'));

    await waitFor(() =>
      expect(screen.getByTestId('weekly-selected-day').props.children).toBe('Wed, Sep 16: 5 planned, 3 completed'),
    );
  });

  it('shows the no-activity state when every day is zero', async () => {
    mockWeekly.mockResolvedValue({ ...SUMMARY, days: [{ date: '2026-09-14', planned: 0, completed: 0 }] });
    await wrap(<WeeklySummaryScreen />);
    await waitFor(() => expect(screen.getByText('No task activity')).toBeTruthy());
  });

  it('opens the task list from the completed and overdue metrics', async () => {
    await wrap(<WeeklySummaryScreen />);
    await waitFor(() => expect(screen.getByTestId('weekly-metric-completed')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('weekly-metric-completed'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/today/weekly-tasks', params: { start: '2026-09-14', filter: 'Completed' } });

    await fireEvent.press(screen.getByTestId('weekly-metric-overdue'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/today/weekly-tasks', params: { start: '2026-09-14', filter: 'Overdue' } });
  });

  it('opens a task from an accomplishment', async () => {
    await wrap(<WeeklySummaryScreen />);
    await waitFor(() => expect(screen.getByTestId('weekly-accomplishment-c1')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('weekly-accomplishment-c1'));
    expect(mockPush).toHaveBeenCalledWith('/task/c1');
  });

  it('says so when a metric is unavailable', async () => {
    mockWeekly.mockResolvedValue({ ...SUMMARY, metrics: { completed: 1, planned: 2, completionRate: null, overdue: null, focusMinutes: null } });
    await wrap(<WeeklySummaryScreen />);
    await waitFor(() => expect(screen.getAllByText('Unavailable').length).toBeGreaterThanOrEqual(2));
  });

  it('shows the error state with Retry', async () => {
    mockWeekly.mockRejectedValue(new Error('Choose a valid date in the current week or an earlier week.'));
    await wrap(<WeeklySummaryScreen />);
    await waitFor(() => expect(screen.getByText('Couldn’t load this week')).toBeTruthy());
    expect(screen.getByTestId('weekly-retry')).toBeTruthy();
  });
});

/** `WeeklySummaryTasksView` (ios/App/WeeklySummaryView.swift:264-315). */
describe('Weekly tasks screen', () => {
  it('opens on the filter it was given and lists that group', async () => {
    mockParams.mockReturnValue({ start: '2026-09-14', filter: 'Overdue' });
    await wrap(<WeeklyTasks />);

    await waitFor(() => expect(screen.getByText('Overdue one')).toBeTruthy());
    expect(screen.getByTestId('weekly-tasks-count').props.children).toBe('1 OVERDUE TASKS');
    expect(screen.queryByText('Completed one')).toBeNull();
  });

  it('shows the overdue caveat only on the overdue filter', async () => {
    mockParams.mockReturnValue({ start: '2026-09-14', filter: 'Overdue' });
    await wrap(<WeeklyTasks />);
    await waitFor(() =>
      expect(
        screen.getByText(
          'Overdue within this week’s planned tasks, as of the report. A task may have been completed since then.',
        ),
      ).toBeTruthy(),
    );
  });

  it('switches filter and re-lists', async () => {
    mockParams.mockReturnValue({ start: '2026-09-14', filter: 'Completed' });
    await wrap(<WeeklyTasks />);
    await waitFor(() => expect(screen.getByText('Completed one')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('weekly-tasks-filter'));
    await fireEvent.press(screen.getByTestId('weekly-tasks-filter-Overdue'));

    await waitFor(() => expect(screen.getByText('Overdue one')).toBeTruthy());
  });

  it('shows the week range', async () => {
    mockParams.mockReturnValue({ start: '2026-09-14', filter: 'Completed' });
    await wrap(<WeeklyTasks />);
    await waitFor(() => expect(screen.getByTestId('weekly-tasks-range').props.children).toBe('Mon, Sep 14 – Sun, Sep 20'));
  });

  it('says when a group is empty', async () => {
    mockWeekly.mockResolvedValue({ ...SUMMARY, taskGroups: { planned: [], completed: [], overdue: [] } });
    mockParams.mockReturnValue({ start: '2026-09-14', filter: 'Completed' });
    await wrap(<WeeklyTasks />);
    await waitFor(() => expect(screen.getByText('No completed tasks for this period.')).toBeTruthy());
  });
});

/** `attentionDetails` and `scheduleCheckDetails` (ios/App/RootView.swift:1202-1259). */
describe('Attention and schedule check screens', () => {
  const ATTENTION = {
    today: {
      day: '2026-09-16',
      timeZone: ZONE,
      commitments: 0,
      appointments: 0,
      tasks: 0,
      overdue: 1,
      availableMinutes: 0,
      timeline: [],
      attention: [
        {
          id: 'gap',
          label: 'Schedule check',
          title: 'Not enough time',
          explanation: 'Two tasks need 90 minutes.',
          recommendedAction: 'Move one earlier.',
          kind: 'GAP',
          taskId: null,
          taskIds: ['t1'],
          requiredMinutes: 90,
          deadlineAt: '2026-09-18T03:30:00.000Z',
        },
        {
          id: 'overdue',
          label: 'Overdue',
          title: '1 overdue task',
          explanation: 'Past its deadline.',
          recommendedAction: 'Reschedule it.',
          kind: 'OVERDUE',
          taskId: null,
          taskIds: [],
          requiredMinutes: null,
          deadlineAt: null,
        },
      ],
      recommendation: { title: '', explanation: '', additionalAdvice: null, kind: '', taskId: null },
    },
  };

  it('lists attention items with overdue first', async () => {
    mockIntelligence.mockResolvedValue(ATTENTION);
    await wrap(<Attention />);

    await waitFor(() => expect(screen.getByTestId('attention-overdue')).toBeTruthy());
    expect(screen.getByText('Not enough time')).toBeTruthy();
    expect(screen.getByText('OVERDUE')).toBeTruthy();
  });

  it('shows the empty state when nothing needs attention', async () => {
    mockIntelligence.mockResolvedValue({ ...ATTENTION, today: { ...ATTENTION.today, attention: [] } });
    await wrap(<Attention />);
    await waitFor(() => expect(screen.getByText('Nothing needs attention')).toBeTruthy());
  });

  it('falls back to the overdue screen when intelligence is unavailable', async () => {
    await wrap(<Attention />);
    await waitFor(() => expect(screen.getByTestId('attention-fallback')).toBeTruthy());
  });

  it('renders the schedule check with its section title and tasks', async () => {
    mockIntelligence.mockResolvedValue(ATTENTION);
    mockTasks.mockResolvedValue({ tasks: [task({ id: 't1', title: 'Pack boxes', dueAt: '2026-09-18T03:30:00.000Z' })], timeZone: ZONE });
    mockParams.mockReturnValue({ id: 'gap' });
    await wrap(<ScheduleCheck />);

    await waitFor(() => expect(screen.getByTestId('check-explanation').props.children).toBe('Two tasks need 90 minutes.'));
    expect(screen.getByTestId('check-action').props.children).toBe('Move one earlier.');
    expect(screen.getByTestId('check-section-title').props.children).toBe('TASKS NEEDING 90 MINUTES BY 9:00 AM');
    expect(screen.getByText('Pack boxes')).toBeTruthy();
    expect(screen.getByText('30 minutes · due 9:00 AM')).toBeTruthy();
  });

  it('says when the affected tasks are gone', async () => {
    mockIntelligence.mockResolvedValue(ATTENTION);
    mockParams.mockReturnValue({ id: 'gap' });
    await wrap(<ScheduleCheck />);
    await waitFor(() => expect(screen.getByText('The affected tasks are no longer available.')).toBeTruthy());
  });
});
