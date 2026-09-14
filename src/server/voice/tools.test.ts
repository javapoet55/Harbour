import { beforeEach, expect, it, vi } from 'vitest';
import { executeVoiceTool, validateVoiceTool } from './tools';
const mocks = vi.hoisted(() => ({ createTask: vi.fn(), updateTask: vi.fn(), scheduleTask: vi.fn(), completeTask: vi.fn(), deleteTask: vi.fn(), reminders: vi.fn(), tasks: vi.fn(), owned: vi.fn(), events: vi.fn(), eventSave: vi.fn(), categories: vi.fn(), categoryCreate: vi.fn(), taskUpdate: vi.fn(), reminderSave: vi.fn(), user: vi.fn(), context: vi.fn(), recommend: vi.fn(), availability: vi.fn() }));
vi.mock('@/server/availability', () => ({ checkCreationAvailability: mocks.availability }));
vi.mock('@/server/tasks', () => mocks);
vi.mock('@/server/schedule-intelligence', () => ({ loadScheduleContext: mocks.context }));
vi.mock('@/lib/executive-recommendations', () => ({ buildExecutiveRecommendation: mocks.recommend }));
vi.mock('@/server/reminders', () => ({ scheduleDefaultReminders: mocks.reminders }));
vi.mock('@/server/calendar-sync', () => ({ pushTaskToExternal: vi.fn() }));
vi.mock('@/server/replanner', () => ({ generateReplanProposal: vi.fn() }));
vi.mock('@/server/agenda', () => ({ listEventsInRange: mocks.events }));
vi.mock('@/server/db', () => ({ prisma: { task: { findMany: mocks.tasks, findFirst: mocks.owned, update: mocks.taskUpdate }, category: { findMany: mocks.categories, create: mocks.categoryCreate }, user: { findUniqueOrThrow: mocks.user }, calendarEvent: { upsert: mocks.eventSave }, reminder: { deleteMany: vi.fn(), upsert: mocks.reminderSave }, recurrenceRule: { deleteMany: vi.fn() } } }));
const task = { id: 'task1', title: 'Call Damien', status: 'PLANNED', priority: 'NORMAL', durationMin: 30, startAt: new Date('2099-01-01T10:00:00Z'), dueAt: null, critical: false };
const args = { title: 'Call Damien', scheduledAt: '2099-01-01T10:00:00Z', durationMin: 30 };
beforeEach(() => { vi.clearAllMocks(); mocks.availability.mockResolvedValue([]); mocks.context.mockResolvedValue({ timeZone: "UTC", workingDays: "0,1,2,3,4,5,6", workStart: "00:00", workEnd: "23:59", bufferMinutes: 15, tasks: [], events: [] }); mocks.createTask.mockResolvedValue(task); mocks.reminders.mockResolvedValue(undefined); mocks.owned.mockResolvedValue(task); mocks.scheduleTask.mockResolvedValue(task); mocks.events.mockResolvedValue([]); mocks.tasks.mockResolvedValue([]); });
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
  mocks.context.mockResolvedValue({ timeZone: 'UTC', workingDays: '0,1,2,3,4,5,6', workStart: '09:00', workEnd: '17:00', bufferMinutes: 15, tasks: [], events: [{ id: 'dentist', title: 'Dentist', startAt: new Date('2099-01-01T10:00:00Z'), endAt: new Date('2099-01-01T11:00:00Z') }] });
  const result = await executeVoiceTool('u', 's', 'c', 'find_free_time', { from: '2099-01-01T09:00:00Z', to: '2099-01-01T12:00:00Z', durationMin: 45 });
  expect(result).toMatchObject({ success: true, slots: [{ from: '2099-01-01T09:00:00.000Z', to: '2099-01-01T09:45:00.000Z' }, { from: '2099-01-01T11:15:00.000Z', to: '2099-01-01T12:00:00.000Z' }] });
});

