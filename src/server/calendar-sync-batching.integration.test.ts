import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from './db';
import { SYNC_WRITE_BATCH, syncConnection } from './calendar-sync';
import { encryptCredential } from '@/lib/credentials';

// The real Google provider runs; only the network is stubbed. Every transaction the sync opens goes
// through a spy that counts the calendar rows it writes: a transaction's run time grows with that count,
// so no transaction may write more than one batch however large the calendar. (Writing a whole
// 2,000-event calendar in one transaction is what ran past Prisma's 5-second timeout in production.)
let userId = '';
let listings: Array<{ items: object[]; token: string }> = [];
let listed: string[] = [];
let onListed: (() => Promise<void>) | undefined;
let onWrite: (() => void) | undefined;
let afterTransaction: (() => Promise<void>) | undefined;
let transactions = 0;
let largestTransaction = 0;
let timeouts: unknown[] = [];

const start = new Date(Date.now() + 86400000);
const items = (count: number, title = 'Event') => Array.from({ length: count }, (_, i) => ({
  id: `event-${i}`, summary: `${title} ${i}`,
  start: { dateTime: new Date(+start + i * 3600000).toISOString() }, end: { dateTime: new Date(+start + i * 3600000 + 1800000).toISOString() },
}));
const realTransaction = prisma.$transaction;

function counted<T extends object>(tx: T): T {
  let writes = 0;
  return new Proxy(tx, { get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (prop !== 'calendarEvent') return value;
    return new Proxy(value as Record<string | symbol, unknown>, { get(model, name) {
      const method = model[name];
      return typeof method === 'function' ? async (...args: unknown[]) => {
        largestTransaction = Math.max(largestTransaction, ++writes);
        onWrite?.();
        return (method as (...a: unknown[]) => unknown).apply(model, args);
      } : method;
    } });
  } });
}

beforeEach(async () => {
  vi.stubEnv('HARBOR_CREDENTIAL_ENCRYPTION_KEY', 'b'.repeat(64));
  userId = (await prisma.user.create({ data: { email: `${randomUUID()}@calendar-batching.test`, passwordHash: '', name: 'Calendar batching' } })).id;
  listings = []; listed = []; onListed = undefined; onWrite = undefined; afterTransaction = undefined; transactions = 0; largestTransaction = 0; timeouts = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (!url.startsWith('https://www.googleapis.com/calendar/v3/')) throw new Error(`Unexpected request ${url}`);
    listed.push(new URL(url).searchParams.get('syncToken') ?? '');
    const listing = listings.shift();
    if (!listing) throw new Error('No listing queued');
    await onListed?.();
    return Response.json({ timeZone: 'UTC', items: listing.items, nextSyncToken: listing.token });
  }));
  const transaction = realTransaction.bind(prisma) as (fn: (tx: object) => Promise<unknown>, options?: object) => Promise<unknown>;
  prisma.$transaction = (async (fn: (tx: object) => Promise<unknown>, options?: object) => {
    transactions += 1;
    timeouts.push((options as { timeout?: number } | undefined)?.timeout);
    const result = await transaction((tx) => fn(counted(tx)), options);
    const next = afterTransaction; afterTransaction = undefined;
    await next?.();
    return result;
  }) as never;
});
afterEach(async () => {
  prisma.$transaction = realTransaction; vi.unstubAllGlobals(); vi.unstubAllEnvs();
  await prisma.user.delete({ where: { id: userId } });
});

async function google() {
  return prisma.calendarConnection.create({ data: {
    userId, provider: 'google', calendarId: randomUUID(), calendarName: 'Work', accountEmail: 'owner@calendar-batching.test',
    accessToken: encryptCredential('fixture-only-token'), tokenExpiresAt: new Date(Date.now() + 3600000),
  } });
}
const saved = (id: string) => prisma.calendarConnection.findUniqueOrThrow({ where: { id } });
const live = () => prisma.calendarEvent.findMany({ where: { userId, deletedAt: null }, orderBy: { externalId: 'asc' } });

