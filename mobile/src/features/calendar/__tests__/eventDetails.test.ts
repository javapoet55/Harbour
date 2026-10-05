import { eventCalendarName, eventEditable, eventStatus, warningsMessage } from '../eventDetails';

/** Event Details (ios/App/CalendarEventDetailsView.swift:19-22). */

const NOW = Date.parse('2026-09-14T20:00:00Z');

test('status: completed wins, then past by the end time, else upcoming', () => {
  expect(eventStatus({ completedAt: '2026-09-15T00:00:00Z', endAt: '2026-09-20T00:00:00Z' }, NOW)).toBe('Completed');
  expect(eventStatus({ completedAt: null, endAt: '2026-09-14T18:00:00Z' }, NOW)).toBe('Past');
  expect(eventStatus({ endAt: '2026-09-14T21:00:00Z' }, NOW)).toBe('Upcoming');
  expect(eventStatus({ endAt: 'garbage' }, NOW)).toBe('Upcoming');
});

test('only Nexdo\'s own unlinked events are editable; any event can be completed', () => {
  expect(eventEditable({ source: 'harbor', connectionId: null })).toBe(true);
  expect(eventEditable({ source: 'harbor', connectionId: 'c1' })).toBe(false);
  expect(eventEditable({ source: 'google', connectionId: null })).toBe(false);
});

test('calendar names', () => {
  expect(eventCalendarName({ source: 'harbor' })).toBe('NexDo');
  expect(eventCalendarName({ source: 'google' })).toBe('Google');
  expect(eventCalendarName({ source: 'MICROSOFT outlook' })).toBe('Microsoft Outlook');
  expect(eventCalendarName({ source: null })).toBe('Calendar');
});

test('warnings join one per line', () => {
  expect(warningsMessage(['A', 'B'])).toBe('A\nB');
  expect(warningsMessage([])).toBeNull();
  expect(warningsMessage(undefined)).toBeNull();
});
