/** Pure helpers for creating-side rules and editing events from the web Calendar. */

export type CalendarEventRecord = {
  id: string;
  title: string;
  notes: string;
  location: string;
  startAt: string;
  endAt: string;
  timeZone?: string;
  allDay?: boolean;
  source: string;
  connectionId: string | null;
  completedAt?: string | null;
};

const SEVEN_DAYS = 7 * 86_400_000;

/** The calendar item id is "event-<id>"; the event API wants the bare id. Null for a task item. */
export function eventIdFromItem(itemId: string): string | null {
  return itemId.startsWith('event-') ? itemId.slice('event-'.length) : null;
}

/** Only events made in Nexdo are edited here; imported events belong to their calendar. */
export function isEditable(event: Pick<CalendarEventRecord, 'source' | 'connectionId'>): boolean {
  return event.source === 'harbor' && event.connectionId === null;
}

export type EventEdit = { title: string; notes: string; location: string; startMs: number; endMs: number };

/**
 * The PATCH body: only what changed. Times are sent together, and only when one of them changed, because
 * the server insists a re-timed event starts in the future (an untouched past event can still be renamed).
 */
export function eventPatch(original: Pick<CalendarEventRecord, 'title' | 'notes' | 'location' | 'startAt' | 'endAt'>, edit: EventEdit): Record<string, string> {
  const body: Record<string, string> = {};
  if (edit.title.trim() !== original.title) body.title = edit.title.trim();
  if (edit.notes !== original.notes) body.notes = edit.notes;
  if (edit.location !== original.location) body.location = edit.location;
  if (edit.startMs !== Date.parse(original.startAt) || edit.endMs !== Date.parse(original.endAt)) {
    body.startAt = new Date(edit.startMs).toISOString();
    body.endAt = new Date(edit.endMs).toISOString();
  }
  return body;
}

/** The first problem with an edit, or null. */
export function eventIssue(edit: Pick<EventEdit, 'title' | 'startMs' | 'endMs'>, retimed: boolean, now: number): string | null {
  if (edit.title.trim() === '') return 'Enter a title.';
  if (Number.isNaN(edit.startMs) || Number.isNaN(edit.endMs)) return 'That time doesn’t exist on this date. Choose another time.';
  if (retimed) {
    if (edit.startMs <= now) return 'Choose a start time in the future.';
    if (edit.endMs <= edit.startMs) return 'The event must end after it starts.';
    if (edit.endMs - edit.startMs > SEVEN_DAYS) return 'An event can last at most seven days.';
  } else if (edit.endMs <= edit.startMs) {
    return 'The event must end after it starts.';
  }
  return null;
}
