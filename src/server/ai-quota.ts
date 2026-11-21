import { prisma } from '@/server/db';
import { log } from '@/lib/logger';
import { AI_FEATURE_LABELS, aiQuotaBody } from '@/lib/ai-quota-message';

/**
 * Daily quota for each signed-in AI feature: every account gets AI_DAILY_LIMIT uses (default 10) of each
 * feature per day, counted in the account's own time zone and reset at its local midnight. Counts live in
 * the database, so every server instance shares them and a restart does not reset them.
 */
export const AI_FEATURES = {
  assistant: 1, voice_tasks: 1, live_transcription: 1, dictation: 1, spoken_replies: 1,
  shopping_photo: 1, shopping_image: 1, shopping_suggestions: 1, shopping_alternatives: 1,
  greeting_wish: 1, greeting_art: 1, checkin_call: 1, support_ticket: 1,
} as const;
export type AiFeature = keyof typeof AI_FEATURES;

export function aiDailyLimit() {
  const value = Number(process.env.AI_DAILY_LIMIT ?? '10');
  return Number.isInteger(value) && value > 0 ? value : 10;
}

/** The account's local calendar day, and the instant its next local midnight begins. */
export function quotaDay(timeZone: string, now = new Date()) {
  const zone = (() => { try { new Intl.DateTimeFormat('en-US', { timeZone }); return timeZone; } catch { return 'UTC'; } })();
  const parts = (at: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(at).map((p) => [p.type, p.value]));
  const p = parts(now);
  const day = `${p.year}-${p.month}-${p.day}`;
  // Seconds left until local midnight; a DST change on that night shifts it by at most an hour.
  const elapsed = Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second);
  const resetsAt = new Date(Math.floor(now.getTime() / 1000) * 1000 + (86_400 - elapsed) * 1000);
  return { day, resetsAt };
}

export class AiQuotaError extends Error {
  constructor(readonly feature: AiFeature, readonly limit: number, readonly resetsAt: Date) { super('AI_DAILY_LIMIT_REACHED'); }
}

/**
 * Takes one use of a feature for today, atomically. Throws AiQuotaError once the day's uses are spent.
 * If the quota store cannot be reached the request is refused rather than allowed (fail closed).
 */
export async function takeAiQuota(user: { id: string; timeZone?: string | null }, feature: AiFeature, now = new Date()) {
  const limit = aiDailyLimit();
  const { day, resetsAt } = quotaDay(user.timeZone || 'UTC', now);
  const where = { userId_feature_day: { userId: user.id, feature, day } };
  let taken: number;
  try {
    taken = await prisma.$transaction(async (tx) => {
      await tx.aiDailyUsage.upsert({ where, create: { userId: user.id, feature, day, count: 0 }, update: {} });
      return (await tx.aiDailyUsage.updateMany({ where: { userId: user.id, feature, day, count: { lt: limit } }, data: { count: { increment: 1 } } })).count;
    });
  } catch (error) {
    log('warn', 'ai_quota.store_unavailable', { feature });
    throw new Error('AI_QUOTA_UNAVAILABLE', { cause: error });
  }
  if (!taken) {
    log('info', 'ai_quota.limit_reached', { feature });
    throw new AiQuotaError(feature, limit, resetsAt);
  }
  return { day, limit };
}

/** Gives a use back when the AI provider failed, so a person is not charged for an answer they never got. */
export async function refundAiQuota(user: { id: string; timeZone?: string | null }, feature: AiFeature, now = new Date()) {
  const { day } = quotaDay(user.timeZone || 'UTC', now);
  await prisma.aiDailyUsage.updateMany({ where: { userId: user.id, feature, day, count: { gt: 0 } }, data: { count: { decrement: 1 } } }).catch(() => undefined);
}

/** Today's remaining uses of every feature, for display. */
export async function aiQuotaStatus(user: { id: string; timeZone?: string | null }, now = new Date()) {
  const limit = aiDailyLimit();
  const { day, resetsAt } = quotaDay(user.timeZone || 'UTC', now);
  const rows = await prisma.aiDailyUsage.findMany({ where: { userId: user.id, day }, select: { feature: true, count: true } });
  const used = new Map(rows.map((r) => [r.feature, r.count]));
  return {
    day, limit, resetsAt: resetsAt.toISOString(),
    features: (Object.keys(AI_FEATURES) as AiFeature[]).map((feature) => ({ feature, label: AI_FEATURE_LABELS[feature], used: used.get(feature) ?? 0, remaining: Math.max(0, limit - (used.get(feature) ?? 0)) })),
  };
}

/** The 429 every AI endpoint returns when a feature's daily uses are spent. */
export function aiQuotaResponse(error: AiQuotaError) {
  return Response.json(aiQuotaBody(error), {
    status: 429,
    headers: { 'Cache-Control': 'private, no-store', 'Retry-After': String(Math.max(1, Math.ceil((error.resetsAt.getTime() - Date.now()) / 1000))) },
  });
}
