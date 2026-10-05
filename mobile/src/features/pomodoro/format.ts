import { dayKey } from '../../lib/taskQuery';
import type { PomodoroBucket, PomodoroPeriod } from './analytics';
import type { PomodoroCategory, PomodoroSession } from './model';

/**
 * The text and the small rules PomodoroView.swift and PomodoroDashboard.swift keep inline. `zone` is the
 * device's, as Swift's `Calendar.current` / `DateFormatter()`.
 */

/** `time(_:)` (PomodoroDashboard.swift:243-247): "1h 5m", "25 min", "40s" under a minute, "0 min". */
export function dashboardTime(seconds: number): string {
  const minutes = Math.trunc(Math.max(0, seconds) / 60);
  if (minutes >= 60) return `${Math.trunc(minutes / 60)}h ${minutes % 60}m`;
  return minutes === 0 && seconds > 0 ? `${Math.trunc(seconds)}s` : `${minutes} min`;
}

/** `duration(_:)` (PomodoroView.swift:178): the completion card's "40 sec" / "25 min". */
export function completionDuration(seconds: number): string {
  return seconds < 60 ? `${Math.trunc(seconds)} sec` : `${Math.trunc(Math.trunc(seconds) / 60)} min`;
}

/** The timer's `%02d:%02d` of the whole seconds left, rounded up. */
export function countdown(remainingSeconds: number): string {
  const seconds = Math.ceil(remainingSeconds);
  return `${String(Math.trunc(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** `status(_:)` (PomodoroDashboard.swift:236). */
export function sessionStatus(session: Pick<PomodoroSession, 'phase' | 'paused'>): string {
  switch (session.phase) {
    case 'completed':
      return 'Completed';
    case 'stopped':
      return 'Stopped early';
    case 'shortBreak':
      return 'Focus complete · Break';
    case 'focus':
      return session.paused ? 'Paused' : 'In progress';
  }
}

/** `comparison` (PomodoroDashboard.swift:110). */
export function comparisonText(period: PomodoroPeriod): string {
  return { today: 'yesterday', week: 'last week', month: 'last month', all: 'previous period' }[period];
}

/** The line under Focus Time (PomodoroDashboard.swift:93-96); `null` when nothing shows. */
export function changeLine(period: PomodoroPeriod, changePercent: number | null, focusSeconds: number): { text: string; up: boolean | null } | null {
  if (changePercent !== null) return { text: `${Math.abs(changePercent)}% ${changePercent >= 0 ? 'more' : 'less'} than ${comparisonText(period)}`, up: changePercent >= 0 };
  if (period === 'all') return null;
  return { text: focusSeconds > 0 ? 'Your first focus time this period' : 'Start a session to build your focus habit', up: null };
}

/** Focus Rate's value: a whole percent, or "—" when nothing finished or stopped. */
export function focusRateLabel(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

/** A category's share of the total as a whole percent (`.rounded()`). */
export function sharePercent(seconds: number, total: number): number {
  return total > 0 ? Math.round((seconds / total) * 100) : 0;
}

/** `tickStep` (PomodoroDashboard.swift:122): about 7 labels for a week, 5 otherwise. */
export function tickIndices(count: number, period: PomodoroPeriod): number[] {
  const step = Math.max(1, Math.ceil(count / (period === 'week' ? 7 : 5)));
  const ticks: number[] = [];
  for (let index = 0; index < count; index += step) ticks.push(index);
  return ticks;
}

/** `chartYScale` (:139): 0 … max(5, the tallest bar in minutes × 1.3). */
export function chartDomain(buckets: PomodoroBucket[]): number {
  const tallest = Math.max(0, ...buckets.map((bucket) => Math.max(bucket.seconds, bucket.breakSeconds) / 60));
  return Math.max(5, tallest * 1.3);
}

/** Four round minute labels from 0 up to the domain, as `AxisMarks(values: .automatic(desiredCount: 4))`. */
export function axisMinutes(domain: number): number[] {
  const raw = domain / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ?? 10 * magnitude;
  const values: number[] = [];
  for (let value = 0; value <= domain + 1e-9; value += step) values.push(Math.round(value));
  return values;
}

/** `chartXSelection` with nothing picked shows the tallest bucket (`buckets.max(by:)`, first on a tie). */
export function selectedBucket(buckets: PomodoroBucket[], picked: number | null): number | null {
  if (picked !== null && picked >= 0 && picked < buckets.length) return picked;
  if (buckets.length === 0) return null;
  let best = 0;
  buckets.forEach((bucket, index) => {
    if (bucket.seconds > buckets[best].seconds) best = index;
  });
  return best;
}

function parts(at: number, zone: string) {
  const values = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23', weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' }).formatToParts(new Date(at));
  const get = (type: string) => values.find((part) => part.type === type)?.value ?? '';
  return { hour: Number(get('hour')) % 24, weekday: get('weekday'), day: get('day'), month: get('month'), year: get('year') };
}

/** `axisLabel(_:period:)` (:150-152): "ha" (3PM), "EEE" (Mon), "d", or "MMM yy" (Sep 26). */
export function axisLabel(at: number, period: PomodoroPeriod, zone: string): string {
  const p = parts(at, zone);
  if (period === 'today') return `${p.hour % 12 === 0 ? 12 : p.hour % 12}${p.hour < 12 ? 'AM' : 'PM'}`;
  if (period === 'week') return p.weekday;
  if (period === 'month') return p.day;
  return `${p.month} ${p.year}`;
}

/** `dayTitle(_:)` (:237-241): "Today, Sep 26, 2026", "Yesterday, …", or the date alone. */
export function dayTitle(at: number, now: number, zone: string): string {
  const date = new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(at));
  const day = dayKey(at, zone);
  if (day === dayKey(now, zone)) return `Today, ${date}`;
  const [y, m, d] = dayKey(now, zone).split('-').map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  return day === yesterday ? `Yesterday, ${date}` : date;
}

/** `Date(timeIntervalSince1970:).formatted(date: .omitted, time: .shortened)` in en-US: "3:05 PM". */
export function shortTime(at: number, zone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(at));
}

/** `.formatted(date: .abbreviated, time: .shortened)`: "Sep 26, 2026 at 3:05 PM". */
export function startedLabel(at: number, zone: string): string {
  const date = new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(at));
  return `${date} at ${shortTime(at, zone)}`;
}

/** The timer's per-category tint (PomodoroView.swift:84-86). */
export const TIMER_TINTS: Record<PomodoroCategory, string> = {
  reading: '#00C7BE',
  focus: '#AF52DE',
  coding: '#FF9500',
  diary: '#FF2D55',
  math: '#FFCC00',
  stretching: '#32ADE6',
};

/** The dashboard's per-category colour (PomodoroDashboard.swift:248); reading is green here, mint there. */
export const CATEGORY_COLORS: Record<PomodoroCategory, string> = {
  reading: '#34C759',
  focus: '#AF52DE',
  coding: '#FF9500',
  diary: '#FF2D55',
  math: '#FFCC00',
  stretching: '#32ADE6',
};

/** Ionicons for `PomodoroCategory.icon` (Pomodoro.swift:8-10). */
export const CATEGORY_ICONS: Record<PomodoroCategory, 'book' | 'stopwatch' | 'code-slash' | 'heart' | 'school' | 'body'> = {
  reading: 'book',
  focus: 'stopwatch',
  coding: 'code-slash',
  diary: 'heart',
  math: 'school',
  stretching: 'body',
};

/** The "About these metrics" alert (PomodoroDashboard.swift:63-67), verbatim. */
export const METRICS_DEFINITION =
  'Focus time excludes pauses and breaks, and includes partial stopped sessions. Sessions counts all attempts. Focus rate is the percentage of finished or stopped focus sessions that reached their planned duration; ongoing focus is excluded. Activity is grouped by the session’s start date in your local time zone. Time saved is not measured, so we show recorded break time instead. Comparisons use the previous full day, week, or month.';
