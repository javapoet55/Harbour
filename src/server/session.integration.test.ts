import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { prisma } from './db';
import { currentUser } from './auth';
import { resetPassword } from './account-auth';
import { clearSession, readSession, writeSession } from './session';
import { revokeAllSessions, sessionIdleMs, sessionMaxAgeMs, SESSION_TOUCH_INTERVAL_MS, UNREMEMBERED_SESSION_MS } from './session-store';
import { sessionSigningKey } from './session-key';
import { POST as logout } from '@/app/api/auth/logout/route';
import { POST as logoutEverywhere } from '@/app/api/auth/logout-everywhere/route';

type Cookie = { value: string; httpOnly?: boolean; secure?: boolean; sameSite?: string; path?: string; maxAge?: number };
const jar = vi.hoisted(() => new Map<string, Cookie>());
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (key: string) => jar.get(key), set: (key: string, value: string, options: object) => jar.set(key, { value, ...options }), delete: (key: string) => jar.delete(key) }) }));

const COOKIE = 'harbor_session';
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const start = new Date('2026-11-02T09:00:00Z');
const run = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);
const post = (handler: (request: Request) => Promise<Response>, path: string) => handler(new Request(`http://localhost${path}`, { method: 'POST' }));

let serial = 0;
async function account(data: { emailVerifiedAt?: Date | null } = {}) {
  return prisma.user.create({ data: { email: `${run}-${serial++}@example.test`, name: 'Sam', passwordHash: 'x', emailVerifiedAt: start, preference: { create: {} }, ...data } });
}
/** Signs in and returns that device's cookie, so a test can play several devices or a stolen copy. */
async function signIn(userId: string) {
  await writeSession(userId);
  return jar.get(COOKIE)!;
}
const as = async (cookie: Cookie | undefined) => {
  if (cookie) jar.set(COOKIE, cookie); else jar.delete(COOKIE);
  return (await currentUser())?.id ?? null;
};
/** A cookie exactly as the server issued them before server-side sessions: no session id. */
async function legacyCookie(userId: string): Promise<Cookie> {
  return { value: await new SignJWT({ sub: userId }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('14d').sign(sessionSigningKey()) };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(start);
  vi.stubEnv('HARBOR_SESSION_SECRET', 's'.repeat(64));
  vi.stubEnv('SESSION_IDLE_TIMEOUT_HOURS', '');
  vi.stubEnv('SESSION_MAX_AGE_DAYS', '');
  jar.clear();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
afterAll(async () => { await prisma.user.deleteMany({ where: { email: { startsWith: run } } }); });

describe('the session cookie', () => {
  it('is HttpOnly, SameSite=Lax, site-wide and expires with the session', async () => {
    const user = await account();
    const cookie = await signIn(user.id);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 14 * 24 * 60 * 60 });
    expect(await as(cookie)).toBe(user.id);
  });

  it('is Secure in production', async () => {
    const user = await account();
    vi.stubEnv('NODE_ENV', 'production');
    expect((await signIn(user.id)).secure).toBe(true);
  });

  it('names a server-side session and carries nothing else about the user', async () => {
    const user = await account();
    await signIn(user.id);
    const claims = await readSession();
    expect(claims).toMatchObject({ userId: user.id, sessionId: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(await prisma.userSession.count({ where: { id: claims!.sessionId!, userId: user.id } })).toBe(1);
  });

  it('is refused when forged, tampered with, or paired with another account\'s session', async () => {
    const [user, other] = [await account(), await account()];
    const cookie = await signIn(user.id);
    expect(await as({ value: 'forged' })).toBeNull();
    expect(await as({ value: `${cookie.value.slice(0, -2)}xx` })).toBeNull();
    const sessionId = (await readSessionOf(cookie))!;
    const crossed = await new SignJWT({ sub: other.id, sid: sessionId }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1d').sign(sessionSigningKey());
    expect(await as({ value: crossed })).toBeNull();
  });

  it('stops working for a deleted or unverified account', async () => {
    const [deleted, unverified] = [await account(), await account({ emailVerifiedAt: null })];
    const [first, second] = [await signIn(deleted.id), await signIn(unverified.id)];
    await prisma.user.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    expect(await as(first)).toBeNull();
    expect(await as(second)).toBeNull();
  });
});

async function readSessionOf(cookie: Cookie) {
  jar.set(COOKIE, cookie);
  return (await readSession())?.sessionId ?? null;
}

describe('idle and absolute expiry', () => {
  it('signs out a device that has not used Nexdo for 7 days', async () => {
    const user = await account();
    const cookie = await signIn(user.id);
    advance(7 * DAY - 60_000);
    expect(await as(cookie)).toBe(user.id);
    advance(7 * DAY);
    expect(await as(cookie)).toBeNull();
  });

  it('keeps an active device signed in, but never past 14 days', async () => {
    const user = await account();
    const cookie = await signIn(user.id);
    for (let day = 1; day <= 13; day += 1) {
      advance(DAY);
      expect(await as(cookie), `day ${day}`).toBe(user.id);
    }
    advance(DAY + 1000);
    expect(await as(cookie)).toBeNull();
  });

  it('does not come back to life once it has gone idle', async () => {
    const user = await account();
    const cookie = await signIn(user.id);
    advance(8 * DAY);
    expect(await as(cookie)).toBeNull();
    expect(await as(cookie)).toBeNull();
  });

  it('records activity at most once every five minutes', async () => {
    const user = await account();
    const cookie = await signIn(user.id);
    const id = (await readSessionOf(cookie))!;
    const seen = async () => (await prisma.userSession.findUniqueOrThrow({ where: { id } })).lastSeenAt.getTime();
    advance(SESSION_TOUCH_INTERVAL_MS - 1000);
    await as(cookie);
    expect(await seen()).toBe(start.getTime());
    advance(2000);
    await as(cookie);
    expect(await seen()).toBe(start.getTime() + SESSION_TOUCH_INTERVAL_MS + 1000);
  });

  it('honours SESSION_IDLE_TIMEOUT_HOURS and SESSION_MAX_AGE_DAYS, ignoring nonsense', async () => {
    vi.stubEnv('SESSION_IDLE_TIMEOUT_HOURS', '2');
    vi.stubEnv('SESSION_MAX_AGE_DAYS', '30');
    expect([sessionIdleMs(), sessionMaxAgeMs()]).toEqual([2 * HOUR, 30 * DAY]);
    const user = await account();
    const cookie = await signIn(user.id);
    expect(cookie.maxAge).toBe(30 * 24 * 60 * 60);
    advance(2 * HOUR + 1000);
    expect(await as(cookie)).toBeNull();
    for (const value of ['0', '-5', 'never', 'NaN']) {
      vi.stubEnv('SESSION_IDLE_TIMEOUT_HOURS', value);
      vi.stubEnv('SESSION_MAX_AGE_DAYS', value);
      expect([sessionIdleMs(), sessionMaxAgeMs()], value).toEqual([7 * DAY, 14 * DAY]);
    }
    // The idle window can never outlast the session itself, and neither can be set absurdly long.
    vi.stubEnv('SESSION_IDLE_TIMEOUT_HOURS', '99999');
    vi.stubEnv('SESSION_MAX_AGE_DAYS', '3');
    expect(sessionIdleMs()).toBe(3 * DAY);
    vi.stubEnv('SESSION_MAX_AGE_DAYS', '99999');
    expect(sessionMaxAgeMs()).toBe(90 * DAY);
  });

  it('clears out the account\'s dead sessions at the next sign-in', async () => {
    const user = await account();
    await signIn(user.id);
    advance(3 * DAY);
    const live = await signIn(user.id);
    advance(5 * DAY); // The first session is now idle for 8 days; the second for 5.
    await as(live);
    await signIn(user.id);
    expect(await prisma.userSession.count({ where: { userId: user.id } })).toBe(2);
  });
});

describe('signing in without "Remember me"', () => {
  it('sets a cookie the browser drops when it closes, and ends the session within a day', async () => {
    const user = await account();
    await writeSession(user.id, { remember: false });
    const cookie = jar.get(COOKIE)!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(cookie.maxAge).toBeUndefined();
    expect(await as(cookie)).toBe(user.id);
    advance(UNREMEMBERED_SESSION_MS - 60_000);
    expect(await as(cookie)).toBe(user.id);
    advance(2 * 60_000);
    expect(await as(cookie)).toBeNull();
  });

  it('is the exception: a plain sign-in is remembered for the full 14 days', async () => {
    const user = await account();
    await writeSession(user.id, { remember: true });
    expect(jar.get(COOKIE)!.maxAge).toBe(14 * 24 * 60 * 60);
    const session = await prisma.userSession.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.expiresAt.getTime() - Date.now()).toBe(14 * DAY);
  });

  it('never outlasts a shorter SESSION_MAX_AGE_DAYS', async () => {
    vi.stubEnv('SESSION_MAX_AGE_DAYS', '0.5');
    const user = await account();
    await writeSession(user.id, { remember: false });
    const session = await prisma.userSession.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.expiresAt.getTime() - Date.now()).toBe(12 * HOUR);
  });
});

describe('signing out', () => {
  it('ends the session on the server, so a copy of the cookie stops working', async () => {
    const user = await account();
    const cookie = await signIn(user.id);
    const stolen = { ...cookie };
    expect((await post(logout, '/api/auth/logout')).status).toBe(200);
    expect(jar.has(COOKIE)).toBe(false);
    expect(await as(stolen)).toBeNull();
  });

  it('leaves the account\'s other devices signed in', async () => {
    const user = await account();
    const [laptop, phone] = [await signIn(user.id), await signIn(user.id)];
    jar.set(COOKIE, laptop);
    await clearSession();
    expect(await as(laptop)).toBeNull();
    expect(await as(phone)).toBe(user.id);
  });

  it('does not fail without a session', async () => {
    expect((await post(logout, '/api/auth/logout')).status).toBe(200);
  });
});

describe('sign out everywhere', () => {
  it('ends every session of the account, this device included, and nobody else\'s', async () => {
    const [user, other] = [await account(), await account()];
    const [laptop, phone, theirs] = [await signIn(user.id), await signIn(user.id), await signIn(other.id)];
    jar.set(COOKIE, laptop);
    const response = await post(logoutEverywhere, '/api/auth/logout-everywhere');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(jar.has(COOKIE)).toBe(false);
    expect(await as(laptop)).toBeNull();
    expect(await as(phone)).toBeNull();
    expect(await as(theirs)).toBe(other.id);
    expect(await prisma.userSession.count({ where: { userId: user.id } })).toBe(0);
  });

  it('requires a signed-in user', async () => {
    expect((await post(logoutEverywhere, '/api/auth/logout-everywhere')).status).toBe(401);
    const user = await account();
    const cookie = await signIn(user.id);
    advance(8 * DAY);
    jar.set(COOKIE, cookie);
    expect((await post(logoutEverywhere, '/api/auth/logout-everywhere')).status).toBe(401);
  });

  it('lets the user sign straight back in', async () => {
    const user = await account();
    jar.set(COOKIE, await signIn(user.id));
    await post(logoutEverywhere, '/api/auth/logout-everywhere');
    expect(await as(await signIn(user.id))).toBe(user.id);
  });

  it('happens automatically when the password is reset', async () => {
    const user = await account();
    const [laptop, phone] = [await signIn(user.id), await signIn(user.id)];
    await prisma.passwordResetToken.create({ data: { userId: user.id, codeHash: await bcrypt.hash('123456', 4), expiresAt: new Date(Date.now() + 10 * 60_000) } });
    await resetPassword({ email: user.email, code: '123456', password: 'a-brand-new-password' });
    expect(await as(laptop)).toBeNull();
    expect(await as(phone)).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionsRevokedAt).toEqual(new Date());
  });
});

describe('cookies issued before server-side sessions', () => {
  it('keep working until they expire, so the upgrade signs nobody out', async () => {
    const user = await account();
    const cookie = await legacyCookie(user.id);
    expect(await as(cookie)).toBe(user.id);
    advance(13 * DAY);
    expect(await as(cookie)).toBe(user.id);
    advance(DAY + 1000);
    expect(await as(cookie)).toBeNull();
  });

  it('are refused after sign out everywhere, a password change or a reset', async () => {
    const [user, other] = [await account(), await account()];
    const [cookie, theirs] = [await legacyCookie(user.id), await legacyCookie(other.id)];
    advance(HOUR);
    await revokeAllSessions(user.id);
    expect(await as(cookie)).toBeNull();
    expect(await as(theirs)).toBe(other.id);
    // Signing in afterwards works: the new cookie has a session of its own.
    advance(1000);
    expect(await as(await signIn(user.id))).toBe(user.id);
  });

  it('can still sign out everywhere', async () => {
    const user = await account();
    const cookie = await legacyCookie(user.id);
    jar.set(COOKIE, cookie);
    expect((await post(logoutEverywhere, '/api/auth/logout-everywhere')).status).toBe(200);
    expect(await as(cookie)).toBeNull();
  });
});
