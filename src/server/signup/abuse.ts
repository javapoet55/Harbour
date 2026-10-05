import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { prisma } from '@/server/db';
import { sessionSigningKey } from '@/server/session-key';
import { log } from '@/lib/logger';

export const AUTH_LIMITS = { windowMs: 15 * 60_000, signup: 5, otpRequests: 3, verifyIp: 30, cooldownMs: 60_000 };
export function securityRef(value: string) {
  const secret = process.env.SIGNUP_ABUSE_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) throw new Error('SIGNUP_SECURITY_UNAVAILABLE');
  return createHmac('sha256', secret || sessionSigningKey()).update(`signup-abuse:${value}`).digest('hex');
}
export function securityEvent(event: string, email?: string) { log('info', event, email ? { accountRef: securityRef(email).slice(0, 16) } : {}); }

export function clientAddress(req: Request) {
  // Configure only a header overwritten by your trusted ingress; never accept caller-chosen forwarding chains.
  const header = process.env.AUTH_TRUSTED_IP_HEADER;
  if (!header) {
    if (process.env.NODE_ENV === 'production') throw new Error('SIGNUP_SECURITY_UNAVAILABLE');
    return 'local';
  }
  const raw = req.headers.get(header)?.trim() ?? '';
  if (!isIP(raw)) throw new Error('SIGNUP_SECURITY_UNAVAILABLE');
  // Normalize IPv6 aliases and group its /64 to prevent cheap address rotation.
  if (isIP(raw) === 6) {
    const canonical = new URL(`http://[${raw}]/`).hostname;
    const groups = canonical.slice(1, -1).split('::');
    const left = groups[0] ? groups[0].split(':') : [];
    const right = groups[1] ? groups[1].split(':') : [];
    const expanded = groups.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
    return `${expanded.slice(0, 4).join(':')}::/64`;
  }
  return raw;
}

/** Durable, atomic limits shared by every backend instance; no in-memory/fail-open fallback. */
export async function consumeLimit(scope: string, identity: string, limit: number, windowMs = AUTH_LIMITS.windowMs) {
  const key = securityRef(`${scope}:${identity}`);
  const now = new Date();
  try {
    const allowed = await prisma.$transaction(async tx => {
      await tx.authRateBucket.upsert({ where: { key }, create: { key, count: 0, expiresAt: new Date(+now + windowMs) }, update: {} });
      await tx.authRateBucket.updateMany({ where: { key, expiresAt: { lte: now } }, data: { count: 0, expiresAt: new Date(+now + windowMs) } });
      return (await tx.authRateBucket.updateMany({ where: { key, count: { lt: limit } }, data: { count: { increment: 1 } } })).count === 1;
    });
    if (!allowed) { securityEvent(scope.startsWith('signup') ? 'signup_rate_limited' : 'otp_rate_limited'); throw new Error('AUTH_RATE_LIMITED'); }
  } catch (e) {
    if (e instanceof Error && e.message === 'AUTH_RATE_LIMITED') throw e;
    log('warn', 'signup_rate_store_unavailable'); throw new Error('SIGNUP_SECURITY_UNAVAILABLE');
  }
}
export async function limitAuthRequest(req: Request, action: 'signup' | 'send' | 'verify') {
  await consumeLimit(`signup-ip:${action}`, clientAddress(req), action === 'signup' ? AUTH_LIMITS.signup : AUTH_LIMITS.verifyIp);
}
export async function limitCodeSend(email: string, purpose: string) {
  await consumeLimit(`otp-cooldown:${purpose}`, email.toLowerCase(), 1, AUTH_LIMITS.cooldownMs);
  await consumeLimit(`otp-send:${purpose}`, email.toLowerCase(), AUTH_LIMITS.otpRequests);
}

export function turnstileRequired() { return process.env.NODE_ENV === 'production' || !!process.env.TURNSTILE_SECRET_KEY; }
export async function verifyBot(token: unknown) {
  if (!turnstileRequired()) return;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const hosts = (process.env.TURNSTILE_HOSTNAMES ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (!secret || !hosts.length || (process.env.NODE_ENV === 'production' && /^[123]x0{10}/.test(secret))) throw new Error('SIGNUP_SECURITY_UNAVAILABLE');
  if (typeof token !== 'string' || !token || token.length > 2048) throw new Error('BOT_CHECK_FAILED');
  let result;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret, response: token }), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error();
    result = await response.json();
  } catch { throw new Error('SIGNUP_SECURITY_UNAVAILABLE'); }
  if (result.success !== true || result.action !== 'signup' || !hosts.includes(result.hostname)) { securityEvent('signup_bot_check_failed'); throw new Error('BOT_CHECK_FAILED'); }
}
