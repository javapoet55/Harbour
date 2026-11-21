import { NextResponse } from 'next/server';
import { healthRoute } from '@/server/health/telemetry';
import { cronAuthorized } from '@/server/nutrition/auth';
import { reminderCallsConfig, runReminderCallTick } from '@/server/reminder-calls';

/** Minute tick from the call worker: places the reminder calls that have come due. */
async function handler(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!reminderCallsConfig().available) return NextResponse.json({ error: 'Reminder calls disabled' }, { status: 503 });
  return NextResponse.json(await runReminderCallTick());
}
export const POST = healthRoute('POST /api/reminder-calls/tick', handler);
