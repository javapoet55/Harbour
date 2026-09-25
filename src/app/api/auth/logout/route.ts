import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { clearSession } from '@/server/session';

async function healthHandlerPOST() {
  await clearSession();
  return NextResponse.json({ ok: true });
}

export const POST = healthRoute('POST /api/auth/logout', healthHandlerPOST);
