import { describe, expect, it } from 'vitest';
import { addDays, parseYmd, rangeForNextNDays, tzToday, ymd, zonedDateTime } from './time';

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
