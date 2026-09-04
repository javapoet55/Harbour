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
] as const;

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    if (typeof body.timeZone === 'string' && body.timeZone.trim()) {
      await prisma.user.update({ where: { id: user.id }, data: { timeZone: body.timeZone.trim() } });
    }
    if (body.preference && typeof body.preference === 'object') {
      const data: Record<string, unknown> = {};
      for (const key of PREF_KEYS) {
        if (key in body.preference) data[key] = body.preference[key];
      }
      await prisma.userPreference.update({
        where: { userId: user.id },
        data: data as Parameters<typeof prisma.userPreference.update>[0]['data'],
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
