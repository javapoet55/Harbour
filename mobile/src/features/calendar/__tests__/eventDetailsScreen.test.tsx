import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Linking, StyleSheet } from 'react-native';

import type { CalendarEvent } from '../../../api/types';
import { queryKeys } from '../../../query/keys';
import { useSession } from '../../../store/session';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: (...args: unknown[]) => mockBack(...args), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

const mockApi = { get: jest.fn(), setCompleted: jest.fn(), update: jest.fn(), remove: jest.fn(), addTask: jest.fn() };
jest.mock('../../../api/calendarEvent', () => ({
  calendarEventApi: {
    get: (...args: unknown[]) => mockApi.get(...args),
    setCompleted: (...args: unknown[]) => mockApi.setCompleted(...args),
    update: (...args: unknown[]) => mockApi.update(...args),
    remove: (...args: unknown[]) => mockApi.remove(...args),
    addTask: (...args: unknown[]) => mockApi.addTask(...args),
  },
}));

import { EventDetailsScreen } from '../EventDetailsScreen';
import { EventEditorScreen, eventEditPayload } from '../EventEditorScreen';
import { eventDateText, intelligenceHeading, openInCalendarURL, reviewableConflicts } from '../eventDetails';

/** `CalendarEventDetailsView` and its editor (ios/App/CalendarEventDetailsView.swift). */

const ZONE = 'Asia/Kolkata';
const OWN: CalendarEvent = {
  id: 'e1',
  title: 'Dentist',
  startAt: '2099-09-16T04:00:00.000Z',
  endAt: '2099-09-16T05:00:00.000Z',
  notes: 'Bring the forms.',
  location: 'MG Road',
  source: 'harbor',
  connectionId: null,
  completedAt: null,
};
const GOOGLE: CalendarEvent = { ...OWN, id: 'g1', title: 'Team sync', source: 'google', connectionId: 'c1', notes: null, location: null, timeZone: 'UTC', startAt: '2020-01-02T15:00:00Z', endAt: '2020-01-02T16:00:00Z' };

let alert: jest.SpyInstance;
let client: QueryClient;

async function open(event: CalendarEvent, server: CalendarEvent = event, node: 'details' | 'editor' = 'details') {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  client.setQueryData(queryKeys.calendar.event('u1', event.id), { event });
  mockApi.get.mockResolvedValue({ event: server });
  await render(
    <QueryClientProvider client={client}>
      {node === 'details' ? <EventDetailsScreen fallbackTimeZone={ZONE} id={event.id} /> : <EventEditorScreen fallbackTimeZone={ZONE} id={event.id} />}
    </QueryClientProvider>,
  );
  await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith(event.id));
}

const alertButtons = (call = 0) => alert.mock.calls[call][2] as { text: string; style?: string; onPress?: () => void }[];

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Ada', email: 'a@b.c', timeZone: ZONE } });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => {
  alert.mockRestore();
  client.clear();
});

