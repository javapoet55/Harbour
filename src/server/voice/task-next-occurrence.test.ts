import { expect, it } from 'vitest';
import { nextTaskStart } from '@/lib/task-next-occurrence';
it('checks the actual next weekday occurrence in the account timezone', () => {
  const task = { startAt: new Date('2026-09-14T09:00:00-07:00'), timeZone: 'America/Los_Angeles', recurrence: { frequency: 'WEEKLY', interval: 1, byWeekday: '1,3,5' } };
  expect(nextTaskStart(task)?.toISOString()).toBe('2026-09-16T16:00:00.000Z');
  expect(nextTaskStart({ ...task, recurrence: { ...task.recurrence, count: 1 } })).toBeNull();
  expect(nextTaskStart({ ...task, recurrence: { ...task.recurrence, until: new Date('2026-09-15T23:00Z') } })).toBeNull();
});
