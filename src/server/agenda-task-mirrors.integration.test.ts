import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from './db';
import { snapshotForRange } from './agenda';

describe('snapshotForRange', () => {
  it('omits the calendar mirror of a scheduled task but keeps other events', async () => {
    const user = await prisma.user.create({ data: { email: `${randomUUID()}@agenda-mirrors.test`, passwordHash: '', name: 'Agenda', timeZone: 'UTC' } });
    const connection = await prisma.calendarConnection.create({ data: { userId: user.id, provider: 'google', accountEmail: 'a@example.com', calendarId: 'primary', calendarName: 'Work', writeEnabled: true } });
    const startAt = new Date(Date.now() + 3600000);
    const endAt = new Date(+startAt + 30 * 60000);
    const mirror = await prisma.calendarEvent.create({ data: { userId: user.id, connectionId: connection.id, title: 'Contact John', startAt, endAt, source: 'google', externalId: 'g-1', syncKey: `${connection.id}:g-1` } });
    await prisma.task.create({ data: { userId: user.id, title: 'Contact John', startAt, dueAt: startAt, durationMin: 30, status: 'PLANNED', calendarEventId: mirror.id, externalEventId: 'g-1' } });
    const moved = await prisma.calendarEvent.create({ data: { userId: user.id, connectionId: connection.id, title: 'Buy groceries', startAt: new Date(+startAt + 3600000), endAt: new Date(+startAt + 5400000), source: 'google', externalId: 'g-2', syncKey: `${connection.id}:g-2` } });
    await prisma.task.create({ data: { userId: user.id, title: 'Buy groceries', startAt, durationMin: 30, status: 'PLANNED', calendarEventId: moved.id, externalEventId: 'g-2' } });
    const meeting = await prisma.calendarEvent.create({ data: { userId: user.id, title: 'Go to DMV', startAt, endAt } });

    const snap = await snapshotForRange(user.id, 'UTC', 2);

    expect(snap.tasks.map((task) => task.title).sort()).toEqual(['Buy groceries', 'Contact John']);
    // An event moved away from its task in the calendar is no longer a plain mirror, so it still shows.
    expect(snap.events.map((event) => event.id).sort()).toEqual([meeting.id, moved.id].sort());
  });
});
