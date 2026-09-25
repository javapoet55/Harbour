import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Platform, StyleSheet } from 'react-native';

import { ApiError } from '../api/client';
import type { Agenda, NexdoTask } from '../api/types';
import { resetRevisions } from '../query/taskRevision';
import { googleConnectStartUrl, parseGoogleCallback, CONNECT_CALLBACK_SCHEME } from '../query/useCalendar';
import { useCalendarNotice } from '../store/calendarNotice';
import { useSession } from '../store/session';
import { palettes } from '../theme';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => ({}),
}));

jest.mock('expo-crypto', () => ({
  ...jest.requireActual('expo-crypto'),
  randomUUID: () => '11111111-2222-3333-4444-555555555555',
}));

const mockTasks = jest.fn();
const mockAgenda = jest.fn();
const mockIntelligence = jest.fn();
const mockCreateEvent = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: {
    tasks: (...args: unknown[]) => mockTasks(...args),
    agenda: (...args: unknown[]) => mockAgenda(...args),
    scheduleIntelligence: (...args: unknown[]) => mockIntelligence(...args),
    createCalendarEvent: (...args: unknown[]) => mockCreateEvent(...args),
  },
}));

import Calendar, { creationTitlesFit } from '../../app/(tabs)/calendar';
import NewCalendarEvent from '../../app/calendar/event/new';

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

const DAYS = ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22'];

const AGENDA: Agenda = {
  timeZone: ZONE,
  // A wide range so every mode's request is satisfied by the same fixture.
  range: { days: [...DAYS, '2026-08-30', '2026-09-14', '2026-09-15', '2026-10-10'] },
  tasks: [
    task({ id: 't1', title: 'Pack boxes', startAt: atLocal('2026-09-16', '14:00') }),
    task({ id: 't2', title: 'Ship the deck', dueAt: atLocal('2026-09-16', '17:00') }),
    task({ id: 't3', title: 'Critical fix', critical: true, startAt: atLocal('2026-09-17', '09:00') }),
  ],
  events: [{ id: 'e1', title: 'Standup', startAt: atLocal('2026-09-16', '09:30'), endAt: atLocal('2026-09-16', '10:00') }],
  overdue: [],
};

