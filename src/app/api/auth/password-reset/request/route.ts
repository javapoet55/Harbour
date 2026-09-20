import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { createPasswordReset } from '@/server/account-auth';
import { jsonError } from '@/lib/http';

async function healthHandlerPOST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await createPasswordReset(String(body.email ?? ''));
    return NextResponse.json({ message: 'If that account exists, a six-digit code has been sent.', ...result });
  } catch (error) {
    return jsonError(error);
  }
}

export const POST = healthRoute('POST /api/auth/password-reset/request', healthHandlerPOST);
