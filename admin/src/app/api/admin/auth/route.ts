import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { adminSessionSchema } from '@/contract/session';
import { BackendError, backendErrorMessage, backendFetch } from '@/server/backend';
import { allowLoginAttempt } from '@/server/login-limit';
import { clientIp, sameOrigin } from '@/server/request';
import { requestToken } from '@/server/proxy';
import { clearSessionCookie, setSessionCookie } from '@/server/session';

const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('login'), email: z.string().trim().email().max(254), password: z.string().min(1).max(72) }),
  z.object({ action: z.literal('logout') }),
]);
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const unavailable = () => reply({ error: 'Unable to sign in. Please try again shortly.' }, 503);

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: 'Request not allowed.' }, 403);
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: 'Enter your email address and password.' }, 400);
  const current = requestToken(request);
  const ip = clientIp(request);
  try {
    if (parsed.data.action === 'logout') {
      if (current) {
        const revoked = await backendFetch('/api/admin/session', { method: 'DELETE', token: current, clientIp: ip });
        // Keep the cookie when revocation failed so the user can retry; a 401 means it was already invalid.
        if (!revoked.ok && revoked.status !== 401) return reply({ error: 'Sign-out failed. Please try again.' }, 503);
      }
      const response = reply({ ok: true });
      clearSessionCookie(response);
      return response;
    }
    if (!allowLoginAttempt(ip)) return reply({ error: 'Too many sign-in attempts. Please try again in 15 minutes.' }, 429);
    const { email, password } = parsed.data;
    const backend = await backendFetch('/api/admin/session', { method: 'POST', body: { email, password }, clientIp: ip });
    if (!backend.ok) {
      if (![400, 401, 429].includes(backend.status)) return unavailable();
      return reply({ error: await backendErrorMessage(backend, 'Unable to sign in.') }, backend.status);
    }
    const session = adminSessionSchema.safeParse(await backend.json().catch(() => null));
    if (!session.success) return unavailable();
    // Signing in again ends the previous session, as on the original portal.
    if (current) await backendFetch('/api/admin/session', { method: 'DELETE', token: current, clientIp: ip }).catch(() => undefined);
    const response = reply({ ok: true });
    setSessionCookie(response, session.data.token, session.data.expiresAt);
    return response;
  } catch (error) {
    if (error instanceof BackendError && parsed.data.action === 'logout') return reply({ error: 'Sign-out failed. Please try again.' }, 503);
    return unavailable();
  }
}
