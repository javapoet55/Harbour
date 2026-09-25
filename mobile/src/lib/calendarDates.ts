import type { CalendarEvent, NexdoTask } from '../api/types';
import { eventOccursOn } from './todaySchedule';
import { addDays, dayKey, isDone, parseServerDate, standardContains, startOfDay } from './taskQuery';

/**
 * Port of `CalendarDates`, `CalendarSearch` and `CalendarEventFilter`
 * (ios/Sources/NexdoCore/CalendarDates.swift).
 *
 * "Calendar arithmetic in the account timezone, shared by all native calendar modes."
 */

/** `CalendarSearch.matches` (CalendarDates.swift:3-8). An empty query matches everything. */
export function calendarSearchMatches(title: string, query: string): boolean {
  const keyword = query.trim();
  return keyword.length === 0 || standardContains(title, keyword);
}

/** `CalendarDates.key(_:)` (CalendarDates.swift:18-23). */
export function calendarKey(at: number, timeZone: string): string {
  return dayKey(at, timeZone);
}

/**
 * `CalendarDates.week(_:)` (CalendarDates.swift:27-30).
 *
 * `firstWeekday = 2`, so the week runs MONDAY to Sunday. Swift's `weekday` component is 1 for Sunday
 * through 7 for Saturday, and `-((weekday + 5) % 7)` walks back to that Monday.
 */
export function calendarWeek(at: number, timeZone: string): number[] {
  const day = startOfDay(at, timeZone);
  const [year, month, date] = dayKey(day, timeZone).split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 1;
  const start = addDays(day, -((weekday + 5) % 7), timeZone);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index, timeZone));
}

/**
 * `CalendarDates.month(_:)` (CalendarDates.swift:31-37).
 *
 * NOTE the asymmetry with `week`, which is deliberate in Swift: the month grid is SUNDAY-first
 * (`offset = weekday(first) - 1`), while the week strip is Monday-first. The two column headers in
 * `dateGrid` say so — `["SUN", …]` for month and `["MON", …]` for week (CalendarView.swift:360).
 *
 * The grid is padded to a whole number of weeks, so it is always 28, 35 or 42 cells.
 */
export function calendarMonth(at: number, timeZone: string): number[] {
  const [year, month] = dayKey(at, timeZone).split('-').map(Number);
  const first = startOfDay(Date.UTC(year, month - 1, 1, 12), timeZone);
  // `calendar.component(.weekday, from: first) - 1`: 0 for Sunday.
  const offset = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 0)).getUTCDate();
  const start = addDays(first, -offset, timeZone);
  const count = Math.floor((offset + daysInMonth + 6) / 7) * 7;
  return Array.from({ length: count }, (_, index) => addDays(start, index, timeZone));
}

/**
 * `CalendarDates.taskOccurs(_:on:completedOnly:)` (CalendarDates.swift:38-41).
 *
 * `task.isDone == completedOnly` is an EQUALITY, not a filter: with `completedOnly` off it keeps only
 * open tasks, and with it on only completed ones.
 */
export function taskOccursOn(task: NexdoTask, day: string, timeZone: string, completedOnly = false): boolean {
  if (isDone(task) !== completedOnly) return false;
  if (task.status === 'CANCELLED') return false;
  return [task.startAt, task.dueAt]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .some((value) => {
      const at = parseServerDate(value);
      return at !== null && dayKey(at, timeZone) === day;
    });
}

/**
 * `CalendarEventFilter.matches` (CalendarDates.swift:44-52).
 *
 * "Events have no completion flag: their exclusive end time determines completion."
 */
export function calendarEventMatches({
  event,
  day,
  timeZone,
  completedOnly,
  now = Date.now(),
}: {
  event: CalendarEvent;
  day: string;
  timeZone: string;
  completedOnly: boolean;
  now?: number;
}): boolean {
  if (!eventOccursOn(event, day, timeZone)) return false;
  if (!completedOnly) return true;
  const end = parseServerDate(event.endAt);
  return end !== null && end <= now;
}

/** The three calendar modes (CalendarView.swift:4). */
export const CALENDAR_MODES = ['Schedule', 'Week', 'Month'] as const;
export type CalendarMode = (typeof CALENDAR_MODES)[number];

/** The schedule-mode ranges (CalendarView.swift:5). */
export const CALENDAR_RANGES = ['Next 3 days', 'Next 7 days', 'This week'] as const;
export type CalendarRange = (typeof CALENDAR_RANGES)[number];

/** `visibleDays` (CalendarView.swift:32-41). */
export function visibleDays(mode: CalendarMode, range: CalendarRange, selected: number, timeZone: string): number[] {
  if (mode === 'Week') return calendarWeek(selected, timeZone);
  if (mode === 'Month') return calendarMonth(selected, timeZone);
  if (range === 'This week') return calendarWeek(selected, timeZone);
  const days = range === 'Next 3 days' ? 3 : 7;
  const from = startOfDay(selected, timeZone);
  return Array.from({ length: days }, (_, index) => addDays(from, index, timeZone));
}

/** `shift(_:)` (CalendarView.swift:382-384): a week in Week mode, a month in Month mode. */
export function shiftSelected(mode: CalendarMode, selected: number, direction: number, timeZone: string): number {
  if (mode === 'Week') return addDays(selected, direction * 7, timeZone);
  const [year, month, date] = dayKey(selected, timeZone).split('-').map(Number);
  // `date(byAdding: .month, …)` clamps into a shorter month rather than rolling over.
  const target = new Date(Date.UTC(year, month - 1 + direction, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return startOfDay(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date, lastDay), 12), timeZone);
}

/** `overdue(_:)` (CalendarView.swift:46-49): a due date strictly before today, on an unfinished task. */
export function calendarOverdue(task: NexdoTask, timeZone: string, now: number = Date.now()): boolean {
  if (isDone(task)) return false;
  const due = parseServerDate(task.dueAt);
  if (due === null) return false;
  return dayKey(due, timeZone) < dayKey(now, timeZone);
}

/** `scheduled(_:_:)` (CalendarView.swift:414): the task STARTS on this day, rather than being due. */
export function taskScheduledOn(task: NexdoTask, day: string, timeZone: string): boolean {
  const at = parseServerDate(task.startAt);
  return at !== null && dayKey(at, timeZone) === day;
}

/** `itemCount(_:)` (CalendarView.swift:70). */
export function itemCount(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}
