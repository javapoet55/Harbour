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

// Native clients (ASWebAuthenticationSession) cannot send the app's session
// cookie, so they exchange an authenticated API call for this short-lived
// token and pass it to the OAuth start route instead.
export async function createConnectToken(userId: string, provider: OAuthProvider) {
  return new SignJWT({ sub: userId, provider, purpose: 'calendar-connect' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m').sign(sessionSigningKey());
}

export async function verifyConnectToken(token: string, provider: OAuthProvider) {
  const { payload } = await jwtVerify(token, sessionSigningKey(), { algorithms: ['HS256'] });
  if (payload.purpose !== 'calendar-connect' || payload.provider !== provider || typeof payload.sub !== 'string') throw new Error('Invalid connect token');
  return payload.sub;
}
