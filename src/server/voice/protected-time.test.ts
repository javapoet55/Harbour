import { expect, it } from 'vitest';
import { protectedTaskIds, proposeProtectedTime, type ProtectedTask } from '@/lib/protected-time';
import { buildReplan } from '@/lib/replanning';
const at = (time: string) => new Date(`2026-09-14T${time}:00Z`);
const task: ProtectedTask = { id: 'presentation', title: 'Presentation', status: 'PLANNED', priority: 'HIGH', startAt: null, durationMin: 45, dueAt: at('17:00'), updatedAt: at('08:00'), postponeCount: 3 };
const context = { timeZone: 'UTC', workingDays: '1,2,3,4,5', workStart: '09:00', workEnd: '17:00', bufferMinutes: 15, tasks: [task], events: [{ id: 'meeting', title: 'Meeting', startAt: at('12:00'), endAt: at('13:00') }] };
it('proposes a real 45-minute opening after the meeting buffer', () => {
  expect(proposeProtectedTime(context, at('12:37'))).toMatchObject({ taskId: task.id, startAt: at('13:15').toISOString(), endAt: at('14:00').toISOString(), durationMin: 45 });
});
it('does not propose blocked, low-priority, dismissed, protected or insufficient-capacity work', () => {
  for (const change of [{ dependencyBlocked: true }, { priority: 'LOW' }, { postponeCount: 2 }, { dueAt: at('13:30') }, { status: 'COMPLETED' }]) expect(proposeProtectedTime({ ...context, tasks: [{ ...task, ...change }] }, at('12:37'))).toBeNull();
  expect(proposeProtectedTime(context, at('12:37'), [task.id])).toBeNull();
  expect(proposeProtectedTime(context, at('12:37'), [], [task.id])).toBeNull();
  expect(proposeProtectedTime({ ...context, contextWarnings: ['Sync needed'] }, at('12:37'))).toBeNull();
});
it('protection expires on completion, elapsed time or a manual schedule change', () => {
  const saved = { ...task, startAt: at('13:15') };
  const records = [{ key: `protected:${task.id}`, value: JSON.stringify({ startAt: saved.startAt.toISOString(), durationMin: 45 }) }];
  expect(protectedTaskIds(records, [saved], at('13:00'))).toEqual([task.id]);
  expect(protectedTaskIds(records, [{ ...saved, status: 'COMPLETED' }], at('13:00'))).toEqual([]);
  expect(protectedTaskIds(records, [{ ...saved, startAt: at('14:00') }], at('13:00'))).toEqual([]);
  expect(protectedTaskIds(records, [saved], at('14:01'))).toEqual([]);
});
it('replanning preserves the approved block and does not place another task over it', () => {
  const saved = { ...task, startAt: at('13:15') };
  const plan = buildReplan({ ...context, now: at('12:37'), horizonDays: 1, protectedTaskIds: [task.id], tasks: [saved, { ...task, id: 'other', startAt: at('13:15'), updatedAt: at('08:00') }] });
  expect(plan.moves.every(move => move.taskId !== task.id)).toBe(true);
  for (const move of plan.moves) expect(+new Date(move.toStartAt) + move.durationMin * 60000 <= +at('13:15') || +new Date(move.toStartAt) >= +at('14:00')).toBe(true);
});
