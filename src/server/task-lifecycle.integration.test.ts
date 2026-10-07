import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prisma } from './db';
import { completeTask, deleteTask, startTask } from './tasks';
import { scheduleDefaultReminders, scheduleRequestedReminder, tickReminders } from './reminders';
import { nextTaskStart } from '@/lib/task-next-occurrence';
import { ScheduleWarning } from '@/lib/schedule-warning';
import { requireAvailableSchedule, requireAvailableTaskBatch } from './availability';
import { POST } from '@/app/api/tasks/route';
import { classifyNewTask } from './task-agent/service';
import { scheduleTask } from './tasks';
import { zonedDateTime } from '@/lib/time';
import { PATCH } from '@/app/api/tasks/[id]/route';
import { PATCH as bulk } from '@/app/api/tasks/bulk/route';
import { requireUser } from './auth';
import { pushProvider, emailProvider, smsProvider } from '@/providers';
vi.mock('./auth', () => ({ requireUser: vi.fn() }));
vi.mock('./availability', () => ({ requireAvailableSchedule: vi.fn(), requireAvailableTaskBatch: vi.fn() }));
vi.mock('./task-agent/service', () => ({ classifyNewTask: vi.fn() }));
vi.mock('./calendar-sync', () => ({ pushTaskToExternal: vi.fn() }));
vi.mock('./replanner', () => ({ generateReplanProposal: vi.fn() }));
let userId: string;
const now = new Date('2026-10-04T18:00:00Z');
beforeEach(async () => {
 vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
 vi.mocked(requireAvailableSchedule).mockReset(); vi.mocked(requireAvailableTaskBatch).mockReset(); vi.mocked(classifyNewTask).mockReset();
 const user = await prisma.user.create({ data: { name: 'Task regression', email: `${randomUUID()}@taskbugs.test`, passwordHash: 'unused', timeZone: 'America/Los_Angeles', preference: { create: { pushEnabled: true, emailEnabled: true, smsEnabled: true } } }, include: { preference: true } });
 userId = user.id; vi.mocked(requireUser).mockResolvedValue(user);
});
afterEach(async () => { await prisma.user.delete({ where: { id: userId } }); vi.restoreAllMocks(); vi.useRealTimers(); });
const task = (data = {}) => prisma.task.create({ data: { userId, title: 'Regression task', status: 'PLANNED', ...data } });
const patch = (id: string, body: object) => PATCH(new Request('http://localhost/api/tasks/'+id, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
it.each(['COMPLETED', 'CANCELLED'])('cancels all pending reminders on PATCH %s', async status => {
 const t = await task(); await scheduleDefaultReminders(userId, t.id, now); await scheduleRequestedReminder(userId, t.id, now);
 await prisma.reminder.updateMany({ where: { taskId: t.id }, data: { status: 'RETRYING' } });
 expect((await patch(t.id, { status })).status).toBe(200);
 expect((await prisma.reminder.findMany({ where: { taskId: t.id } })).every(r => r.status === 'CANCELLED')).toBe(true);
 const push = vi.spyOn(pushProvider, 'send'); const email = vi.spyOn(emailProvider, 'send'); const sms = vi.spyOn(smsProvider, 'send');
 await tickReminders(now, { userId }); expect(push).not.toHaveBeenCalled(); expect(email).not.toHaveBeenCalled(); expect(sms).not.toHaveBeenCalled();
});
it.each([{ status: 'COMPLETED' }, { status: 'CANCELLED' }, { deletedAt: now }])('suppresses legacy orphaned pending reminders for %j', async data => {
 const t = await task(data); await scheduleRequestedReminder(userId, t.id, now);
 const push = vi.spyOn(pushProvider, 'send'); const email = vi.spyOn(emailProvider, 'send'); const sms = vi.spyOn(smsProvider, 'send');
 await tickReminders(now, { userId }); expect(push).not.toHaveBeenCalled(); expect(email).not.toHaveBeenCalled(); expect(sms).not.toHaveBeenCalled();
});
// Every test file shares one database, so an unscoped tick would send other files' due reminders and trip
// the send spies above. The ticks here are scoped to this test's account.
it('ticks only the reminders of the account it is scoped to', async () => {
 const other = await prisma.user.create({ data: { name: 'Other file', email: `${randomUUID()}@taskbugs.test`, passwordHash: 'unused', preference: { create: { pushEnabled: true } } } });
 try {
  const t = await prisma.task.create({ data: { userId: other.id, title: 'Someone else', status: 'PLANNED' } });
  await scheduleRequestedReminder(other.id, t.id, now);
  const push = vi.spyOn(pushProvider, 'send');
  expect(await tickReminders(now, { userId })).toMatchObject({ scanned: 0 });
  expect(push).not.toHaveBeenCalled();
  expect((await prisma.reminder.findFirstOrThrow({ where: { taskId: t.id } })).status).toBe('SCHEDULED');
 } finally { await prisma.user.delete({ where: { id: other.id } }); }
});
it('copies context and resets subtasks, recreates defaults, and does not clone twice on retry', async () => {
 const tag = await prisma.tag.create({ data: { userId, name: 'repeat' } });
 const t = await task({ startAt: new Date('2026-09-06T16:00:00Z'), dueAt: new Date('2026-09-06T16:30:00Z'), timeZone: 'America/Los_Angeles', waitingOn: 'vendor', assignee: 'Alex', recurrence: { create: { frequency: 'WEEKLY', interval: 1 } }, tags: { create: { tagId: tag.id } }, subtasks: { create: { title: 'Prepare', sortOrder: 2, completedAt: now } } });
 await completeTask(userId, t.id, true); await completeTask(userId, t.id, true);
 const next = await prisma.task.findFirstOrThrow({ where: { userId, id: { not: t.id } }, include: { tags: true, subtasks: true, reminders: true } });
 expect(next.startAt?.toISOString()).toBe('2026-10-04T16:00:00.000Z');
 expect(next).toMatchObject({ waitingOn: 'vendor', assignee: 'Alex', tags: [{ tagId: tag.id }], subtasks: [{ title: 'Prepare', sortOrder: 2, completedAt: null }] });
 expect(next.reminders.map(r => r.offsetLabel).sort()).toEqual(['30 minutes before', 'at due time']);
 expect(await prisma.task.count({ where: { userId } })).toBe(2);
});
it('completes a recurring spring-forward task by snapping to 3 AM', async () => {
 vi.setSystemTime(new Date('2026-03-07T20:00:00Z'));
 const t = await task({ startAt: new Date('2026-03-07T10:30:00Z'), timeZone: 'America/Los_Angeles', recurrence: { create: { frequency: 'DAILY', interval: 1 } } });
 await completeTask(userId, t.id, true);
 const next = await prisma.task.findFirstOrThrow({ where: { userId, id: { not: t.id } } });
 expect(next.startAt?.toISOString()).toBe('2026-03-08T10:00:00.000Z');
});
it('respects interval cadence and until when skipping overdue occurrences', () => {
 const t = { startAt: new Date('2026-09-06T16:00Z'), timeZone: 'America/Los_Angeles', recurrence: { frequency: 'WEEKLY', interval: 2 } };
 expect(nextTaskStart(t, now)?.toISOString()).toBe('2026-10-04T16:00:00.000Z');
 expect(nextTaskStart({ ...t, recurrence: { ...t.recurrence, until: new Date('2026-09-30T00:00Z') } }, now)).toBeNull();
});
it('saves project plus schedule and metadata from the iOS payload', async () => {
 const project = await prisma.project.create({ data: { userId, name: 'Work' } });
 const t = await task();
 const response = await patch(t.id, { projectId: project.id, startAt: '2026-10-05T16:00:00Z', title: 'Updated', notes: 'Details', durationMin: 45 });
 expect(response.status).toBe(200);
 expect(await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({ projectId: project.id, title: 'Updated', notes: 'Details', durationMin: 45, startAt: new Date('2026-10-05T16:00Z') });
});
it.each([{ status: 'BANANA' }, { priority: 'BANANA' }, { status: 1 }, { priority: null }])('rejects invalid PATCH enums %j without mutation', async body => {
 const t = await task(); expect((await patch(t.id, body)).status).toBe(400);
 expect(await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({ status: 'PLANNED', priority: 'NORMAL' });
});
it('does not start a completed task or open a new work session', async () => {
 const t = await task({ status: 'COMPLETED', completedAt: now });
 await expect(startTask(userId, t.id)).rejects.toThrow('INVALID_TASK_STATE');
 expect(await prisma.taskWorkSession.count({ where: { taskId: t.id } })).toBe(0);
 expect((await patch(t.id, { status: 'IN_PROGRESS' })).status).toBe(409);
});
it('rolls back the whole bulk completion when a later recurrence write fails', async () => {
 const a = await task({ startAt: new Date('2026-10-04T16:00Z'), recurrence: { create: { frequency: 'DAILY', interval: 1 } } });
 const b = await task({ startAt: new Date('2026-10-04T20:00Z'), recurrence: { create: { frequency: 'DAILY', interval: 1 } } });
 await scheduleRequestedReminder(userId, a.id, now);
 vi.mocked(classifyNewTask).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('write failure'));
 const response = await bulk(new Request('http://localhost/api/tasks/bulk', { method: 'PATCH', body: JSON.stringify({ ids: [a.id, b.id], status: 'COMPLETED' }) }));
 expect(response.status).toBe(500);
 expect(await prisma.task.count({ where: { userId } })).toBe(2);
 expect((await prisma.task.findMany({ where: { userId } })).every(t => t.status === 'PLANNED')).toBe(true);
 expect((await prisma.reminder.findFirstOrThrow({ where: { taskId: a.id } })).status).toBe('SCHEDULED');
});
it('rolls back all deletions when a later deletion fails', async () => {
 const t = await task(); await scheduleRequestedReminder(userId, t.id, now);
 await expect(prisma.$transaction(async tx => { await deleteTask(userId, t.id, tx); await deleteTask(userId, 'missing', tx); })).rejects.toThrow('NOT_FOUND');
 expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).deletedAt).toBeNull();
 expect((await prisma.reminder.findFirstOrThrow({ where: { taskId: t.id } })).status).toBe('SCHEDULED');
});
it('keeps critical default reminders on later occurrences', async () => {
 const t = await task({ critical: true, startAt: now, recurrence: { create: { frequency: 'DAILY', interval: 1 } } });
 await completeTask(userId, t.id, true);
 const next = await prisma.task.findFirstOrThrow({ where: { userId, id: { not: t.id } }, include: { reminders: true } });
 expect(next.reminders).toHaveLength(4);
 expect(next.reminders.every(r => r.critical && r.channelPlan === 'push,email,sms')).toBe(true);
});
it('keeps requested reminder offsets on later occurrences', async () => {
 const t = await task({ startAt: now, reminderAt: new Date(+now - 3600000), recurrence: { create: { frequency: 'DAILY', interval: 1 } } });
 await completeTask(userId, t.id, true);
 const next = await prisma.task.findFirstOrThrow({ where: { userId, id: { not: t.id } }, include: { reminders: true } });
 expect(next.reminders).toHaveLength(1);
 expect(+next.reminders[0].fireAt).toBe(+next.startAt! - 3600000);
});
it('bulk cancel cancels reminders for every selected task', async () => {
 const a = await task(), b = await task();
 for (const t of [a,b]) await scheduleRequestedReminder(userId, t.id, now);
 expect((await bulk(new Request('http://localhost/api/tasks/bulk', { method: 'PATCH', body: JSON.stringify({ ids: [a.id,b.id], status: 'CANCELLED' }) }))).status).toBe(200);
 expect((await prisma.reminder.findMany({ where: { userId } })).every(r => r.status === 'CANCELLED')).toBe(true);
});
it('does not escalate after completion during an earlier channel attempt', async () => {
 const t = await task(); await scheduleRequestedReminder(userId, t.id, now);
 vi.spyOn(pushProvider, 'send').mockImplementationOnce(async () => {
   await completeTask(userId, t.id, true);
   return { id: '', status: 'FAILED', reason: 'PUSH_NOT_REGISTERED' };
 });
 const email = vi.spyOn(emailProvider, 'send');
 await tickReminders(now, { userId });
 expect(email).not.toHaveBeenCalled();
 expect((await prisma.reminder.findFirstOrThrow({ where: { taskId: t.id } })).status).toBe('CANCELLED');
});
const post = (body: object) => POST(new Request('http://localhost/api/tasks', { method: 'POST', body: JSON.stringify(body) }));
it.each([{ date: 'garbage' }, { date: '2026-02-30' }, { time: '25:00', date: '2026-10-04' }, { startAt: 'garbage' }, { recurrence: { frequency: 'MONTHLY', until: 'garbage' } }, { recurrence: { frequency: 'MONTHLY', until: '2026-02-30' } }])('rejects malformed dates before POST or PATCH writes: %j', async bad => {
 const t = await task();
 expect((await post({ title: 'New invalid task', ...bad })).status).toBe(400);
 expect((await patch(t.id, { title: 'Invalid edit', ...bad })).status).toBe(400);
 expect(await prisma.task.count({ where: { userId } })).toBe(1);
 expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).title).toBe(t.title);
});
it('rejects malformed local dates with a handled domain error', () => {
 expect(() => zonedDateTime('garbage', '09:00', 'America/Los_Angeles')).toThrow('INVALID_LOCAL_TIME');
});
it('repeated POST with a key returns one task and one recurrence', async () => {
 const body = { title: 'Review draft', idempotencyKey: 'retry-123', startAt: '2026-10-05T16:00:00Z', recurrence: { frequency: 'MONTHLY' } };
 const first = await post(body), second = await post(body);
 expect(first.status).toBe(200); expect(second.status).toBe(200);
 expect((await first.json()).task.id).toBe((await second.json()).task.id);
 expect(await prisma.task.count({ where: { userId } })).toBe(1);
 expect(await prisma.recurrenceRule.count({ where: { task: { userId } } })).toBe(1);
 expect(await prisma.reminder.count({ where: { userId } })).toBe(2);
});
it('concurrent POST retries return one task', async () => {
 const responses = await Promise.all([post({ title: 'Retry', idempotencyKey: 'concurrent' }), post({ title: 'Retry', idempotencyKey: 'concurrent' })]);
 expect(responses.map(r => r.status)).toEqual([200,200]);
 expect(await prisma.task.count({ where: { userId } })).toBe(1);
});
it('preserves WAITING when saving the schedule and does not invent a deadline', async () => {
 const t = await task();
 expect((await patch(t.id, { status: 'WAITING', startAt: '2026-10-05T16:00:00Z' })).status).toBe(200);
 expect(await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({ status: 'WAITING', dueAt: null });
 await scheduleTask(userId, t.id, new Date('2026-10-06T16:00Z'), 45);
 expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).dueAt).toBeNull();
});
it('does not inject Sunday from an empty weekday entry', () => {
 const t = { startAt: new Date('2026-10-07T16:00Z'), timeZone: 'America/Los_Angeles', recurrence: { frequency: 'WEEKLY', interval: 1, byWeekday: '1,3,' } };
 expect(nextTaskStart(t, now)?.toISOString()).toBe('2026-10-12T16:00:00.000Z');
});
it('restores the original monthly day after a short month, including across completions', async () => {
 vi.setSystemTime(new Date('2026-01-31T18:00Z'));
 const t = await task({ startAt: new Date('2026-01-31T17:00Z'), recurrence: { create: { frequency: 'MONTHLY', interval: 1 } } });
 await completeTask(userId, t.id, true);
 const feb = await prisma.task.findFirstOrThrow({ where: { userId, status: 'PLANNED' }, include: { recurrence: true } });
 expect(feb.startAt?.toISOString()).toBe('2026-02-28T17:00:00.000Z'); expect(feb.recurrence?.anchorDay).toBe(31);
 vi.setSystemTime(new Date('2026-02-28T18:00Z'));
 await completeTask(userId, feb.id, true);
 const mar = await prisma.task.findFirstOrThrow({ where: { userId, status: 'PLANNED' } });
 expect(mar.startAt?.toISOString()).toBe('2026-03-31T16:00:00.000Z');
});
it('loads one batch preflight and rejects conflicts before mutations', async () => {
 const a = await task(), b = await task();
 vi.mocked(requireAvailableTaskBatch).mockRejectedValueOnce(new ScheduleWarning(['Conflict']));
 const response = await bulk(new Request('http://localhost/api/tasks/bulk', { method: 'PATCH', body: JSON.stringify({ ids: [a.id,b.id], status: 'COMPLETED' }) }));
 expect(response.status).toBe(409); expect(requireAvailableTaskBatch).toHaveBeenCalledTimes(1);
 expect((await prisma.task.findMany({ where: { userId } })).every(t => t.status === 'PLANNED')).toBe(true);
});
it('rejects stale completion snapshots after preflight', async () => {
 const t = await task();
 vi.mocked(requireAvailableTaskBatch).mockImplementationOnce(async () => { await prisma.task.update({ where: { id: t.id }, data: { status: 'WAITING' } }); });
 expect((await patch(t.id, { status: 'COMPLETED' })).status).toBe(409);
 expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('WAITING');
});
