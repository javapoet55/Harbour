import { describe, expect, it } from 'vitest';
import { nextOccurrence, occurrencesUntil } from './recurrence';

describe('recurrence', () => {
  it('advances monthly without losing the day-of-month', () => {
    expect(nextOccurrence('2026-01-28', { frequency: 'monthly', interval: 1 })).toBe('2026-02-28');
  });

  it('lists weekly occurrences through a date', () => {
    expect(occurrencesUntil('2026-09-04', { frequency: 'weekly', interval: 1 }, '2026-09-25')).toEqual([
      '2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25',
    ]);
  });

  it('supports selected weekdays', () => {
    const rule = { frequency: 'weekly' as const, interval: 1, byWeekday: [1, 3, 5] };
    expect(nextOccurrence('2026-09-04', rule)).toBe('2026-09-07');
    expect(nextOccurrence('2026-09-07', rule)).toBe('2026-09-09');
  });

  it('clamps month-end and leap-day yearly recurrence safely', () => {
    expect(nextOccurrence('2026-01-31', { frequency: 'monthly', interval: 1 })).toBe('2026-02-28');
    expect(nextOccurrence('2024-02-29', { frequency: 'yearly', interval: 1 })).toBe('2025-02-28');
  });
});
