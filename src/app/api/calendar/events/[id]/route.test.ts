import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), push: vi.fn() }));
vi.mock('@/server/auth', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/server/db', () => ({ prisma: { calendarEvent: mocks } }));
vi.mock('@/server/calendar-sync', () => ({ pushEventToExternal: mocks.push }));
vi.mock('@/server/health/telemetry', () => ({ healthRoute: (_name: string, handler: unknown) => handler }));
import { PATCH, DELETE } from './route';
const ctx = { params: Promise.resolve({ id: 'event' }) };
const patch = (body: unknown) => PATCH(new Request('https://nexdo.test', { method: 'PATCH', body: JSON.stringify(body) }), ctx);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({ id: 'owner' });
  mocks.findFirst.mockResolvedValue({ id: 'event', startAt: new Date('2099-01-01T10:00:00Z'), endAt: new Date('2099-01-01T11:00:00Z') });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.findUniqueOrThrow.mockResolvedValue({ id: 'event' });
  mocks.push.mockResolvedValue({ status: 'not_connected' });
});
it.each([null, {}, { title: '' }, { startAt: 'garbage' }, { startAt: '2099-01-01T10:00:00' }, { endAt: '2099-01-01T09:00:00Z' }, { startAt: '2000-01-01T00:00:00Z' }])('rejects invalid edits before writing: %j', async body => {
  expect((await patch(body)).status).toBe(400);
  expect(mocks.updateMany).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
});
it('preserves absolute instants when rescheduling across offset changes', async () => {
  expect((await patch({ startAt: '2099-03-08T01:30:00-08:00', endAt: '2099-03-08T03:30:00-07:00' })).status).toBe(200);
  expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ startAt: new Date('2099-03-08T09:30:00Z'), endAt: new Date('2099-03-08T10:30:00Z') }) }));
  expect(mocks.push).toHaveBeenCalledWith('owner', 'event');
});
it('does not reschedule a title-only edit', async () => {
  expect((await patch({ title: 'Changed title' })).status).toBe(200);
  expect(mocks.updateMany.mock.calls[0][0].data).toEqual({ title: 'Changed title' });
});
it('limits deletes to owned local events', async () => {
  mocks.findFirst.mockResolvedValue(null);
  expect((await DELETE(new Request('https://nexdo.test'), ctx)).status).toBe(404);
  expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: 'event', userId: 'owner', source: 'harbor', connectionId: null } });
  expect(mocks.updateMany).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
});
it('rejects an edit deleted concurrently without pushing it', async () => {
  mocks.updateMany.mockResolvedValue({ count: 0 });
  expect((await patch({ title: 'Changed' })).status).toBe(404);
  expect(mocks.push).not.toHaveBeenCalled();
});
it('does not send a second provider deletion after a concurrent delete wins', async () => {
  mocks.updateMany.mockResolvedValue({ count: 0 });
  expect((await DELETE(new Request('https://nexdo.test'), ctx)).status).toBe(404);
  expect(mocks.push).not.toHaveBeenCalled();
});
