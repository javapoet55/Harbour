import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { signInAdminPassword } from '@/server/admin-otp';
import { ADMIN_COOKIE, adminCookieOptions, clearAdminSession } from '@/server/admin-session';

export const runtime = 'nodejs';
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('login'), email: z.string().trim().email().max(254), password: z.string().min(1).max(72) }),
  z.object({ action: z.literal('logout') }),
]);
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function healthHandlerPOST(request: Request) {
  // Next may normalize request.url to localhost behind the development server or a proxy.
  // Host is supplied by the browser/server, not by form data. Never trust an arbitrary forwarded host.
  const origin = request.headers.get('origin');
  const host = request.headers.get('host') ?? new URL(request.url).host;
  let sameOrigin = false;
  try {
    const url = new URL(origin ?? '');
    sameOrigin = ['https:', 'http:'].includes(url.protocol) && url.host === host;
  } catch { /* Missing or malformed origins fail closed. */ }
  if (!sameOrigin) return reply({ error: 'Request not allowed.' }, 403);
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: 'Enter your email address and password.' }, 400);
  try {
    const body = parsed.data;
    const jar = await cookies();
    if (body.action === 'logout') {
      await clearAdminSession();
    } else {
      const session = await signInAdminPassword(body.email, body.password);
      await clearAdminSession();
      // Browser-session cookie; server also enforces an absolute eight-hour lifetime.
      jar.set(ADMIN_COOKIE, session, adminCookieOptions);
    }
    return reply({ ok: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    if (reason === 'INVALID_ADMIN_PASSWORD') return reply({ error: 'Invalid email or password, or this account is not an authorized administrator.' }, 401);
    if (reason === 'RATE_LIMITED') return reply({ error: 'Too many sign-in attempts. Please try again in 15 minutes.' }, 429);
    return reply({ error: 'Unable to sign in. Please try again shortly.' }, 503);
  }
}

export const POST = healthRoute('POST /api/admin/auth', healthHandlerPOST);
