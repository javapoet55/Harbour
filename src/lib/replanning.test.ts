import { describe, expect, it } from 'vitest';
import { buildReplan, type ReplanTask } from './replanning';

const updatedAt = new Date('2026-09-04T12:00:00Z');
function task(value: Partial<ReplanTask> & Pick<ReplanTask, 'id' | 'title'>): ReplanTask {
  return { status: 'PLANNED', priority: 'NORMAL', startAt: null, dueAt: null, durationMin: 60, updatedAt, ...value };
}
const base = { timeZone: 'America/Los_Angeles', workingDays: '1,2,3,4,5', workStart: '09:00', workEnd: '17:00', now: new Date('2026-09-08T15:00:00Z') };

describe('continuous replanning', () => {
  it('moves unfinished work from the past into the next free block', () => {
    const plan = buildReplan({ ...base, events: [], tasks: [task({ id: 'late', title: 'Late task', startAt: new Date('2026-09-08T14:00:00Z') })] });
    expect(plan.moves).toHaveLength(1);
    expect(plan.moves[0].reason).toBe('unfinished');
    expect(plan.moves[0].toStartAt).toBe('2026-09-08T16:00:00.000Z');
  });

  it('moves a task when a meeting occupies its block', () => {
    const start = new Date('2026-09-08T17:00:00Z');
    const plan = buildReplan({ ...base, tasks: [task({ id: 'conflict', title: 'Conflicted', startAt: start })], events: [{ id: 'meeting', title: 'Meeting', startAt: start, endAt: new Date('2026-09-08T18:00:00Z') }] });
    expect(plan.moves[0].reason).toBe('meeting_conflict');
    expect(plan.moves[0].toStartAt).not.toBe(start.toISOString());
  });

  it('inserts urgent unscheduled work first and minimally displaces lower priority work', () => {
    const normalStart = new Date('2026-09-08T16:00:00Z');
    const plan = buildReplan({ ...base, events: [], tasks: [
      task({ id: 'normal', title: 'Normal', startAt: normalStart }),
      task({ id: 'urgent', title: 'Urgent', priority: 'CRITICAL', dueAt: new Date('2026-09-08T20:00:00Z'), durationMin: 60 }),
    ] });
    expect(plan.moves.find((move) => move.taskId === 'urgent')?.reason).toBe('urgent_inserted');
    expect(plan.moves.find((move) => move.taskId === 'normal')?.reason).toBe('priority_displacement');
  });

  it('reports capacity risk when no working slot is available', () => {
    const plan = buildReplan({ ...base, horizonDays: 1, events: [{ id: 'all-day', title: 'Busy', startAt: new Date('2026-09-08T16:00:00Z'), endAt: new Date('2026-09-09T00:00:00Z') }], tasks: [task({ id: 'urgent', title: 'Urgent', priority: 'CRITICAL' })] });
    expect(plan.risks).toEqual([{ taskId: 'urgent', title: 'Urgent', reason: 'no_capacity' }]);
  });

  it('places a dependency before the task it unblocks', () => {
    const plan = buildReplan({ ...base, events: [], tasks: [
      task({ id: 'draft', title: 'Draft proposal', dependsOnIds: ['research'] }),
      task({ id: 'research', title: 'Research', priority: 'LOW' }),
    ] });
    const research = plan.moves.find((move) => move.taskId === 'research')!;
    const draft = plan.moves.find((move) => move.taskId === 'draft')!;
    expect(new Date(draft.toStartAt).getTime()).toBeGreaterThanOrEqual(new Date(research.toStartAt).getTime() + research.durationMin * 60_000);
  });

  it('fits high-energy work early and low-energy work late', () => {
    const plan = buildReplan({ ...base, events: [], tasks: [
      task({ id: 'focus', title: 'Deep work', energyLevel: 'HIGH' }),
      task({ id: 'admin', title: 'Admin', energyLevel: 'LOW' }),
    ] });
    const focus = plan.moves.find((move) => move.taskId === 'focus')!;
    const admin = plan.moves.find((move) => move.taskId === 'admin')!;
    expect(new Date(focus.toStartAt).getTime()).toBeLessThan(new Date(admin.toStartAt).getTime());
  });
});
