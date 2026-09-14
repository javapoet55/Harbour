import { beforeEach, expect, it, vi } from 'vitest';
import { respondProtectedTime } from '@/server/protected-time';
const m = vi.hoisted(() => ({ context: vi.fn(), update: vi.fn(), memory: vi.fn(), activity: vi.fn(), task: vi.fn(), sync: vi.fn(), reminder: vi.fn() }));
vi.mock('@/server/schedule-intelligence', () => ({ loadScheduleContext: m.context }));
vi.mock('@/server/db', () => ({ prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn({ task: { updateMany: m.update }, userMemory: { upsert: m.memory }, activityLog: { create: m.activity } }), task: { findFirstOrThrow: m.task } } }));
vi.mock('@/server/reminders', () => ({ scheduleDefaultReminders: m.reminder }));
vi.mock('@/server/calendar-sync', () => ({ pushTaskToExternal: m.sync }));
const now = new Date('2026-09-14T12:37:00Z');
const task = { id: 't', title: 'Presentation', startAt: null, durationMin: 45, calendarDurationMin: 45, priority: 'HIGH', status: 'PLANNED', postponeCount: 3, dueAt: new Date('2026-09-14T17:00Z'), updatedAt: now };
const input = { action: 'accept' as const, taskId: 't', startAt: '2026-09-14T13:15:00.000Z', expectedUpdatedAt: now.toISOString() };
const context = { user: { preference: { personalizationEnabled: true } }, tasks: [task], events: [], timeZone: 'UTC', workingDays: '1,2,3,4,5', workStart: '09:00', workEnd: '17:00', bufferMinutes: 15, contextWarnings: [] };
beforeEach(() => { vi.clearAllMocks(); m.context.mockResolvedValue(context); m.update.mockResolvedValue({ count: 1 }); m.task.mockResolvedValue({ ...task, startAt: new Date(input.startAt), critical: false }); });
it('reserves only after approval, preserves the deadline, and persists protection', async () => {
  expect(await respondProtectedTime('owner', input, now)).toEqual({ ok: true, warnings: [] });
  expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'owner', updatedAt: now }), data: { startAt: new Date(input.startAt), status: 'PLANNED' } }));
  expect(m.memory).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ userId: 'owner', kind: 'protected_time', key: 'protected:t' }) }));
});
it('rejects changed tasks and newly conflicting appointments before any mutation', async () => {
  await expect(respondProtectedTime('owner', { ...input, expectedUpdatedAt: new Date(0).toISOString() }, now)).rejects.toThrow('STALE_PROTECTED_TIME');
  m.context.mockResolvedValue({ ...context, events: [{ id: 'e', title: 'New meeting', startAt: new Date(input.startAt), endAt: new Date('2026-09-14T14:00Z') }] });
  await expect(respondProtectedTime('owner', input, now)).rejects.toThrow('STALE_PROTECTED_TIME');
  expect(m.update).not.toHaveBeenCalled(); expect(m.memory).not.toHaveBeenCalled();
});
it('dismisses without moving the task or syncing calendars', async () => {
  await respondProtectedTime('owner', { ...input, action: 'dismiss' }, now);
  expect(m.update).not.toHaveBeenCalled(); expect(m.sync).not.toHaveBeenCalled();
  expect(m.memory).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ kind: 'protected_dismissal' }) }));
});
it('does not reserve after personalization is disabled', async () => {
  m.context.mockResolvedValue({ ...context, user: { preference: { personalizationEnabled: false } } });
  await expect(respondProtectedTime('owner', input, now)).rejects.toThrow('STALE_PROTECTED_TIME');
  expect(m.update).not.toHaveBeenCalled();
});
