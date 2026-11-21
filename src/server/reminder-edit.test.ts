import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({ task: { update: vi.fn() }, reminder: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() } }));
const db = vi.hoisted(() => ({
  task: { findFirst: vi.fn(), findMany: vi.fn() },
  reminderCall: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
const deps = vi.hoisted(() => ({ cancel: vi.fn(), assertCalls: vi.fn(), del: vi.fn(), push: vi.fn() }));
vi.mock('@/server/db', () => ({ prisma: db }));
vi.mock('@/server/reminders', () => ({ cancelTaskReminders: deps.cancel }));
vi.mock('@/server/reminder-calls', () => ({ assertReminderCallsUsable: deps.assertCalls }));
vi.mock('@/server/tasks', () => ({ deleteTask: deps.del }));
vi.mock('@/server/calendar-sync', () => ({ pushTaskToExternal: deps.push }));
import { removeReminder, updateReminder } from './reminder-history';

const NOW = new Date('2026-11-21T16:00:00Z');
const past = new Date('2026-11-21T14:00:00Z'), future = '2026-11-22T17:00:00.000Z';
const task = (over = {}) => ({ id: 't1', userId: 'u1', status: 'PLANNED', reminderAt: past, startAt: past, critical: false, notifyPush: true, notifyEmail: true, notifyCall: false, ...over });
const body = (over = {}) => ({ title: 'Call mom', notes: '', at: past.toISOString(), notifyPush: true, notifyEmail: true, notifyCall: false, ...over });

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  db.task.findMany.mockResolvedValue([]);
  deps.push.mockResolvedValue(undefined);
});

describe('updateReminder', () => {
  it('fixes the wording of a past reminder without re-sending it', async () => {
    db.task.findFirst.mockResolvedValue(task({ status: 'COMPLETED' }));
    await updateReminder('u1', 't1', body({ title: 'Call mom back' }), NOW);
    expect(tx.task.update.mock.calls[0][0].data).toEqual({ title: 'Call mom back', notes: '', notifyPush: true, notifyEmail: true, notifyCall: false });
    expect(tx.reminder.update).not.toHaveBeenCalled();
    expect(tx.reminder.create).not.toHaveBeenCalled();
  });
  it('moving to a future time reopens a finished reminder and schedules a fresh occurrence', async () => {
    db.task.findFirst.mockResolvedValue(task({ status: 'COMPLETED' }));
    tx.reminder.findUnique.mockResolvedValue({ id: 'r1' });
    await updateReminder('u1', 't1', body({ at: future }), NOW);
    expect(tx.task.update.mock.calls[0][0].data).toMatchObject({ reminderAt: new Date(future), startAt: new Date(future), dueAt: new Date(future), status: 'PLANNED', completedAt: null });
    expect(tx.reminder.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { fireAt: new Date(future), status: 'SCHEDULED', generation: { increment: 1 } } });
  });
  it('refuses to move a reminder into the past or to leave no channel', async () => {
    db.task.findFirst.mockResolvedValue(task());
    await expect(updateReminder('u1', 't1', body({ at: '2026-11-21T15:00:00.000Z' }), NOW)).rejects.toThrow('REMINDER_TIME_PASSED');
    await expect(updateReminder('u1', 't1', body({ notifyPush: false, notifyEmail: false }), NOW)).rejects.toThrow('REMINDER_NO_DELIVERY');
    await expect(updateReminder('u1', 't1', body({ title: ' ' }), NOW)).rejects.toThrow('INVALID_REMINDER');
  });
  it('checks the phone before turning a call on, and cancels notices when only the call is left', async () => {
    db.task.findFirst.mockResolvedValue(task({ reminderAt: new Date(future) }));
    deps.assertCalls.mockRejectedValueOnce(new Error('REMINDER_CALL_PHONE_UNVERIFIED'));
    await expect(updateReminder('u1', 't1', body({ at: future, notifyCall: true }), NOW)).rejects.toThrow('REMINDER_CALL_PHONE_UNVERIFIED');
    await updateReminder('u1', 't1', body({ at: future, notifyPush: false, notifyEmail: false, notifyCall: true }), NOW);
    expect(deps.cancel).toHaveBeenCalledWith(tx, 'u1', 't1');
  });
  it('only edits the person’s own live reminders', async () => {
    db.task.findFirst.mockResolvedValue(null);
    await expect(updateReminder('u2', 't1', body(), NOW)).rejects.toThrow('NOT_FOUND');
    expect(db.task.findFirst.mock.calls[0][0].where).toMatchObject({ id: 't1', userId: 'u2', deletedAt: null });
  });
});

describe('removeReminder', () => {
  it('deletes the task and cancels calls not yet placed', async () => {
    db.task.findFirst.mockResolvedValue({ id: 't1' });
    expect(await removeReminder('u1', 't1')).toEqual({ deleted: true });
    expect(deps.del).toHaveBeenCalledWith('u1', 't1');
    expect(db.reminderCall.updateMany.mock.calls[0][0].where).toEqual({ taskId: 't1', status: 'QUEUED' });
  });
});
