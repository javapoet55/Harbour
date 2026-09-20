import { describe, expect, it } from 'vitest';
import { adminDateRangeLabel, parseAdminDateRange } from './admin-date-range';

const now = new Date('2026-09-20T13:00:00.000Z');

describe('admin user date ranges', () => {
  it('defaults to an inclusive last-15-day range', () => {
    expect(parseAdminDateRange(undefined, undefined, now)).toMatchObject({ from: '2026-09-06', to: '2026-09-20', days: 15 });
  });

  it('accepts a particular day and custom range', () => {
    expect(parseAdminDateRange('2026-09-17', '2026-09-17', now)).toMatchObject({ from: '2026-09-17', to: '2026-09-17', days: 1 });
    const range = parseAdminDateRange('2026-09-01', '2026-09-20', now);
    expect(range.days).toBe(20);
    expect(adminDateRangeLabel(range)).toBe('Sep 1 – Sep 20, 2026');
  });

  it('rejects future, reversed, malformed, and oversized ranges', () => {
    for (const pair of [['2026-09-21','2026-09-21'], ['2026-09-20','2026-09-01'], ['bad','2026-09-20'], ['2025-01-01','2026-09-20']]) {
      expect(parseAdminDateRange(pair[0], pair[1], now)).toMatchObject({ from: '2026-09-06', to: '2026-09-20', days: 15 });
    }
  });
});
