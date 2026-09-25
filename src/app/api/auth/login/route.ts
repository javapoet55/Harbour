import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { login } from '@/server/auth';
import { writeSession } from '@/server/session';
import { jsonError } from '@/lib/http';
import { isAdminEmail } from '@/server/admin-auth';
import { adminAppUrl } from '@/lib/admin-app-url';

async function healthHandlerPOST(req: Request) {
  try {
  const body = await req.json().catch(() => ({}));
  const user = await login(String(body.email ?? ''), String(body.password ?? ''));
  if (!user) return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  if (!user.emailVerifiedAt) {
    return NextResponse.json({ code: 'EMAIL_NOT_VERIFIED', error: 'Verify your email address to sign in.', email: user.email }, { status: 403 });
  }
  await writeSession(user.id);
  const admin = isAdminEmail(user.email);
  // Admins land in the standalone admin app when it is configured; otherwise they use the app like anyone else.
  const adminApp = admin ? adminAppUrl()?.toString() : undefined;
  return NextResponse.json({ id: user.id, name: user.name, email: user.email, admin, ...(adminApp ? { adminAppUrl: adminApp } : {}) });
  } catch (error) { return jsonError(error); }
}

export const POST = healthRoute('POST /api/auth/login', healthHandlerPOST);
