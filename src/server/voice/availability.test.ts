import { expect, it } from 'vitest';
import { availability, creationWarnings, type AvailabilityContext } from '@/lib/availability';
const at = (time: string) => new Date(`2026-09-14T${time}:00Z`);
const context: AvailabilityContext = { timeZone: 'UTC', workingDays: '1,2,3,4,5', workStart: '09:00', workEnd: '17:00', bufferMinutes: 15, tasks: [], events: [{ id: 'meeting', title: 'Meeting', startAt: at('10:00'), endAt: at('11:00') }] };
it('free time and creation checks agree on the same buffered opening', () => {
  expect(availability(context, at('08:00'), at('12:00')).slots).toEqual([{ start: +at('09:00'), end: +at('09:45') }, { start: +at('11:15'), end: +at('12:00') }]);
  expect(creationWarnings(context, at('09:00'), at('09:45'), 'task')).toEqual([]);
  expect(creationWarnings(context, at('09:30'), at('10:00'), 'task').join()).toContain('overlaps');
});
it('includes buffers for the proposed appointment as well as existing ones', () => {
  expect(creationWarnings(context, at('11:15'), at('11:45'), 'event').join()).toContain('overlaps');
  expect(creationWarnings(context, at('11:30'), at('12:00'), 'event')).toEqual([]);
});
it('honors nonworking days and task occupancy', () => {
  expect(availability(context, new Date('2026-09-13T09:00Z'), new Date('2026-09-13T17:00Z')).slots).toEqual([]);
  const occupied = { ...context, tasks: [{ id: 't', status: 'PLANNED', startAt: at('11:15'), durationMin: 45 }] };
  expect(availability(occupied, at('11:15'), at('12:00')).slots).toEqual([]);
  expect(availability({ ...occupied, tasks: [{ ...occupied.tasks[0], status: 'COMPLETED' }] }, at('11:15'), at('12:00')).slots).toHaveLength(1);
});
it('includes stale-calendar warnings even when a slot appears free', () => {
  expect(creationWarnings({ ...context, contextWarnings: ['Calendar sync is stale.'] }, at('12:00'), at('13:00'), 'task')).toContain('Calendar sync is stale.');
});

it('refreshes the next choice immediately after completion while preserving dismissal cooldown', async () => {
  const { suppressNextAction } = await import('@/lib/next-action-config');
  const state = { taskId: 'finished', score: 80, shownAt: 1000000 };
  const next = { taskId: 'next', score: 75 };
  expect(suppressNextAction(state, next, false, 1001000)).toBe(false);
  expect(suppressNextAction(state, next, true, 1001000)).toBe(false);
  expect(suppressNextAction({ ...state, dismissed: true }, next, true, 1001000)).toBe(true);
  expect(suppressNextAction(state, { taskId: 'finished', score: 80 }, true, 1001000)).toBe(true);
});
