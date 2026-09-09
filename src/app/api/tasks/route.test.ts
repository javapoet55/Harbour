import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/server/auth', () => ({ requireUser: vi.fn(async () => ({ id: 'task-owner', timeZone: 'America/Los_Angeles' })) }));
vi.mock('@/server/db', () => ({ prisma: { task: { findMany: mocks.findMany } } }));
vi.mock('@/server/tasks', () => ({ createTask: vi.fn() }));
vi.mock('@/server/reminders', () => ({ scheduleDefaultReminders: vi.fn() }));
vi.mock('@/server/calendar-sync', () => ({ pushTaskToExternal: vi.fn() }));
vi.mock('@/server/replanner', () => ({ generateReplanProposal: vi.fn() }));

import { GET } from './route';

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
