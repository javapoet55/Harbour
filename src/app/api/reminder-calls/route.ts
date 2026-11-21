import { NextResponse } from 'next/server';
import { healthRoute } from '@/server/health/telemetry';
import { jsonError } from '@/lib/http';
import { requireUser } from '@/server/auth';
import { reminderCallSetup } from '@/server/reminder-calls';

/** Whether reminder calls can be offered, and the number Nexdo would call. */
async function handler() {
  try {
    const user = await requireUser();
    return NextResponse.json(await reminderCallSetup(user.id));
  } catch (error) { return jsonError(error); }
}
export const GET = healthRoute('GET /api/reminder-calls', handler);
