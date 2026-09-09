import { prisma } from './db';
import { calendarProviderFor } from '@/providers/calendar';

export async function syncConnection(userId: string, connectionId: string) {
  const connection = await prisma.calendarConnection.findFirst({ where: { id: connectionId, userId } });
  if (!connection) throw new Error('NOT_FOUND');
  const provider = await calendarProviderFor(connection);
  // Obtaining the adapter can refresh credentials and advance updatedAt.
  const syncVersion = await prisma.calendarConnection.findUniqueOrThrow({ where: { id: connection.id } });
  const from = new Date(Date.now() - 30 * 86400000);
  const to = new Date(Date.now() + 365 * 86400000);
  let result;
  let fullSnapshot = !syncVersion.syncToken;
  try {
    result = await provider.list(from, to, syncVersion.syncToken);
  } catch (error) {
    if ((error as { status?: number }).status !== 410) {
      await prisma.calendarConnection.update({ where: { id: connection.id }, data: { status: 'error' } });
      throw error;
    }
    fullSnapshot = true;
    try { result = await provider.list(from, to, null); }
    catch (retryError) {
      await prisma.calendarConnection.update({ where: { id: connection.id }, data: { status: 'error' } });
      throw retryError;
    }
  }
  if (result.events.some((event) => !event.externalId || (!event.deleted && (!Number.isFinite(+event.startAt) || !Number.isFinite(+event.endAt) || event.endAt <= event.startAt)))) {
    await prisma.calendarConnection.update({ where: { id: connection.id }, data: { status: 'error' } });
    throw new Error('INVALID_CALENDAR_DATA');
  }
  const lastSyncedAt = new Date();
  return prisma.$transaction(async (tx) => {
    // Claim this snapshot before changing rows. A slower request cannot overwrite a newer sync.
    const claimed = await tx.calendarConnection.updateMany({ where: { id: connection.id, userId, updatedAt: syncVersion.updatedAt }, data: {
      lastSyncedAt, status: 'connected', syncToken: result.syncToken,
      updatedAt: new Date(Math.max(+lastSyncedAt, +syncVersion.updatedAt + 1)),
    } });
    if (claimed.count !== 1) throw new Error('CALENDAR_SYNC_STALE');
    const previous = await tx.calendarEvent.findMany({ where: { userId, connectionId: connection.id } });
    const byKey = new Map(previous.map((event) => [event.syncKey, event]));
    let created = 0; let updated = 0; let deleted = 0;
    const seen = new Set<string>();
    for (const event of result.events) {
    const syncKey = `${connection.id}:${event.externalId}`;
    seen.add(syncKey);
    const existing = byKey.get(syncKey);
    if (event.deleted) {
      if (existing && !existing.deletedAt) {
        await tx.calendarEvent.update({ where: { id: existing.id }, data: { deletedAt: lastSyncedAt } });
        deleted += 1;
      }
      continue;
    }
    await tx.calendarEvent.upsert({
      where: { syncKey },
      update: { title: event.title, notes: event.notes ?? '', startAt: event.startAt, endAt: event.endAt, allDay: event.allDay ?? false, location: event.location ?? '', deletedAt: null },
      create: { userId, connectionId: connection.id, title: event.title, notes: event.notes ?? '', startAt: event.startAt, endAt: event.endAt, allDay: event.allDay ?? false, location: event.location ?? '', source: connection.provider, externalId: event.externalId, syncKey, timeZone: 'UTC' },
    });
    if (existing) updated += 1; else created += 1;
    }
    // A replacement snapshot has no tombstones for events no longer in the result.
    if (fullSnapshot) {
      const missing = previous.filter((event) => !event.deletedAt && event.endAt > from && event.startAt < to && !seen.has(event.syncKey ?? ''));
      if (missing.length) deleted += (await tx.calendarEvent.updateMany({ where: { userId, id: { in: missing.map((event) => event.id) } }, data: { deletedAt: lastSyncedAt } })).count;
    }
    return { created, updated, deleted, lastSyncedAt };
  });
}

async function writableConnection(userId: string) {
  const prefs = await prisma.userPreference.findUnique({ where: { userId } });
  return prefs?.defaultCalendarId
    ? prisma.calendarConnection.findFirst({ where: { id: prefs.defaultCalendarId, userId, writeEnabled: true, status: 'connected' } })
    : prisma.calendarConnection.findFirst({ where: { userId, writeEnabled: true, status: 'connected' } });
}

export async function pushTaskToExternal(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) return null;
  const matches = task.externalEventId ? await prisma.calendarEvent.findMany({ where: { userId, externalId: task.externalEventId, ...(task.calendarEventId ? { id: task.calendarEventId } : {}) }, include: { connection: true } }) : [];
  if (task.externalEventId && (matches.length !== 1 || !matches[0].connection || matches[0].connection.userId !== userId)) throw new Error('CALENDAR_LINK_UNRESOLVED');
  const connection = task.externalEventId ? matches[0].connection : await writableConnection(userId);
  if (!connection) return null;
  if (!connection.writeEnabled || connection.status !== 'connected') throw new Error('CALENDAR_WRITE_DISABLED');
  const provider = await calendarProviderFor(connection);
  if ((task.deletedAt || task.status === 'CANCELLED') && task.externalEventId) {
    await provider.remove(task.externalEventId);
    await prisma.calendarEvent.updateMany({ where: { userId, id: matches[0].id }, data: { deletedAt: new Date() } });
    await prisma.task.update({ where: { id: task.id }, data: { externalEventId: null, calendarEventId: null } });
    return { deleted: true };
  }
  if (!task.startAt) return null;
  const endAt = new Date(task.startAt.getTime() + (task.durationMin || 30) * 60000);
  const written = await provider.upsert({ title: task.title, startAt: task.startAt, endAt, notes: task.notes, externalId: task.externalEventId ?? undefined });
  const mirror = await prisma.calendarEvent.upsert({ where: { syncKey: `${connection.id}:${written.externalId}` },
    create: { userId, connectionId: connection.id, source: connection.provider, externalId: written.externalId, syncKey: `${connection.id}:${written.externalId}`, title: task.title, startAt: task.startAt, endAt, notes: task.notes, timeZone: task.timeZone },
    update: { title: task.title, startAt: task.startAt, endAt, notes: task.notes, deletedAt: null },
  });
  await prisma.task.update({ where: { id: task.id }, data: { externalEventId: written.externalId, calendarEventId: mirror.id } });
  return written;
}
