import { prisma } from './db';
import { calendarProviderFor } from '@/providers';

export async function syncConnection(userId: string, connectionId: string) {
  const connection = await prisma.calendarConnection.findFirst({
    where: { id: connectionId, userId },
  });
  if (!connection) throw new Error('NOT_FOUND');
  const provider = calendarProviderFor(connection.provider);
  const from = new Date();
  const to = new Date(Date.now() + 14 * 86400000);
  const remote = await provider.list(from, to);
  let created = 0;
  for (const event of remote) {
    const syncKey = `${connection.id}:${event.externalId ?? event.title}:${event.startAt.toISOString()}`;
    const existing = await prisma.calendarEvent.findUnique({ where: { syncKey } });
    if (existing) continue;
    await prisma.calendarEvent.create({
      data: {
        userId,
        connectionId: connection.id,
        title: event.title,
        notes: event.notes ?? '',
        startAt: event.startAt,
        endAt: event.endAt,
        source: connection.provider,
        externalId: event.externalId,
        syncKey,
        timeZone: connection.calendarName,
      },
    });
    created += 1;
  }
  await prisma.calendarConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt: new Date(), status: 'connected', syncToken: `tok-${Date.now()}` },
  });
  return { created, lastSyncedAt: new Date() };
}

export async function pushTaskToExternal(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  const prefs = await prisma.userPreference.findUnique({ where: { userId } });
  if (!task?.startAt) return null;
  const connection = prefs?.defaultCalendarId
    ? await prisma.calendarConnection.findFirst({ where: { id: prefs.defaultCalendarId, userId, writeEnabled: true } })
    : await prisma.calendarConnection.findFirst({ where: { userId, writeEnabled: true } });
  if (!connection) return null;
  const provider = calendarProviderFor(connection.provider);
  const endAt = new Date(task.startAt.getTime() + (task.durationMin || 30) * 60000);
  const written = await provider.upsert({
    title: task.title,
    startAt: task.startAt,
    endAt,
    notes: task.notes,
    externalId: task.externalEventId ?? undefined,
  });
  await prisma.task.update({
    where: { id: task.id },
    data: { externalEventId: written.externalId },
  });
  return written;
}
