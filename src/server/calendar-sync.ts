import { prisma } from './db';
import { calendarProviderFor, isCalendarAuthFailure, isCalendarListAuthFailure } from '@/providers/calendar';
import type { CalendarConnection } from '@/generated/prisma';
import type { CalendarPushResult } from '@/lib/calendar-push';
import { log } from '@/lib/logger';

export async function syncConnection(userId: string, connectionId: string) {
  const connection = await prisma.calendarConnection.findFirst({ where: { id: connectionId, userId } });
  if (!connection) throw new Error('NOT_FOUND');
  let provider;
  try { provider = await calendarProviderFor(connection); }
  catch (error) {
    // A revoked or missing grant needs reconnecting, so the app shows "Needs reconnecting". Transient
    // failures (network, timeout, 5xx, rate limit) leave the status alone and are retried next sync.
    if (isCalendarAuthFailure(error)) await prisma.calendarConnection.update({ where: { id: connection.id }, data: { status: 'error' } });
    throw error;
  }
  // Obtaining the adapter can refresh credentials and advance updatedAt.
  const syncVersion = await prisma.calendarConnection.findUniqueOrThrow({ where: { id: connection.id } });
  const from = new Date(Date.now() - 30 * 86400000);
  const to = new Date(Date.now() + 365 * 86400000);
  let result;
  let fullSnapshot = !syncVersion.syncToken;
  // Only a lost sign-in or a missing calendar (404: deleted or unshared) marks the connection for
  // reconnecting; anything else (network, timeout, 5xx, 429, a rate-limit 403) leaves status and
  // lastSyncedAt as they were and is retried on the next sync.
  const failed = async (error: unknown) => {
    if (isCalendarListAuthFailure(error)) await prisma.calendarConnection.update({ where: { id: connection.id }, data: { status: 'error' } });
    return error;
  };
  try {
    result = await provider.list(from, to, syncVersion.syncToken);
  } catch (error) {
    if ((error as { status?: number }).status !== 410) throw await failed(error);
    fullSnapshot = true;
    try { result = await provider.list(from, to, null); }
    catch (retryError) { throw await failed(retryError); }
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
    // Nexdo events written to this calendar come back in the listing; the Nexdo row is the original.
    const pushed = new Set((await tx.calendarEvent.findMany({ where: { userId, pushedConnectionId: connection.id, pushedExternalId: { not: null } }, select: { pushedExternalId: true } })).map((event) => event.pushedExternalId));
    let created = 0; let updated = 0; let deleted = 0;
    const seen = new Set<string>();
    for (const event of result.events) {
    const syncKey = `${connection.id}:${event.externalId}`;
    const existing = byKey.get(syncKey);
    if (pushed.has(event.externalId!)) {
      // A sync that ran between the provider write and storing its id imported a copy; retire it.
      if (existing && !existing.deletedAt) await tx.calendarEvent.update({ where: { id: existing.id }, data: { deletedAt: lastSyncedAt } });
      continue;
    }
    seen.add(syncKey);
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

// A daily repeat can hold a year of occurrences: bound the parallel writes and the time spent,
// and stop after the first failure so an unavailable provider does not hold the request open.
const EVENT_PUSH_CONCURRENCY = 5;
const EVENT_PUSH_BUDGET_MS = 40_000;
const gone = (error: unknown) => [404, 410].includes(Number((error as { status?: number }).status));

/**
 * Writes Nexdo-created events (source 'harbor') to the user's writable calendar, the one tasks use.
 * Each local event is one occurrence, so a repeating series is written as separate provider events.
 * A deleted event is removed from the calendar it was written to. Never throws: a provider failure
 * is logged and reported in the result, and the local events are left as saved.
 */
export async function pushEventToExternal(userId: string, eventIds: string | string[], options: { skipPushed?: boolean } = {}): Promise<CalendarPushResult> {
  const ids = Array.isArray(eventIds) ? eventIds : [eventIds];
  let events;
  let fallback: CalendarConnection | null = null;
  try {
    events = await prisma.calendarEvent.findMany({ where: { userId, id: { in: ids }, source: 'harbor', connectionId: null }, include: { pushedConnection: true }, orderBy: { startAt: 'asc' } });
    if (events.some((event) => !event.pushedConnection && !event.deletedAt)) fallback = await writableConnection(userId);
  } catch (error) {
    log('error', 'calendar.event_push_failed', { stage: 'load', message: error instanceof Error ? error.message : 'unknown' });
    return { status: 'failed', total: ids.length, succeeded: 0 };
  }
  const groups = new Map<string, { connection: CalendarConnection; events: typeof events }>();
  let succeeded = 0; let removed = 0; let failed = 0; let attempted = 0;
  for (const event of events) {
    // An id from a since-disconnected calendar (pushedConnectionId set null) is not reused elsewhere.
    const connection = event.pushedConnection ?? (event.deletedAt ? null : fallback);
    if (!connection) continue;
    attempted += 1;
    if (options.skipPushed && event.pushedConnection && event.pushedExternalId && !event.deletedAt) { succeeded += 1; continue; }
    const group = groups.get(connection.id) ?? { connection, events: [] };
    group.events.push(event);
    groups.set(connection.id, group);
  }
  const deadline = Date.now() + EVENT_PUSH_BUDGET_MS;
  let calendarName = fallback?.calendarName;
  for (const { connection, events: batch } of groups.values()) {
    calendarName ??= connection.calendarName;
    let provider;
    try {
      if (!connection.writeEnabled || connection.status !== 'connected') throw new Error('CALENDAR_WRITE_DISABLED');
      provider = await calendarProviderFor(connection);
    } catch (error) {
      log('warn', 'calendar.event_push_failed', { stage: 'connect', provider: connection.provider, message: error instanceof Error ? error.message : 'unknown' });
      failed += batch.length;
      continue;
    }
    let stopped = false;
    const queue = [...batch];
    const worker = async () => {
      for (let event = queue.shift(); event; event = queue.shift()) {
        if (stopped || Date.now() > deadline) { failed += 1; continue; }
        const externalId = event.pushedConnectionId === connection.id ? event.pushedExternalId ?? undefined : undefined;
        try {
          if (event.deletedAt) {
            try { if (externalId) await provider.remove(externalId); } catch (error) { if (!gone(error)) throw error; }
            await prisma.calendarEvent.updateMany({ where: { id: event.id, userId }, data: { pushedConnectionId: null, pushedExternalId: null } });
            removed += 1;
          } else {
            const write = { title: event.title, notes: event.notes, location: event.location, startAt: event.startAt, endAt: event.endAt };
            let written;
            // Deleted directly in the provider: write it again rather than leave the edit unsynchronized.
            try { written = await provider.upsert({ ...write, externalId }); }
            catch (error) { if (!externalId || !gone(error)) throw error; written = await provider.upsert(write); }
            await prisma.calendarEvent.updateMany({ where: { id: event.id, userId }, data: { pushedConnectionId: connection.id, pushedExternalId: written.externalId } });
          }
          succeeded += 1;
        } catch (error) {
          stopped = true;
          failed += 1;
          log('warn', 'calendar.event_push_failed', { stage: event.deletedAt ? 'remove' : 'upsert', provider: connection.provider, status: (error as { status?: number }).status, message: error instanceof Error ? error.message : 'unknown' });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(EVENT_PUSH_CONCURRENCY, batch.length) }, worker));
  }
  const status = attempted === 0 ? 'not_connected'
    : failed === 0 ? (removed > 0 && removed === succeeded ? 'removed' : 'pushed')
    : succeeded === 0 ? 'failed' : 'partial';
  return { status, total: attempted, succeeded, ...(calendarName ? { calendarName } : {}) };
}
