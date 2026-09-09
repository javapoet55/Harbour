import { describe, expect, it } from 'vitest';
import { completionRate, mondayForWeek, startOfAccountWeek, weeklySummaryTaskWhere } from './weekly-summary';

describe('weekly summary rules', () => {
  it('normalizes every selected date to Monday, including Sunday and year boundaries', () => {
    for (const day of ['07', '08', '09', '10', '11', '12', '13']) {
      expect(mondayForWeek(`2026-09-${day}`)).toBe('2026-09-07');
    }
    expect(mondayForWeek('2027-01-03')).toBe('2026-12-28');
    expect(mondayForWeek('2026-09-14')).toBe('2026-09-14');
  });

  it.each(['2026-02-30', '2026-13-01', 'bad-date', '2026-9-7'])('rejects invalid calendar date %s', (day) => {
    expect(() => mondayForWeek(day)).toThrow('INVALID_WEEK');
  });
  it('uses the account timezone for Monday week boundaries', () => {
    expect(startOfAccountWeek('America/Los_Angeles', new Date('2026-09-08T02:00:00Z'))).toBe('2026-09-07');
    expect(startOfAccountWeek('Asia/Kolkata', new Date('2026-09-06T20:00:00Z'))).toBe('2026-09-07');
  });

  it('does not manufacture a percentage for an empty cohort', () => {
    expect(completionRate(0, 0)).toBeNull();
    expect(completionRate(18, 22)).toBe(82);
  });

  it('always scopes both planning branches to the authenticated account', () => {
    const where = weeklySummaryTaskWhere('account-a', new Date('2026-09-07T07:00:00Z'), new Date('2026-09-14T07:00:00Z'));
    expect(where.userId).toBe('account-a');
    expect(where.deletedAt).toBeNull();
    expect(where.OR).toHaveLength(2);
  });
});
