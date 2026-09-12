import { beforeEach, expect, it, vi } from 'vitest';
import { executeVoiceTool, validateVoiceTool } from './tools';
const mocks = vi.hoisted(() => ({ createTask: vi.fn(), updateTask: vi.fn(), scheduleTask: vi.fn(), completeTask: vi.fn(), deleteTask: vi.fn(), reminders: vi.fn(), tasks: vi.fn(), owned: vi.fn(), events: vi.fn() }));
vi.mock('@/server/tasks', () => mocks);
vi.mock('@/server/reminders', () => ({ scheduleDefaultReminders: mocks.reminders }));
vi.mock('@/server/calendar-sync', () => ({ pushTaskToExternal: vi.fn() }));
vi.mock('@/server/replanner', () => ({ generateReplanProposal: vi.fn() }));
vi.mock('@/server/agenda', () => ({ listEventsInRange: mocks.events }));
vi.mock('@/server/db', () => ({ prisma: { task: { findMany: mocks.tasks, findFirst: mocks.owned }, reminder: { deleteMany: vi.fn() }, recurrenceRule: { deleteMany: vi.fn() } } }));
const task = { id: 'task1', title: 'Call Damien', status: 'PLANNED', priority: 'NORMAL', durationMin: 30, startAt: new Date('2099-01-01T10:00:00Z'), dueAt: null, critical: false };
const args = { title: 'Call Damien', scheduledAt: '2099-01-01T10:00:00Z', durationMin: 30 };
beforeEach(() => { vi.clearAllMocks(); mocks.createTask.mockResolvedValue(task); mocks.reminders.mockResolvedValue(undefined); mocks.owned.mockResolvedValue(task); mocks.scheduleTask.mockResolvedValue(task); mocks.events.mockResolvedValue([]); mocks.tasks.mockResolvedValue([]); });
it('passes a stable per-user session and call idempotency key to the existing task engine', async () => {
  await executeVoiceTool('u', 's', 'c', 'create_task', args);
  await executeVoiceTool('u', 's', 'c', 'create_task', args);
  expect(mocks.createTask.mock.calls[0][0].idempotencyKey).toBe(mocks.createTask.mock.calls[1][0].idempotencyKey);
  await executeVoiceTool('other', 's', 'c', 'create_task', args);
  expect(mocks.createTask.mock.calls[2][0].idempotencyKey).not.toBe(mocks.createTask.mock.calls[0][0].idempotencyKey);
});
it('reports a persisted task and reminder warning separately', async () => {
  mocks.reminders.mockRejectedValue(new Error('reminder unavailable'));
  const result = await executeVoiceTool('u', 's', 'c', 'create_task', args);
  expect(result).toMatchObject({ success: true, task: { id: 'task1' }, reminderWarning: expect.any(String) });
});
it('rejects invalid fields and ambiguous timestamps before execution', () => {
  for (const bad of [{ ...args, scheduledAt: 'tomorrow' }, { ...args, durationMin: 0 }, { ...args, sendEmail: true }]) expect(() => validateVoiceTool('create_task', bad)).toThrow();
  expect(() => validateVoiceTool('send_email', {})).toThrow();
});
it('uses the owned task and existing duration for a correction', async () => {
  await executeVoiceTool('u', 's', 'c', 'update_task', { taskId: 'task1', scheduledAt: '2099-01-01T11:00:00Z' });
  expect(mocks.owned).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'task1', userId: 'u', deletedAt: null } }));
  expect(mocks.scheduleTask).toHaveBeenCalledWith('u', 'task1', new Date('2099-01-01T11:00:00Z'), 30);
  expect(mocks.createTask).not.toHaveBeenCalled();
});
it('does not mutate an inaccessible task', async () => {
  mocks.owned.mockResolvedValue(null);
  expect(await executeVoiceTool('u', 's', 'c', 'delete_task', { taskId: 'other' })).toMatchObject({ success: false });
  expect(mocks.deleteTask).not.toHaveBeenCalled();
});
it('rejects overbroad calendar windows', async () => {
  await expect(executeVoiceTool('u', 's', 'c', 'get_schedule', { from: '2099-01-01T00:00:00Z', to: '2099-02-01T00:00:00Z' })).rejects.toThrow();
  expect(mocks.events).not.toHaveBeenCalled();
});
it('subtracts overlapping appointments from available time', async () => {
  mocks.events.mockResolvedValue([{ title: 'Dentist', startAt: new Date('2099-01-01T10:00:00Z'), endAt: new Date('2099-01-01T11:00:00Z') }]);
  const result = await executeVoiceTool('u', 's', 'c', 'find_free_time', { from: '2099-01-01T09:00:00Z', to: '2099-01-01T12:00:00Z', durationMin: 45 });
  expect(result).toMatchObject({ success: true, slots: [{ from: '2099-01-01T09:00:00.000Z', to: '2099-01-01T10:00:00.000Z' }, { from: '2099-01-01T11:00:00.000Z', to: '2099-01-01T12:00:00.000Z' }] });
});
