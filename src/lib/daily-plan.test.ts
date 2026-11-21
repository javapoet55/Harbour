import { describe, expect, it } from 'vitest';
import { canReschedule, effectiveTime, focusLabel, overdueTasks, rescheduleButtonTitle, rescheduleFailure, rescheduleSlots, shiftWeek, weekRange, zonedParts } from './daily-plan';

const t = (id: string, extra: Record<string, unknown> = {}) => ({ id, status: 'PLANNED', startAt: null as string | null, dueAt: null as string | null, durationMin: 30, ...extra });
const NOW = Date.parse('2026-11-21T12:00:00Z');

describe('overdueTasks', () => {
  it('uses start, else due, and skips finished, future and undated tasks', () => {
    const tasks = [
      t('a', { startAt: '2026-11-20T10:00:00Z', dueAt: '2026-11-25T10:00:00Z' }),
      t('b', { dueAt: '2026-11-19T10:00:00Z' }),
      t('c', { startAt: '2026-11-22T10:00:00Z' }),
      t('d'),
      t('e', { dueAt: '2026-11-18T10:00:00Z', status: 'COMPLETED' }),
      t('f', { dueAt: '2026-11-18T10:00:00Z', status: 'CANCELLED' }),
    ];
    expect(overdueTasks(tasks, NOW).map((task) => task.id)).toEqual(['b', 'a']);
  });
  it('orders ties by id and ignores bad dates', () => {
    const same = '2026-11-20T10:00:00Z';
    expect(overdueTasks([t('z', { dueAt: same }), t('m', { dueAt: same }), t('x', { dueAt: 'nope' })], NOW).map((task) => task.id)).toEqual(['m', 'z']);
    expect(effectiveTime(t('x', { dueAt: 'nope' }))).toBeNull();
  });
});

describe('rescheduleSlots', () => {
  it('places tasks back to back, each taking at least a minute', () => {
    const slots = rescheduleSlots([t('a', { durationMin: 30 }), t('b', { durationMin: 0 }), t('c', { durationMin: 15 })], 1_000_000);
    expect(slots.map((slot) => slot.startMs)).toEqual([1_000_000, 1_000_000 + 30 * 60_000, 1_000_000 + 31 * 60_000]);
  });
});

describe('zonedParts', () => {
  it('reads the date and time in the given zone', () => {
    expect(zonedParts(Date.parse('2026-11-21T04:30:00Z'), 'America/Los_Angeles')).toEqual({ date: '2026-11-20', time: '20:30' });
    expect(zonedParts(Date.parse('2026-11-21T00:05:00Z'), 'UTC')).toEqual({ date: '2026-11-21', time: '00:05' });
  });
});

describe('labels and guards', () => {
  it('words the button and failure', () => {
    expect(rescheduleButtonTitle(false, 1)).toBe('Reschedule 1 task');
    expect(rescheduleButtonTitle(false, 3)).toBe('Reschedule 3 tasks');
    expect(rescheduleButtonTitle(true, 3)).toBe('Rescheduling…');
    expect(rescheduleFailure('Pay rent', 'Busy.')).toBe('Couldn’t reschedule Pay rent: Busy. Earlier changes were saved.');
  });
  it('needs tasks, a future start, and no save in flight', () => {
    expect(canReschedule({ saving: false, count: 2, start: NOW + 1, now: NOW })).toBe(true);
    expect(canReschedule({ saving: true, count: 2, start: NOW + 1, now: NOW })).toBe(false);
    expect(canReschedule({ saving: false, count: 0, start: NOW + 1, now: NOW })).toBe(false);
    expect(canReschedule({ saving: false, count: 2, start: NOW, now: NOW })).toBe(false);
    expect(canReschedule({ saving: false, count: 2, start: NaN, now: NOW })).toBe(false);
  });
  it('pages weeks and formats', () => {
    expect(shiftWeek('2026-11-16', -1)).toBe('2026-11-09');
    expect(shiftWeek('2026-12-28', 1)).toBe('2027-01-04');
    expect(weekRange('2026-11-16', '2026-11-22')).toMatch(/16.*22/);
    expect(focusLabel(0)).toBe('0 min');
    expect(focusLabel(45)).toBe('45 min');
    expect(focusLabel(120)).toBe('2 hr');
    expect(focusLabel(125)).toBe('2 hr 5 min');
  });
});
