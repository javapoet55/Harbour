import { dayKey } from '../../../lib/taskQuery';
import { pomodoroAnalytics } from '../analytics';
import { advance, newPomodoroSession, stop, togglePause, type PomodoroCategory, type PomodoroSession } from '../model';

/** Port of ios/Tests/NexdoCoreTests/PomodoroAnalyticsTests.swift. */

const zone = 'America/Los_Angeles';
const date = (text: string) => Date.parse(text);
let counter = 0;

function make(startMs: number, category: PomodoroCategory = 'focus', autoBreak = false): PomodoroSession {
  counter += 1;
  return newPomodoroSession({ id: `S${counter}`, category, name: '', durationMinutes: 25, autoBreak, playSound: false, now: startMs });
}

function finished(startMs: number, category: PomodoroCategory = 'focus', stopped = false): PomodoroSession {
  const s = make(startMs, category);
  return stopped ? stop(s, startMs + 600_000) : advance(s, startMs + 1_500_000).session;
}

function weekday(ms: number): number {
  const [y, m, d] = dayKey(ms, zone).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday, 1 = Monday
}

test('totals exclude pauses and breaks and use the actual stopped time', () => {
  const now = date('2026-09-26T22:00:00Z');
  const completed = finished(now - 7_200_000, 'reading');
  const stopped = finished(now - 3_600_000, 'coding', true);
  const paused = togglePause(make(now - 1_000_000, 'focus', true), now - 700_000);
  const stats = pomodoroAnalytics({ sessions: [completed, stopped, paused], period: 'today', now, timeZone: zone });
  expect(stats.focusSeconds).toBe(2400);
  expect(stats.breakSeconds).toBe(0);
  expect(stats.focusRate).toBe(0.5);
  expect(stats.sessions).toHaveLength(3);
  expect(stats.categories.reduce((sum, c) => sum + c.seconds, 0)).toBe(stats.focusSeconds);
  expect(stats.buckets.reduce((sum, b) => sum + b.seconds, 0)).toBe(stats.focusSeconds);
});

test('local midnight filters, and the previous day is compared', () => {
  const now = date('2026-09-26T22:00:00Z');
  const yesterday = finished(date('2026-09-26T06:00:00Z'));
  const today = finished(date('2026-09-26T08:00:00Z'));
  const stats = pomodoroAnalytics({ sessions: [yesterday, today], period: 'today', now, timeZone: zone });
  expect(stats.sessions.map((s) => s.id)).toEqual([today.id]);
  expect(stats.previousSeconds).toBe(1500);
  expect(stats.changePercent).toBe(0);
  expect(pomodoroAnalytics({ sessions: [yesterday, today], period: 'all', now, timeZone: zone }).days).toHaveLength(2);
});

test('daylight-saving buckets are contiguous and do not double count', () => {
  const now = date('2026-11-02T07:30:00Z'); // End of the 25-hour fall-back day in Los Angeles.
  const a = finished(date('2026-11-01T08:00:00Z'));
  const b = finished(date('2026-11-01T09:00:00Z'));
  const stats = pomodoroAnalytics({ sessions: [a, b], period: 'today', now, timeZone: zone });
  expect(stats.interval.end - stats.interval.start).toBe(25 * 3_600_000);
  expect(stats.buckets.reduce((sum, bucket) => sum + bucket.seconds, 0)).toBe(3000);
  expect(stats.buckets[0].start).toBe(stats.interval.start);
  expect(stats.buckets[stats.buckets.length - 1].end).toBe(stats.interval.end);
});

test('empty data has no invented rates, and stale timers normalise', () => {
  const now = date('2026-09-26T22:00:00Z');
  const empty = pomodoroAnalytics({ sessions: [], period: 'all', now, timeZone: zone });
  expect(empty.focusRate).toBeNull();
  expect(empty.changePercent).toBeNull();
  expect(empty.categories).toEqual([]);
  const running = newPomodoroSession({ id: 'R', category: 'math', name: '', durationMinutes: 25, autoBreak: true, playSound: false, now: now - 2_000_000 });
  const restored = pomodoroAnalytics({ sessions: [running, running], period: 'week', now, timeZone: zone });
  expect(restored.sessions).toHaveLength(1);
  expect(restored.completedCount).toBe(1);
  expect(restored.focusSeconds).toBe(1500);
  expect(restored.breakSeconds).toBe(300);
  expect(restored.buckets).toHaveLength(7);
});

test('duplicates resolve by stored revision before the clock advances them', () => {
  const now = date('2026-09-26T22:00:00Z');
  const old = newPomodoroSession({ id: 'D', category: 'focus', name: '', durationMinutes: 25, autoBreak: true, playSound: false, now: now - 2_000_000 });
  const newer = togglePause(old, now - 1_900_000);
  const stats = pomodoroAnalytics({ sessions: [newer, old], period: 'today', now, timeZone: zone });
  expect(stats.sessions).toHaveLength(1);
  expect(stats.sessions[0].paused).toBe(true);
  expect(stats.focusSeconds).toBe(100);
  expect(stats.completedCount).toBe(0);
});

test('month and all time keep older sessions', () => {
  const now = date('2026-09-26T22:00:00Z');
  const older = finished(date('2026-06-01T18:00:00Z'));
  const recent = finished(date('2026-09-01T18:00:00Z'));
  expect(pomodoroAnalytics({ sessions: [older, recent], period: 'month', now, timeZone: zone }).focusSeconds).toBe(1500);
  const all = pomodoroAnalytics({ sessions: [older, recent], period: 'all', now, timeZone: zone });
  expect(all.focusSeconds).toBe(3000);
  expect(all.buckets).toHaveLength(4);
});

test('weeks run Monday to Sunday (Swift forces it even on Sunday-first devices)', () => {
  const sunday = date('2026-09-27T19:00:00Z'); // Sun 27 Sep 2026, 12 PM Pacific
  const saturday = finished(date('2026-09-26T18:00:00Z')); // previous day, same Monday-based week
  const stats = pomodoroAnalytics({ sessions: [saturday], period: 'week', now: sunday, timeZone: zone });
  expect(stats.interval.start).toBe(date('2026-09-21T07:00:00Z')); // Mon 21 Sep, midnight Pacific
  expect(stats.interval.end).toBe(date('2026-09-28T07:00:00Z')); // through Sun 27 Sep
  expect(stats.buckets).toHaveLength(7);
  expect(weekday(stats.buckets[0].start)).toBe(1); // Monday
  expect(weekday(stats.buckets[6].start)).toBe(0); // Sunday
  expect(stats.focusSeconds).toBe(1500);
  const monday = pomodoroAnalytics({ sessions: [saturday], period: 'week', now: date('2026-09-28T16:00:00Z'), timeZone: zone });
  expect(monday.interval.start).toBe(date('2026-09-28T07:00:00Z')); // a new week starts Monday
  expect(monday.focusSeconds).toBe(0);
  expect(monday.previousSeconds).toBe(1500);
});

test('a negative half-percent change rounds away from zero, as Swift does', () => {
  const now = date('2026-09-26T22:00:00Z');
  // 1500 s yesterday; today a session stopped at 1462.5 s is -2.5 %, which Swift rounds to -3.
  const yesterday = finished(date('2026-09-26T06:00:00Z'));
  const today = stop(make(date('2026-09-26T08:00:00Z')), date('2026-09-26T08:00:00Z') + 1_462_500);
  expect(pomodoroAnalytics({ sessions: [yesterday, today], period: 'today', now, timeZone: zone }).changePercent).toBe(-3);
});
