import { dayInterval, dayKey, monthInterval, startOfDay, addDays, weekInterval, type Interval } from '../../lib/taskQuery';
import { advance, BREAK_SECONDS, POMODORO_CATEGORIES, remaining, type PomodoroCategory, type PomodoroSession } from './model';

/**
 * `PomodoroPeriod` and `PomodoroAnalytics` (ios/Sources/NexdoCore/PomodoroAnalytics.swift).
 *
 * "Activity is attributed to the session's start date in the user's current calendar; weeks run
 * Monday–Sunday. Pauses are excluded by the timer model; breaks never contribute to focus time."
 *
 * Swift takes a `Calendar` and forces `firstWeekday = 2`; this takes the zone and always uses Monday,
 * whatever the device region says. Intervals and bucket bounds are epoch MILLISECONDS; durations are
 * seconds, as in Swift.
 */

export const POMODORO_PERIODS = ['today', 'week', 'month', 'all'] as const;
export type PomodoroPeriod = (typeof POMODORO_PERIODS)[number];

/** `PomodoroPeriod.title` (PomodoroAnalytics.swift:5). */
export const POMODORO_PERIOD_TITLES: Record<PomodoroPeriod, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
  all: 'All Time',
};

export type PomodoroBucket = { start: number; end: number; seconds: number; breakSeconds: number };
export type PomodoroCategoryTotal = { category: PomodoroCategory; seconds: number };
export type PomodoroDay = { date: number; sessions: PomodoroSession[] };

export type PomodoroAnalytics = {
  /** The period's sessions, newest first, each advanced to `now`. */
  sessions: PomodoroSession[];
  period: PomodoroPeriod;
  interval: Interval;
  now: number;
  timeZone: string;
  /** Focus in the period before this one; `null` for All Time. */
  previousSeconds: number | null;
  focusSeconds: number;
  breakSeconds: number;
  completedCount: number;
  /** Completed out of completed plus stopped; `null` when neither happened. */
  focusRate: number | null;
  /** Whole-percent change against `previousSeconds`; `null` without a previous period to compare. */
  changePercent: number | null;
  categories: PomodoroCategoryTotal[];
  buckets: PomodoroBucket[];
  days: PomodoroDay[];
};

/** Swift's `Double.rounded()`: half away from zero (`Math.round` rounds -2.5 to -2). */
function rounded(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** `focused(_:)` (PomodoroAnalytics.swift:68-71): focus done, never more than planned. */
export function focusedSeconds(session: PomodoroSession, now: number): number {
  const planned = session.durationMinutes * 60;
  return Math.min(planned, Math.max(0, session.phase === 'focus' ? planned - remaining(session, now) : session.focusSeconds));
}

/** `rested(_:)` (PomodoroAnalytics.swift:72-74). */
export function restedSeconds(session: PomodoroSession, now: number): number {
  return Math.min(BREAK_SECONDS, Math.max(0, session.phase === 'shortBreak' ? BREAK_SECONDS - remaining(session, now) : session.breakSeconds));
}

/** `calendar.dateInterval(of:for:)` for the component the period uses. */
function periodInterval(period: PomodoroPeriod, at: number, timeZone: string): Interval {
  if (period === 'week') return weekInterval(at, timeZone);
  if (period === 'month') return monthInterval(at, timeZone);
  return dayInterval(at, timeZone);
}

function startMs(session: PomodoroSession): number {
  return session.startedAt * 1000;
}

function within(session: PomodoroSession, interval: Interval): boolean {
  return startMs(session) >= interval.start && startMs(session) < interval.end;
}

/** `PomodoroAnalytics.init` and its computed properties (PomodoroAnalytics.swift:45-91). */
export function pomodoroAnalytics({
  sessions: input,
  period,
  now = Date.now(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
}: {
  sessions: PomodoroSession[];
  period: PomodoroPeriod;
  now?: number;
  timeZone?: string;
}): PomodoroAnalytics {
  // One copy per id: the highest stored revision, a later one winning a tie, BEFORE the clock advances it.
  const latest = new Map<string, PomodoroSession>();
  for (const session of input) {
    if (startMs(session) > now) continue;
    const kept = latest.get(session.id);
    if (!kept || session.revision >= kept.revision) latest.set(session.id, session);
  }
  const all = [...latest.values()].map((session) => advance(session, now).session).sort((a, b) => b.startedAt - a.startedAt);

  const current = periodInterval(period, now, timeZone);
  const oldest = all.length > 0 ? startMs(all[all.length - 1]) : now;
  const interval: Interval = period === 'all' ? { start: startOfDay(oldest, timeZone), end: current.end } : current;
  const sessions = all.filter((session) => within(session, interval));

  let previousSeconds: number | null = null;
  if (period !== 'all') {
    const previous = periodInterval(period, current.start - 1, timeZone);
    previousSeconds = all.filter((session) => within(session, previous)).reduce((sum, session) => sum + focusedSeconds(session, now), 0);
  }

  const focus = (list: PomodoroSession[]) => list.reduce((sum, session) => sum + focusedSeconds(session, now), 0);
  const rest = (list: PomodoroSession[]) => list.reduce((sum, session) => sum + restedSeconds(session, now), 0);

  const focusSeconds = focus(sessions);
  const completedCount = sessions.filter((session) => session.phase === 'completed' || session.phase === 'shortBreak').length;
  const resolved = completedCount + sessions.filter((session) => session.phase === 'stopped').length;

  const categories = POMODORO_CATEGORIES.map((category) => ({
    category,
    seconds: focus(sessions.filter((session) => session.category === category)),
  })).filter((total) => total.seconds > 0);

  // Three-hour buckets for Today (`.hour`, value 3: elapsed hours), months for All Time, days otherwise.
  const step = (cursor: number): number => {
    if (period === 'today') return cursor + 3 * 3_600_000;
    if (period === 'all') return monthInterval(cursor, timeZone).end;
    return addDays(cursor, 1, timeZone);
  };
  const buckets: PomodoroBucket[] = [];
  let cursor = period === 'all' ? monthInterval(interval.start, timeZone).start : interval.start;
  while (cursor < interval.end) {
    const next = step(cursor);
    if (!(next > cursor)) break;
    const bounds = { start: cursor, end: Math.min(next, interval.end) };
    const inside = sessions.filter((session) => within(session, bounds));
    buckets.push({ ...bounds, seconds: focus(inside), breakSeconds: rest(inside) });
    cursor = next;
  }

  const grouped = new Map<string, PomodoroSession[]>();
  for (const session of sessions) {
    const key = dayKey(startMs(session), timeZone);
    grouped.set(key, [...(grouped.get(key) ?? []), session]);
  }
  const days = [...grouped.values()]
    .map((list) => ({ date: startOfDay(startMs(list[0]), timeZone), sessions: [...list].sort((a, b) => b.startedAt - a.startedAt) }))
    .sort((a, b) => b.date - a.date);

  return {
    sessions,
    period,
    interval,
    now,
    timeZone,
    previousSeconds,
    focusSeconds,
    breakSeconds: rest(sessions),
    completedCount,
    focusRate: resolved === 0 ? null : completedCount / resolved,
    changePercent: previousSeconds !== null && previousSeconds > 0 ? rounded(((focusSeconds - previousSeconds) / previousSeconds) * 100) : null,
    categories,
    buckets,
    days,
  };
}
