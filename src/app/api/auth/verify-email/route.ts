import { limitAuthRequest } from '@/server/signup/abuse';
import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { verifyEmail } from '@/server/account-auth';
import { writeSession } from '@/server/session';
import { jsonError } from '@/lib/http';

async function healthHandlerPOST(req: Request) {
  try {
    await limitAuthRequest(req, 'verify');
    const body = await req.json().catch(() => ({}));
    const user = await verifyEmail(String(body.email ?? ''), String(body.code ?? ''), String(body.verificationProof ?? ''));
    await writeSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export const POST = healthRoute('POST /api/auth/verify-email', healthHandlerPOST);
