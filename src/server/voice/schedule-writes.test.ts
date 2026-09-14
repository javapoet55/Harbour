import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/tasks/route';
import { PATCH } from '@/app/api/tasks/[id]/route';
import { ScheduleWarning } from '@/lib/schedule-warning';
const m = vi.hoisted(() => ({ check: vi.fn(), create: vi.fn(), update: vi.fn(), schedule: vi.fn(), owned: vi.fn(), replan: vi.fn() }));
vi.mock('@/server/auth', () => ({ requireUser: async () => ({ id: 'owner', timeZone: 'UTC' }) }));
vi.mock('@/server/availability', () => ({ requireAvailableSchedule: m.check }));
vi.mock('@/server/tasks', () => ({ createTask: m.create, updateTask: m.update, scheduleTask: m.schedule }));
vi.mock('@/server/db', () => ({ prisma: { task: { findFirst: m.owned } } }));
vi.mock('@/server/reminders', () => ({ scheduleDefaultReminders: vi.fn() }));
vi.mock('@/server/calendar-sync', () => ({ pushTaskToExternal: vi.fn() }));
vi.mock('@/server/replanner', () => ({ generateReplanProposal: m.replan }));
const task = { id: 't', startAt: new Date('2099-01-01T10:00Z'), durationMin: 30, status: 'PLANNED' };
const request = (body: object) => new Request('https://test/api/tasks', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); m.owned.mockResolvedValue(task); m.create.mockResolvedValue(task); m.check.mockImplementation(async (_u, _s, _d, approved) => { if (approved !== true) throw new ScheduleWarning(['Overlaps existing work']); }); });
it('direct create is rejected before saving, then accepts explicit consent', async () => {
  const body = { title: 'Work', startAt: task.startAt.toISOString(), durationMin: 30 };
  expect((await POST(request(body))).status).toBe(409);
  expect(m.create).not.toHaveBeenCalled();
  expect((await POST(request({ ...body, allowScheduleConflict: true }))).status).toBe(200);
  expect(m.create).toHaveBeenCalledTimes(1);
});
it('duration-only edits and rescheduling exclude the existing task and reject before writes', async () => {
  const ctx = { params: Promise.resolve({ id: 't' }) };
  expect((await PATCH(request({ durationMin: 60, title: 'Changed' }), ctx)).status).toBe(409);
  expect(m.check).toHaveBeenCalledWith('owner', task.startAt, 60, undefined, 't');
  expect(m.update).not.toHaveBeenCalled();
  expect((await PATCH(request({ startAt: '2099-01-01T12:00:00Z' }), ctx)).status).toBe(409);
  expect(m.schedule).not.toHaveBeenCalled();
});
it('checks task ownership before reading availability for an edit', async () => {
  m.owned.mockResolvedValue(null);
  expect((await PATCH(request({ durationMin: 60 }), { params: Promise.resolve({ id: 'other' }) })).status).toBe(404);
  expect(m.check).not.toHaveBeenCalled();
});
