import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@/generated/prisma';
import type { CalendarWrite } from '@/providers/types';
import { POST } from '@/app/api/calendar/events/route';
import { PATCH, DELETE } from '@/app/api/calendar/events/[id]/route';
import { syncConnection } from './calendar-sync';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), upsert: vi.fn(), remove: vi.fn(), list: vi.fn() }));
vi.mock('@/server/auth', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/providers/calendar', () => ({ calendarProviderFor: vi.fn(async () => ({ name: 'google', upsert: mocks.upsert, remove: mocks.remove, list: mocks.list })) }));

const prisma = new PrismaClient();
const users: string[] = [];
let userId = '';
let written = 0;
const event = { title: 'Dentist', notes: 'Bring forms', location: 'Main St', startAt: '2099-01-01T18:00:00Z', endAt: '2099-01-01T18:30:00Z', allowScheduleConflict: true };
const create = (body: Record<string, unknown>) => POST(new Request('https://nexdo.test/api/calendar/events', { method: 'POST', body: JSON.stringify({ requestId: crypto.randomUUID(), ...event, ...body }) }));
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const connect = (data: { writeEnabled?: boolean } = {}) => prisma.calendarConnection.create({ data: { userId, provider: 'google', accountEmail: 'owner@nexdo.test', calendarId: 'primary', calendarName: 'owner@nexdo.test', writeEnabled: true, ...data } });
const saved = () => prisma.calendarEvent.findMany({ where: { userId, source: 'harbor' }, orderBy: { startAt: 'asc' } });

beforeEach(async () => {
  vi.clearAllMocks();
  written = 0;
  mocks.upsert.mockImplementation(async (write: CalendarWrite) => ({ externalId: write.externalId ?? `google-${++written}` }));
  mocks.remove.mockResolvedValue(undefined);
  const user = await prisma.user.create({ data: { email: `writeback-${crypto.randomUUID()}@nexdo.test`, name: 'Owner', passwordHash: 'unused', timeZone: 'UTC', preference: { create: {} } } });
  userId = user.id;
  users.push(userId);
  mocks.requireUser.mockResolvedValue({ id: userId, timeZone: 'UTC' });
});

afterAll(async () => {
  await prisma.calendarEvent.deleteMany({ where: { userId: { in: users } } });
  await prisma.calendarConnection.deleteMany({ where: { userId: { in: users } } });
  await prisma.userPreference.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('Nexdo event write-back to the connected calendar', () => {
  it('writes a single event and stores its provider id', async () => {
    const connection = await connect();
    const response = await create({});
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({ title: 'Dentist', notes: 'Bring forms', location: 'Main St', startAt: new Date(event.startAt), endAt: new Date(event.endAt), externalId: undefined });
    expect(body).toMatchObject({ success: true, calendarPush: { status: 'pushed', total: 1, succeeded: 1, calendarName: 'owner@nexdo.test' }, message: 'Saved in Nexdo and added it to your connected calendar. No invitations were sent.' });
    expect(body.warnings).toBeUndefined();
    expect(await saved()).toMatchObject([{ pushedConnectionId: connection.id, pushedExternalId: 'google-1', connectionId: null }]);
  });

  it('writes each occurrence of a repeating event and does not rewrite them on a retry', async () => {
    const connection = await connect();
    const requestId = crypto.randomUUID();
    const body = await (await create({ requestId, repeat: { frequency: 'daily', until: '2099-01-03' } })).json();
    expect(body).toMatchObject({ success: true, occurrenceCount: 3, calendarPush: { status: 'pushed', total: 3, succeeded: 3 }, message: 'Saved 3 events in Nexdo and added them to your connected calendar.' });
    const rows = await saved();
    expect(rows.map(row => row.pushedConnectionId)).toEqual([connection.id, connection.id, connection.id]);
    expect(new Set(rows.map(row => row.pushedExternalId)).size).toBe(3);
    expect(mocks.upsert.mock.calls.map(([write]) => (write as CalendarWrite).startAt.toISOString()).sort()).toEqual(rows.map(row => row.startAt.toISOString()));
    await create({ requestId, repeat: { frequency: 'daily', until: '2099-01-03' } });
    expect(mocks.upsert).toHaveBeenCalledTimes(3);
    expect(await saved()).toHaveLength(3);
  });

  it('keeps events local when no calendar accepts writes', async () => {
    await connect({ writeEnabled: false });
    const single = await (await create({})).json();
    const series = await (await create({ repeat: { frequency: 'daily', until: '2099-01-02' } })).json();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(single).toMatchObject({ success: true, calendarPush: { status: 'not_connected' }, message: 'Saved in Nexdo only. No connected calendar is set to receive Nexdo events. No invitations were sent.' });
    expect(series).toMatchObject({ success: true, occurrenceCount: 2, calendarPush: { status: 'not_connected' } });
    expect((await saved()).every(row => row.pushedExternalId === null)).toBe(true);
  });

  it('saves the event locally with a warning when the provider fails', async () => {
    await connect();
    mocks.upsert.mockRejectedValue(Object.assign(new Error('Calendar provider returned 503'), { status: 503 }));
    const response = await create({});
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, calendarPush: { status: 'failed', succeeded: 0 }, warnings: ['Saved in Nexdo, but it could not be added to your connected calendar.'] });
    expect(await saved()).toMatchObject([{ title: 'Dentist', pushedExternalId: null, deletedAt: null }]);
  });

  it('reports a partially written series and completes it on retry', async () => {
    await connect();
    mocks.upsert.mockImplementationOnce(async () => ({ externalId: 'google-first' })).mockRejectedValueOnce(Object.assign(new Error('Calendar provider returned 500'), { status: 500 }));
    const requestId = crypto.randomUUID();
    const repeat = { frequency: 'daily', until: '2099-01-02' };
    const first = await (await create({ requestId, repeat })).json();
    expect(first).toMatchObject({ success: true, occurrenceCount: 2, calendarPush: { status: 'partial', total: 2, succeeded: 1 }, warnings: ['Saved 2 events in Nexdo; 1 reached your connected calendar and 1 did not.'] });
    const retry = await (await create({ requestId, repeat })).json();
    expect(retry).toMatchObject({ calendarPush: { status: 'pushed', total: 2, succeeded: 2 } });
    expect((await saved()).every(row => row.pushedExternalId)).toBe(true);
  });

  it('propagates an edit to the stored provider event', async () => {
    await connect();
    await create({});
    const [row] = await saved();
    const response = await PATCH(new Request(`https://nexdo.test/api/calendar/events/${row.id}`, { method: 'PATCH', body: JSON.stringify({ title: 'Dentist (moved)', startAt: '2099-01-02T18:00:00Z', endAt: '2099-01-02T19:00:00Z' }) }), params(row.id));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ externalId: 'google-1', title: 'Dentist (moved)', startAt: new Date('2099-01-02T18:00:00Z'), endAt: new Date('2099-01-02T19:00:00Z') }));
    expect(body).toMatchObject({ success: true, event: { title: 'Dentist (moved)' }, calendarPush: { status: 'pushed' }, message: 'Updated in Nexdo and your connected calendar.' });
    expect(await saved()).toMatchObject([{ title: 'Dentist (moved)', pushedExternalId: 'google-1' }]);
  });

  it('keeps an edit when the provider rejects it', async () => {
    await connect();
    await create({});
    const [row] = await saved();
    mocks.upsert.mockRejectedValueOnce(Object.assign(new Error('Calendar provider returned 503'), { status: 503 }));
    const body = await (await PATCH(new Request('https://nexdo.test', { method: 'PATCH', body: JSON.stringify({ location: 'Elm St' }) }), params(row.id))).json();
    expect(body).toMatchObject({ success: true, calendarPush: { status: 'failed' }, warnings: ['Updated in Nexdo, but it could not be updated in your connected calendar.'] });
    expect(await saved()).toMatchObject([{ location: 'Elm St', pushedExternalId: 'google-1' }]);
  });

  it('propagates a deletion using the stored provider id', async () => {
    await connect();
    await create({});
    const [row] = await saved();
    const response = await DELETE(new Request('https://nexdo.test', { method: 'DELETE' }), params(row.id));
    expect(await response.json()).toMatchObject({ success: true, calendarPush: { status: 'removed' }, message: 'Deleted from Nexdo and your connected calendar.' });
    expect(mocks.remove).toHaveBeenCalledWith('google-1');
    const [deleted] = await saved();
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.pushedExternalId).toBeNull();
  });

  it('deletes locally with a warning when the provider removal fails', async () => {
    await connect();
    await create({});
    const [row] = await saved();
    mocks.remove.mockRejectedValueOnce(Object.assign(new Error('Calendar provider returned 503'), { status: 503 }));
    const body = await (await DELETE(new Request('https://nexdo.test', { method: 'DELETE' }), params(row.id))).json();
    expect(body).toMatchObject({ success: true, calendarPush: { status: 'failed' }, warnings: ['Deleted from Nexdo, but it could not be removed from your connected calendar.'] });
    expect((await saved())[0]).toMatchObject({ pushedExternalId: 'google-1' });
    expect((await saved())[0].deletedAt).not.toBeNull();
  });

  it('does not edit or delete imported events through the Nexdo event routes', async () => {
    const connection = await connect();
    const imported = await prisma.calendarEvent.create({ data: { userId, connectionId: connection.id, source: 'google', externalId: 'theirs', syncKey: `${connection.id}:theirs`, title: 'Standup', startAt: new Date('2099-01-01T09:00:00Z'), endAt: new Date('2099-01-01T09:15:00Z') } });
    expect((await PATCH(new Request('https://nexdo.test', { method: 'PATCH', body: JSON.stringify({ title: 'x' }) }), params(imported.id))).status).toBe(404);
    expect((await DELETE(new Request('https://nexdo.test', { method: 'DELETE' }), params(imported.id))).status).toBe(404);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('does not import a written event back as a duplicate on the next sync', async () => {
    const connection = await connect();
    await create({});
    mocks.list.mockResolvedValue({ events: [{ externalId: 'google-1', title: 'Dentist', startAt: new Date(event.startAt), endAt: new Date(event.endAt) }], syncToken: 'next' });
    await syncConnection(userId, connection.id);
    const all = await prisma.calendarEvent.findMany({ where: { userId, deletedAt: null } });
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ source: 'harbor', pushedExternalId: 'google-1' });
  });
});
