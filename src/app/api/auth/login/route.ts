import { phonePlatform } from '@/server/account-device';
import { prisma } from '@/server/db';
import { signupProof } from '@/server/account-auth';
import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { login } from '@/server/auth';
import { writeSession } from '@/server/session';
import { jsonError } from '@/lib/http';
import { isAdminEmail } from '@/server/admin-auth';
import { clearLoginFailures, limitLogin } from '@/server/signup/abuse';

async function healthHandlerPOST(req: Request) {
  try {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '');
  // Count the attempt before any password work; too many in a window is a 429 whether or not the account exists.
  await limitLogin(req, email);
  const user = await login(email, String(body.password ?? ''));
  if (!user) return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  // The right password: the failed-attempt count starts over.
  await clearLoginFailures(email);
  if (!user.emailVerifiedAt) {
    return NextResponse.json({ code: 'EMAIL_NOT_VERIFIED', verificationProof: signupProof(user), error: 'Verify your email address to sign in.', email: user.email }, { status: 403 });
  }
  // Only an explicit `remember: false` (the web login page's unticked box) shortens the session. The phone
  // apps send nothing and stay signed in as before.
  await writeSession(user.id, { remember: body.remember !== false });
  const platform = phonePlatform(req.headers.get('user-agent'));
  if (platform) {
    await prisma.userMemory.upsert({
      where: { userId_key: { userId: user.id, key: 'device:login' } },
      create: { userId: user.id, key: 'device:login', value: platform, kind: 'device', source: 'login' },
      update: { value: platform },
    }).catch(() => { /* Device reporting must not prevent sign-in. */ });
  }
  // Signing in here always lands in the main app, admins included. Administrators sign in to the standalone
  // admin app separately (email code), so this response carries no admin app link.
  return NextResponse.json({ id: user.id, name: user.name, email: user.email, admin: isAdminEmail(user.email) });
  } catch (error) { return jsonError(error); }
}

export const POST = healthRoute('POST /api/auth/login', healthHandlerPOST);
