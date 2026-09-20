import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { resetPassword } from '@/server/account-auth';
import { jsonError } from '@/lib/http';

async function healthHandlerPOST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    await resetPassword({ email: String(body.email ?? ''), code: String(body.code ?? ''), password: String(body.password ?? '') });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export const POST = healthRoute('POST /api/auth/password-reset/confirm', healthHandlerPOST);
