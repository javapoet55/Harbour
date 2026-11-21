import { NextResponse } from 'next/server';
import { healthRoute } from '@/server/health/telemetry';
import { jsonError } from '@/lib/http';
import { requireUser } from '@/server/auth';
import { reminderHistory } from '@/server/reminder-history';

/** The Reminders tab: every reminder the person set, with how each pop-up, email and call went. */
async function handler() {
  try {
    const user = await requireUser();
    return NextResponse.json({ reminders: await reminderHistory(user.id), timeZone: user.timeZone });
  } catch (error) { return jsonError(error); }
}
export const GET = healthRoute('GET /api/reminders', handler);
