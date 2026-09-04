import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { jsonError } from '@/lib/http';

const PREF_KEYS = [
  'workingDays', 'workStart', 'workEnd', 'quietStart', 'quietEnd',
  'defaultDurationMin', 'defaultReminderMinutes', 'confirmationLevel',
  'pushEnabled', 'emailEnabled', 'smsEnabled', 'morningSummary', 'eveningSummary',
  'weeklySummary', 'escalateToEmailMinutes', 'escalateToSmsMinutes',
  'voiceEnabled', 'transcriptRetentionDays', 'audioRetentionHours', 'defaultCalendarId',
  'phoneNumber',
  'personalizationEnabled',
] as const;

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    if (typeof body.timeZone === 'string' && body.timeZone.trim()) {
      await prisma.user.update({ where: { id: user.id }, data: { timeZone: body.timeZone.trim() } });
    }
    if (body.preference && typeof body.preference === 'object') {
      if (body.preference.phoneNumber && !/^\+[1-9]\d{7,14}$/.test(String(body.preference.phoneNumber))) {
        return NextResponse.json({ error: 'SMS phone number must use E.164 format, for example +15551234567.' }, { status: 400 });
      }
      const data: Record<string, unknown> = {};
      for (const key of PREF_KEYS) {
        if (key in body.preference) data[key] = body.preference[key];
      }
      await prisma.userPreference.update({
        where: { userId: user.id },
        data: {
          ...(data as Parameters<typeof prisma.userPreference.update>[0]['data']),
          ...('personalizationEnabled' in data ? { personalizationConsentAt: data.personalizationEnabled === true ? new Date() : null } : {}),
        },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
