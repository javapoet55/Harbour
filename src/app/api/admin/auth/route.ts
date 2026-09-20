import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { requestAdminCode, verifyAdminCode } from '@/server/admin-otp';
import { ADMIN_CHALLENGE, ADMIN_COOKIE, adminCookieOptions, clearAdminSession } from '@/server/admin-session';

export const runtime = 'nodejs';
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('request'), email: z.string().trim().email().max(254) }),
  z.object({ action: z.literal('verify'), code: z.string().regex(/^\d{6}$/) }),
  z.object({ action: z.literal('logout') }),
]);
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
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
  if (!parsed.success) return reply({ error: 'Enter a valid email address or six-digit code.' }, 400);
  try {
    const body = parsed.data;
    const jar = await cookies();
    if (body.action === 'logout') {
      await clearAdminSession();
    } else if (body.action === 'request') {
      const id = await requestAdminCode(body.email);
      jar.set(ADMIN_CHALLENGE, id, { ...adminCookieOptions, maxAge: 10 * 60 });
    } else {
      const session = await verifyAdminCode(jar.get(ADMIN_CHALLENGE)?.value ?? '', body.code);
      await clearAdminSession();
      // Browser-session cookie; server also enforces an absolute eight-hour lifetime.
      jar.set(ADMIN_COOKIE, session, adminCookieOptions);
    }
    return reply({ ok: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    if (reason === 'INVALID_ADMIN_CODE') return reply({ error: 'This code is invalid or expired. Try again or request a new code.' }, 401);
    if (reason === 'RATE_LIMITED') return reply({ error: 'Please wait before requesting another code. You can request up to three codes in 15 minutes.' }, 429);
    return reply({ error: 'We could not send or verify your code. Please try again shortly.' }, 503);
  }
}
