import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { jsonError } from '@/lib/http';
import { z } from 'zod';

const PREF_KEYS = [
  'workingDays', 'workStart', 'workEnd', 'quietStart', 'quietEnd',
  'defaultDurationMin', 'defaultReminderMinutes', 'confirmationLevel',
  'pushEnabled', 'emailEnabled', 'smsEnabled', 'morningSummary', 'eveningSummary',
  'weeklySummary', 'escalateToEmailMinutes', 'escalateToSmsMinutes',
  'voiceEnabled', 'transcriptRetentionDays', 'audioRetentionHours', 'defaultCalendarId',
  'phoneNumber',
  'personalizationEnabled',
] as const;

const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const minutes = z.number().int().min(0).max(10080);
const phoneNumber = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const raw = value.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!raw.startsWith('+') && digits.length === 10) return `+1${digits}`;
  return raw.startsWith('+') ? `+${digits}` : raw;
}, z.string().regex(/^\+[1-9]\d{7,14}$/).nullable());
const preferenceSchema = z.object({
  workingDays: z.string().regex(/^[0-6](?:,[0-6])*$/), workStart: clock, workEnd: clock, quietStart: clock, quietEnd: clock,
  defaultDurationMin: z.number().int().min(1).max(1440), defaultReminderMinutes: minutes,
  confirmationLevel: z.enum(['ALWAYS', 'CHANGES_AND_DELETES', 'ROUTINE_AUTO']),
  pushEnabled: z.boolean(), emailEnabled: z.boolean(), smsEnabled: z.boolean(), morningSummary: z.boolean(), eveningSummary: z.boolean(), weeklySummary: z.boolean(), voiceEnabled: z.boolean(),
  escalateToEmailMinutes: minutes, escalateToSmsMinutes: minutes,
  transcriptRetentionDays: z.number().int().min(0).max(365), audioRetentionHours: z.number().int().min(0).max(24),
  defaultCalendarId: z.string().min(1).nullable(), phoneNumber, personalizationEnabled: z.boolean(),
}).partial();
const settingsSchema = z.object({
  photo: z.string().max(350000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/).refine((value) => { const bytes = Buffer.from(value.split(",")[1], "base64"); return bytes.length <= 256000 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217; }).nullable().optional(),
  name: z.string().trim().min(1).max(80).refine((name) => !/[\u0000-\u001F\u007F]/.test(name)).optional(),
  timeZone: z.string().trim().refine((zone) => { try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(); return Boolean(zone); } catch { return false; } }).optional(),
  preference: preferenceSchema.optional(),
  nextAction: z.object({ enabled: z.boolean().optional(), switchingThreshold: z.number().int().min(0).max(50).optional() }).optional(),
});

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const parsed = settingsSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Enter valid profile, time zone, working hours, and preference values.' }, { status: 400 });
    const body = parsed.data;
    const savedProfile = await prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(body.nextAction ?? {})) {
        const memoryKey = key === 'enabled' ? 'preference:next_action_enabled' : 'preference:switching_threshold';
        await tx.userMemory.upsert({ where: { userId_key: { userId: user.id, key: memoryKey } }, create: { userId: user.id, key: memoryKey, value: String(value), kind: 'preference', source: 'settings' }, update: { value: String(value), kind: 'preference', source: 'settings' } });
      }
      const prefs = await tx.userPreference.findUniqueOrThrow({ where: { userId: user.id } });
      if ((body.preference?.workEnd ?? prefs.workEnd) <= (body.preference?.workStart ?? prefs.workStart)) throw new Error('INVALID_SETTINGS');
      if (body.preference?.defaultCalendarId && !await tx.calendarConnection.findFirst({ where: { id: body.preference.defaultCalendarId, userId: user.id } })) throw new Error('INVALID_SETTINGS');
      if (body.name !== undefined || body.timeZone !== undefined || body.photo !== undefined) await tx.user.update({ where: { id: user.id }, data: { name: body.name, timeZone: body.timeZone, photo: body.photo } });
      if (body.preference) {
      const data: Record<string, unknown> = {};
      for (const key of PREF_KEYS) {
        if (key in body.preference) data[key] = body.preference[key];
      }
      await tx.userPreference.update({
        where: { userId: user.id },
        data: {
          ...(data as Parameters<typeof prisma.userPreference.update>[0]['data']),
          ...('personalizationEnabled' in data ? { personalizationConsentAt: data.personalizationEnabled === true ? new Date() : null } : {}),
        },
      });
      }
      // Return the persisted photo in the write response so clients do not
      // depend on a second, potentially stale profile read to update avatars.
      return body.photo !== undefined
        ? tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, photo: true } })
        : undefined;
    });
    return NextResponse.json({ ok: true, ...(savedProfile ? { profile: savedProfile } : {}) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof Error && err.message === 'INVALID_SETTINGS') return NextResponse.json({ error: 'Choose valid working hours and a calendar belonging to your account.' }, { status: 400 });
    return jsonError(err);
  }
}
