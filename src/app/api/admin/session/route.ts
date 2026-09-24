import { healthRoute } from '@/server/health/telemetry';
import { z } from 'zod';
import { adminUserForSession, revokeAdminSession } from '@/server/admin-otp';
import { adminBearerToken, adminClientAuthorized } from '@/server/admin-session';
import { adminAudit, adminIpTarget, signInAdminApi } from '@/server/admin-api-session';

export const runtime = 'nodejs';
// Bearer-token sessions for the separate admin frontend. Only callers holding an ADMIN_API_SECRETS value may use it.
const input = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(72) }).strict();
const headers = { 'Cache-Control': 'private, no-store' };
const reply = (body: object, status = 200) => Response.json(body, { status, headers });
const unauthorizedClient = () => reply({ error: 'Admin client not authorized.' }, 401);

async function healthHandlerPOST(request: Request) {
  if (!adminClientAuthorized(request.headers)) return unauthorizedClient();
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: 'Enter your email address and password.' }, 400);
  try {
    return reply(await signInAdminApi(parsed.data.email, parsed.data.password, request.headers.get('x-admin-client-ip')));
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    if (reason === 'INVALID_ADMIN_PASSWORD') return reply({ error: 'Invalid email or password, or this account is not an authorized administrator.' }, 401);
    if (reason === 'RATE_LIMITED') return reply({ error: 'Too many sign-in attempts. Please try again in 15 minutes.' }, 429);
    return reply({ error: 'Unable to sign in. Please try again shortly.' }, 503);
  }
}

async function healthHandlerDELETE(request: Request) {
  if (!adminClientAuthorized(request.headers)) return unauthorizedClient();
  const token = adminBearerToken(request.headers);
  if (!token) return reply({ error: 'Admin sign-in required' }, 401);
  const user = await adminUserForSession(token);
  await revokeAdminSession(token);
  if (user) await adminAudit(user.id, 'ADMIN_LOGOUT', adminIpTarget(request.headers.get('x-admin-client-ip')), 'Signed out of admin frontend');
  return new Response(null, { status: 204, headers });
}

export const POST = healthRoute('POST /api/admin/session', healthHandlerPOST);
export const DELETE = healthRoute('DELETE /api/admin/session', healthHandlerDELETE);
