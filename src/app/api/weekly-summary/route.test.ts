import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { prisma } from '@/server/db';
import { GET } from './route';

const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock('@/server/auth', () => auth);
let userId: string;
let otherId: string;
beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `weekly-${Date.now()}@nexdo.test`, name: 'Weekly QA', passwordHash: 'unused', timeZone: 'America/Los_Angeles' } });
  const other = await prisma.user.create({ data: { email: `weekly-other-${Date.now()}@nexdo.test`, name: 'Other', passwordHash: 'unused' } });
  userId = user.id; otherId = other.id;
  await prisma.task.createMany({ data: [
    { userId, title: 'Monday task', startAt: new Date('2026-09-07T07:00:00Z'), completedAt: new Date('2026-09-07T08:00:00Z'), status: 'COMPLETED' },
    { userId, title: 'Sunday task', startAt: new Date('2026-09-14T06:00:00Z'), completedAt: new Date('2026-09-14T06:59:00Z'), status: 'COMPLETED' },
    { userId, title: 'Next Monday', startAt: new Date('2026-09-14T07:00:00Z') },
    { userId, title: 'Previous Sunday', startAt: new Date('2026-09-07T06:59:00Z') },
    { userId: otherId, title: 'Private task', startAt: new Date('2026-09-07T12:00:00Z') },
  ] });
});
beforeEach(() => {
  auth.requireUser.mockReset().mockResolvedValue({ id: userId, timeZone: 'America/Los_Angeles' });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T04:00:00Z'));
});
afterAll(async () => {
  vi.useRealTimers();
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
});

it('returns Monday through Sunday and includes late Sunday activity in the account timezone', async () => {
  const response = await GET(new Request('https://nexdo.test/api/weekly-summary?start=2026-09-13'));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  const summary = await response.json();
  expect(summary).toMatchObject({ start: '2026-09-07', end: '2026-09-13', metrics: { planned: 2, completed: 2, completionRate: 100, focusMinutes: 0 } });
  expect(summary.days.map((day: { date: string }) => day.date)).toEqual(['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']);
  expect(summary.days[6].completed).toBe(1);
  expect(summary.accomplishments.map((item: { title: string }) => item.title).sort()).toEqual(['Monday task', 'Sunday task']);
  expect(summary.taskGroups.planned).toHaveLength(summary.metrics.planned);
  expect(summary.taskGroups.completed).toHaveLength(summary.metrics.completed);
  expect(summary.taskGroups.overdue).toHaveLength(summary.metrics.overdue);
  expect(summary.taskGroups.planned.map((task: { title: string }) => task.title).sort()).toEqual(['Monday task', 'Sunday task']);
  expect(summary.taskGroups.completed.every((task: { id: string }) => summary.taskGroups.planned.some((planned: { id: string }) => task.id === planned.id))).toBe(true);
  expect(summary.days.reduce((sum: number, day: { completed: number }) => sum + day.completed, 0)).toBe(summary.taskGroups.completed.length);
});

it('returns the overdue snapshot even when that task was completed in a later week', async () => {
  const task = await prisma.task.create({ data: {
    userId, title: 'Completed after the selected week', status: 'COMPLETED',
    dueAt: new Date('2026-09-10T17:00:00Z'), completedAt: new Date('2026-09-14T18:00:00Z'),
  } });
  try {
    const summary = await (await GET(new Request('https://nexdo.test/api/weekly-summary?start=2026-09-07'))).json();
    expect(summary.metrics.overdue).toBe(1);
    expect(summary.taskGroups.overdue.map((item: { id: string }) => item.id)).toEqual([task.id]);
    expect(summary.taskGroups.completed.some((item: { id: string }) => item.id === task.id)).toBe(false);
  } finally { await prisma.task.delete({ where: { id: task.id } }); }
});

it('returns empty drilldowns for an empty week', async () => {
  const summary = await (await GET(new Request('https://nexdo.test/api/weekly-summary?start=2026-08-24'))).json();
  expect(summary.taskGroups).toEqual({ planned: [], completed: [], overdue: [] });
  expect(summary.metrics.completionRate).toBeNull();
});

it('defaults to the current account week', async () => {
  const summary = await (await GET(new Request('https://nexdo.test/api/weekly-summary'))).json();
  expect(summary.start).toBe('2026-09-14');
  expect(summary.end).toBe('2026-09-20');
});

it.each(['2026-02-30', 'invalid', '2026-09-21'])('rejects invalid or future weeks: %s', async (start) => {
  expect((await GET(new Request(`https://nexdo.test/api/weekly-summary?start=${start}`))).status).toBe(400);
});

it('returns 401 without an authenticated account', async () => {
  auth.requireUser.mockRejectedValue(new Error('UNAUTHENTICATED'));
  expect((await GET(new Request('https://nexdo.test/api/weekly-summary'))).status).toBe(401);
});