describe('Event Details', () => {
  it('shows the event at once, then the server’s copy', async () => {
    await open(OWN, { ...OWN, title: 'Dentist (moved)' });
    await waitFor(() => expect(screen.getByTestId('event-details-title')).toHaveTextContent('Dentist (moved)'));
    expect(screen.getByRole('header')).toHaveTextContent('Event Details');
    expect(screen.getAllByText('NexDo')).toHaveLength(2);
    expect(screen.getByTestId('event-details-status')).toHaveTextContent('Upcoming');
    expect(screen.getByTestId('event-details-start')).toHaveTextContent('Start' + 'Sep 16, 2099 at 9:30 AM');
    expect(screen.getByTestId('event-details-end')).toHaveTextContent('End' + 'Sep 16, 2099 at 10:30 AM');
    expect(screen.getByTestId('event-details-zone')).toHaveTextContent('Time Zone' + ZONE);
    expect(screen.getByTestId('event-details-calendar')).toHaveTextContent('Calendar' + 'NexDo');
    expect(screen.getByTestId('event-details-location')).toHaveTextContent('Location' + 'MG Road');
    expect(screen.getByTestId('event-details-notes')).toHaveTextContent('Bring the forms.');
    expect(screen.getByLabelText('Mark Complete')).toBeTruthy();
    // Only the completion action that applies (Android ahead of iOS).
    expect(screen.queryByLabelText('Mark Incomplete')).toBeNull();
    expect(screen.getByLabelText('Add to Tasks')).toBeTruthy();
    expect(screen.getByTestId('event-details-delete')).toBeTruthy();
  });

  it('an imported event cannot be edited or deleted, says its provider and its own zone, and is Past', async () => {
    await open(GOOGLE);
    expect(screen.getAllByText('Google').length).toBeGreaterThan(0);
    expect(screen.getByTestId('event-details-status')).toHaveTextContent('Past');
    expect(screen.getByTestId('event-details-zone')).toHaveTextContent('Time ZoneUTC');
    expect(screen.getByTestId('event-details-start')).toHaveTextContent('StartJan 2, 2020 at 3:00 PM');
    expect(screen.getByTestId('event-details-notes')).toHaveTextContent('No notes added.');
    expect(screen.queryByTestId('event-details-location')).toBeNull();
    expect(screen.queryByTestId('event-details-edit-bar')).toBeNull();
    expect(screen.queryByTestId('event-details-edit-notes')).toBeNull();
    expect(screen.queryByTestId('event-details-delete')).toBeNull();
  });

  it('Mark Complete marks it, strikes the title through and says Completed', async () => {
    mockApi.setCompleted.mockResolvedValue({ event: { ...OWN, completedAt: '2099-09-16T05:00:00Z' } });
    await open(OWN);
    await fireEvent.press(screen.getByTestId('event-details-complete'));
    await waitFor(() => expect(screen.getByTestId('event-details-status')).toHaveTextContent('Completed'));
    expect(mockApi.setCompleted).toHaveBeenCalledWith('e1', true);
    expect(StyleSheet.flatten(screen.getByTestId('event-details-title').props.style)).toMatchObject({ textDecorationLine: 'line-through' });
    // A completed event offers Mark Incomplete in place of Mark Complete.
    expect(screen.getByTestId('event-details-incomplete')).toBeTruthy();
    expect(screen.queryByTestId('event-details-complete')).toBeNull();
  });

  it('the "…" menu toggles completion; Mark Incomplete sends false', async () => {
    mockApi.setCompleted.mockResolvedValue({ event: OWN });
    await open({ ...OWN, completedAt: '2099-09-16T05:00:00Z' });
    await waitFor(() => expect(screen.getByTestId('event-details-status')).toHaveTextContent('Completed'));
    await fireEvent.press(screen.getByLabelText('More event actions'));
    expect(screen.getByTestId('event-details-menu-complete')).toHaveTextContent('Mark Incomplete');
    // `Button(_:systemImage:)`: Mark Incomplete carries `xmark.circle`, Delete Event `trash`.
    const glyphs = (node: { props: { name?: string }; children: unknown[] }): string[] => [
      ...(node.props.name ? [node.props.name] : []),
      ...node.children.flatMap((child) => (typeof child === 'object' && child ? glyphs(child as typeof node) : [])),
    ];
    expect(glyphs(screen.getByTestId('event-details-menu-complete') as never)).toEqual(['close-circle-outline']);
    expect(glyphs(screen.getByTestId('event-details-menu-delete') as never)).toEqual(['trash-outline']);
    await fireEvent.press(screen.getByTestId('event-details-incomplete'));
    await waitFor(() => expect(mockApi.setCompleted).toHaveBeenCalledWith('e1', false));
  });

  it('a failure shows on the "Event Details" alert', async () => {
    mockApi.setCompleted.mockRejectedValue(new Error('Event not found.'));
    await open(OWN);
    await fireEvent.press(screen.getByTestId('event-details-complete'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Event Details', 'Event not found.', expect.any(Array), { cancelable: false }));
  });

  it('Add to Tasks adds once and then says so', async () => {
    mockApi.addTask.mockResolvedValue({ success: true, taskId: 't9' });
    await open(OWN);
    await fireEvent.press(screen.getByTestId('event-details-add-task'));
    await waitFor(() => expect(screen.getByLabelText('Added to Tasks')).toBeTruthy());
    expect(alert).toHaveBeenCalledWith('Event Details', 'Added to your tasks.', expect.any(Array), { cancelable: false });
    expect(screen.getByLabelText('Added to Tasks').props.accessibilityState.disabled).toBe(true);
  });

  it('asks "Delete this event?" and closes after deleting', async () => {
    mockApi.remove.mockResolvedValue({ success: true });
    await open(OWN);
    await fireEvent.press(screen.getByTestId('event-details-delete'));
    expect(alert.mock.calls[0][0]).toBe('Delete this event?');
    expect(alertButtons().map((button) => button.text)).toEqual(['Cancel', 'Delete Event']);
    await act(async () => alertButtons()[1].onPress?.());
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockApi.remove).toHaveBeenCalledWith('e1');
  });

  it('shows delete warnings first and closes on OK', async () => {
    mockApi.remove.mockResolvedValue({ success: true, warnings: ['Google Calendar could not be updated.'] });
    await open(OWN);
    await fireEvent.press(screen.getByTestId('event-details-delete'));
    await act(async () => alertButtons()[1].onPress?.());
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(2));
    expect(alert.mock.calls[1][1]).toBe('Google Calendar could not be updated.');
    expect(mockBack).not.toHaveBeenCalled();
    await act(async () => alertButtons(1)[0].onPress?.());
    expect(mockBack).toHaveBeenCalled();
  });

  it('Edit opens the editor; Open in Calendar opens the calendar at the start; Back goes back', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await open(OWN);
    await fireEvent.press(screen.getByTestId('event-details-edit-bar'));
    await fireEvent.press(screen.getByTestId('event-details-edit-notes'));
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/calendar/event/edit', params: { id: 'e1' } });
    await fireEvent.press(screen.getByTestId('event-details-open'));
    expect(openURL).toHaveBeenCalledWith(openInCalendarURL(OWN.startAt, 'ios'));
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalled();
    openURL.mockRestore();
  });

  it('reports a failed load', async () => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    client.setQueryData(queryKeys.calendar.event('u1', 'e1'), { event: OWN });
    mockApi.get.mockRejectedValue(new Error('Network unavailable.'));
    await render(
      <QueryClientProvider client={client}>
        <EventDetailsScreen fallbackTimeZone={ZONE} id="e1" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Event Details', 'Network unavailable.', expect.any(Array), { cancelable: false }));
    expect(screen.getByTestId('event-details-title')).toHaveTextContent('Dentist');
  });
});

