import { SignJWT, jwtVerify } from 'jose';
import type { OAuthProvider } from '@/providers/calendar';

function key() {
  return new TextEncoder().encode(process.env.HARBOR_SESSION_SECRET || 'harbor-dev-session-secret-change-me');
}

export async function createOAuthState(userId: string, provider: OAuthProvider) {
  return new SignJWT({ sub: userId, provider, purpose: 'calendar-oauth' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(key());
}

export async function verifyOAuthState(token: string, provider: OAuthProvider) {
  const { payload } = await jwtVerify(token, key());
  if (payload.purpose !== 'calendar-oauth' || payload.provider !== provider || typeof payload.sub !== 'string') throw new Error('Invalid OAuth state');
  return payload.sub;
}
