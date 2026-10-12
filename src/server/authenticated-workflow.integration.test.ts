import { afterAll, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';

// Replace only Next's request cookie transport; authentication, JWT signing,
// ownership checks, routes and persistence use their real implementations.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({ cookies: async () => ({
  get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined,
  set: (key: string, value: string) => jar.set(key, value),
  delete: (key: string) => jar.delete(key),
}) }));
vi.mock('./task-agent/service', () => ({ classifyNewTask: vi.fn() }));
vi.mock('./replanner', () => ({ generateReplanProposal: vi.fn() }));

import { prisma } from './db';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as tasks, POST as createTask } from '@/app/api/tasks/route';
import { PATCH as editTask } from '@/app/api/tasks/[id]/route';
import { PATCH as bulkTasks } from '@/app/api/tasks/bulk/route';
import { POST as createEvent } from '@/app/api/calendar/events/route';
import { GET as event, PATCH as editEvent, DELETE as deleteEvent } from '@/app/api/calendar/events/[id]/route';

let userId: string;
const request = (path: string, method = 'GET', body?: object) => new Request(`https://nexdo.test/api/${path}`, {
  method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
});
const context = (id: string) => ({ params: Promise.resolve({ id }) });
afterAll(async () => {
  jar.clear();
  if (userId) await prisma.user.delete({ where: { id: userId } });
});

it('uses a real signed login session for persisted task and calendar operations', async () => {
  const email = `workflow-${crypto.randomUUID()}@nexdo.test`;
  const password = 'local-integration-password-123';
  const user = await prisma.user.create({ data: {
    email, name: 'Local workflow test', passwordHash: await bcrypt.hash(password, 10),
    emailVerifiedAt: new Date(), timeZone: 'America/Los_Angeles', preference: { create: {} },
  } });
  userId = user.id;
  expect((await tasks(request('tasks'))).status).toBe(401);
  expect((await login(request('auth/login', 'POST', { email, password }))).status).toBe(200);
  expect(jar.get('harbor_session')).toBeTruthy();

  const created = await createTask(request('tasks', 'POST', { title: 'Local workflow task' }));
  expect(created.status).toBe(200);
  const { task } = await created.json();
  expect((await editTask(request(`tasks/${task.id}`, 'PATCH', { title: 'Updated workflow task' }), context(task.id))).status).toBe(200);
  const list = await tasks(request('tasks'));
  expect(list.status).toBe(200);
  expect((await list.json()).tasks).toEqual(expect.arrayContaining([expect.objectContaining({ id: task.id, title: 'Updated workflow task' })]));
  expect((await editTask(request(`tasks/${task.id}`, 'PATCH', {
    startAt: '2099-01-06T10:00:00-08:00', durationMin: 30, allowScheduleConflict: true,
  }), context(task.id))).status).toBe(200);
  expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).startAt?.toISOString()).toBe('2099-01-06T18:00:00.000Z');
  expect((await bulkTasks(request('tasks/bulk', 'PATCH', { ids: [task.id], status: 'CANCELLED' }))).status).toBe(200);
  expect((await (await tasks(request('tasks'))).json()).tasks).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: task.id })]));

  const body = { requestId: crypto.randomUUID(), title: 'Local workflow event', notes: '', location: '',
    startAt: '2099-01-05T18:00:00Z', endAt: '2099-01-05T18:30:00Z', allowScheduleConflict: true };
  expect((await createEvent(request('calendar/events', 'POST', body))).status).toBe(200);
  expect((await createEvent(request('calendar/events', 'POST', body))).status).toBe(200);
  const rows = await prisma.calendarEvent.findMany({ where: { userId, title: body.title } });
  expect(rows).toHaveLength(1);
  const id = rows[0].id;
  expect((await event(request(`calendar/events/${id}`), context(id))).status).toBe(200);
  expect((await editEvent(request(`calendar/events/${id}`, 'PATCH', {
    title: 'Rescheduled workflow event', startAt: '2099-01-05T11:00:00-08:00', endAt: '2099-01-05T11:30:00-08:00',
  }), context(id))).status).toBe(200);
  expect((await prisma.calendarEvent.findUniqueOrThrow({ where: { id } })).startAt.toISOString()).toBe('2099-01-05T19:00:00.000Z');
  expect((await deleteEvent(request(`calendar/events/${id}`, 'DELETE'), context(id))).status).toBe(200);
  expect((await event(request(`calendar/events/${id}`), context(id))).status).toBe(404);
  jar.set('harbor_session', 'invalid-session');
  expect((await tasks(request('tasks'))).status).toBe(401);
  expect((await event(request(`calendar/events/${id}`), context(id))).status).toBe(401);
});
