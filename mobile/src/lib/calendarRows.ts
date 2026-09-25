import type { CalendarEvent, NexdoTask } from '../api/types';
import { calendarOverdue, taskScheduledOn } from './calendarDates';
import { serverTime } from './taskLabels';
import { addDays, DISTANT_FUTURE, dayKey, parseServerDate, startOfDay } from './taskQuery';

/**
 * Port of `CalendarView.Row` and `rows(_:)` (ios/App/CalendarView.swift:408-435), the merge that turns
 * a day's tasks and calendar events into one ordered timeline.
 */
export type CalendarRow = {
  id: string;
  title: string;
  /** The sort key, epoch ms. */
  at: number;
  time: string;
  detail: string;
  task: NexdoTask | null;
  event: CalendarEvent | null;
  /** True when the task's DUE date falls on this day, which draws the "Deadline" badge. */
  deadline: boolean;
};

/**
 * `rows(_:)` (CalendarView.swift:415-434).
 *
 * A task uses its start time when it is scheduled on this day, and its due time otherwise — the
 * latter prefixed "Due ". An event is clamped to the day it is being shown on, so a multi-day event
 * reads from this day's midnight rather than from its real start.
 */
export function calendarRows({
  tasks,
  events,
  day,
  timeZone,
  now = Date.now(),
}: {
  tasks: NexdoTask[];
  events: CalendarEvent[];
  /** The day being rendered, as epoch ms anywhere inside it. */
  day: number;
  timeZone: string;
  now?: number;
}): CalendarRow[] {
  const key = dayKey(day, timeZone);
  const midnight = startOfDay(day, timeZone);
  const nextMidnight = addDays(midnight, 1, timeZone);

  const taskRows: CalendarRow[] = tasks.map((task) => {
    const isScheduled = taskScheduledOn(task, key, timeZone);
    const value = (isScheduled ? task.startAt : task.dueAt) ?? '';
    const dueDay = parseServerDate(task.dueAt);
    return {
      id: `task:${task.id}`,
      title: task.title,
      at: parseServerDate(value) ?? DISTANT_FUTURE,
      time: `${isScheduled ? '' : 'Due '}${serverTime(value, timeZone)}`,
      detail: isScheduled
        ? `${task.durationMin} min · Task${task.recurrence ? ' · Repeats' : ''}`
        : 'Task deadline',
      task,
      event: null,
      deadline: dueDay !== null && dayKey(dueDay, timeZone) === key,
    };
  });

  const eventRows: CalendarRow[] = events.map((event) => {
    const rawStart = parseServerDate(event.startAt) ?? day;
    // `max(start, startOfDay(day))` and `min(end, startOfDay(day) + 1)`: clamp to this day.
    const start = Math.max(rawStart, midnight);
    const end = Math.min(parseServerDate(event.endAt) ?? start, nextMidnight);
    const allDay = event.allDay === true;
    return {
      id: `event:${event.id}`,
      title: event.title,
      at: allDay ? midnight : start,
      time: allDay ? 'All day' : serverTime(new Date(start).toISOString(), timeZone),
      detail: allDay ? 'Calendar event' : `${Math.max(0, Math.round((end - start) / 60_000))} min · Event`,
      task: null,
      event,
      deadline: false,
    };
  });

  // `sorted { $0.at == $1.at ? $0.id < $1.id : $0.at < $1.at }`
  return [...taskRows, ...eventRows].sort((left, right) =>
    left.at === right.at ? (left.id < right.id ? -1 : left.id > right.id ? 1 : 0) : left.at - right.at,
  );
}

/** `timeline(_:)`'s colour choice (CalendarView.swift:436-439). */
export function rowTone(row: CalendarRow, timeZone: string, now: number = Date.now()): 'critical' | 'late' | 'normal' {
  if (row.task && (row.task.critical === true || row.task.priority === 'CRITICAL')) return 'critical';
  if (row.task && calendarOverdue(row.task, timeZone, now)) return 'late';
  return 'normal';
}

/** The glyph `timeline(_:)` draws (CalendarView.swift:445). */
export function rowSymbol(row: CalendarRow, timeZone: string, now: number = Date.now()): 'calendar' | 'doc.text' | 'checkmark.square' {
  if (row.event !== null) return 'calendar';
  return row.task && calendarOverdue(row.task, timeZone, now) ? 'doc.text' : 'checkmark.square';
}
