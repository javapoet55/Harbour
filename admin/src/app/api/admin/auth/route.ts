import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { adminCodeRequestSchema, adminSessionSchema } from '@/contract/session';
import { BackendError, backendErrorMessage, backendFetch } from '@/server/backend';
import { allowLoginAttempt } from '@/server/login-limit';
import { clientIp, sameOrigin } from '@/server/request';
import { requestToken } from '@/server/proxy';
import { clearSessionCookie, setSessionCookie } from '@/server/session';

const email = z.string().trim().email().max(254);
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('request'), email }),
  z.object({ action: z.literal('verify'), email, code: z.string().trim().regex(/^\d{6}$/) }),
  z.object({ action: z.literal('logout') }),
]);
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const unavailable = () => reply({ error: 'Unable to sign in. Please try again shortly.' }, 503);
const invalidInput = (action: unknown) => reply({ error: action === 'verify' ? 'Enter the 6-digit code from the email.' : 'Enter a valid email address.' }, 400);

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: 'Request not allowed.' }, 403);
  const raw = await request.json().catch(() => null);
  const parsed = input.safeParse(raw);
  if (!parsed.success) return invalidInput((raw as { action?: unknown } | null)?.action);
  const body = parsed.data;
  const current = requestToken(request);
  const ip = clientIp(request);
  try {
    if (body.action === 'logout') {
      if (current) {
        const revoked = await backendFetch('/api/admin/session', { method: 'DELETE', token: current, clientIp: ip });
        // Keep the cookie when revocation failed so the user can retry; a 401 means it was already invalid.
        if (!revoked.ok && revoked.status !== 401) return reply({ error: 'Sign-out failed. Please try again.' }, 503);
      }
      const response = reply({ ok: true });
      clearSessionCookie(response);
      return response;
    }
    if (!allowLoginAttempt(ip)) return reply({ error: 'Too many attempts. Please try again in 15 minutes.' }, 429);
    const backend = await backendFetch('/api/admin/session', { method: 'POST', body, clientIp: ip });
    if (!backend.ok) {
      if (![400, 401, 429].includes(backend.status)) return unavailable();
      return reply({ error: await backendErrorMessage(backend, 'Unable to sign in.') }, backend.status);
    }
    if (body.action === 'request') {
      // The backend answers identically for every address; pass that one answer through.
      const accepted = adminCodeRequestSchema.safeParse(await backend.json().catch(() => null));
      return accepted.success ? reply(accepted.data) : unavailable();
    }
    const session = adminSessionSchema.safeParse(await backend.json().catch(() => null));
    if (!session.success) return unavailable();
    // Signing in again ends the previous session.
    if (current) await backendFetch('/api/admin/session', { method: 'DELETE', token: current, clientIp: ip }).catch(() => undefined);
    const response = reply({ ok: true });
    setSessionCookie(response, session.data.token, session.data.expiresAt);
    return response;
  } catch (error) {
    if (error instanceof BackendError && body.action === 'logout') return reply({ error: 'Sign-out failed. Please try again.' }, 503);
    return unavailable();
  }
}
