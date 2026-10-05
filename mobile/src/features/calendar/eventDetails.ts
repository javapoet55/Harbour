import type { CalendarEvent } from '../../api/types';
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
