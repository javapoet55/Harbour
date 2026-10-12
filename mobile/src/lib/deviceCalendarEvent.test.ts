import type { CalendarEvent } from '../api/types';
import { buildCalendarDayIndex } from '../features/calendar/dayIndex';
import { eventCalendarName, eventHasServerRecord } from '../features/calendar/eventDetails';
import { calendarEventMatches, calendarKey, calendarMonth } from './calendarDates';
import { deviceCalendarSelectionKey, eventDayZone, isDeviceCalendarEvent, makeDeviceCalendarEvent } from './deviceCalendarEvent';
import { eventOccursOn } from './todaySchedule';

/** The cases are Swift's own: ios/Tests/NexdoCoreTests/DeviceCalendarEventTests.swift (bdb68ce). */

const LA = 'America/Los_Angeles';

function deviceEvent({ start, end, allDay = false, identifier = 'series', calendarId = 'personal' }: { start: string; end: string; allDay?: boolean; identifier?: string; calendarId?: string }): CalendarEvent {
  return makeDeviceCalendarEvent({ identifier, calendarId, title: 'Apple appointment', start: Date.parse(start), end: Date.parse(end), allDay, timeZone: LA });
}

describe('device calendar events', () => {
  // appleTimedEventsAppearOnTheProfileDay (:11-18)
  it('puts a timed event on the profile day', () => {
    const event = deviceEvent({ start: '2026-10-10T01:00:00Z', end: '2026-10-10T02:00:00Z' });
    expect(calendarEventMatches({ event, day: '2026-10-09', timeZone: LA, completedOnly: false })).toBe(true);
    expect(calendarEventMatches({ event, day: '2026-10-10', timeZone: LA, completedOnly: false })).toBe(false);
    expect(calendarEventMatches({ event, day: '2026-10-10', timeZone: 'Asia/Kolkata', completedOnly: false })).toBe(true);
    expect(isDeviceCalendarEvent(event)).toBe(true);
    expect(event.connectionId).toBeNull();
  });

  // appleAllDayEventsKeepFloatingDatesAcrossTimeZonesAndDST (:20-29)
  it.each([LA, 'Pacific/Honolulu', 'Asia/Tokyo'])('keeps an all-day event on its own dates in %s', (zone) => {
    const event = deviceEvent({ start: '2026-03-07T08:00:00Z', end: '2026-03-09T07:00:00Z', allDay: true });
    expect(eventOccursOn(event, '2026-03-06', zone)).toBe(false);
    expect(eventOccursOn(event, '2026-03-07', zone)).toBe(true);
    expect(eventOccursOn(event, '2026-03-08', zone)).toBe(true);
    expect(eventOccursOn(event, '2026-03-09', zone)).toBe(false);
    expect(Number.isNaN(Date.parse(event.startAt))).toBe(false);
  });

  // appleRecurringOccurrencesAndDifferentCalendarsHaveDistinctIdentity (:31-36)
  it('gives each occurrence and each calendar its own id', () => {
    const first = deviceEvent({ start: '2026-10-09T12:00:00Z', end: '2026-10-09T13:00:00Z' });
    const repeat = deviceEvent({ start: '2026-10-10T12:00:00Z', end: '2026-10-10T13:00:00Z' });
    const other = deviceEvent({ start: '2026-10-09T12:00:00Z', end: '2026-10-09T13:00:00Z', calendarId: 'work' });
    expect(new Set([first.id, repeat.id, other.id]).size).toBe(3);
    expect(first.id).toBe('apple-device:personal:series:1791547200.0');
  });

  // appleMidnightEndDoesNotAddAnotherDayAndPastDoesNotMeanCompleted (:38-43)
  it('does not spill a midnight end into the next day, and past is not completed', () => {
    const event = deviceEvent({ start: '2026-10-09T23:00:00-07:00', end: '2026-10-10T00:00:00-07:00' });
    expect(eventOccursOn(event, '2026-10-09', LA)).toBe(true);
    expect(eventOccursOn(event, '2026-10-10', LA)).toBe(false);
    expect(calendarEventMatches({ event, day: '2026-10-09', timeZone: LA, completedOnly: true })).toBe(false);
  });

  it('reads only device all-day events in their own zone', () => {
    expect(eventDayZone({ source: 'apple-device', allDay: true, timeZone: 'Asia/Tokyo' }, LA)).toBe('Asia/Tokyo');
    expect(eventDayZone({ source: 'apple-device', allDay: false, timeZone: 'Asia/Tokyo' }, LA)).toBe(LA);
    expect(eventDayZone({ source: 'google', allDay: true, timeZone: 'Asia/Tokyo' }, LA)).toBe(LA);
  });

  it('has no server record: Details neither fetches it nor offers its actions', () => {
    const event = deviceEvent({ start: '2026-10-09T12:00:00Z', end: '2026-10-09T13:00:00Z' });
    expect(eventHasServerRecord(event)).toBe(false);
    expect(eventCalendarName(event)).toBe('Apple Calendar');
    expect(eventHasServerRecord({ source: 'harbor' })).toBe(true);
  });

  it('keys the calendar choice per account', () => {
    expect(deviceCalendarSelectionKey('u1')).toBe('nexdo.apple-calendar.selection.u1');
  });
});

// calendarIndexMatchesExistingDateRules (CalendarDayIndexTests.swift:5-27), now that `occurs` has the device rule.
describe('CalendarDayIndex agrees with ServerDate.occurs', () => {
  it.each([LA, 'Asia/Tokyo'])('in %s', (zone) => {
    const days = calendarMonth(Date.parse('2026-03-08T12:00:00Z'), LA).map((at) => calendarKey(at, LA));
    const events = [
      makeDeviceCalendarEvent({ identifier: 'all-day', calendarId: 'a', title: 'Trip', start: Date.parse('2026-03-07T08:00:00Z'), end: Date.parse('2026-03-09T07:00:00Z'), allDay: true, timeZone: LA }),
      makeDeviceCalendarEvent({ identifier: 'timed', calendarId: 'a', title: 'Meeting', start: Date.parse('2026-03-08T07:00:00Z'), end: Date.parse('2026-03-08T08:00:00Z'), allDay: false, timeZone: LA }),
    ];
    const index = buildCalendarDayIndex({ days, timeZone: zone, tasks: [], events });
    for (const day of days) {
      expect((index.events[day] ?? []).map((event) => event.id)).toEqual(events.filter((event) => eventOccursOn(event, day, zone)).map((event) => event.id));
    }
  });
});
