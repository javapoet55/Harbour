import { SignJWT, jwtVerify } from 'jose';
import type { OAuthProvider } from '@/providers/calendar';
import { sessionSigningKey } from './session-key';

export async function createOAuthState(userId: string, provider: OAuthProvider, native = false) {
  return new SignJWT({ sub: userId, provider, native, purpose: 'calendar-oauth' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(sessionSigningKey());
}

export async function isNativeOAuthState(token: string, provider: OAuthProvider) {
  const { payload } = await jwtVerify(token, sessionSigningKey(), { algorithms: ['HS256'] });
  if (payload.purpose !== 'calendar-oauth' || payload.provider !== provider || typeof payload.sub !== 'string') throw new Error('Invalid OAuth state');
  return payload.native === true;
}

export async function verifyOAuthState(token: string, provider: OAuthProvider) {
  const { payload } = await jwtVerify(token, sessionSigningKey(), { algorithms: ['HS256'] });
  if (payload.purpose !== 'calendar-oauth' || payload.provider !== provider || typeof payload.sub !== 'string') throw new Error('Invalid OAuth state');
  return payload.sub;
}
