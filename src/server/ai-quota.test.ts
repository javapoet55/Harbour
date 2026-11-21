import { beforeEach, describe, expect, it, vi } from 'vitest';

// A tiny stand-in for the AiDailyUsage table with the same atomic rules as the real queries.
const store = vi.hoisted(() => ({ rows: new Map<string, number>(), down: false }));
const key = (w: { userId: string; feature: string; day: string }) => `${w.userId}|${w.feature}|${w.day}`;
vi.mock('@/server/db', () => {
  const aiDailyUsage = {
    upsert: vi.fn(async ({ where }: { where: { userId_feature_day: { userId: string; feature: string; day: string } } }) => {
      if (store.down) throw new Error('db down');
      const k = key(where.userId_feature_day); if (!store.rows.has(k)) store.rows.set(k, 0);
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { userId: string; feature: string; day: string; count: { lt?: number; gt?: number } }; data: { count: { increment?: number; decrement?: number } } }) => {
      const k = key(where); const n = store.rows.get(k);
      if (n === undefined) return { count: 0 };
      if (where.count.lt !== undefined && !(n < where.count.lt)) return { count: 0 };
      if (where.count.gt !== undefined && !(n > where.count.gt)) return { count: 0 };
      store.rows.set(k, n + (data.count.increment ?? 0) - (data.count.decrement ?? 0)); return { count: 1 };
    }),
    findMany: vi.fn(async ({ where }: { where: { userId: string; day: string } }) => [...store.rows].filter(([k]) => k.startsWith(`${where.userId}|`) && k.endsWith(`|${where.day}`)).map(([k, count]) => ({ feature: k.split('|')[1], count }))),
  };
  return { prisma: { aiDailyUsage, $transaction: async (fn: (tx: unknown) => unknown) => fn({ aiDailyUsage }) } };
});
import { AiQuotaError, aiQuotaStatus, quotaDay, refundAiQuota, takeAiQuota } from './ai-quota';
import { jsonError } from '@/lib/http';

const user = { id: 'u1', timeZone: 'America/Los_Angeles' };
const NOON = new Date('2026-11-21T20:00:00Z'); // 12:00 PM in Los Angeles

beforeEach(() => { store.rows.clear(); store.down = false; delete process.env.AI_DAILY_LIMIT; });

describe('daily AI quota', () => {
  it('allows 10 uses of a feature per local day, then refuses with the reset time', async () => {
    for (let i = 0; i < 10; i++) await takeAiQuota(user, 'assistant', NOON);
    const refused = await takeAiQuota(user, 'assistant', NOON).catch((e) => e);
    expect(refused).toBeInstanceOf(AiQuotaError);
    expect(refused.resetsAt.toISOString()).toBe('2026-11-22T08:00:00.000Z'); // midnight in Los Angeles
    const response = jsonError(refused);
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: 'AI_DAILY_LIMIT_REACHED', feature: 'assistant', limit: 10 });
  });
  it('counts each feature and each person separately', async () => {
    for (let i = 0; i < 10; i++) await takeAiQuota(user, 'assistant', NOON);
    await expect(takeAiQuota(user, 'spoken_replies', NOON)).resolves.toBeTruthy();
    await expect(takeAiQuota({ id: 'u2', timeZone: 'UTC' }, 'assistant', NOON)).resolves.toBeTruthy();
  });
  it('starts again after local midnight', async () => {
    for (let i = 0; i < 10; i++) await takeAiQuota(user, 'assistant', NOON);
    await expect(takeAiQuota(user, 'assistant', new Date('2026-11-22T08:00:01Z'))).resolves.toMatchObject({ day: '2026-11-22' });
  });
  it('gives a use back when the provider failed', async () => {
    for (let i = 0; i < 10; i++) await takeAiQuota(user, 'dictation', NOON);
    await refundAiQuota(user, 'dictation', NOON);
    await expect(takeAiQuota(user, 'dictation', NOON)).resolves.toBeTruthy();
  });
  it('refuses rather than allows when the count cannot be stored', async () => {
    store.down = true;
    const error = await takeAiQuota(user, 'assistant', NOON).catch((e) => e);
    expect(error.message).toBe('AI_QUOTA_UNAVAILABLE');
    expect(jsonError(error).status).toBe(503);
  });
  it('honours AI_DAILY_LIMIT and reports what is left', async () => {
    process.env.AI_DAILY_LIMIT = '3';
    for (let i = 0; i < 3; i++) await takeAiQuota(user, 'greeting_art', NOON);
    await expect(takeAiQuota(user, 'greeting_art', NOON)).rejects.toBeInstanceOf(AiQuotaError);
    const status = await aiQuotaStatus(user, NOON);
    expect(status.features.find((f) => f.feature === 'greeting_art')).toMatchObject({ used: 3, remaining: 0 });
    expect(status.features.find((f) => f.feature === 'assistant')).toMatchObject({ used: 0, remaining: 3 });
  });
  it('works out the local day and midnight, including bad time zones', () => {
    expect(quotaDay('Asia/Kolkata', NOON)).toEqual({ day: '2026-11-22', resetsAt: new Date('2026-11-22T18:30:00Z') });
    expect(quotaDay('Not/AZone', NOON).day).toBe('2026-11-21');
  });
});
