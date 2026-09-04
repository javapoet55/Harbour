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
});
