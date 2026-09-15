import { NextResponse } from 'next/server';
import { registerAccount, sendEmailVerification } from '@/server/account-auth';
import { jsonError } from '@/lib/http';
import { log } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const user = await registerAccount({ name: String(body.name ?? ''), email: String(body.email ?? ''), password: String(body.password ?? '') });
    let verification: { delivered: boolean; developmentCode?: string } = { delivered: false };
    try {
      verification = await sendEmailVerification(user);
    } catch (error) {
      // The account exists either way; the verify screen lets the person request a new code.
      log('warn', 'auth.verification_email_failed', { reason: error instanceof Error ? error.message : 'unknown' });
    }
    // No session until the emailed code is verified. Verifying signs the person in.
    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerificationRequired: true,
      emailSent: verification.delivered,
      ...(verification.developmentCode ? { developmentCode: verification.developmentCode } : {}),
    }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
