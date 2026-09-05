import { describe, expect, it } from 'vitest';
import { rankFocusTasks } from './focus-ranking';

describe('focus ranking', () => {
  const now = new Date('2026-09-04T16:00:00Z');
  it('ranks critical and overdue work ahead of ordinary tasks', () => {
    const ranked = rankFocusTasks([
      { id: 'normal', title: 'Normal', priority: 'NORMAL', status: 'PLANNED', dueAt: null, startAt: null },
      { id: 'critical', title: 'Critical', priority: 'CRITICAL', status: 'PLANNED', dueAt: new Date('2026-09-05T16:00:00Z'), startAt: null },
      { id: 'overdue', title: 'Overdue', priority: 'HIGH', status: 'PLANNED', dueAt: new Date('2026-09-03T16:00:00Z'), startAt: null },
    ], now);
    expect(new Set(ranked.slice(0, 2).map((task) => task.id))).toEqual(new Set(['overdue', 'critical']));
    expect(ranked[2].id).toBe('normal');
  });

  it('does not put an undated task ahead of an equally prioritized dated task', () => {
    const ranked = rankFocusTasks([
      { id: 'none', title: 'No date', priority: 'NORMAL', status: 'PLANNED', dueAt: null, startAt: null },
      { id: 'dated', title: 'Due soon', priority: 'NORMAL', status: 'PLANNED', dueAt: new Date('2026-09-05T16:00:00Z'), startAt: null },
    ], now);
    expect(ranked[0].id).toBe('dated');
  });
});
