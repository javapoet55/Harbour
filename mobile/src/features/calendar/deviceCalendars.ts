import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

import type { CalendarEvent } from '../../api/types';
import { DEVICE_CALENDAR_SOURCE, isDeviceCalendarEvent, makeDeviceCalendarEvent } from '../../lib/deviceCalendarEvent';
import { decisionFromExpo, permissionDecision, statusFromExpo, type PermissionStatus } from '../../lib/permissionAccess';
import { deviceTimeZone } from '../../lib/profileSettings';

/**
 * `AppleCalendarService` (bdb68ce, b61801c; ios/App/AppleCalendarService.swift:11-54), the one place
 * the phone's own calendars are read. EventKit on iOS; on Android, expo-calendar over `READ_CALENDAR`
 * (the app blocks `WRITE_CALENDAR`, android-polish.md §37). Events read here never leave the phone:
 * they are shown beside the server's events and are never sent anywhere.
 *
 * Swift keeps every EventKit object inside one actor and hands out value snapshots; here every call is
 * a plain async function over the module's own objects, which already are plain values.
 */

/** `AppleCalendarChoice` (:4-8): a calendar to show, with the account it belongs to. */
export type DeviceCalendarChoice = { id: string; title: string; account: string };

/**
 * The fields read from expo-calendar's legacy `Calendar` and `Event` records (`expo-calendar/legacy`;
 * the main entry re-exports the functions but not those two types). Structural, so a test can pass a
 * literal.
 */
export type DeviceCalendarRecord = { id: string; title: string; source?: { name?: string | null } | null; ownerAccount?: string | null };
export type DeviceEventRecord = {
  id: string;
  calendarId: string;
  title: string;
  location?: string | null;
  timeZone?: string | null;
  notes?: string | null;
  startDate: string | Date;
  endDate: string | Date;
  allDay?: boolean;
  status?: string;
};

/** The current status without prompting (`EKEventStore.authorizationStatus(for: .event)`). */
export async function deviceCalendarAccess(): Promise<PermissionStatus> {
  try {
    return statusFromExpo(await Calendar.getCalendarPermissionsAsync());
  } catch {
    // No calendar provider on this phone (or the module is unavailable): nothing can be read.
    return 'denied';
  }
}

/** `fullAccess` on iOS 17+: the only state that lets events be read. */
export async function hasDeviceCalendarAccess(): Promise<boolean> {
  return permissionDecision('calendar', await deviceCalendarAccess()) === 'allow';
}

/**
 * `requestAccess()` (:15-27): ask only when the decision table says so (undetermined, or iOS write-only),
 * never when access is already granted or has been refused. Resolves to whether events can now be read.
 */
export async function requestDeviceCalendarAccess(): Promise<boolean> {
  switch (decisionFromExpo('calendar', await Calendar.getCalendarPermissionsAsync())) {
    case 'allow':
      return true;
    case 'deny':
      return false;
    case 'request':
      return decisionFromExpo('calendar', await Calendar.requestCalendarPermissionsAsync()) === 'allow';
  }
}

/** The account a calendar belongs to: its source's title (`$0.source.title`), else the owner account. */
function accountName(calendar: DeviceCalendarRecord): string {
  return calendar.source?.name || calendar.ownerAccount || '';
}

/** `calendars()` (:29-34): every event calendar, sorted by account then title; none without access. */
export async function listDeviceCalendars(): Promise<DeviceCalendarChoice[]> {
  if (!(await hasDeviceCalendarAccess())) return [];
  const calendars = (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)) as DeviceCalendarRecord[];
  return sortDeviceCalendars(calendars.map((calendar) => ({ id: calendar.id, title: calendar.title, account: accountName(calendar) })));
}

