import { prisma } from '@/server/db';

export const VOICE_MONTHLY_LIMIT_MINUTES = 100;
const maxSessionSeconds = 4 * 60 * 60;

export function voiceUsageMonth(timeZone: string, date = new Date()) {
  const values = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit' })
    .formatToParts(date).reduce<Record<string, string>>((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${values.year}-${values.month}`;
}

export function normalizeVoiceSeconds(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(0, Math.min(maxSessionSeconds, Math.round(seconds))) : 0;
}

function receipt(month: string, seconds: number, asOf = new Date()) {
  const limitSeconds = VOICE_MONTHLY_LIMIT_MINUTES * 60;
  return { month, usedSeconds: seconds, limitMinutes: VOICE_MONTHLY_LIMIT_MINUTES, remainingSeconds: Math.max(0, limitSeconds - seconds), asOf: asOf.toISOString() };
}

export async function currentVoiceUsage(userId: string, timeZone: string, now = new Date()) {
  const month = voiceUsageMonth(timeZone, now);
  const rows = await prisma.userMemory.findMany({ where: { userId, kind: 'voice_usage', key: { startsWith: `voice-usage:${month}:` } }, select: { value: true } });
  return receipt(month, rows.reduce((total, row) => total + normalizeVoiceSeconds(row.value), 0), now);
}

export async function recordVoiceUsage(userId: string, timeZone: string, sessionId: string, durationSeconds: unknown, now = new Date()) {
  const month = voiceUsageMonth(timeZone, now);
  const key = `voice-usage:${month}:${sessionId}`;
  const seconds = normalizeVoiceSeconds(durationSeconds);
  const prior = await prisma.userMemory.findUnique({ where: { userId_key: { userId, key } }, select: { value: true } });
  const value = String(Math.max(seconds, normalizeVoiceSeconds(prior?.value)));
  await prisma.userMemory.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, value, kind: 'voice_usage', source: 'ios-realtime' },
    update: { value, kind: 'voice_usage', source: 'ios-realtime' },
  });
  return currentVoiceUsage(userId, timeZone, now);
}
