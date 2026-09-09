import { describe, expect, it } from 'vitest';
import { startOfLocalDay, endOfLocalDay, zonedDateTime, formatTime, addDays, parseYmd, rangeForNextNDays, tzToday, ymd } from './time';
describe('date ranges', () => {
  it('computes the next three days from a Pacific afternoon', () => {
    const now = new Date('2026-09-04T20:30:00.000Z');
    const range = rangeForNextNDays(3, 'America/Los_Angeles', now);
    expect(range.from).toBe('2026-09-04');
    expect(range.to).toBe('2026-09-06');
    expect(range.days).toEqual(['2026-09-04', '2026-09-05', '2026-09-06']);
  });

  it('computes the next five days', () => {
    const now = new Date('2026-09-04T20:30:00.000Z');
    const range = rangeForNextNDays(5, 'America/Los_Angeles', now);
    expect(range.days).toHaveLength(5);
    expect(range.to).toBe('2026-09-08');
  });

  it('resolves today in a positive-offset zone', () => {
    const now = new Date('2026-09-04T16:00:00.000Z');
    expect(ymd(tzToday('Asia/Kolkata', now))).toBe('2026-09-04');
  });
});

describe('time zones', () => {
  it('places 09:00 Pacific on the requested calendar day', () => {
    const when = zonedDateTime('2026-09-04', '09:00', 'America/Los_Angeles');
    expect(when.toISOString()).toBe('2026-09-04T16:00:00.000Z');
  });

  it('keeps midnight as the start of that local day, not the previous UTC day', () => {
    const when = zonedDateTime('2026-09-04', '00:00', 'America/Los_Angeles');
    expect(when.toISOString()).toBe('2026-09-04T07:00:00.000Z');
  });

  it('crosses a spring-forward day without inventing a local time', () => {
    const when = zonedDateTime('2026-03-08', '03:00', 'America/Los_Angeles');
    expect(Number.isNaN(when.getTime())).toBe(false);
  });
});

describe('calendar math', () => {
  it('adds days on UTC anchors so a west-coast browser cannot shift the date', () => {
    expect(ymd(addDays(parseYmd('2026-09-04'), 1))).toBe('2026-09-05');
  });
});

describe('timezone boundaries', () => {
  it('rejects the nonexistent spring-forward wall clock instead of silently changing it', () => {
    expect(() => zonedDateTime('2026-03-08', '02:30', 'America/Los_Angeles')).toThrow('INVALID_LOCAL_TIME');
    expect(() => zonedDateTime('2026-02-30', '09:00', 'America/Los_Angeles')).toThrow('INVALID_LOCAL_TIME');
  });
  it('uses 23-hour and 25-hour local days across DST', () => {
    for (const [day, hours] of [['2026-03-08', 23], ['2026-11-01', 25]] as const) {
      expect(+endOfLocalDay(day, 'America/Los_Angeles') + 1 - +startOfLocalDay(day, 'America/Los_Angeles')).toBe(hours * 3600000);
    }
  });
  it('retains local time with fractional offsets and both sides of a clock change', () => {
    expect(zonedDateTime('2026-09-08', '09:00', 'Asia/Kolkata').toISOString()).toBe('2026-09-08T03:30:00.000Z');
    for (const day of ['2026-03-07', '2026-03-08', '2026-11-01', '2026-11-02']) expect(formatTime(zonedDateTime(day, '09:00', 'America/Los_Angeles'), 'America/Los_Angeles')).toBe('9:00 AM');
  });
});
