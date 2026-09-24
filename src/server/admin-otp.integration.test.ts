import bcrypt from 'bcryptjs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from './db';
import { adminTokenHash, adminUserForSession, requestAdminCode, signInAdminPassword, revokeAdminSession, verifyAdminCode } from './admin-otp';
import { requireAdmin } from './admin-auth';
import { POST } from '@/app/api/admin/auth/route';
import { DELETE as sessionDELETE, POST as sessionPOST } from '@/app/api/admin/session/route';
import { GET as meGET } from '@/app/api/admin/me/route';
import { adminIpTarget, ADMIN_IP_ATTEMPT_LIMIT } from './admin-api-session';
import { randomBytes } from 'node:crypto';
import { middleware } from '@/middleware';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ send: vi.fn(), mocked: vi.fn(() => false), jar: new Map<string, string>(), headers: new Headers() }));
vi.mock('@/providers/admin-email', () => ({ adminEmailProvider: { send: mocks.send }, adminEmailConfigured: () => !mocks.mocked() }));
vi.mock('next/headers', () => ({ cookies: async () => ({
  get: (key: string) => mocks.jar.has(key) ? { value: mocks.jar.get(key) } : undefined,
  set: (key: string, value: string) => { mocks.jar.set(key, value); },
  delete: (key: string) => { mocks.jar.delete(key); },
}), headers: async () => mocks.headers }));

