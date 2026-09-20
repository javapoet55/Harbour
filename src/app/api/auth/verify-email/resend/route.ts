import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { requestEmailVerification } from '@/server/account-auth';
import { jsonError } from '@/lib/http';

async function healthHandlerPOST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await requestEmailVerification(String(body.email ?? ''));
    return NextResponse.json({ message: 'If that account still needs verification, a new six-digit code has been sent. It expires in 24 hours.', ...result });
  } catch (error) {
    return jsonError(error);
  }
}

export const POST = healthRoute('POST /api/auth/verify-email/resend', healthHandlerPOST);
