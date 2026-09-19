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
const mockIntelligence = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    tasks: (...args: unknown[]) => mockTasks(...args),
    agenda: (...args: unknown[]) => mockAgenda(...args),
    updateTask: (...args: unknown[]) => mockUpdateTask(...args),
    scheduleIntelligence: (...args: unknown[]) => mockIntelligence(...args),
  },
}));

// Phase 11: the moment count and the Quick Access statuses.
const mockMoments = jest.fn();
jest.mock('../api/moments', () => ({ momentsEndpoints: { list: (...args: unknown[]) => mockMoments(...args) } }));
const mockShopping = jest.fn();
jest.mock('../api/shopping', () => ({ shoppingEndpoints: { list: (...args: unknown[]) => mockShopping(...args) } }));

// The weather chip calls open-meteo directly, not the Nexdo API.
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import Today from '../../app/(tabs)/today/index';

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
  // No intelligence by default: the dashboard then builds its schedule from the agenda.
  mockIntelligence.mockRejectedValue(new Error('unavailable'));
  mockMoments.mockResolvedValue({ moments: [], emailAccount: null, emailConfigured: false, automaticEmailEnabled: false });
  mockShopping.mockResolvedValue({ lists: [] });
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

  it('renders Quick Access in place of the Weekly Summary card (d444b37)', async () => {
    await renderToday();

    expect(screen.getByText('Quick Access')).toBeTruthy();
    expect(screen.getByText('Weekly')).toBeTruthy();
    expect(screen.getByText('Summary')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('quick-access-moments-subtitle').props.children).toBe('0 upcoming'));
    expect(screen.getByTestId('quick-access-shopping-subtitle').props.children).toBe('Your lists');
    expect(screen.queryByText('Review progress, focus time, and accomplishments')).toBeNull();
  });

  it('renders the intelligence card with the commitment counts', async () => {
    await renderToday();

    // One event and one task fall on today.
    await waitFor(() => expect(screen.getByTestId('today-commitments').props.children).toBe('2 commitments today'));
    expect(screen.getByTestId('today-summary-line').props.children).toBe('1 Task · 1 Appointment · 0 Moments');
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

  it('renders the Focus next card’s empty state instead of the old "What should I do now?" entry', async () => {
    await renderToday();

    expect(screen.getByTestId('today-focus-next')).toBeTruthy();
    expect(screen.getByText('Focus next')).toBeTruthy();
    expect(screen.getByText('Find a task for the time you have.')).toBeTruthy();
    expect(screen.getByText('Find my next task')).toBeTruthy();
    expect(screen.queryByLabelText('What should I do now?')).toBeNull();
    expect(screen.queryByText('Find the best task for the time you have, and start focusing.')).toBeNull();
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

  it('opens Do Now from "Find my next task"', async () => {
    await renderToday();
    await fireEvent.press(screen.getByTestId('today-focus-find'));
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

  it('does not render the sections that are still deferred, and does not fake them', async () => {
    await renderToday();

    // With no server data there is no protected-time proposal, and the Daily Briefing row and the
    // "What should I do now?" entry no longer exist in Swift at all (d444b37, 63d9542).
    expect(screen.queryByText('Make room for important work')).toBeNull();
    expect(screen.queryByText('Daily Briefing')).toBeNull();
    expect(screen.queryByText('What should I do now?')).toBeNull();
    // The inline attention list is gone too; the row replaces it.
    expect(screen.queryByText('Needs your attention')).toBeNull();
  });

  it('keeps sign-out off the dashboard itself', async () => {
    await renderToday();
    // It moved into the __DEV__ menu, which is collapsed until the version text is long-pressed.
    expect(screen.queryByTestId('sign-out')).toBeNull();
  });
});

/** Section 10 of `body`: the attention row (RootView.swift:1146-1166), which replaced the inline list. */
describe('Today attention row', () => {
  const INTELLIGENCE = {
    today: {
      day: '2026-09-16',
      timeZone: ZONE,
      commitments: 2,
      appointments: 1,
      tasks: 1,
      overdue: 1,
      availableMinutes: 90,
      timeline: [],
      attention: [
        {
          id: 'gap',
          label: 'Schedule check',
          title: 'Not enough time before Friday',
          explanation: 'Two tasks need 90 minutes before their deadline.',
          recommendedAction: 'Move one task earlier.',
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
          explanation: 'Renew passport is past its deadline.',
          recommendedAction: 'Reschedule or complete it.',
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

  const OVERDUE = task({ id: 'late', title: 'Renew passport', dueAt: atLocal('2026-09-10', '10:00') });

  it('shows one row: overdue tasks from the TASK LIST, then the other checks', async () => {
    mockIntelligence.mockResolvedValue(INTELLIGENCE);
    mockTasks.mockResolvedValue({ tasks: [...AGENDA.tasks, OVERDUE], timeZone: ZONE });
    await renderToday();

    await waitFor(() => expect(screen.getByTestId('today-attention-subtitle').props.children).toBe('1 overdue task · 1 other'));
    expect(screen.getByText('Needs attention')).toBeTruthy();
    expect(screen.getByTestId('today-attention-count').props.children).toBe('2');
    // No per-item cards any more.
    expect(screen.queryByTestId('today-attention-overdue')).toBeNull();
    expect(screen.queryByTestId('today-attention-gap')).toBeNull();
  });

  it('names only the schedule checks when nothing is overdue', async () => {
    mockIntelligence.mockResolvedValue(INTELLIGENCE);
    await renderToday();

    // The "overdue" intelligence item is ignored: the count comes from `OverdueTasks.results`.
    await waitFor(() => expect(screen.getByTestId('today-attention-subtitle').props.children).toBe('1 schedule check'));
    expect(screen.getByTestId('today-attention-count').props.children).toBe('1');
  });

  it('shows no row when nothing needs attention', async () => {
    await renderToday();
    await waitFor(() => expect(screen.getByText('Pack boxes')).toBeTruthy());
    expect(screen.queryByTestId('today-attention-summary')).toBeNull();
  });

  it('shows no row on the 3- and 5-day ranges', async () => {
    mockIntelligence.mockResolvedValue(INTELLIGENCE);
    await renderToday();
    await waitFor(() => expect(screen.getByTestId('today-attention-summary')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('today-range-3'));
    expect(screen.queryByTestId('today-attention-summary')).toBeNull();
    expect(screen.queryByTestId('today-focus-next')).toBeNull();
  });

  it('counts attention items from intelligence rather than the overdue list', async () => {
    mockIntelligence.mockResolvedValue(INTELLIGENCE);
    await renderToday();

    // Two attention items, even though the agenda carries one overdue task.
    await waitFor(() => expect(screen.getByText('2 things need attention')).toBeTruthy());
  });

  it('opens the Needs attention sheet from the row', async () => {
    mockIntelligence.mockResolvedValue(INTELLIGENCE);
    await renderToday();
    await waitFor(() => expect(screen.getByTestId('today-attention-summary')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('today-attention-summary'));
    expect(mockPush).toHaveBeenCalledWith('/today/attention');
  });

  it('uses the server timeline as the Today schedule once intelligence loads', async () => {
    mockIntelligence.mockResolvedValue({
      ...INTELLIGENCE,
      today: {
        ...INTELLIGENCE.today,
        attention: [],
        timeline: [
          {
            id: 'tl1',
            sourceId: 't1',
            kind: 'task',
            title: 'From the timeline',
            startAt: atLocal('2026-09-16', '11:00'),
            endAt: null,
            allDay: false,
            deadlineOnly: false,
            past: false,
          },
        ],
      },
    });
    await renderToday();

    await waitFor(() => expect(screen.getByText('From the timeline')).toBeTruthy());
    // The agenda build is replaced wholesale, so its rows are gone.
    expect(screen.queryByText('Standup')).toBeNull();
  });

  it('rejects a stale snapshot whose day is not today', async () => {
    mockIntelligence.mockResolvedValue({ ...INTELLIGENCE, today: { ...INTELLIGENCE.today, day: '2026-09-15' } });
    await renderToday();

    // It falls back to the agenda build and the agenda overdue count.
    await waitFor(() => expect(screen.getByText('1 thing needs attention')).toBeTruthy());
    expect(screen.getByText('Standup')).toBeTruthy();
  });
});

describe('Today navigation to the Run B screens', () => {
  it('opens the weather forecast from the chip', async () => {
    await renderToday();
    await waitFor(() => expect(screen.getByLabelText(/San Ramon weather/)).toBeTruthy());

    await fireEvent.press(screen.getByTestId('weather-chip'));
    expect(mockPush).toHaveBeenCalledWith('/today/weather');
  });

  it('opens the weekly summary from the Quick Access tile', async () => {
    await renderToday();
    await fireEvent.press(screen.getByTestId('quick-access-weekly'));
    expect(mockPush).toHaveBeenCalledWith('/today/weekly-summary');
  });

  it('opens Moments and Shopping from their tiles', async () => {
    await renderToday();
    await fireEvent.press(screen.getByTestId('quick-access-moments'));
    expect(mockPush).toHaveBeenCalledWith('/moments');
    await fireEvent.press(screen.getByTestId('quick-access-shopping'));
    expect(mockPush).toHaveBeenCalledWith('/shopping');
  });

  it('opens the attention screen from the summary chip', async () => {
    await renderToday();
    await waitFor(() => expect(screen.getByTestId('today-attention-chip')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('today-attention-chip'));
    expect(mockPush).toHaveBeenCalledWith('/today/attention');
  });
});

/** Phase 11: the Quick Access statuses and the moment count come from `/api/moments` and `/api/shopping`. */
describe('Today moments and shopping', () => {
  const moment = (id: string, nextOccurrence: string, extra: Record<string, unknown> = {}) => ({
    id,
    type: 'custom',
    title: `Moment ${id}`,
    firstName: '',
    phone: '',
    email: '',
    occurrenceDate: nextOccurrence,
    timeZoneID: ZONE,
    source: 'manual',
    sourceKey: id,
    yearly: false,
    enabled: true,
    festivalSettings: '{}',
    snoozedUntil: null,
    nextOccurrence,
    drafts: [],
    ...extra,
  });

  it('counts today’s moments into the commitments and the summary line', async () => {
    mockMoments.mockResolvedValue({
      moments: [moment('a', '2026-09-16'), moment('b', '2026-09-20'), moment('off', '2026-09-16', { enabled: false })],
      emailAccount: null,
      emailConfigured: false,
      automaticEmailEnabled: false,
    });
    await renderToday();

    await waitFor(() => expect(screen.getByTestId('today-summary-line').props.children).toBe('1 Task · 1 Appointment · 1 Moment'));
    expect(screen.getByTestId('today-commitments').props.children).toBe('3 commitments today');
    // Two enabled moments on or after today.
    expect(screen.getByTestId('quick-access-moments-subtitle').props.children).toBe('2 upcoming');
  });

  it('drops the moment count on the longer ranges, as Swift passes 0', async () => {
    mockMoments.mockResolvedValue({ moments: [moment('a', '2026-09-16')], emailAccount: null, emailConfigured: false, automaticEmailEnabled: false });
    await renderToday();
    await waitFor(() => expect(screen.getByTestId('today-summary-line').props.children).toBe('1 Task · 1 Appointment · 1 Moment'));

    await fireEvent.press(screen.getByTestId('today-range-3'));
    // The 18th's task joins on the 3-day range; the moment does not.
    await waitFor(() => expect(screen.getByTestId('today-summary-line').props.children).toBe('2 Tasks · 1 Appointment · 0 Moments'));
  });

  it('shows the earliest open shopping list’s remaining items and weekday', async () => {
    const item = (id: string, checked: boolean) => ({ id, name: id, category: 'Other', quantity: '1', size: '', notes: '', checked });
    mockShopping.mockResolvedValue({
      lists: [
        { id: 'later', title: 'Later', date: '2026-09-25', timeZone: ZONE, weekly: false, completedAt: null, revision: 0, items: [item('x', false)] },
        { id: 'next', title: 'Next', date: '2026-09-18', timeZone: ZONE, weekly: false, completedAt: null, revision: 0, items: [item('a', false), item('b', true), item('c', false)] },
        { id: 'done', title: 'Done', date: '2026-09-01', timeZone: ZONE, weekly: false, completedAt: '2026-09-02T00:00:00.000Z', revision: 0, items: [] },
      ],
    });
    await renderToday();

    await waitFor(() => expect(screen.getByTestId('quick-access-shopping-subtitle').props.children).toBe('2 items · Fri'));
  });

  it('reads "View lists" when the shopping refresh fails', async () => {
    mockShopping.mockRejectedValue(new Error('offline'));
    await renderToday();

    await waitFor(() => expect(screen.getByTestId('quick-access-shopping-subtitle').props.children).toBe('View lists'));
  });
});
