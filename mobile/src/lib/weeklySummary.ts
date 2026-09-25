import { addDays, dayKey, startOfDay } from './taskQuery';

/**
 * Port of `WeeklySummaryDates` (ios/Sources/NexdoCore/WeeklySummary.swift:82-110) and the label
 * helpers on `WeeklySummaryView` (ios/App/WeeklySummaryView.swift:216-230).
 *
 * The calendar is Gregorian with `firstWeekday = 2`, so weeks run Monday to Sunday everywhere.
 */

/** `startOfWeek(containing:timeZoneID:)` (WeeklySummary.swift:91-96): the Monday of that week. */
export function startOfWeek(at: number, timeZone: string): number {
  const day = startOfDay(at, timeZone);
  const [year, month, date] = dayKey(day, timeZone).split('-').map(Number);
  // `calendar.component(.weekday, …)` is 1 for Sunday through 7 for Saturday.
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 1;
  return addDays(day, weekday === 1 ? -6 : 2 - weekday, timeZone);
}

/** `addingWeek(_:to:timeZoneID:)` (WeeklySummary.swift:98-100). */
export function addingWeek(amount: number, at: number, timeZone: string): number {
  return addDays(at, amount * 7, timeZone);
}

/** `apiDay(_:timeZoneID:)` (WeeklySummary.swift:102-109): `yyyy-MM-dd` in the account zone. */
export function apiDay(at: number, timeZone: string): string {
  return dayKey(at, timeZone);
}

/** Parse a `yyyy-MM-dd` day string back to the instant of its local midnight. */
export function dayStringToInstant(day: string, timeZone: string): number | null {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return null;
  return startOfDay(Date.UTC(year, month - 1, date, 12), timeZone);
}

/**
 * `rangeLabel` (WeeklySummaryView.swift:211-216): "Sep 14–Sep 20, 2026". The start carries no year,
 * the end does.
 */
export function weekRangeLabel(weekStart: number, timeZone: string): string {
  const end = addDays(weekStart, 6, timeZone);
  const startText = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(new Date(weekStart));
  const endText = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(end));
  return `${startText}–${endText}`;
}

/**
 * `WeeklySummary.taskRangeLabel` (WeeklySummary.swift:41-50): "Mon, Sep 14 – Sun, Sep 20", falling
 * back to the raw strings when either will not parse.
 */
export function taskRangeLabel(start: string, end: string, timeZone: string): string {
  const first = dayStringToInstant(start, timeZone);
  const last = dayStringToInstant(end, timeZone);
  if (first === null || last === null) return `${start} – ${end}`;
  const format = (at: number) =>
    new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(at));
  return `${format(first)} – ${format(last)}`;
}

/** `focusLabel(_:)` (WeeklySummaryView.swift:217): minutes under an hour, otherwise one decimal. */
export function focusLabel(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return 'Unavailable';
  return minutes < 60 ? `${minutes}m` : `${(minutes / 60).toFixed(1)}h`;
}

/** `weekday(_:)` (WeeklySummaryView.swift:218): the `EEEEE` narrow initial, for the chart axis. */
export function weekdayInitial(day: string, timeZone: string): string {
  const at = dayStringToInstant(day, timeZone);
  if (at === null) return day;
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'narrow' }).format(new Date(at));
}

/** `longDay(_:)` (WeeklySummaryView.swift:219): `EEE, MMM d`. */
export function longDay(day: string, timeZone: string): string {
  const at = dayStringToInstant(day, timeZone);
  if (at === null) return day;
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(at));
}

/**
 * `planPrompt(_:)` (WeeklySummaryView.swift:222-227). Reproduced exactly, because it is the prompt
 * the assistant receives — any drift changes the answer.
 */
export function planPrompt(
  summary: { start: string; end: string; metrics: { completed: number; planned: number; overdue?: number | null; focusMinutes?: number | null } },
  weekStart: number,
  timeZone: string,
): string {
  const nextStart = addingWeek(1, weekStart, timeZone);
  const nextEnd = addDays(nextStart, 6, timeZone);
  const overdue = summary.metrics.overdue === null || summary.metrics.overdue === undefined
    ? 'overdue unavailable'
    : String(summary.metrics.overdue);
  const focus = summary.metrics.focusMinutes === null || summary.metrics.focusMinutes === undefined
    ? 'focus time unavailable'
    : `${summary.metrics.focusMinutes} recorded focus minutes`;
  return (
    `Help me plan the week from ${apiDay(nextStart, timeZone)} through ${apiDay(nextEnd, timeZone)}. ` +
    `Facts from ${summary.start} through ${summary.end}: ${summary.metrics.completed} of ${summary.metrics.planned} ` +
    `planned tasks completed, ${overdue} overdue, and ${focus}. ` +
    `Propose a plan for my review; do not modify tasks without my approval.`
  );
}

/** `WeeklyTaskFilter` — the three filters on the task list (WeeklySummaryView.swift:264-270). */
export const WEEKLY_TASK_FILTERS = ['Completed', 'Planned', 'Overdue'] as const;
export type WeeklyTaskFilter = (typeof WEEKLY_TASK_FILTERS)[number];
