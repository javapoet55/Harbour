import { limitAuthRequest } from '@/server/signup/abuse';
import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { createPasswordReset } from '@/server/account-auth';
import { jsonError } from '@/lib/http';

async function healthHandlerPOST(req: Request) {
  try {
    await limitAuthRequest(req, 'send');
    const body = await req.json().catch(() => ({}));
    const result = await createPasswordReset(String(body.email ?? ''));
    return NextResponse.json({ message: 'A six-digit verification code has been sent to your email.', ...result });
  } catch (error) {
    return jsonError(error);
  }
}

export const POST = healthRoute('POST /api/auth/password-reset/request', healthHandlerPOST);
