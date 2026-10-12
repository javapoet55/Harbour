import type { CalendarEvent } from '../api/types';

/**
 * Events read from the phone's own calendar (bdb68ce, ios/Sources/NexdoCore/DeviceCalendarEvent.swift).
 * They have no server record: they are read on the device, shown beside the server's events, and
 * never sent anywhere.
 */

/** `source` of a device event. Swift's value; the Android reader should use the same one. */
export const DEVICE_CALENDAR_SOURCE = 'apple-device';

/** `isDeviceCalendarEvent` (DeviceCalendarEvent.swift:16-18). */
export function isDeviceCalendarEvent(event: Pick<CalendarEvent, 'source'>): boolean {
  return event.source === DEVICE_CALENDAR_SOURCE;
}

/**
 * The zone an event's DAYS are read in (Models.swift:276-277, CalendarDayIndex.swift:30-31). A device
 * all-day event keeps its own calendar dates even when the profile uses another zone — a trip on the
 * 7th and 8th stays there from Tokyo — so it is read in the zone it was stored with. Everything else
 * is read in the profile zone.
 */
export function eventDayZone(event: Pick<CalendarEvent, 'source' | 'allDay' | 'timeZone'>, profileZone: string): string {
  return isDeviceCalendarEvent(event) && event.allDay === true ? event.timeZone ?? profileZone : profileZone;
}

/**
 * Swift's `"\(start.timeIntervalSince1970)"`: a Double's description, so whole seconds keep a `.0`.
 * Only the device ever sees these ids, but keeping Swift's spelling keeps one rule for both.
 */
function swiftSeconds(at: number): string {
  const seconds = at / 1000;
  return Number.isInteger(seconds) ? `${seconds}.0` : String(seconds);
}

/**
 * `DeviceCalendarEvent.make` (DeviceCalendarEvent.swift:5-13). The id carries the calendar, the
 * event's identifier AND its start, so each occurrence of a repeating event — and the same event in
 * two calendars — is its own row. Instants are whole-second UTC, as `ISO8601DateFormatter` writes.
 */
export function makeDeviceCalendarEvent({
  identifier,
  calendarId,
  title,
  start,
  end,
  allDay,
  timeZone,
  notes = null,
  location = null,
}: {
  identifier: string;
  calendarId: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  timeZone: string;
  notes?: string | null;
  location?: string | null;
}): CalendarEvent {
  const iso = (at: number) => new Date(Math.floor(at / 1000) * 1000).toISOString().replace('.000Z', 'Z');
  return {
    id: `${DEVICE_CALENDAR_SOURCE}:${calendarId}:${identifier}:${swiftSeconds(start)}`,
    title,
    startAt: iso(start),
    endAt: iso(end),
    allDay,
    notes,
    location,
    timeZone,
    source: DEVICE_CALENDAR_SOURCE,
    connectionId: null,
    completedAt: null,
  };
}

/**
 * The per-account calendar choice (`AppleCalendarSelection`, ios/App/AppleCalendarService.swift):
 * `UserDefaults` key `nexdo.apple-calendar.selection.<profile id>`, the chosen calendar ids sorted.
 * No saved choice means every calendar; an EMPTY saved choice means none.
 */
export function deviceCalendarSelectionKey(ownerId: string): string {
  return `nexdo.apple-calendar.selection.${ownerId}`;
}
