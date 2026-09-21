import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), createTask: vi.fn(), requestedReminder: vi.fn(), recurrenceCreate: vi.fn(), replan: vi.fn() }));
vi.mock('@/server/auth', () => ({ requireUser: vi.fn(async () => ({ id: 'task-owner', timeZone: 'America/Los_Angeles' })) }));
vi.mock('@/server/db', () => ({ prisma: { task: { findMany: mocks.findMany }, recurrenceRule: { create: mocks.recurrenceCreate } } }));
vi.mock('@/server/tasks', () => ({ createTask: mocks.createTask }));
vi.mock('@/server/reminders', () => ({ scheduleDefaultReminders: vi.fn(), scheduleRequestedReminder: mocks.requestedReminder }));
vi.mock('@/server/availability', () => ({ requireAvailableSchedule: vi.fn() }));
vi.mock('@/server/calendar-sync', () => ({ pushTaskToExternal: vi.fn() }));
vi.mock('@/server/replanner', () => ({ generateReplanProposal: mocks.replan }));

import { GET, POST } from './route';

describe('task list timeline API', () => {
  beforeEach(() => { mocks.findMany.mockReset(); mocks.findMany.mockResolvedValue([]); });
  it('combines timeline and search without overwriting ownership or search conditions', async () => {
    const response = await GET(new Request('http://localhost/api/tasks?timeline=TODAY&q=proposal&priority=CRITICAL&status=COMPLETED'));
    const { where } = mocks.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ userId: 'task-owner', deletedAt: null, priority: 'CRITICAL', status: 'COMPLETED' });
    expect(where.OR).toHaveLength(4);
    expect(where.OR[0]).toEqual({ title: { contains: 'proposal' } });
    expect(where.AND[0].OR).toHaveLength(2);
    expect(where.AND[0].OR[0].dueAt.gte).toBeInstanceOf(Date);
    expect(where.AND[0].OR[0].dueAt.lt).toBeInstanceOf(Date);
    expect(await response.json()).toEqual({ tasks: [], timeZone: 'America/Los_Angeles' });
  });
  it('keeps All unfiltered and includes the data required by the task editor', async () => {
    await GET(new Request('http://localhost/api/tasks?timeline=ALL'));
    const { where, include } = mocks.findMany.mock.calls[0][0];
    expect(where.AND).toEqual([{}]);
    expect(include).toMatchObject({ subtasks: true, recurrence: true, project: true });
  });
});

describe('typed smart life reminders', () => {
  it('routes Quick Add through task metadata, recurrence and requested notifications', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-19T18:00:00Z'));
      mocks.createTask.mockResolvedValue({ id: 'bill', critical: false });
      const response = await POST(new Request('http://localhost/api/tasks', { method: 'POST', body: JSON.stringify({ title: 'Pay electricity bill on the 20th every month' }) }));
      expect(response.status).toBe(200);
      expect(mocks.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pay electricity bill', lifeReminderType: 'bill', originalUserText: 'Pay electricity bill on the 20th every month' }));
      expect(mocks.recurrenceCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ taskId: 'bill', frequency: 'MONTHLY', interval: 1 }) });
      expect(mocks.requestedReminder).toHaveBeenCalledWith('task-owner', 'bill', new Date('2026-09-20T16:00:00Z'), false);
    } finally { vi.useRealTimers(); }
  });
});