describe('calendar sync writes', () => {
  it('syncs a 2,000-event calendar in bounded transactions', async () => {
    const connection = await google();
    listings = [{ items: items(2000), token: 'token-1' }];
    await expect(syncConnection(userId, connection.id)).resolves.toMatchObject({ created: 2000, updated: 0, deleted: 0 });
    expect(await prisma.calendarEvent.count({ where: { userId, deletedAt: null } })).toBe(2000);
    expect(transactions).toBe(2000 / SYNC_WRITE_BATCH);
    expect(largestTransaction).toBe(SYNC_WRITE_BATCH);
    expect(timeouts.every((timeout) => typeof timeout === 'number' && timeout > 5_000)).toBe(true);
    expect((await saved(connection.id)).syncToken).toBe('token-1');
    // A later full snapshot that drops most of the calendar retires them in batches too.
    await prisma.calendarConnection.update({ where: { id: connection.id }, data: { syncToken: null } });
    listings = [{ items: items(10), token: 'token-2' }];
    await expect(syncConnection(userId, connection.id)).resolves.toMatchObject({ created: 0, updated: 10, deleted: 1990 });
    expect(await prisma.calendarEvent.count({ where: { userId, deletedAt: null } })).toBe(10);
    expect(largestTransaction).toBe(SYNC_WRITE_BATCH);
  }, 60_000);

  it('leaves the sync token and last-synced time alone when a write fails, and the next run succeeds', async () => {
    const connection = await google();
    listings = [{ items: items(5), token: 'token-1' }];
    await syncConnection(userId, connection.id);
    const before = await saved(connection.id);
    listings = [{ items: items(250, 'Changed'), token: 'token-2' }];
    // The 150th row, in the second batch, fails.
    let writes = 0;
    onWrite = () => { if (++writes === SYNC_WRITE_BATCH + 50) throw new Error('database went away'); };
    await expect(syncConnection(userId, connection.id)).rejects.toThrow('database went away');
    const after = await saved(connection.id);
    expect(after.syncToken).toBe('token-1');
    expect(after.lastSyncedAt).toEqual(before.lastSyncedAt);
    expect(after.status).toBe('connected');
    // The first batch was written before the failure; the failed batch rolled back.
    expect(await prisma.calendarEvent.count({ where: { userId } })).toBe(SYNC_WRITE_BATCH);
    onWrite = undefined;
    listings = [{ items: items(250, 'Changed'), token: 'token-2' }];
    await expect(syncConnection(userId, connection.id)).resolves.toMatchObject({ created: 150, updated: 100 });
    expect(listed).toEqual(['', 'token-1', 'token-1']);
    expect((await saved(connection.id)).syncToken).toBe('token-2');
    expect((await live()).every((event) => event.title.startsWith('Changed'))).toBe(true);
    expect(await prisma.calendarEvent.count({ where: { userId, deletedAt: null } })).toBe(250);
  });

  it('lets only one of two simultaneous syncs of a connection write', async () => {
    const connection = await google();
    listings = [{ items: items(150, 'First'), token: 'token-a' }, { items: items(150, 'Second'), token: 'token-b' }];
    // Both have read the connection and listed the calendar before either claims it.
    let arrived = 0; let release!: () => void;
    const bothListed = new Promise<void>((resolve) => { release = resolve; });
    onListed = async () => { if (++arrived === 2) release(); await bothListed; };
    const results = await Promise.allSettled([syncConnection(userId, connection.id), syncConnection(userId, connection.id)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.message).toBe('CALENDAR_SYNC_STALE');
    // Listings go to whichever request reaches the network first, not to the first call, so the stored
    // rows name the winner; the rows and the sync token must both come from that one listing.
    const events = await live();
    expect(events).toHaveLength(150);
    const winner = events[0].title.split(' ')[0];
    expect(['First', 'Second']).toContain(winner);
    expect(events.every((event) => event.title.startsWith(`${winner} `))).toBe(true);
    expect((await saved(connection.id)).syncToken).toBe(winner === 'First' ? 'token-a' : 'token-b');
  });

  it('stops a sync part way when a newer sync claims the connection', async () => {
    const connection = await google();
    listings = [{ items: items(250, 'Older'), token: 'token-older' }, { items: items(250, 'Newer'), token: 'token-newer' }];
    let newer: Promise<unknown> | undefined;
    afterTransaction = async () => { newer = syncConnection(userId, connection.id); await newer; };
    await expect(syncConnection(userId, connection.id)).rejects.toThrow('CALENDAR_SYNC_STALE');
    await expect(newer).resolves.toMatchObject({ updated: SYNC_WRITE_BATCH, created: 250 - SYNC_WRITE_BATCH });
    const events = await live();
    expect(events).toHaveLength(250);
    expect(events.every((event) => event.title.startsWith('Newer'))).toBe(true);
    expect((await saved(connection.id)).syncToken).toBe('token-newer');
  });

  it('keeps a small sync the same: counts, tombstones, token and status', async () => {
    const connection = await google();
    await prisma.calendarConnection.update({ where: { id: connection.id }, data: { status: 'error' } });
    listings = [{ items: items(2), token: 'token-1' }];
    const first = await syncConnection(userId, connection.id);
    expect(first).toMatchObject({ created: 2, updated: 0, deleted: 0 });
    expect(transactions).toBe(1);
    expect(await saved(connection.id)).toMatchObject({ syncToken: 'token-1', status: 'connected', lastSyncedAt: first.lastSyncedAt });
    listings = [{ items: [{ ...items(1, 'Renamed')[0] }, { id: 'event-1', status: 'cancelled' }], token: 'token-2' }];
    await expect(syncConnection(userId, connection.id)).resolves.toMatchObject({ created: 0, updated: 1, deleted: 1 });
    expect(listed).toEqual(['', 'token-1']);
    expect((await live()).map((event) => event.title)).toEqual(['Renamed 0']);
    expect((await saved(connection.id)).syncToken).toBe('token-2');
  });
});
