import { headers } from 'next/headers';
import { createHash, timingSafeEqual } from 'node:crypto';
import { adminUserForSession } from './admin-otp';

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

/** The admin behind this request. A bearer counts only when the admin frontend's client secret accompanies it. */
export async function readAdminSession() {
  const incoming = await requestHeaders();
  const bearer = incoming && adminClientAuthorized(incoming) ? adminBearerToken(incoming) : null;
  return bearer ? adminUserForSession(bearer) : null;
}
