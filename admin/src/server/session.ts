import 'server-only';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

// __Host- requires Secure and Path=/ and forbids Domain, pinning the cookie to this exact host.
export const ADMIN_COOKIE = '__Host-nexdo_admin';
export const adminCookieOptions = { httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/' };
export const SESSION_EXPIRED_PATH = '/session-expired';

export const validToken = (value: string | null | undefined) => (value && /^[a-f0-9]{64}$/.test(value) ? value : null);

/** The session token for server components. Route handlers read request.cookies instead. */
export async function sessionToken() {
  return validToken((await cookies()).get(ADMIN_COOKIE)?.value);
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: string) {
  response.cookies.set(ADMIN_COOKIE, token, { ...adminCookieOptions, expires: new Date(expiresAt) });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(ADMIN_COOKIE, '', { ...adminCookieOptions, maxAge: 0 });
}
