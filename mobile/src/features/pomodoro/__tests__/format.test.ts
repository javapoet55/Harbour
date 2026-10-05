import type { PomodoroBucket } from '../analytics';
import {
  axisLabel,
  axisMinutes,
  changeLine,
  chartDomain,
  completionDuration,
  countdown,
  dashboardTime,
  dayTitle,
  focusRateLabel,
  selectedBucket,
  sessionStatus,
  sharePercent,
  shortTime,
  startedLabel,
  tickIndices,
} from '../format';

/** The inline text rules of PomodoroView.swift and PomodoroDashboard.swift. */

const zone = 'America/Los_Angeles';

test('dashboard durations', () => {
  expect(dashboardTime(0)).toBe('0 min');
  expect(dashboardTime(40)).toBe('40s');
  expect(dashboardTime(1500)).toBe('25 min');
  expect(dashboardTime(3900)).toBe('1h 5m');
  expect(dashboardTime(-5)).toBe('0 min');
});

test('completion durations and the countdown', () => {
  expect(completionDuration(20)).toBe('20 sec');
  expect(completionDuration(1500)).toBe('25 min');
  expect(countdown(1500)).toBe('25:00');
  expect(countdown(59.2)).toBe('01:00');
  expect(countdown(0)).toBe('00:00');
});

test('statuses', () => {
  expect(sessionStatus({ phase: 'completed', paused: false })).toBe('Completed');
  expect(sessionStatus({ phase: 'stopped', paused: false })).toBe('Stopped early');
  expect(sessionStatus({ phase: 'shortBreak', paused: false })).toBe('Focus complete · Break');
  expect(sessionStatus({ phase: 'focus', paused: true })).toBe('Paused');
  expect(sessionStatus({ phase: 'focus', paused: false })).toBe('In progress');
});

test('the line under Focus Time', () => {
  expect(changeLine('week', 12, 100)).toEqual({ text: '12% more than last week', up: true });
  expect(changeLine('today', -30, 100)).toEqual({ text: '30% less than yesterday', up: false });
  expect(changeLine('month', null, 100)).toEqual({ text: 'Your first focus time this period', up: null });
  expect(changeLine('today', null, 0)).toEqual({ text: 'Start a session to build your focus habit', up: null });
  expect(changeLine('all', null, 100)).toBeNull();
});

test('rates and shares', () => {
  expect(focusRateLabel(null)).toBe('—');
  expect(focusRateLabel(0.666)).toBe('67%');
  expect(sharePercent(1, 3)).toBe(33);
  expect(sharePercent(1, 0)).toBe(0);
});

test('chart scale, ticks and the default pick', () => {
  const bucket = (seconds: number, breakSeconds = 0): PomodoroBucket => ({ start: seconds, end: seconds + 1, seconds, breakSeconds });
  expect(chartDomain([])).toBe(5);
  expect(chartDomain([bucket(1500, 300)])).toBeCloseTo(32.5);
  expect(axisMinutes(32.5)).toEqual([0, 10, 20, 30]);
  expect(axisMinutes(5)).toEqual([0, 2, 4]);
  expect(tickIndices(7, 'week')).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(tickIndices(30, 'month')).toEqual([0, 6, 12, 18, 24]);
  expect(selectedBucket([bucket(10), bucket(30), bucket(30)], null)).toBe(1);
  expect(selectedBucket([bucket(10), bucket(30)], 0)).toBe(0);
  expect(selectedBucket([], null)).toBeNull();
});

test('axis labels and dates, in the device zone', () => {
  const at = Date.parse('2026-09-26T22:00:00Z'); // Sat 26 Sep, 3 PM Pacific
  expect(axisLabel(at, 'today', zone)).toBe('3PM');
  expect(axisLabel(Date.parse('2026-09-26T07:00:00Z'), 'today', zone)).toBe('12AM');
  expect(axisLabel(at, 'week', zone)).toBe('Sat');
  expect(axisLabel(at, 'month', zone)).toBe('26');
  expect(axisLabel(at, 'all', zone)).toBe('Sep 26');
  expect(dayTitle(at, at, zone)).toBe('Today, Sep 26, 2026');
  expect(dayTitle(at - 86_400_000, at, zone)).toBe('Yesterday, Sep 25, 2026');
  expect(dayTitle(at - 3 * 86_400_000, at, zone)).toBe('Sep 23, 2026');
  expect(shortTime(at, zone)).toBe('3:00 PM');
  expect(startedLabel(at, zone)).toBe('Sep 26, 2026 at 3:00 PM');
});
