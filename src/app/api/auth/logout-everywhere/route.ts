import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { healthRoute } from '@/server/health/telemetry';
import { clearSession } from '@/server/session';
import { revokeAllSessions } from '@/server/session-store';
import { jsonError } from '@/lib/http';

/** "Sign out everywhere": ends every session of this account, on every browser and app, including this one. */
async function logoutEverywhere() {
  try {
    const user = await requireUser();
    await revokeAllSessions(user.id);
    await clearSession();
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return jsonError(error); }
}

export const POST = healthRoute('POST /api/auth/logout-everywhere', logoutEverywhere);
