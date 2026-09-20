import { cookies } from 'next/headers';
import { adminUserForSession, revokeAdminSession } from './admin-otp';

export const ADMIN_COOKIE = 'nexdo_admin_session';
export const ADMIN_CHALLENGE = 'nexdo_admin_challenge';
export const adminCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/' };

export async function readAdminSession() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return token ? adminUserForSession(token) : null;
}

export async function clearAdminSession() {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (token) await revokeAdminSession(token);
  jar.delete(ADMIN_COOKIE);
  jar.delete(ADMIN_CHALLENGE);
}
