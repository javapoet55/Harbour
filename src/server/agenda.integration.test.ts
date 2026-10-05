import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { prisma } from './db';
import { listEventsInRange, snapshotForRange } from './agenda';

let userId: string;
const startAt = new Date('2026-10-05T16:00:00Z');
const endAt = new Date('2026-10-05T16:30:00Z');
beforeEach(async () => {
  userId = (await prisma.user.create({ data: { email: `${randomUUID()}@agenda.test`, name: 'Agenda test', passwordHash: '' } })).id;
});
afterEach(async () => { await prisma.user.delete({ where: { id: userId } }); });
const event = (externalId: string) => prisma.calendarEvent.create({ data: { userId, title: 'Buy Groceries', startAt, endAt, externalId } });
const agenda = () => snapshotForRange(userId, 'America/Los_Angeles', 3, startAt);

it('returns the task once and preserves independent appointments with the same title and time', async () => {
  const mirror = await event('provider-task');
  const appointment = await event('real-appointment');
  const task = await prisma.task.create({ data: { userId, title: 'Buy Groceries', startAt, dueAt: startAt, durationMin: 30, calendarEventId: mirror.id, externalEventId: mirror.externalId } });
  const result = await agenda();
  expect(result.tasks.map(t => t.id)).toEqual([task.id]);
  expect(result.events.map(e => e.id)).toEqual([appointment.id]);
  // The provider copy remains available to synchronization/conflict detection.
  expect((await listEventsInRange(userId, startAt, endAt)).map(e => e.id)).toContain(mirror.id);
});

it.each(['COMPLETED', 'CANCELLED', 'DELETED'])('does not revive a %s task as an event', async (state) => {
  const mirror = await event('terminal-task');
  await prisma.task.create({ data: { userId, title: 'Buy Groceries', startAt, calendarEventId: mirror.id, status: state === 'DELETED' ? 'PLANNED' : state, deletedAt: state === 'DELETED' ? startAt : null } });
  expect((await agenda()).events).toEqual([]);
});

it('supports legacy external links without hiding ambiguous provider IDs', async () => {
  const mirror = await event('legacy');
  await prisma.task.create({ data: { userId, title: 'Buy Groceries', startAt, durationMin: 30, externalEventId: 'legacy' } });
  expect((await agenda()).events).toEqual([]);
  const otherCalendar = await event('legacy');
  expect((await agenda()).events.map(e => e.id).sort()).toEqual([mirror.id, otherCalendar.id].sort());
});

it('preserves a linked event moved externally to a different time', async () => {
  const mirror = await event('moved');
  await prisma.task.create({ data: { userId, title: 'Buy Groceries', startAt: new Date(+startAt - 3600000), durationMin: 30, calendarEventId: mirror.id } });
  expect((await agenda()).events.map(e => e.id)).toEqual([mirror.id]);
});

it('does not use another account’s task links to suppress appointments', async () => {
  const mirror = await event('shared-id');
  const other = await prisma.user.create({ data: { email: `${randomUUID()}@agenda.test`, name: 'Other account', passwordHash: '' } });
  try {
    await prisma.task.create({ data: { userId: other.id, title: 'Other task', startAt, durationMin: 30, externalEventId: mirror.externalId } });
    expect((await agenda()).events.map(e => e.id)).toEqual([mirror.id]);
  } finally { await prisma.user.delete({ where: { id: other.id } }); }
});
