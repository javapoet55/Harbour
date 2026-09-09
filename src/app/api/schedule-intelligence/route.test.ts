import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { prisma } from '@/server/db';
import { GET } from './route';

const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock('@/server/auth', () => auth);

let userId: string;
let otherId: string;
beforeAll(async () => {
  const user = await prisma.user.create({ data: {
    email: `schedule-route-${Date.now()}@nexdo.test`, name: 'Schedule QA', passwordHash: 'unused-test-hash',
    timeZone: 'America/Los_Angeles', preference: { create: {} },
  } });
  const other = await prisma.user.create({ data: {
    email: `schedule-other-${Date.now()}@nexdo.test`, name: 'Other account', passwordHash: 'unused-test-hash',
  } });
  userId = user.id; otherId = other.id;
  await prisma.task.create({ data: {
    userId, title: 'Evening task', status: 'PLANNED', priority: 'NORMAL', durationMin: 30,
    startAt: new Date('2026-09-09T05:00:00Z'),
  } });
  await prisma.calendarEvent.createMany({ data: [
    { userId, title: 'Evening appointment', startAt: new Date('2026-09-09T03:00:00Z'), endAt: new Date('2026-09-09T03:30:00Z') },
    { userId: otherId, title: 'Private other account event', startAt: new Date('2026-09-09T03:00:00Z'), endAt: new Date('2026-09-09T03:30:00Z') },
  ] });
});
beforeEach(() => {
  auth.requireUser.mockReset().mockResolvedValue({ id: userId });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-09T02:52:00Z'));
});
afterAll(async () => {
  vi.useRealTimers();
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
});

it('serves the native Today contract after UTC midnight using the account day and private data', async () => {
  const response = await GET(new Request('https://nexdo.test/api/schedule-intelligence?scope=today'));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  const { today } = await response.json();
  expect(today).toMatchObject({ day: '2026-09-08', timeZone: 'America/Los_Angeles', commitments: 2, appointments: 1, tasks: 1 });
  expect(Number.isInteger(today.availableMinutes)).toBe(true);
  expect(today.timeline.map((item: { title: string }) => item.title)).toEqual(['Evening appointment', 'Evening task']);
  for (const item of today.timeline) {
    expect(item).toEqual(expect.objectContaining({
      id: expect.any(String), sourceId: expect.any(String), kind: expect.any(String), startAt: expect.any(String),
      allDay: expect.any(Boolean), deadlineOnly: expect.any(Boolean), past: expect.any(Boolean),
    }));
  }
  expect(today.recommendation).toEqual(expect.objectContaining({ title: expect.any(String), explanation: expect.any(String), kind: expect.any(String) }));
});

it('requires an authenticated account', async () => {
  auth.requireUser.mockRejectedValue(new Error('UNAUTHENTICATED'));
  expect((await GET(new Request('https://nexdo.test/api/schedule-intelligence?scope=today'))).status).toBe(401);
});

it.each(['scope=month', 'bufferMinutes=-1', 'bufferMinutes=61', 'bufferMinutes=1.5'])('rejects invalid options: %s', async (query) => {
  expect((await GET(new Request(`https://nexdo.test/api/schedule-intelligence?${query}`))).status).toBe(400);
});
