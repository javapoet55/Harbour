import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { smsProvider } from '@/providers';
import { DEFAULT_VOICE, isRealtimeVoice, NO_ANSWER_POLICIES, nutritionCallConfig, REALTIME_VOICES } from './config';
import { NutritionError } from './errors';
import { isLocalTime, isTimeZone } from './time';
import { placeCodeCall } from './twilio';

const CODE_TTL_MS = 10 * 60_000;
const RESEND_MS = 60_000;
const MAX_CODE_ATTEMPTS = 5;
export const E164 = /^\+[1-9]\d{7,14}$/;

type SettingsRow = NonNullable<Awaited<ReturnType<typeof prisma.nutritionCallSettings.findUnique>>>;

export function publicSettings(row: SettingsRow | null, fallbackTimeZone: string) {
  return {
    enabled: row?.enabled ?? false,
    phone: row?.phoneE164 ?? null,
    phoneVerified: !!row?.phoneVerifiedAt,
    localTime: row?.localTime ?? '20:00',
    timeZone: row?.timeZone ?? fallbackTimeZone,
    repeatDaily: row?.repeatDaily ?? true,
    noAnswer: row?.noAnswer ?? 'NOTIFY',
    voice: row?.voice ?? DEFAULT_VOICE,
    calorieGoal: row?.calorieGoal ?? 2000,
    goals: row?.goalsJson ? JSON.parse(row.goalsJson) as Record<string, number> : null,
    insightsEnabled: row?.insightsEnabled ?? true,
    voices: REALTIME_VOICES,
  };
}

export async function readSettings(userId: string, fallbackTimeZone: string) {
  return publicSettings(await prisma.nutritionCallSettings.findUnique({ where: { userId } }), fallbackTimeZone);
}

export const settingsInput = z.object({
  enabled: z.boolean().optional(),
  localTime: z.string().refine(isLocalTime).optional(),
  timeZone: z.string().refine(isTimeZone).optional(),
  repeatDaily: z.boolean().optional(),
  noAnswer: z.enum(NO_ANSWER_POLICIES).optional(),
  voice: z.string().refine(isRealtimeVoice).optional(),
  calorieGoal: z.number().int().min(500).max(5000).optional(),
  goals: z.record(z.string().max(40), z.number().min(0).max(10000)).refine(g => Object.keys(g).length <= 20).optional(),
  insightsEnabled: z.boolean().optional(),
}).strict();

export async function updateSettings(userId: string, fallbackTimeZone: string, raw: unknown) {
  const input = settingsInput.parse(raw);
  const existing = await prisma.nutritionCallSettings.findUnique({ where: { userId } });
  if (input.enabled && !existing?.phoneVerifiedAt) throw new NutritionError('PHONE_NOT_VERIFIED');
  const data = {
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.enabled && !existing?.consentAt ? { consentAt: new Date() } : {}),
    ...(input.localTime ? { localTime: input.localTime } : {}),
    ...(input.timeZone ? { timeZone: input.timeZone } : {}),
    ...(input.repeatDaily !== undefined ? { repeatDaily: input.repeatDaily } : {}),
    ...(input.noAnswer ? { noAnswer: input.noAnswer } : {}),
    ...(input.voice ? { voice: input.voice } : {}),
    ...(input.calorieGoal ? { calorieGoal: input.calorieGoal } : {}),
    ...(input.goals ? { goalsJson: JSON.stringify(input.goals) } : {}),
    ...(input.insightsEnabled !== undefined ? { insightsEnabled: input.insightsEnabled } : {}),
  };
  const row = await prisma.nutritionCallSettings.upsert({
    where: { userId },
    create: { userId, timeZone: input.timeZone ?? fallbackTimeZone, ...data },
    update: data,
  });
  return publicSettings(row, fallbackTimeZone);
}

export const codeChannel = () => (process.env.NUTRITION_PHONE_CODE_CHANNEL === 'sms' ? 'sms' : 'voice');

const hashCode = (userId: string, code: string) => createHash('sha256').update(`nutrition-phone:${userId}:${code}`).digest('hex');

/**
 * Sends a 6-digit code. By default it is read aloud in a short phone call from the voice number
 * (NUTRITION_PHONE_CODE_CHANNEL=voice), because the number is not registered for SMS; set it to
 * "sms" once A2P messaging is approved. Changing the number turns calls off until it is verified.
 */
export async function startPhoneVerification(userId: string, fallbackTimeZone: string, phone: unknown, now = new Date()) {
  if (typeof phone !== 'string' || !E164.test(phone.trim())) throw new NutritionError('INVALID_PHONE');
  const phoneE164 = phone.trim();
  const existing = await prisma.nutritionCallSettings.findUnique({ where: { userId } });
  if (existing?.phoneCodeSentAt && now.getTime() - existing.phoneCodeSentAt.getTime() < RESEND_MS) throw new NutritionError('CODE_THROTTLED');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const data = {
    phoneE164, phoneVerifiedAt: null, enabled: false,
    phoneCodeHash: hashCode(userId, code), phoneCodeExpiresAt: new Date(now.getTime() + CODE_TTL_MS), phoneCodeAttempts: 0, phoneCodeSentAt: now,
  };
  await prisma.nutritionCallSettings.upsert({ where: { userId }, create: { userId, timeZone: fallbackTimeZone, ...data }, update: data });
  if (codeChannel() === 'voice') {
    const { twilio } = nutritionCallConfig();
    if (!twilio.accountSid || !twilio.authToken || !twilio.from) throw new NutritionError('CODE_UNAVAILABLE');
    const call = await placeCodeCall({ accountSid: twilio.accountSid, authToken: twilio.authToken, from: twilio.from, to: phoneE164, code });
    if ('error' in call) throw new NutritionError('CODE_UNAVAILABLE');
    return { sent: true, channel: 'voice' as const };
  }
  const sent = await smsProvider.send({ to: phoneE164, text: `Your NexDo check-in code is ${code}. It expires in 10 minutes.` });
  if (sent.status !== 'SENT') throw new NutritionError('CODE_UNAVAILABLE');
  return { sent: true, channel: 'sms' as const };
}

export async function verifyPhone(userId: string, fallbackTimeZone: string, code: unknown, now = new Date()) {
  const row = await prisma.nutritionCallSettings.findUnique({ where: { userId } });
  if (typeof code !== 'string' || !/^\d{6}$/.test(code) || !row?.phoneCodeHash || !row.phoneCodeExpiresAt
    || row.phoneCodeExpiresAt < now || row.phoneCodeAttempts >= MAX_CODE_ATTEMPTS) throw new NutritionError('INVALID_CODE');
  const expected = Buffer.from(row.phoneCodeHash), supplied = Buffer.from(hashCode(userId, code));
  if (!timingSafeEqual(expected, supplied)) {
    await prisma.nutritionCallSettings.update({ where: { userId }, data: { phoneCodeAttempts: { increment: 1 } } });
    throw new NutritionError('INVALID_CODE');
  }
  const updated = await prisma.nutritionCallSettings.update({
    where: { userId },
    data: { phoneVerifiedAt: now, phoneCodeHash: null, phoneCodeExpiresAt: null, phoneCodeAttempts: 0 },
  });
  return publicSettings(updated, fallbackTimeZone);
}