function wrap(node: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

async function renderCalendar() {
  const view = await wrap(<Calendar />);
  await waitFor(() => expect(screen.getByTestId('calendar-summary')).toBeTruthy());
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  resetRevisions();
  useCalendarNotice.setState({ notice: null });
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Sri Ram', email: 'a@b.com', timeZone: ZONE } });
  mockTasks.mockResolvedValue({ tasks: AGENDA.tasks, timeZone: ZONE });
  mockAgenda.mockResolvedValue(AGENDA);
  mockIntelligence.mockRejectedValue(new Error('unavailable'));
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => jest.useRealTimers());

/** `CalendarView.body` (ios/App/CalendarView.swift:72-176), section by section. */
describe('Calendar tab', () => {
  it('renders the header copy and the three modes', async () => {
    await renderCalendar();

    expect(screen.getByText('Calendar')).toBeTruthy();
    expect(screen.getByText('Plan your time. Make it happen.')).toBeTruthy();
    for (const mode of ['Schedule', 'Week', 'Month']) {
      expect(screen.getByTestId(`calendar-mode-${mode}`)).toBeTruthy();
    }
    expect(screen.getByTestId('calendar-mode-Schedule').props.accessibilityState.selected).toBe(true);
  });

  it('merges tasks and events into the day, ordered by time', async () => {
    await renderCalendar();

    await waitFor(() => expect(screen.getByText('Standup')).toBeTruthy());
    expect(screen.getByText('Pack boxes')).toBeTruthy();
    // A deadline task reads "Due", a scheduled one its duration.
    expect(screen.getByText('Task deadline')).toBeTruthy();
    // Two scheduled tasks in range share this detail line, so match all of them.
    expect(screen.getAllByText('30 min · Task').length).toBeGreaterThan(0);
    expect(screen.getByText('30 min · Event')).toBeTruthy();
  });

  it('labels today and tomorrow relatively in Schedule mode', async () => {
    await renderCalendar();
    await waitFor(() => expect(screen.getByText('Today · Wed, Sep 16')).toBeTruthy());
    expect(screen.getByText('Tomorrow · Thu, Sep 17')).toBeTruthy();
  });

  it('shows three days by default and seven when the range changes', async () => {
    await renderCalendar();
    expect(mockAgenda).toHaveBeenCalledWith(3, '2026-09-16');

    await fireEvent.press(screen.getByTestId('calendar-range'));
    await fireEvent.press(screen.getByTestId('calendar-range-Next 7 days'));

    await waitFor(() => expect(mockAgenda).toHaveBeenCalledWith(7, '2026-09-16'));
  });

  it('switches to the Monday-first week when "This week" is chosen', async () => {
    await renderCalendar();

    await fireEvent.press(screen.getByTestId('calendar-range'));
    await fireEvent.press(screen.getByTestId('calendar-range-This week'));

    await waitFor(() => expect(mockAgenda).toHaveBeenCalledWith(7, '2026-09-14'));
  });

  it('shows the summary card with item and deadline counts', async () => {
    await renderCalendar();
    // Two items on the 16th plus one on the 17th, and one deadline.
    await waitFor(() => expect(screen.getByText('4 items · 1 deadline')).toBeTruthy());
  });

  it('opens a task from a row and an event detail sheet from an event row', async () => {
    await renderCalendar();
    await waitFor(() => expect(screen.getByTestId('calendar-row-task:t1')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('calendar-row-task:t1'));
    expect(mockPush).toHaveBeenCalledWith('/task/t1');

    await fireEvent.press(screen.getByTestId('calendar-row-event:e1'));
    await waitFor(() => expect(screen.getByTestId('event-detail-title')).toBeTruthy());
    expect(screen.getByText('Event Details')).toBeTruthy();
    expect(screen.getByTestId('event-detail-starts').props.children).toBe('Starts: Wed, Sep 16, 2026 9:30 AM');
    expect(screen.getByTestId('event-detail-ends').props.children).toBe('Ends: Wed, Sep 16, 2026 10:00 AM');
  });

  it('routes the creation cards', async () => {
    await renderCalendar();

    await fireEvent.press(screen.getByTestId('calendar-add-manual'));
    expect(mockPush).toHaveBeenCalledWith('/calendar/event/new');

    await fireEvent.press(screen.getByTestId('calendar-add-voice'));
    expect(mockPush).toHaveBeenCalledWith('/calendar/voice');
  });
});

describe('Calendar Week and Month modes', () => {
  it('shows a Monday-first week grid and a single day beneath it', async () => {
    await renderCalendar();
    await fireEvent.press(screen.getByTestId('calendar-mode-Week'));

    await waitFor(() => expect(screen.getByTestId('calendar-day-2026-09-14')).toBeTruthy());
    expect(screen.getByText('MON')).toBeTruthy();
    expect(screen.getByTestId('calendar-nav-label').props.children).toBe('Sep 14 – Sep 20, 2026');
    // The mode change refetches for the new range, so the summary appears once that lands.
    await waitFor(() => expect(screen.getByTestId('calendar-week-summary')).toBeTruthy());
  });

  it('shows a Sunday-first month grid', async () => {
    await renderCalendar();
    await fireEvent.press(screen.getByTestId('calendar-mode-Month'));

    await waitFor(() => expect(screen.getByTestId('calendar-nav-label').props.children).toBe('September 2026'));
    expect(screen.getByText('SUN')).toBeTruthy();
    // September 2026 starts on a Tuesday, so the grid opens on 30 August.
    expect(screen.getByTestId('calendar-day-2026-08-30')).toBeTruthy();
  });

  it('moves a week and a month with the arrows, and Today returns', async () => {
    await renderCalendar();
    await fireEvent.press(screen.getByTestId('calendar-mode-Week'));
    await waitFor(() => expect(screen.getByTestId('calendar-previous')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('calendar-next'));
    await waitFor(() => expect(screen.getByTestId('calendar-nav-label').props.children).toBe('Sep 21 – Sep 27, 2026'));

    await fireEvent.press(screen.getByTestId('calendar-today'));
    await waitFor(() => expect(screen.getByTestId('calendar-nav-label').props.children).toBe('Sep 14 – Sep 20, 2026'));
  });

  it('selects a day and shows only that day', async () => {
    await renderCalendar();
    await fireEvent.press(screen.getByTestId('calendar-mode-Week'));
    await waitFor(() => expect(screen.getByTestId('calendar-day-2026-09-17')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('calendar-day-2026-09-17'));

    await waitFor(() => expect(screen.getByText('Critical fix')).toBeTruthy());
    expect(screen.queryByText('Pack boxes')).toBeNull();
  });
});

describe('Calendar filters and search', () => {
  it('hides events when the events filter is off', async () => {
    await renderCalendar();
    await waitFor(() => expect(screen.getByText('Standup')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('calendar-filters'));
    await fireEvent.press(screen.getByTestId('filter-events'));

    await waitFor(() => expect(screen.queryByText('Standup')).toBeNull());
    expect(screen.getByText('Pack boxes')).toBeTruthy();
  });

  it('critical-only hides events entirely, matching Swift', async () => {
    await renderCalendar();
    await fireEvent.press(screen.getByTestId('calendar-filters'));
    await fireEvent.press(screen.getByTestId('filter-critical'));

    await waitFor(() => expect(screen.queryByText('Standup')).toBeNull());
    expect(screen.queryByText('Pack boxes')).toBeNull();
    expect(screen.getByText('Critical fix')).toBeTruthy();
  });

  it('completed-only clears critical-only', async () => {
    await renderCalendar();
    await fireEvent.press(screen.getByTestId('calendar-filters'));
    await fireEvent.press(screen.getByTestId('filter-critical'));
    await waitFor(() => expect(screen.getByTestId('filter-critical').props.accessibilityState.checked).toBe(true));

    await fireEvent.press(screen.getByTestId('filter-completed'));

    await waitFor(() => expect(screen.getByTestId('filter-critical').props.accessibilityState.checked).toBe(false));
  });

  it('shows the filtered empty copy rather than the clear-day copy', async () => {
    await renderCalendar();
    await fireEvent.press(screen.getByTestId('calendar-filters'));
    await fireEvent.press(screen.getByTestId('filter-tasks'));
    await fireEvent.press(screen.getByTestId('filter-events'));

    await waitFor(() => expect(screen.getAllByText('No items match your filters.').length).toBeGreaterThan(0));
    expect(screen.queryByText('Nothing scheduled. Room to breathe.')).toBeNull();
  });

  it('resets every filter', async () => {
    await renderCalendar();
    await fireEvent.press(screen.getByTestId('calendar-filters'));
    await fireEvent.press(screen.getByTestId('filter-tasks'));
    // The menu stays open, so Reset is reachable without re-opening it.
    await fireEvent.press(screen.getByTestId('filter-reset'));

    await waitFor(() => expect(screen.getByText('Pack boxes')).toBeTruthy());
  });

  it('searches across events and tasks in the visible range', async () => {
    await renderCalendar();

    await fireEvent.press(screen.getByTestId('calendar-search-open'));
    await fireEvent.changeText(screen.getByTestId('calendar-search-input'), 'pack');

    await waitFor(() => expect(screen.queryByText('Standup')).toBeNull());
    expect(screen.getByText('Pack boxes')).toBeTruthy();
  });

  it('shows the no-results copy', async () => {
    await renderCalendar();
    await fireEvent.press(screen.getByTestId('calendar-search-open'));
    await fireEvent.changeText(screen.getByTestId('calendar-search-input'), 'zzzz');

    await waitFor(() => expect(screen.getByTestId('calendar-no-results')).toBeTruthy());
  });
});

describe('Calendar renders no invented section', () => {
  it('has no connect or sync controls — those live in Profile, Phase 7', async () => {
    await renderCalendar();

    expect(screen.queryByText('Connect Google Calendar')).toBeNull();
    expect(screen.queryByText('Synchronize now')).toBeNull();
    expect(screen.queryByText('Calendars and privacy')).toBeNull();
  });

  it('has none of the sections a brief-first port would have invented', async () => {
    await renderCalendar();

    for (const invented of ['Day', 'Agenda', 'Year', 'Attendees', 'Add guests', 'My calendars']) {
      expect(screen.queryByText(invented)).toBeNull();
    }
  });
});

/** `CalendarEventEditor` (CalendarView.swift:518-588). */
describe('Calendar event editor', () => {
  it('renders exactly Swift’s field set', async () => {
    await wrap(<NewCalendarEvent />);

    expect(screen.getByText('APPOINTMENT / EVENT')).toBeTruthy();
    expect(screen.getByText('SCHEDULE')).toBeTruthy();
    expect(screen.getByText('REPEAT')).toBeTruthy();
    expect(screen.getByText('LOCATION')).toBeTruthy();
    expect(screen.getByText('NOTES')).toBeTruthy();
    // Swift has no all-day toggle, no attendees, no calendar picker.
    expect(screen.queryByText('All day')).toBeNull();
    expect(screen.queryByText('Attendees')).toBeNull();
    expect(screen.queryByText('Calendar')).toBeNull();
  });

  it('keeps Create Event disabled until there is a title', async () => {
    await wrap(<NewCalendarEvent />);
    expect(screen.getByTestId('event-create').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('event-title'), '   ');
    await waitFor(() => expect(screen.getByTestId('event-create').props.accessibilityState.disabled).toBe(true));

    await fireEvent.changeText(screen.getByTestId('event-title'), 'Dentist');
    await waitFor(() => expect(screen.getByTestId('event-create').props.accessibilityState.disabled).toBe(false));
  });

  it('submits the exact body the route accepts, with no repeat key', async () => {
    mockCreateEvent.mockResolvedValue({ success: true });
    await wrap(<NewCalendarEvent />);

    await fireEvent.changeText(screen.getByTestId('event-title'), '  Dentist  ');
    await fireEvent.changeText(screen.getByTestId('event-location'), 'Clinic');
    await fireEvent.press(screen.getByTestId('event-create'));

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalled());
    const body = mockCreateEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toEqual({
      requestId: '11111111-2222-3333-4444-555555555555',
      title: 'Dentist',
      notes: '',
      location: 'Clinic',
      // Defaults: now + 1 hour, now + 90 minutes.
      startAt: new Date(NOW + 3_600_000).toISOString(),
      endAt: new Date(NOW + 5_400_000).toISOString(),
    });
    // The route's schema is `.strict()`, so a stray `repeat` would be a 400.
    expect('repeat' in body).toBe(false);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('includes the repeat block once a frequency is chosen', async () => {
    mockCreateEvent.mockResolvedValue({ success: true });
    await wrap(<NewCalendarEvent />);

    await fireEvent.changeText(screen.getByTestId('event-title'), 'Standup');
    await fireEvent.press(screen.getByTestId('event-repeat'));
    await fireEvent.press(screen.getByTestId('event-repeat-weekly'));
    await fireEvent.press(screen.getByTestId('event-create'));

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalled());
    const body = mockCreateEvent.mock.calls[0][0] as { repeat?: { frequency: string; until: string; weekdays: number[] } };
    expect(body.repeat).toEqual({ frequency: 'weekly', until: '2026-12-15', weekdays: [] });
  });

  it('requires at least one weekday for the weekdays frequency', async () => {
    await wrap(<NewCalendarEvent />);
    await fireEvent.changeText(screen.getByTestId('event-title'), 'Gym');
    await fireEvent.press(screen.getByTestId('event-repeat'));
    await fireEvent.press(screen.getByTestId('event-repeat-weekdays'));

    await waitFor(() => expect(screen.getByTestId('event-create').props.accessibilityState.disabled).toBe(true));

    await fireEvent.press(screen.getByTestId('event-weekday-1'));
    await waitFor(() => expect(screen.getByTestId('event-create').props.accessibilityState.disabled).toBe(false));
  });

  it('sends the chosen weekdays sorted', async () => {
    mockCreateEvent.mockResolvedValue({ success: true });
    await wrap(<NewCalendarEvent />);
    await fireEvent.changeText(screen.getByTestId('event-title'), 'Gym');
    await fireEvent.press(screen.getByTestId('event-repeat'));
    await fireEvent.press(screen.getByTestId('event-repeat-weekdays'));
    await fireEvent.press(screen.getByTestId('event-weekday-5'));
    await fireEvent.press(screen.getByTestId('event-weekday-1'));
    await fireEvent.press(screen.getByTestId('event-create'));

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalled());
    const body = mockCreateEvent.mock.calls[0][0] as { repeat?: { weekdays: number[] } };
    expect(body.repeat?.weekdays).toEqual([1, 5]);
  });

  /** `scheduleRequest` (NexdoApp.swift:73-85), shared with task writes. */
  it('prompts on SCHEDULE_WARNING and retries with the override and the SAME requestId', async () => {
    const warning = new ApiError({
      status: 409,
      code: 'SCHEDULE_WARNING',
      message: 'That slot is taken.',
      warnings: ['That slot overlaps “Standup”.'],
    });
    mockCreateEvent.mockRejectedValueOnce(warning).mockResolvedValueOnce({ success: true });
    await wrap(<NewCalendarEvent />);

    await fireEvent.changeText(screen.getByTestId('event-title'), 'Dentist');
    await fireEvent.press(screen.getByTestId('event-create'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Review this time', 'That slot overlaps “Standup”.', expect.anything()),
    );

    const buttons = (Alert.alert as unknown as jest.Mock).mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((each) => each.text === 'Save anyway')?.onPress?.();

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalledTimes(2));
    const retry = mockCreateEvent.mock.calls[1][0] as Record<string, unknown>;
    expect(retry.allowScheduleConflict).toBe(true);
    // The same requestId, or the server would create a second series.
    expect(retry.requestId).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('abandons on "Keep previous schedule", with no second request', async () => {
    mockCreateEvent.mockRejectedValueOnce(
      new ApiError({ status: 409, code: 'SCHEDULE_WARNING', message: 'Taken.', warnings: ['Overlaps.'] }),
    );
    await wrap(<NewCalendarEvent />);
    await fireEvent.changeText(screen.getByTestId('event-title'), 'Dentist');
    await fireEvent.press(screen.getByTestId('event-create'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const buttons = (Alert.alert as unknown as jest.Mock).mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((each) => each.text === 'Keep previous schedule')?.onPress?.();

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalledTimes(1));
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('surfaces a server error without closing', async () => {
    mockCreateEvent.mockRejectedValue(new ApiError({ status: 400, message: 'Choose a future start and an end within seven days.' }));
    await wrap(<NewCalendarEvent />);
    await fireEvent.changeText(screen.getByTestId('event-title'), 'Dentist');
    await fireEvent.press(screen.getByTestId('event-create'));

    await waitFor(() => expect(screen.getByTestId('event-failure')).toBeTruthy());
    expect(mockBack).not.toHaveBeenCalled();
  });
});

/** The server writes Nexdo events to the connected calendar and reports it as `calendarPush`. */
describe('Calendar write-back note', () => {
  async function saveEvent(response: Record<string, unknown>) {
    mockCreateEvent.mockResolvedValue(response);
    await wrap(<NewCalendarEvent />);
    await fireEvent.changeText(screen.getByTestId('event-title'), 'Dentist');
    await fireEvent.press(screen.getByTestId('event-create'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  }

  it('shows where a New Event went, with the calendar name, then clears itself', async () => {
    await saveEvent({
      success: true,
      calendarPush: { status: 'pushed', total: 1, succeeded: 1, calendarName: 'sri@example.com' },
      message: 'Saved in Nexdo and added it to your connected calendar. No invitations were sent.',
    });
    await renderCalendar();

    expect(screen.getByTestId('calendar-push-message')).toHaveTextContent('Saved in Nexdo and added it to your connected calendar. No invitations were sent.');
    expect(screen.getByTestId('calendar-push-calendar')).toHaveTextContent('sri@example.com');
    expect(screen.queryByTestId('calendar-push-warning')).toBeNull();

    await act(() => jest.advanceTimersByTime(6000));
    expect(screen.queryByTestId('calendar-push-note')).toBeNull();
  });

  it('keeps a failed write on screen with its warnings until dismissed', async () => {
    const message = 'Saved 2 events in Nexdo; 1 reached your connected calendar and 1 did not.';
    await saveEvent({
      success: true,
      occurrenceCount: 2,
      calendarPush: { status: 'partial', total: 2, succeeded: 1, calendarName: 'Work' },
      message,
      warnings: [message, 'Calendar authorization expired; reconnect the account.'],
    });
    await renderCalendar();

    expect(screen.getByTestId('calendar-push-message')).toHaveTextContent(message);
    // The repeated message is not listed twice; the other warning is.
    expect(screen.getAllByTestId('calendar-push-warning').map((node) => node.props.children)).toEqual(['Calendar authorization expired; reconnect the account.']);
    await act(() => jest.advanceTimersByTime(60_000));
    expect(screen.getByTestId('calendar-push-note')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('calendar-push-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('calendar-push-note')).toBeNull());
  });

  it('shows nothing for a server without write-back', async () => {
    await saveEvent({ success: true });
    await renderCalendar();
    expect(screen.queryByTestId('calendar-push-note')).toBeNull();
  });

  it('does not show one account’s note to another', async () => {
    await saveEvent({ success: true, calendarPush: { status: 'not_connected', total: 0, succeeded: 0 }, message: 'Saved in Nexdo only. No connected calendar is set to receive Nexdo events.' });
    useSession.setState({ status: 'signedIn', profile: { id: 'u2', name: 'Other', email: 'o@b.com', timeZone: ZONE } });
    await renderCalendar();
    expect(screen.queryByTestId('calendar-push-note')).toBeNull();
  });
});

/**
 * `CalendarOAuthCoordinator.connectGoogle` (ios/App/ProfileView.swift:10-30).
 *
 * The connect BUTTON and the token handshake are tested with the settings screen in account.test.tsx;
 * these are the pure helpers.
 */
describe('Google connect helpers', () => {
  it('builds the start URL as `calendarConnectURL` does, carrying the connect token (3a26c52)', () => {
    expect(googleConnectStartUrl('https://app.nexdoapp.com', 'tok+/=')).toBe(
      'https://app.nexdoapp.com/api/calendar/oauth/google/start?native=1&connect_token=tok%2B%2F%3D',
    );
  });

  it('uses the callback scheme the Swift session registers', () => {
    expect(CONNECT_CALLBACK_SCHEME).toBe('nexdo');
  });

  it('treats no callback as a quiet cancel (27798c5)', () => {
    expect(parseGoogleCallback(null)).toEqual({ kind: 'cancelled' });
    expect(parseGoogleCallback('')).toEqual({ kind: 'cancelled' });
  });

  it('treats calendar=error as a failure', () => {
    expect(parseGoogleCallback('nexdo://calendar?calendar=error')).toEqual({
      kind: 'failed',
      // Swift's fallback is `?? "authorization failed"`, with no trailing period.
      message: 'Google Calendar connection failed: authorization failed',
    });
  });

  it('treats ANY detail parameter as a failure, quoting it', () => {
    expect(parseGoogleCallback('nexdo://calendar-connected?calendar=error&detail=Unable%20to%20read%20Google%20account%20calendar')).toEqual({
      kind: 'failed',
      message: 'Google Calendar connection failed: Unable to read Google account calendar',
    });
    expect(parseGoogleCallback('nexdo://calendar?detail=access_denied')).toEqual({
      kind: 'failed',
      message: 'Google Calendar connection failed: access_denied',
    });
  });

  it('treats a clean callback as connected', () => {
    expect(parseGoogleCallback('nexdo://calendar-connected?calendar=google-connected')).toEqual({ kind: 'connected' });
  });
});

/** docs/android-polish.md §10: the Calendar screen on Android. */
describe('Calendar on Android', () => {
  const light = palettes.light;
  const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);
  const group = { backgroundColor: light.fieldSurface, borderWidth: 1, borderColor: light.fieldBorder };
  const layout = (width: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height: 20 } } });

  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));
  afterEach(() => jest.restoreAllMocks());

  it('spaces each day: 20 above the header, 8 below, and 24 under an empty day', async () => {
    await renderCalendar();
    expect(flat('calendar-day-2026-09-16')).toMatchObject({ paddingTop: 20 });
    expect(flat('calendar-day-header-2026-09-16')).toMatchObject({ paddingBottom: 8 });
    const empty = screen.getAllByText('Nothing scheduled. Room to breathe.')[0];
    expect(StyleSheet.flatten(empty.props.style)).toMatchObject({ paddingBottom: 24, color: light.secondary });
  });

  it('draws the summary, Schedule Intelligence and backlog cards as the shared group', async () => {
    await renderCalendar();
    expect(flat('calendar-summary')).toMatchObject(group);
    expect(flat('calendar-intelligence')).toMatchObject(group);
    expect(flat('calendar-backlog-card')).toMatchObject(group);
  });

  it('lets "Review conflicts" shrink and wrap instead of being clipped', async () => {
    await renderCalendar();
    expect(flat('calendar-conflicts')).toMatchObject({ flexShrink: 1, maxWidth: '50%' });
    expect(StyleSheet.flatten(screen.getByText('Review conflicts').props.style)).toMatchObject({ textAlign: 'right' });
    expect(screen.getByText('Review conflicts').props.numberOfLines).toBeUndefined();
  });

  it('keeps the creation cards two-up only while both titles fit on one line', async () => {
    await renderCalendar();
    const measure = async (row: number, voice: number, manual: number) => {
      await fireEvent(screen.getByTestId('calendar-creation-row'), 'layout', layout(row));
      await fireEvent(screen.getByTestId('calendar-creation-measure-voice', { includeHiddenElements: true }), 'layout', layout(voice));
      await fireEvent(screen.getByTestId('calendar-creation-measure-manual', { includeHiddenElements: true }), 'layout', layout(manual));
    };
    await measure(340, 70, 76);
    expect(flat('calendar-creation-row')).toMatchObject({ flexDirection: 'row' });
    expect(screen.getByText('Add Manually').props.adjustsFontSizeToFit).toBe(false);

    await measure(260, 70, 76);
    expect(flat('calendar-creation-row')).toMatchObject({ flexDirection: 'column', gap: 12 });
    expect(flat('calendar-add-manual')).toMatchObject({ flex: 0, alignSelf: 'stretch' });
  });
});

describe('creationTitlesFit', () => {
  it('fits two-up when each title fits half the row less the padding, border, icon and gap', () => {
    // (340 - 10) / 2 - 16 - 2 - 38 - 8 = 101
    expect(creationTitlesFit({ row: 340, voice: 101, manual: 101 })).toBe(true);
    expect(creationTitlesFit({ row: 340, voice: 101, manual: 102 })).toBe(false);
    expect(creationTitlesFit({ row: 0, voice: 70, manual: 76 })).toBe(true);
  });
});