const ids: string[] = [];
async function account() {
  const email = `admin-${crypto.randomUUID()}@nexdo.test`;
  process.env.NEXDO_ADMIN_EMAILS = email;
  const user = await prisma.user.create({ data: { email, name: 'Admin', passwordHash: 'unused' } });
  ids.push(user.id);
  return user;
}
function sentCode() { return (mocks.send.mock.calls.at(-1)![0].text as string).match(/code is (\d{6})/)![1]; }
const original = process.env.NEXDO_ADMIN_EMAILS;
const originalSecrets = process.env.ADMIN_API_SECRETS;
beforeEach(() => { mocks.send.mockReset().mockResolvedValue({ status: 'SENT', id: 'mock' }); mocks.mocked.mockReturnValue(false); mocks.jar.clear(); mocks.headers = new Headers(); });
afterAll(async () => {
  if (original === undefined) delete process.env.NEXDO_ADMIN_EMAILS; else process.env.NEXDO_ADMIN_EMAILS = original;
  if (originalSecrets === undefined) delete process.env.ADMIN_API_SECRETS; else process.env.ADMIN_API_SECRETS = originalSecrets;
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('admin email OTP', () => {
  it('sends a code, stores only hashes, consumes it once, and revokes the session', async () => {
    const user = await account();
    const id = await requestAdminCode(user.email.toUpperCase());
    const code = sentCode();
    const stored = await prisma.adminLoginToken.findUniqueOrThrow({ where: { id } });
    expect(stored.codeHash).not.toBe(code);
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(590_000);
    const session = await verifyAdminCode(id, code);
    expect(await adminUserForSession(session)).toMatchObject({ id: user.id });
    expect((await prisma.adminLoginToken.findUniqueOrThrow({ where: { id } })).sessionHash).toBe(adminTokenHash(session));
    await expect(verifyAdminCode(id, code)).rejects.toThrow('INVALID_ADMIN_CODE');
    await revokeAdminSession(session);
    expect(await adminUserForSession(session)).toBeNull();
  });
  it('locks the code after five incorrect attempts', async () => {
    const user = await account(); const id = await requestAdminCode(user.email); const code = sentCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await expect(verifyAdminCode(id, wrong)).rejects.toThrow('INVALID_ADMIN_CODE');
    await expect(verifyAdminCode(id, code)).rejects.toThrow('INVALID_ADMIN_CODE');
  });
  it('rejects expired codes and expired sessions', async () => {
    const user = await account(); const id = await requestAdminCode(user.email); const code = sentCode();
    await prisma.adminLoginToken.update({ where: { id }, data: { expiresAt: new Date(0) } });
    await expect(verifyAdminCode(id, code)).rejects.toThrow('INVALID_ADMIN_CODE');
    await prisma.adminLoginToken.update({ where: { id }, data: { expiresAt: new Date(Date.now() + 60_000) } });
    const session = await verifyAdminCode(id, code);
    await prisma.adminLoginToken.update({ where: { id }, data: { sessionExpiresAt: new Date(0) } });
    expect(await adminUserForSession(session)).toBeNull();
  });
  it('throttles resends and invalidates the previous code', async () => {
    const user = await account(); const first = await requestAdminCode(user.email); const oldCode = sentCode();
    await expect(requestAdminCode(user.email)).rejects.toThrow('RATE_LIMITED');
    await prisma.adminLoginToken.update({ where: { id: first }, data: { createdAt: new Date(Date.now() - 61_000) } });
    const second = await requestAdminCode(user.email);
    await expect(verifyAdminCode(first, oldCode)).rejects.toThrow('INVALID_ADMIN_CODE');
    await prisma.adminLoginToken.update({ where: { id: second }, data: { createdAt: new Date(Date.now() - 61_000) } });
    const third = await requestAdminCode(user.email);
    await prisma.adminLoginToken.update({ where: { id: third }, data: { createdAt: new Date(Date.now() - 61_000) } });
    await expect(requestAdminCode(user.email)).rejects.toThrow('RATE_LIMITED');
  });
  it('allows only one concurrent redemption', async () => {
    const user = await account(); const id = await requestAdminCode(user.email); const code = sentCode();
    const results = await Promise.allSettled([verifyAdminCode(id, code), verifyAdminCode(id, code)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('does not send codes to non-admins, and rejects removed admins', async () => {
    const user = await account();
    const unknown = await requestAdminCode('stranger@nexdo.test');
    expect(mocks.send).not.toHaveBeenCalled();
    await expect(verifyAdminCode(unknown, '123456')).rejects.toThrow('INVALID_ADMIN_CODE');
    const id = await requestAdminCode(user.email); const code = sentCode();
    process.env.NEXDO_ADMIN_EMAILS = '';
    await expect(verifyAdminCode(id, code)).rejects.toThrow('INVALID_ADMIN_CODE');
    process.env.NEXDO_ADMIN_EMAILS = user.email;
    const session = await verifyAdminCode(id, code);
    process.env.NEXDO_ADMIN_EMAILS = '';
    expect(await adminUserForSession(session)).toBeNull();
  });
  it('fails closed when delivery is missing or fails', async () => {
    const user = await account(); mocks.mocked.mockReturnValue(true);
    await expect(requestAdminCode(user.email)).rejects.toThrow('EMAIL_UNAVAILABLE');
    mocks.mocked.mockReturnValue(false); mocks.send.mockResolvedValue({ status: 'FAILED' });
    await expect(requestAdminCode(user.email)).rejects.toThrow('EMAIL_UNAVAILABLE');
    const token = await prisma.adminLoginToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(token.usedAt).not.toBeNull();
  });
  it('requires an OTP admin session even with a normal account cookie', async () => {
    mocks.jar.set('harbor_session', 'normal-account-session');
    await expect(requireAdmin()).rejects.toThrow('UNAUTHENTICATED');
    const user = await account(); const id = await requestAdminCode(user.email);
    mocks.jar.set('nexdo_admin_session', await verifyAdminCode(id, sentCode()));
    expect(await requireAdmin()).toMatchObject({ id: user.id });
  });
  it('uses password authentication, rejects OTP and preserves the origin guard and logout', async () => {
    const user = await account();
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash('valid-test-password', 4), emailVerifiedAt: new Date() } });
    const request = (body: object, origin = 'http://localhost') => POST(new Request('http://localhost/api/admin/auth', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    const body = { action: 'login', email: user.email, password: 'valid-test-password' };
    expect((await request(body, 'https://other.test')).status).toBe(403);
    expect((await request({ action: 'request', email: user.email })).status).toBe(400);
    expect((await request({ ...body, password: 'wrong' })).status).toBe(401);
    expect((await request(body)).status).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
    const session = mocks.jar.get('nexdo_admin_session')!;
    expect(await adminUserForSession(session)).toMatchObject({ id: user.id });
    expect((await request({ action: 'logout' })).status).toBe(200);
    expect(await adminUserForSession(session)).toBeNull();
  });
  it('rate limits password attempts and rejects non-admin or unverified accounts', async () => {
    const user = await account();
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash('valid-test-password', 4) } });
    await expect(signInAdminPassword(user.email, 'valid-test-password')).rejects.toThrow('INVALID_ADMIN_PASSWORD');
    process.env.NEXDO_ADMIN_EMAILS = '';
    await expect(signInAdminPassword(user.email, 'valid-test-password')).rejects.toThrow('INVALID_ADMIN_PASSWORD');
    process.env.NEXDO_ADMIN_EMAILS = user.email;
    for (let i = 0; i < 4; i++) await expect(signInAdminPassword(user.email, 'wrong')).rejects.toThrow('INVALID_ADMIN_PASSWORD');
    await expect(signInAdminPassword(user.email, 'wrong')).rejects.toThrow('RATE_LIMITED');
  });
  it('lets admin pages reach their own OTP gate without an ordinary account cookie', () => {
    for (const path of ['/admin/login', '/admin', '/admin/users']) {
      const result = middleware(new NextRequest(`http://localhost${path}`));
      expect(result.headers.get('location')).toBeNull();
    }
    expect(middleware(new NextRequest('http://localhost/tasks')).headers.get('location')).toContain('/login');
  });
});

describe('admin frontend bearer sessions', () => {
  const secret = randomBytes(24).toString('hex');
  const ip = () => `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 250)).join('.')}`;
  // Route handlers read the bearer through next/headers, so each request also becomes the mocked header set.
  function request(path: string, init: { method?: string; headers?: Record<string, string>; body?: object } = {}) {
    const value = new Request(`http://backend.test${path}`, { method: init.method ?? 'GET', headers: { 'Content-Type': 'application/json', ...init.headers }, body: init.body ? JSON.stringify(init.body) : undefined });
    mocks.headers = value.headers;
    return value;
  }
  const client = (extra: Record<string, string> = {}, clientSecret: string | null = secret) => ({ ...(clientSecret ? { 'X-Admin-Client': clientSecret } : {}), ...extra });
  const bearer = (token: string, clientSecret: string | null = secret) => client({ Authorization: `Bearer ${token}` }, clientSecret);
  async function passwordAdmin() {
    const user = await account();
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash('valid-test-password', 4), emailVerifiedAt: new Date() } });
    return user;
  }
  async function signIn(email: string, clientIp = ip(), password = 'valid-test-password') {
    return sessionPOST(request('/api/admin/session', { method: 'POST', headers: client({ 'X-Admin-Client-IP': clientIp }), body: { email, password } }));
  }
  const me = (headers?: Record<string, string>) => { request('/api/admin/me', { headers }); return meGET(); };
  const audits = (targetId: string) => prisma.healthAudit.findMany({ where: { targetId }, orderBy: { createdAt: 'asc' } });
  beforeEach(() => { process.env.ADMIN_API_SECRETS = `unused-rotated-secret-value-000000000000,${secret}`; delete process.env.NEXDO_HEALTH_ENABLED; });

  it('issues a bearer session only to the admin client and audits it', async () => {
    const user = await passwordAdmin(); const clientIp = ip();
    const body = { email: user.email, password: 'valid-test-password' };
    expect((await sessionPOST(request('/api/admin/session', { method: 'POST', body }))).status).toBe(401);
    expect((await sessionPOST(request('/api/admin/session', { method: 'POST', headers: client({}, 'wrong-secret-of-sufficient-length-0000000'), body }))).status).toBe(401);
    process.env.ADMIN_API_SECRETS = 'short';
    expect((await sessionPOST(request('/api/admin/session', { method: 'POST', headers: client({}, 'short'), body }))).status).toBe(401);
    process.env.ADMIN_API_SECRETS = secret;
    const response = await signIn(user.email, clientIp);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const session = await response.json();
    expect(session).toMatchObject({ token: expect.stringMatching(/^[a-f0-9]{64}$/), user: { id: user.id, name: user.name, email: user.email } });
    expect(Object.keys(session.user).sort()).toEqual(['email', 'id', 'name']);
    expect(Date.parse(session.expiresAt) - Date.now()).toBeGreaterThan(7.9 * 60 * 60_000);
    expect(mocks.jar.size).toBe(0);
    const current = await me(bearer(session.token));
    expect(current.status).toBe(200);
    expect(await current.json()).toEqual({ id: user.id, name: user.name, email: user.email, canOperate: false });
    expect((await audits(adminIpTarget(clientIp))).map((row) => [row.action, row.actorId])).toEqual([['ADMIN_LOGIN', user.id]]);
  });

  it('rejects a bearer without the client secret, with a wrong secret, or in a malformed header', async () => {
    const user = await passwordAdmin();
    const { token } = await (await signIn(user.email)).json();
    expect((await me(bearer(token, null))).status).toBe(401);
    expect((await me(bearer(token, `${secret}x`))).status).toBe(401);
    expect((await me(client({ Authorization: `bearer ${token}` }))).status).toBe(401);
    expect((await me(client({ Authorization: token }))).status).toBe(401);
    process.env.ADMIN_API_SECRETS = '';
    expect((await me(bearer(token))).status).toBe(401);
    await expect(requireAdmin()).rejects.toThrow('UNAUTHENTICATED');
  });

  it('rejects a bearer once the email leaves the allowlist, or the session is revoked or expired', async () => {
    const user = await passwordAdmin();
    const first = (await (await signIn(user.email)).json()).token;
    process.env.NEXDO_ADMIN_EMAILS = '';
    expect((await me(bearer(first))).status).toBe(401);
    process.env.NEXDO_ADMIN_EMAILS = user.email;
    expect((await me(bearer(first))).status).toBe(200);
    await prisma.adminLoginToken.update({ where: { sessionHash: adminTokenHash(first) }, data: { sessionExpiresAt: new Date(Date.now() - 1000) } });
    expect((await me(bearer(first))).status).toBe(401);

    const clientIp = ip();
    const second = (await (await signIn(user.email, clientIp)).json()).token;
    expect((await sessionDELETE(request('/api/admin/session', { method: 'DELETE', headers: bearer(second, null) }))).status).toBe(401);
    expect((await me(bearer(second))).status).toBe(200);
    const deleted = await sessionDELETE(request('/api/admin/session', { method: 'DELETE', headers: { ...bearer(second), 'X-Admin-Client-IP': clientIp } }));
    expect(deleted.status).toBe(204);
    expect((await me(bearer(second))).status).toBe(401);
    expect((await sessionDELETE(request('/api/admin/session', { method: 'DELETE', headers: bearer(second) }))).status).toBe(204);
    expect((await audits(adminIpTarget(clientIp))).map((row) => row.action)).toEqual(['ADMIN_LOGIN', 'ADMIN_LOGOUT']);
  });

  it('keeps the cookie flow unchanged alongside bearer sessions', async () => {
    const user = await passwordAdmin();
    const cookieLogin = await POST(new Request('http://localhost/api/admin/auth', { method: 'POST', headers: { origin: 'http://localhost', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', email: user.email, password: 'valid-test-password' }) }));
    expect(cookieLogin.status).toBe(200);
    expect((await me()).status).toBe(200);
    // A bad bearer falls back to the valid cookie rather than locking the browser session out.
    expect(await (await me(bearer('0'.repeat(64)))).json()).toMatchObject({ id: user.id });
    mocks.jar.clear();
    expect((await me()).status).toBe(401);
  });

  it('limits attempts per account and per client IP, auditing failures and blocks', async () => {
    const user = await passwordAdmin(); const clientIp = ip();
    for (let i = 0; i < 5; i++) expect((await signIn(user.email, clientIp, 'wrong')).status).toBe(401);
    expect((await signIn(user.email, clientIp)).status).toBe(429);
    const accountRows = await audits(adminIpTarget(clientIp));
    expect(accountRows.map((row) => row.action)).toEqual([...Array(5).fill('ADMIN_LOGIN_FAILED'), 'ADMIN_RATE_LIMITED']);
    expect(accountRows.map((row) => row.detail).join(' ')).not.toContain(user.email);

    const other = await passwordAdmin(); const busyIp = ip(); const target = adminIpTarget(busyIp);
    await prisma.healthAudit.createMany({ data: Array.from({ length: ADMIN_IP_ATTEMPT_LIMIT - 1 }, () => ({ actorId: 'anonymous', action: 'ADMIN_LOGIN_FAILED', targetId: target, detail: 'seeded' })) });
    expect((await signIn(other.email, busyIp, 'wrong')).status).toBe(401);
    expect((await signIn(other.email, busyIp)).status).toBe(429);
    expect((await audits(target)).at(-1)).toMatchObject({ action: 'ADMIN_RATE_LIMITED', actorId: 'anonymous' });
    expect((await signIn(other.email, ip())).status).toBe(200);
    // Attempts older than the 15-minute window no longer count. HealthAudit is append-only, so seed aged rows.
    const agedIp = ip();
    await prisma.healthAudit.createMany({ data: Array.from({ length: ADMIN_IP_ATTEMPT_LIMIT + 5 }, () => ({ actorId: 'anonymous', action: 'ADMIN_LOGIN_FAILED', targetId: adminIpTarget(agedIp), detail: 'seeded', createdAt: new Date(Date.now() - 16 * 60_000) })) });
    expect((await signIn(other.email, agedIp)).status).toBe(200);
  });
});