/** `.sorted { ($0.account, $0.title) < ($1.account, $1.title) }`. */
export function sortDeviceCalendars(calendars: DeviceCalendarChoice[]): DeviceCalendarChoice[] {
  return [...calendars].sort((left, right) => (left.account === right.account ? compare(left.title, right.title) : compare(left.account, right.account)));
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** expo-calendar's `startDate` / `endDate` are strings on Android and Dates on iOS. */
function instant(value: string | Date | undefined): number | null {
  if (value === undefined) return null;
  const at = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

/**
 * One phone event as a `CalendarEvent` (`events(start:end:selectedIDs:)`, :36-53): cancelled ones are
 * dropped, a blank title reads "Untitled event", and the event's own zone is kept (the phone's when the
 * module gives none) so an all-day event keeps its dates in `eventDayZone`. `null` for an event with no
 * usable start, end or calendar.
 */
export function mapDeviceEvent(event: DeviceEventRecord, phoneZone: string = deviceTimeZone()): CalendarEvent | null {
  if (event.status === Calendar.EventStatus.CANCELED) return null;
  const start = instant(event.startDate);
  const end = instant(event.endDate);
  if (start === null || end === null || !event.calendarId) return null;
  return makeDeviceCalendarEvent({
    identifier: event.id,
    calendarId: event.calendarId,
    title: event.title || 'Untitled event',
    start,
    end,
    allDay: event.allDay === true,
    timeZone: event.timeZone || phoneZone,
    notes: event.notes ? event.notes : null,
    location: event.location ? event.location : null,
  });
}

/**
 * The phone's events between two instants, from the chosen calendars (`events(start:end:selectedIDs:)`,
 * :36-53). `selectedIds` `null` means every calendar; an EMPTY selection means none — it must not fall
 * through to "all". Occurrences are deduplicated by their derived id. No access, or an empty range,
 * reads as no events rather than an error.
 */
export async function deviceCalendarEvents({
  start,
  end,
  selectedIds,
  phoneZone = deviceTimeZone(),
}: {
  start: number;
  end: number;
  selectedIds: ReadonlySet<string> | null;
  phoneZone?: string;
}): Promise<CalendarEvent[]> {
  if (!(end > start) || !(await hasDeviceCalendarAccess())) return [];
  const calendars = ((await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)) as DeviceCalendarRecord[]).filter((calendar) => selectedIds === null || selectedIds.has(calendar.id));
  if (calendars.length === 0) return [];
  const events = (await Calendar.getEventsAsync(
    calendars.map((calendar) => calendar.id),
    new Date(start),
    new Date(end),
  )) as DeviceEventRecord[];
  const seen = new Set<string>();
  const result: CalendarEvent[] = [];
  for (const event of events) {
    const mapped = mapDeviceEvent(event, phoneZone);
    if (mapped && !seen.has(mapped.id)) {
      seen.add(mapped.id);
      result.push(mapped);
    }
  }
  return result;
}

/**
 * The calendar and event identifiers packed into a device event's id by `makeDeviceCalendarEvent`
 * (`apple-device:<calendarId>:<identifier>:<start seconds>`). Android calendar ids are numbers and iOS
 * identifiers carry no colon, so the first colon after the prefix ends the calendar id and the last one
 * starts the seconds.
 */
export function deviceEventIdentifier(id: string): { calendarId: string; identifier: string } | null {
  const prefix = `${DEVICE_CALENDAR_SOURCE}:`;
  if (!id.startsWith(prefix)) return null;
  const rest = id.slice(prefix.length);
  const firstColon = rest.indexOf(':');
  const lastColon = rest.lastIndexOf(':');
  if (firstColon < 0 || lastColon <= firstColon) return null;
  const calendarId = rest.slice(0, firstColon);
  const identifier = rest.slice(firstColon + 1, lastColon);
  return calendarId && identifier ? { calendarId, identifier } : null;
}

/**
 * "Edit this event in Phone calendar": the phone's calendar app on THIS event (CalendarEventDetailsView.swift:44
 * says so in words; `calshow:` opens the day). expo-calendar's `openEventInCalendarAsync` is the Android
 * `ACTION_VIEW` intent on the event — `content://com.android.calendar/events/<id>` — and on iOS the
 * EventKit view controller. Resolves to false when the id cannot be read or the module declines.
 */
export async function openDeviceEvent(event: Pick<CalendarEvent, 'id' | 'source' | 'startAt'>): Promise<boolean> {
  if (!isDeviceCalendarEvent(event)) return false;
  const parsed = deviceEventIdentifier(event.id);
  if (!parsed) return false;
  try {
    const instanceStartDate = Platform.OS === 'android' ? new Date(event.startAt) : undefined;
    await Calendar.openEventInCalendarAsync({ id: parsed.identifier, ...(instanceStartDate ? { instanceStartDate } : {}) });
    return true;
  } catch {
    return false;
  }
}
