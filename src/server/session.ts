import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { sessionSigningKey } from './session-key';
import { createSession, revokeSession, sessionMaxAgeMs } from './session-store';

const COOKIE = 'harbor_session';
// HttpOnly keeps the cookie away from page scripts. Secure is on wherever NODE_ENV is production (every
// Railway environment); plain-http local development needs it off. SameSite=Lax, not Strict, because the
// Google and Outlook OAuth callbacks arrive as top-level navigations from another site and must stay
// signed in. Cross-site writes are refused separately, by origin (src/lib/csrf.ts).
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' });

/**
 * Signs this device in. With `remember: false` (the login page's "Remember me" unticked) the cookie has no
 * expiry date, so the browser drops it when it closes, and the session ends within a day regardless.
 */
export async function writeSession(userId: string, options: { remember?: boolean } = {}) {
  const key = sessionSigningKey(); // Fails before any session is stored when the signing secret is not configured.
  const session = await createSession(userId, { remember: options.remember });
  const token = await new SignJWT({ sub: userId, sid: session.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(session.expiresAt.getTime() / 1000))
    .sign(key);
  const jar = await cookies();
  jar.set(COOKIE, token, options.remember === false ? cookieOptions() : { ...cookieOptions(), maxAge: Math.floor(sessionMaxAgeMs() / 1000) });
}

/** Signs this device out: its server-side session is deleted, so a copy of the cookie stops working too. */
export async function clearSession() {
  const session = await readSession();
  if (session?.sessionId) await revokeSession(session.sessionId);
  const jar = await cookies();
  jar.delete(COOKIE);
}

export type SessionClaims = {
  userId: string;
  /** Null for cookies issued before server-side sessions; those stay valid until their own expiry. */
  sessionId: string | null;
  issuedAt: Date;
};

/** The verified claims of the session cookie. Whether the session is still alive is decided in auth.ts. */
export async function readSession(): Promise<SessionClaims | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSigningKey(), { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.iat !== 'number') return null;
    return { userId: payload.sub, sessionId: typeof payload.sid === 'string' ? payload.sid : null, issuedAt: new Date(payload.iat * 1000) };
  } catch {
    return null;
  }
}
