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
