import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { PrismaClient } from '@/generated/prisma';
import type { CalendarWrite } from '@/providers/types';
import { GET } from '@/app/api/agenda/route';
import { pushTaskToExternal } from './calendar-sync';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), upsert: vi.fn(), remove: vi.fn(), list: vi.fn() }));
vi.mock('@/server/auth', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/providers/calendar', () => ({ calendarProviderFor: vi.fn(async () => ({ name: 'google', upsert: mocks.upsert, remove: mocks.remove, list: mocks.list })) }));

const prisma = new PrismaClient();
const users: string[] = [];
let userId = '';
let written = 0;
const agenda = async () => (await GET(new Request('https://nexdo.test/api/agenda?from=2099-01-01&days=3'))).json() as Promise<{ tasks: { id: string }[]; events: { id: string; title: string }[] }>;

beforeEach(async () => {
  vi.clearAllMocks();
  written = 0;
  mocks.upsert.mockImplementation(async (write: CalendarWrite) => ({ externalId: write.externalId ?? `google-${++written}` }));
  const user = await prisma.user.create({ data: { email: `mirror-${crypto.randomUUID()}@nexdo.test`, name: 'Owner', passwordHash: 'unused', timeZone: 'UTC', preference: { create: {} } } });
  userId = user.id;
  users.push(userId);
  mocks.requireUser.mockResolvedValue({ id: userId, timeZone: 'UTC' });
  await prisma.calendarConnection.create({ data: { userId, provider: 'google', accountEmail: 'owner@nexdo.test', calendarId: 'primary', calendarName: 'owner@nexdo.test', writeEnabled: true } });
});

afterAll(async () => {
  await prisma.task.deleteMany({ where: { userId: { in: users } } });
  await prisma.calendarEvent.deleteMany({ where: { userId: { in: users } } });
  await prisma.calendarConnection.deleteMany({ where: { userId: { in: users } } });
  await prisma.userPreference.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

const timedTask = (title: string) => prisma.task.create({ data: { userId, title, status: 'PLANNED', startAt: new Date('2099-01-01T06:06:00Z'), dueAt: new Date('2099-01-01T06:06:00Z'), durationMin: 30, timeZone: 'UTC' } });

it('lists a timed task once, not again as the calendar event it was written to', async () => {
  const task = await timedTask('Contact John');
  await pushTaskToExternal(userId, task.id);
  const mirror = await prisma.calendarEvent.findFirstOrThrow({ where: { userId, title: 'Contact John' } });
  await prisma.calendarEvent.create({ data: { userId, title: 'Dentist', startAt: new Date('2099-01-01T09:00:00Z'), endAt: new Date('2099-01-01T09:30:00Z'), timeZone: 'UTC' } });

  const body = await agenda();
  expect(body.tasks.map((item) => item.id)).toEqual([task.id]);
  expect(body.events.map((item) => item.title)).toEqual(['Dentist']);
  expect(body.events.some((item) => item.id === mirror.id)).toBe(false);
});

it('keeps the calendar event when it was moved away from the task time', async () => {
  const task = await timedTask('Buy Groceries');
  await pushTaskToExternal(userId, task.id);
  await prisma.calendarEvent.updateMany({ where: { userId, title: 'Buy Groceries' }, data: { startAt: new Date('2099-01-02T10:00:00Z'), endAt: new Date('2099-01-02T10:30:00Z') } });

  expect((await agenda()).events.map((item) => item.title)).toEqual(['Buy Groceries']);
});
