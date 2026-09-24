import bcrypt from 'bcryptjs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from './db';
import { adminTokenHash, adminUserForSession, requestAdminCode, signInAdminPassword, revokeAdminSession, verifyAdminCode } from './admin-otp';
import { requireAdmin } from './admin-auth';
import { POST } from '@/app/api/admin/auth/route';
import { middleware } from '@/middleware';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ send: vi.fn(), mocked: vi.fn(() => false), jar: new Map<string, string>() }));
vi.mock('@/providers/admin-email', () => ({ adminEmailProvider: { send: mocks.send }, adminEmailConfigured: () => !mocks.mocked() }));
vi.mock('next/headers', () => ({ cookies: async () => ({
  get: (key: string) => mocks.jar.has(key) ? { value: mocks.jar.get(key) } : undefined,
  set: (key: string, value: string) => { mocks.jar.set(key, value); },
  delete: (key: string) => { mocks.jar.delete(key); },
}) }));

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
beforeEach(() => { mocks.send.mockReset().mockResolvedValue({ status: 'SENT', id: 'mock' }); mocks.mocked.mockReturnValue(false); mocks.jar.clear(); });
afterAll(async () => {
  if (original === undefined) delete process.env.NEXDO_ADMIN_EMAILS; else process.env.NEXDO_ADMIN_EMAILS = original;
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
