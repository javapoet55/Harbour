import { cookies, headers } from 'next/headers';
import { createHash, timingSafeEqual } from 'node:crypto';
import { adminUserForSession, revokeAdminSession } from './admin-otp';

export const ADMIN_COOKIE = 'nexdo_admin_session';
export const ADMIN_CHALLENGE = 'nexdo_admin_challenge';
export const adminCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/' };

// Shared secrets identifying the separate admin frontend. Comma-separated so a secret can be rotated
// without downtime. Short values are ignored so a placeholder can never enable bearer access.
const MIN_SECRET_LENGTH = 32;
const digest = (value: string) => createHash('sha256').update(value).digest();

export function adminClientAuthorized(requestHeaders: Pick<Headers, 'get'>) {
  const presented = requestHeaders.get('x-admin-client');
  if (!presented) return false;
  const secrets = (process.env.ADMIN_API_SECRETS ?? '').split(',').map((value) => value.trim()).filter((value) => value.length >= MIN_SECRET_LENGTH);
  // Compare fixed-length digests against every configured secret; no early exit on a match.
  let matched = false;
  for (const secret of secrets) matched = timingSafeEqual(digest(presented), digest(secret)) || matched;
  return matched;
}

export function adminBearerToken(requestHeaders: Pick<Headers, 'get'>) {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(requestHeaders.get('authorization') ?? '');
  return match?.[1] ?? null;
}

async function requestHeaders() {
  try { return await headers(); } catch { return null; } // Outside a request scope there is no bearer to read.
}

/** A bearer counts only when the admin frontend's client secret accompanies it; otherwise the cookie applies. */
export async function readAdminAuth() {
  const incoming = await requestHeaders();
  const bearer = incoming && adminClientAuthorized(incoming) ? adminBearerToken(incoming) : null;
  if (bearer) {
    const user = await adminUserForSession(bearer);
    if (user) return { user, viaBearer: true };
  }
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const user = token ? await adminUserForSession(token) : null;
  return user ? { user, viaBearer: false } : null;
}

export async function readAdminSession() {
  return (await readAdminAuth())?.user ?? null;
}

export async function clearAdminSession() {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (token) await revokeAdminSession(token);
  jar.delete(ADMIN_COOKIE);
  jar.delete(ADMIN_CHALLENGE);
}
