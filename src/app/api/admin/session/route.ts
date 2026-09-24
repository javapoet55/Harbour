import { after } from 'next/server';
import { healthRoute } from '@/server/health/telemetry';
import { z } from 'zod';
import { adminUserForSession, revokeAdminSession } from '@/server/admin-otp';
import { adminBearerToken, adminClientAuthorized } from '@/server/admin-session';
import { requestAdminCodeApi, verifyAdminCodeApi } from '@/server/admin-api-session';
import { adminAudit, adminIpTarget } from '@/server/admin-audit';

export const runtime = 'nodejs';
// Email-code sessions for the separate admin frontend. Only callers holding an ADMIN_API_SECRETS value may use it.
const email = z.string().trim().email().max(254);
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('request'), email }).strict(),
  z.object({ action: z.literal('verify'), email, code: z.string().trim().regex(/^\d{6}$/) }).strict(),
]);
const headers = { 'Cache-Control': 'private, no-store' };
const reply = (body: object, status = 200) => Response.json(body, { status, headers });
const unauthorizedClient = () => reply({ error: 'Admin client not authorized.' }, 401);
// The one answer to every accepted code request, whether or not the address may sign in.
const codeRequestAccepted = { ok: true, message: 'If this email can sign in to Nexdo Admin, a 6-digit code is on its way.' };

async function healthHandlerPOST(request: Request) {
  if (!adminClientAuthorized(request.headers)) return unauthorizedClient();
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: 'Enter your email address and the 6-digit code.' }, 400);
  const clientIp = request.headers.get('x-admin-client-ip');
  const body = parsed.data;
  try {
    if (body.action === 'request') {
      // Delivery continues after the response, so response time does not depend on whether an email is sent.
      // after() tells Next to keep this request's work alive until the send finishes and is logged.
      const { delivery } = await requestAdminCodeApi(body.email, clientIp);
      afterResponse(delivery);
      return reply(codeRequestAccepted);
    }
    return reply(await verifyAdminCodeApi(body.email, body.code, clientIp));
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    if (reason === 'INVALID_ADMIN_CODE') return reply({ error: 'That code is incorrect or has expired. Check the latest email or request a new code.' }, 401);
    if (reason === 'RATE_LIMITED') return reply({ error: 'Too many attempts. Please try again in 15 minutes.' }, 429);
    return reply({ error: 'Unable to sign in. Please try again shortly.' }, 503);
  }
}

function afterResponse(work: Promise<void>) {
  // Outside a Next request scope (tests, scripts) after() throws; the promise still runs to completion there.
  try { after(work); } catch { void work; }
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
