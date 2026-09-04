import { prisma } from './db';
import { calendarProviderFor } from '@/providers/calendar';

export async function syncConnection(userId: string, connectionId: string) {
  const connection = await prisma.calendarConnection.findFirst({ where: { id: connectionId, userId } });
  if (!connection) throw new Error('NOT_FOUND');
  const provider = await calendarProviderFor(connection);
  const from = new Date(Date.now() - 30 * 86400000);
  const to = new Date(Date.now() + 365 * 86400000);
  let result;
  try {
    result = await provider.list(from, to, connection.syncToken);
  } catch (error) {
    if ((error as { status?: number }).status !== 410) {
      await prisma.calendarConnection.update({ where: { id: connection.id }, data: { status: 'error' } });
      throw error;
    }
    result = await provider.list(from, to, null);
  }
  let created = 0;
  let updated = 0;
  let deleted = 0;
  for (const event of result.events) {
    if (!event.externalId) continue;
    const syncKey = `${connection.id}:${event.externalId}`;
    const existing = await prisma.calendarEvent.findUnique({ where: { syncKey } });
    if (event.deleted) {
      if (existing && !existing.deletedAt) {
        await prisma.calendarEvent.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
        deleted += 1;
      }
      continue;
    }
    await prisma.calendarEvent.upsert({
      where: { syncKey },
      update: { title: event.title, notes: event.notes ?? '', startAt: event.startAt, endAt: event.endAt, allDay: event.allDay ?? false, location: event.location ?? '', deletedAt: null },
      create: { userId, connectionId: connection.id, title: event.title, notes: event.notes ?? '', startAt: event.startAt, endAt: event.endAt, allDay: event.allDay ?? false, location: event.location ?? '', source: connection.provider, externalId: event.externalId, syncKey, timeZone: 'UTC' },
    });
    if (existing) updated += 1; else created += 1;
  }
  const lastSyncedAt = new Date();
  await prisma.calendarConnection.update({ where: { id: connection.id }, data: { lastSyncedAt, status: 'connected', syncToken: result.syncToken } });
  return { created, updated, deleted, lastSyncedAt };
}

async function writableConnection(userId: string) {
  const prefs = await prisma.userPreference.findUnique({ where: { userId } });
  return prefs?.defaultCalendarId
    ? prisma.calendarConnection.findFirst({ where: { id: prefs.defaultCalendarId, userId, writeEnabled: true, status: 'connected' } })
    : prisma.calendarConnection.findFirst({ where: { userId, writeEnabled: true, status: 'connected' } });
}

export async function pushTaskToExternal(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  const connection = await writableConnection(userId);
  if (!task || !connection) return null;
  const provider = await calendarProviderFor(connection);
  if ((task.deletedAt || task.status === 'CANCELLED') && task.externalEventId) {
    await provider.remove(task.externalEventId);
    await prisma.task.update({ where: { id: task.id }, data: { externalEventId: null } });
    return { deleted: true };
  }
  if (!task.startAt) return null;
  const endAt = new Date(task.startAt.getTime() + (task.durationMin || 30) * 60000);
  const written = await provider.upsert({ title: task.title, startAt: task.startAt, endAt, notes: task.notes, externalId: task.externalEventId ?? undefined });
  await prisma.task.update({ where: { id: task.id }, data: { externalEventId: written.externalId } });
  return written;
}