describe('Edit Event', () => {
  it('starts from the event and saves the text fields only when the times are unchanged', async () => {
    mockApi.update.mockResolvedValue({ event: { ...OWN, title: 'Dentist visit' } });
    await open(OWN, OWN, 'editor');
    expect(screen.getByRole('header')).toHaveTextContent('Edit Event');
    expect(screen.getByTestId('event-editor-title').props.value).toBe('Dentist');
    expect(screen.getByTestId('event-editor-location').props.value).toBe('MG Road');
    expect(screen.getByTestId('event-editor-notes').props.value).toBe('Bring the forms.');
    await fireEvent.changeText(screen.getByTestId('event-editor-title'), '  Dentist visit ');
    await fireEvent.press(screen.getByTestId('event-editor-save'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockApi.update).toHaveBeenCalledWith('e1', { title: 'Dentist visit', notes: 'Bring the forms.', location: 'MG Road' });
  });

  it('needs a title; a failure stays in the form', async () => {
    mockApi.update.mockRejectedValue(new Error('Choose a future start time.'));
    await open(OWN, OWN, 'editor');
    await fireEvent.changeText(screen.getByTestId('event-editor-title'), '   ');
    expect(screen.getByTestId('event-editor-save').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('event-editor-title'), 'Dentist');
    await fireEvent.press(screen.getByTestId('event-editor-save'));
    await waitFor(() => expect(screen.getByTestId('event-editor-error')).toHaveTextContent('Choose a future start time.'));
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows save warnings on the Event Details alert after closing', async () => {
    mockApi.update.mockResolvedValue({ event: OWN, warnings: ['Saved in Nexdo only.', 'Google was unreachable.'] });
    await open(OWN, OWN, 'editor');
    await fireEvent.press(screen.getByTestId('event-editor-save'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Event Details', 'Saved in Nexdo only.\nGoogle was unreachable.', expect.any(Array)));
  });

  it('Cancel closes without saving', async () => {
    await open(OWN, OWN, 'editor');
    await fireEvent.press(screen.getByTestId('event-editor-cancel'));
    expect(mockBack).toHaveBeenCalled();
    expect(mockApi.update).not.toHaveBeenCalled();
  });

  it('adds both instants, in whole seconds, once either time changed', () => {
    const start = Date.parse(OWN.startAt);
    expect(eventEditPayload(OWN, { title: 'x', notes: '', location: '', start: start + 3_600_000, end: Date.parse(OWN.endAt) })).toEqual({
      title: 'x',
      notes: '',
      location: '',
      startAt: '2099-09-16T05:00:00Z',
      endAt: '2099-09-16T05:00:00Z',
    });
  });
});

describe('the pure parts', () => {
  it('formats dates in the event’s zone, all-day as the date alone', () => {
    expect(eventDateText('2026-10-05T09:30:00Z', 'UTC', false)).toBe('Oct 5, 2026 at 9:30 AM');
    expect(eventDateText('2026-10-05T00:00:00Z', 'UTC', true)).toBe('Oct 5, 2026 · All day');
    expect(eventDateText('soon', 'UTC', false)).toBe('soon');
  });

  it('builds the Open in Calendar URL per platform', () => {
    // `calshow:` takes seconds since 2001-01-01.
    expect(openInCalendarURL('2001-01-01T00:01:00Z', 'ios')).toBe('calshow:60');
    expect(openInCalendarURL('2026-10-05T00:00:00Z', 'android')).toBe(`content://com.android.calendar/time/${Date.parse('2026-10-05T00:00:00Z')}`);
    expect(openInCalendarURL('never', 'ios')).toBeNull();
  });

  it('keeps only today’s reviewable conflicts', () => {
    const item = { id: 'a', label: '', title: '', explanation: '', recommendedAction: '', kind: '' };
    const today = {
      day: '2026-10-05',
      timeZone: 'UTC',
      commitments: 0,
      appointments: 0,
      tasks: 0,
      overdue: 0,
      availableMinutes: 0,
      timeline: [],
      attention: [item, { ...item, id: 'overdue' }, { ...item, id: 'dependency:x' }],
      recommendation: { title: '', explanation: '', kind: '' },
    };
    expect(reviewableConflicts(today, false, '2026-10-05', 'UTC').map((entry) => entry.id)).toEqual(['a']);
    expect(reviewableConflicts(today, true, '2026-10-05', 'UTC')).toEqual([]);
    expect(reviewableConflicts(today, false, '2026-10-06', 'UTC')).toEqual([]);
    expect(reviewableConflicts(today, false, '2026-10-05', 'Asia/Kolkata')).toEqual([]);
    expect(reviewableConflicts(null, false, '2026-10-05', 'UTC')).toEqual([]);
    expect(intelligenceHeading(today, 1)).toBe('Review schedule conflicts');
    expect(intelligenceHeading(today, 0)).toBe('Your schedule is clear');
    expect(intelligenceHeading({ ...today, tasks: 1 }, 0)).toBe('Your schedule today');
  });
});
