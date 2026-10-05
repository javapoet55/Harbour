import { randomBytes } from 'node:crypto';
import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { registerAccount, sendEmailVerification, normalizeEmail, validatePassword, signupProof } from '@/server/account-auth';
import { checkEmail } from '@/server/signup/email-risk';
import { limitAuthRequest, limitCodeSend, securityEvent, verifyBot } from '@/server/signup/abuse';
import { jsonError } from '@/lib/http';

async function healthHandlerPOST(req: Request) {
  try {
    await limitAuthRequest(req, 'signup');
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(String(body.email ?? ''));
    validatePassword(String(body.password ?? ''));
    securityEvent('signup_started', email);
    await verifyBot(body.turnstileToken);
    const risk = await checkEmail(email);
    if (risk.decision === 'REJECT') { securityEvent('signup_email_risk_rejected', email); throw new Error(risk.reasonCodes[0]); }
    await limitCodeSend(email, 'verify');
    let user;
    try { user = await registerAccount({ name: String(body.name ?? ''), email, password: String(body.password ?? '') }); }
    catch (e) {
      if (!(e instanceof Error) || e.message !== 'ACCOUNT_EXISTS') throw e;
      // Same body/status as a new account. Never replace the existing password or return its profile.

    }
    let developmentCode: string | undefined;
    if (user) {
      try { developmentCode = (await sendEmailVerification(user, true)).developmentCode; }
      catch { securityEvent('signup_verification_delivery_deferred', email); }
    }
    return NextResponse.json({ email, verificationProof: user ? signupProof(user) : randomBytes(32).toString('hex'), emailVerificationRequired: true, emailSent: true,
      message: 'If your account needs verification, check your inbox. You can also sign in or reset your password.',
      ...(developmentCode ? { developmentCode } : {}),
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return jsonError(error); }
}
export const POST = healthRoute('POST /api/auth/register', healthHandlerPOST);
