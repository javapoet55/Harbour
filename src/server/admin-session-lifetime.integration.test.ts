import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { prisma } from './db';
import { adminSessionIdleMs, adminTokenHash, adminUserForSession, revokeAdminSessionsForUser } from './admin-otp';
import { revokeAllSessions } from './session-store';
import { DELETE as sessionDELETE } from '@/app/api/admin/session/route';

const SECRET = 'k'.repeat(48);
const MINUTE = 60_000;
const start = new Date('2026-11-02T09:00:00Z');
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);
const ids: string[] = [];
const saved = { emails: process.env.NEXDO_ADMIN_EMAILS, secrets: process.env.ADMIN_API_SECRETS };

async function admin() {
  const email = `admin-${crypto.randomUUID()}@nexdo.test`;
  process.env.NEXDO_ADMIN_EMAILS = [process.env.NEXDO_ADMIN_EMAILS, email].filter(Boolean).join(',');
  const user = await prisma.user.create({ data: { email, name: 'Admin', passwordHash: 'unused', emailVerifiedAt: start } });
  ids.push(user.id);
  return user;
}
/** A signed-in admin browser: the same row a redeemed email code leaves behind. */
async function adminSession(userId: string, lastUsed: Date | null = new Date()) {
  const token = randomBytes(32).toString('hex');
  await prisma.adminLoginToken.create({ data: {
    id: randomBytes(32).toString('hex'), userId, codeHash: 'used', expiresAt: new Date(Date.now() + 10 * MINUTE), usedAt: new Date(),
    sessionHash: adminTokenHash(token), sessionExpiresAt: new Date(Date.now() + 8 * 60 * MINUTE), sessionLastUsedAt: lastUsed,
  } });
  return token;
}
const live = async (token: string) => Boolean(await adminUserForSession(token));
const signOut = (token: string, query = '') => sessionDELETE(new Request(`http://localhost/api/admin/session${query}`, { method: 'DELETE', headers: { 'x-admin-client': SECRET, authorization: `Bearer ${token}` } }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(start);
  process.env.NEXDO_ADMIN_EMAILS = '';
  process.env.ADMIN_API_SECRETS = SECRET;
  vi.stubEnv('ADMIN_SESSION_IDLE_MINUTES', '');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
afterAll(async () => {
  process.env.NEXDO_ADMIN_EMAILS = saved.emails; process.env.ADMIN_API_SECRETS = saved.secrets;
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe('idle admin sessions', () => {
  it('end after an hour without use, well inside the 8-hour limit, and stay ended', async () => {
    const token = await adminSession((await admin()).id);
    advance(59 * MINUTE);
    expect(await live(token)).toBe(true);
    advance(60 * MINUTE);
    expect(await live(token)).toBe(false);
    expect(await prisma.adminLoginToken.count({ where: { sessionHash: adminTokenHash(token) } })).toBe(0);
  });

  it('stay alive while in use, but never past 8 hours', async () => {
    const token = await adminSession((await admin()).id);
    for (let step = 1; step <= 15; step += 1) {
      advance(30 * MINUTE);
      expect(await live(token), `after ${step * 30} minutes`).toBe(true);
    }
    advance(31 * MINUTE);
    expect(await live(token)).toBe(false);
  });

  it('honour ADMIN_SESSION_IDLE_MINUTES, ignoring nonsense and never exceeding the session', async () => {
    vi.stubEnv('ADMIN_SESSION_IDLE_MINUTES', '15');
    const token = await adminSession((await admin()).id);
    advance(15 * MINUTE);
    expect(await live(token)).toBe(false);
    for (const value of ['0', '-1', 'never']) { vi.stubEnv('ADMIN_SESSION_IDLE_MINUTES', value); expect(adminSessionIdleMs()).toBe(60 * MINUTE); }
    vi.stubEnv('ADMIN_SESSION_IDLE_MINUTES', '99999');
    expect(adminSessionIdleMs()).toBe(8 * 60 * MINUTE);
  });

  it('start counting at first use for sessions created before idle tracking', async () => {
    const token = await adminSession((await admin()).id, null);
    advance(3 * 60 * MINUTE);
    expect(await live(token)).toBe(true);
    advance(60 * MINUTE);
    expect(await live(token)).toBe(false);
  });
});

describe('admin sign out everywhere', () => {
  it('ends every admin session of the account and nobody else\'s', async () => {
    const [user, other] = [await admin(), await admin()];
    const [laptop, desktop, theirs] = [await adminSession(user.id), await adminSession(user.id), await adminSession(other.id)];
    expect((await signOut(laptop, '?everywhere=1')).status).toBe(204);
    expect([await live(laptop), await live(desktop), await live(theirs)]).toEqual([false, false, true]);
    const audit = await prisma.healthAudit.findFirst({ where: { actorId: user.id, action: 'ADMIN_LOGOUT' }, orderBy: { createdAt: 'desc' } });
    expect(audit?.detail).toBe('Signed out of admin frontend on every browser');
  });

  it('still signs out only this browser by default', async () => {
    const user = await admin();
    const [laptop, desktop] = [await adminSession(user.id), await adminSession(user.id)];
    expect((await signOut(laptop)).status).toBe(204);
    expect([await live(laptop), await live(desktop)]).toEqual([false, true]);
  });

  it('needs a live session and the admin frontend\'s secret', async () => {
    const user = await admin();
    const [idle, desktop] = [await adminSession(user.id), await adminSession(user.id)];
    advance(30 * MINUTE);
    await live(desktop);
    advance(45 * MINUTE); // `idle` is now 75 minutes unused; `desktop` 45.
    expect((await signOut(idle, '?everywhere=1')).status).toBe(401);
    expect(await live(desktop)).toBe(true);
    const unauthorised = await sessionDELETE(new Request('http://localhost/api/admin/session?everywhere=1', { method: 'DELETE', headers: { authorization: `Bearer ${desktop}` } }));
    expect(unauthorised.status).toBe(401);
    expect(await live(desktop)).toBe(true);
  });

  it('is part of signing out everywhere from the main app, and of a password change or reset', async () => {
    const [user, other] = [await admin(), await admin()];
    const [mine, theirs] = [await adminSession(user.id), await adminSession(other.id)];
    await revokeAllSessions(user.id);
    expect([await live(mine), await live(theirs)]).toEqual([false, true]);
    expect(await revokeAdminSessionsForUser(user.id)).toBe(0);
  });
});