it('creates a calendar event in the owned timezone with a stable key and no invitations', async () => {
  mocks.user.mockResolvedValue({ timeZone: 'America/Los_Angeles' });
  mocks.eventSave.mockResolvedValue({ id: 'event1', title: 'Dentist' });
  const input = { title: 'Dentist', startAt: '2099-01-01T10:00:00-08:00', endAt: '2099-01-01T11:00:00-08:00' };
  const result = await executeVoiceTool('u', 's', 'event-call', 'create_calendar_event', input);
  await executeVoiceTool('u', 's', 'event-call', 'create_calendar_event', input);
  expect(result).toMatchObject({ success: true, savedAs: 'NexDo calendar event' });
  expect(mocks.eventSave.mock.calls[0][0].create).toMatchObject({ userId: 'u', timeZone: 'America/Los_Angeles', source: 'harbor' });
  expect(mocks.eventSave.mock.calls[0][0].where).toEqual(mocks.eventSave.mock.calls[1][0].where);
  await expect(executeVoiceTool('u', 's', 'bad', 'create_calendar_event', { ...input, endAt: input.startAt })).rejects.toThrow();
});
it('assigns an existing owned category and preserves the exact requested reminder time', async () => {
  mocks.categories.mockResolvedValue([{ id: 'health', name: 'Health' }]);
  mocks.taskUpdate.mockResolvedValue(task);
  const result = await executeVoiceTool('u', 's', 'reminder-call', 'create_reminder', { title: 'Take vitamins', scheduledAt: args.scheduledAt, categoryName: 'Health' });
  expect(result).toMatchObject({ success: true });
  expect(mocks.categories).toHaveBeenCalledWith({ where: { userId: 'u' }, take: 100 });
  expect(mocks.taskUpdate).toHaveBeenCalledWith({ where: { id: task.id, userId: 'u' }, data: { categoryId: 'health' } });
  expect(mocks.reminderSave.mock.calls[0][0].create).toMatchObject({ userId: 'u', taskId: task.id, fireAt: new Date(args.scheduledAt) });
  expect(mocks.categoryCreate).not.toHaveBeenCalled();
});
it('grounds a recommendation in this user’s current schedule context', async () => {
  mocks.context.mockResolvedValue({ marker: 'owned-context' });
  mocks.recommend.mockReturnValue({ recommendation: { summary: 'Use 30 minutes', nextAction: { availableWindowMinutes: 38 }, assumptions: [], timeZone: 'America/Los_Angeles' } });
  const result = await executeVoiceTool('u', 's', 'read', 'get_recommendations', { minutes: 38 });
  expect(mocks.context).toHaveBeenCalledWith('u');
  expect(mocks.recommend).toHaveBeenCalledWith({ marker: 'owned-context' }, 'FREE_WINDOW', { minutes: 38 });
  expect(result).toMatchObject({ success: true, nextAction: { availableWindowMinutes: 38 } });
});

it('requires confirmation before creating a task in a conflicting slot', async () => {
  mocks.availability.mockResolvedValue(['Overlaps an appointment buffer.']);
  expect(await executeVoiceTool('u', 's', 'c', 'create_task', args)).toMatchObject({ success: false, requiresConfirmation: true });
  expect(mocks.createTask).not.toHaveBeenCalled();
  expect(await executeVoiceTool('u', 's', 'c', 'create_task', { ...args, allowScheduleConflict: true })).toMatchObject({ success: true });
});
it('checks a voice duration or schedule edit before changing any fields', async () => {
  mocks.availability.mockResolvedValue(['Overlaps a meeting']);
  expect(await executeVoiceTool('u', 's', 'c', 'update_task', { taskId: task.id, title: 'New title', durationMin: 60 })).toMatchObject({ requiresConfirmation: true });
  expect(mocks.updateTask).not.toHaveBeenCalled();
  expect(mocks.scheduleTask).not.toHaveBeenCalled();
  expect(mocks.availability).toHaveBeenCalledWith('u', task.startAt, new Date(+task.startAt + 3600000), 'task', task.id);
});
it('lets voice ask about a conflicting recurring occurrence before completion', async () => {
  const { ScheduleWarning } = await import('@/lib/schedule-warning');
  mocks.completeTask.mockRejectedValueOnce(new ScheduleWarning(['Next occurrence overlaps']));
  expect(await executeVoiceTool('u', 's', 'c', 'complete_task', { taskId: task.id })).toMatchObject({ requiresConfirmation: true, success: false });
  expect(mocks.completeTask).toHaveBeenCalledWith('u', task.id, false);
  const { voiceTools } = await import('./configuration');
  expect(voiceTools.find(tool => tool.name === 'complete_task')?.parameters.properties).toHaveProperty('allowScheduleConflict');
  expect(voiceTools.find(tool => tool.name === 'update_task')?.parameters.properties).toHaveProperty('allowScheduleConflict');
});
