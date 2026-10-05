import type { CalendarEvent, ScheduleIntelligenceResponse } from '../../api/types';
import { parseServerDate } from '../../lib/taskQuery';

/** The pure parts of Event Details (ios/App/CalendarEventDetailsView.swift:19-22). */

/** `editable` (:20): only events made in Nexdo and not linked to a connected calendar. */
export function eventEditable(event: Pick<CalendarEvent, 'source' | 'connectionId'>): boolean {
  return event.source === 'harbor' && event.connectionId == null;
}

/** `calendarName` (:21): "NexDo", or the provider capitalised as Swift's `.capitalized`. */
export function eventCalendarName(event: Pick<CalendarEvent, 'source'>): string {
  if (event.source === 'harbor') return 'NexDo';
  return (event.source ?? 'Calendar').toLowerCase().replace(/(^|[^\p{L}\p{N}'])(\p{L})/gu, (_match, before: string, letter: string) => before + letter.toUpperCase());
}

/** `status` (:22): completed wins; otherwise past once the end has gone by (an unreadable end never is). */
export function eventStatus(event: Pick<CalendarEvent, 'completedAt' | 'endAt'>, now: number = Date.now()): 'Completed' | 'Past' | 'Upcoming' {
  if (event.completedAt != null) return 'Completed';
  const end = parseServerDate(event.endAt);
  return end !== null && end < now ? 'Past' : 'Upcoming';
}

/** The alert after an edit or delete (:134, `:157`): the warnings, one per line, or nothing. */
export function warningsMessage(warnings: string[] | null | undefined): string | null {
  return warnings && warnings.length > 0 ? warnings.join('\n') : null;
}

/**
 * `dateText(_:)` (:125-130): `.medium` date and `.short` time in the event's zone — "Oct 5, 2026 at
 * 3:00 PM" — or the date and " · All day". An unreadable value is shown as it came.
 */
export function eventDateText(raw: string, zone: string, allDay: boolean | null | undefined): string {
  const at = parseServerDate(raw);
  if (at === null) return raw;
  const date = new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(at));
  if (allDay === true) return `${date} · All day`;
  const time = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(at));
  return `${date} at ${time}`;
}

/** Seconds between 1970 and 2001-01-01, the reference date of `timeIntervalSinceReferenceDate`. */
const REFERENCE_DATE_OFFSET = 978_307_200;

/**
 * "Open in Calendar" (:66-70). iOS: `calshow:<seconds since 2001>`, Swift's own URL. Android: the
 * Calendar app's day view, `content://com.android.calendar/time/<ms>` (android-polish.md, Run A).
 */
export function openInCalendarURL(startAt: string, platform: 'ios' | 'android'): string | null {
  const at = parseServerDate(startAt);
  if (at === null) return null;
  return platform === 'ios' ? `calshow:${at / 1000 - REFERENCE_DATE_OFFSET}` : `content://com.android.calendar/time/${at}`;
}

type IntelligenceToday = ScheduleIntelligenceResponse['today'];

/**
 * `reviewableConflicts` (CalendarView.swift:255-261): today's attention items, for today in this zone,
 * without "overdue" and "dependency:" items — "Overdue and blocked tasks have their own task review flows."
 */
export function reviewableConflicts(today: IntelligenceToday | null | undefined, failed: boolean, todayKey: string, zone: string): IntelligenceToday['attention'] {
  if (failed || !today || today.day !== todayKey || today.timeZone !== zone) return [];
  return today.attention.filter((item) => item.id !== 'overdue' && !item.id.startsWith('dependency:'));
}

/** The intelligence card's heading (CalendarView.swift:272-278). */
export function intelligenceHeading(today: IntelligenceToday, conflicts: number): string {
  if (conflicts > 0) return 'Review schedule conflicts';
  return today.appointments === 0 && today.tasks === 0 ? 'Your schedule is clear' : 'Your schedule today';
}
