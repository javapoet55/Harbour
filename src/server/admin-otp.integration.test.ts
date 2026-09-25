import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from './db';
import { adminTokenHash, adminUserForSession, requestAdminCode, revokeAdminSession, verifyAdminCode, verifyAdminCodeForEmail } from './admin-otp';
import { requireAdmin } from './admin-auth';
import { DELETE as sessionDELETE, POST as sessionPOST } from '@/app/api/admin/session/route';
import { GET as meGET } from '@/app/api/admin/me/route';
import { ADMIN_CODE_REQUESTS_PER_EMAIL, ADMIN_CODE_REQUESTS_PER_IP, ADMIN_VERIFY_ATTEMPTS_PER_IP } from './admin-api-session';
import { adminEmailTarget, adminIpTarget } from './admin-audit';
import { randomBytes } from 'node:crypto';

const mocks = vi.hoisted(() => ({ jar: new Map<string, string>(), headers: new Headers() }));
vi.mock('next/headers', () => ({ cookies: async () => ({
  get: (key: string) => mocks.jar.has(key) ? { value: mocks.jar.get(key) } : undefined,
  set: (key: string, value: string) => { mocks.jar.set(key, value); },
  delete: (key: string) => { mocks.jar.delete(key); },
}), headers: async () => mocks.headers }));

// SendGrid is mocked at the HTTP boundary, so codes travel the real provider path.
type Sent = { to: string; from: { email: string; name: string }; subject: string; text: string; html: string };
const sent: Sent[] = [];
const sendgrid = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url !== 'https://api.sendgrid.com/v3/mail/send') throw new Error(`Unexpected request to ${url}`);
  const body = JSON.parse(String(init?.body));
  sent.push({ to: body.personalizations[0].to[0].email, from: body.from, subject: body.subject, text: body.content[0].value, html: body.content[1].value });
  return new Response(null, { status: 202, headers: { 'x-message-id': `sg-${sent.length}` } });
});
const codeIn = (message: Sent) => message.text.match(/Your code is (\d{6})\./)![1];
const sentTo = (email: string) => sent.filter((message) => message.to === email);
/** Requests a code through the service and returns what was emailed. */
async function emailedCode(email: string) {
  const { id, delivery } = await requestAdminCode(email);
  expect(await delivery).toEqual({ outcome: 'sent' });
  return { id, code: codeIn(sentTo(email.toLowerCase()).at(-1)!) };
}

const ids: string[] = [];
async function account(extra: { verified?: boolean } = {}) {
  const email = `admin-${crypto.randomUUID()}@nexdo.test`;
  process.env.NEXDO_ADMIN_EMAILS = email;
  const user = await prisma.user.create({ data: { email, name: 'Admin', passwordHash: 'unused', emailVerifiedAt: extra.verified === false ? null : new Date() } });
  ids.push(user.id);
  return user;
}
const saved = { emails: process.env.NEXDO_ADMIN_EMAILS, secrets: process.env.ADMIN_API_SECRETS };
beforeEach(() => {
  sent.length = 0; sendgrid.mockClear(); mocks.jar.clear(); mocks.headers = new Headers();
  vi.stubGlobal('fetch', sendgrid);
  vi.stubEnv('SENDGRID_API_KEY', 'test-sendgrid-key');
  vi.stubEnv('EMAIL_FROM_ADDRESS', 'hello@nexdo.test');
  vi.stubEnv('NEXDO_ADMIN_FROM_EMAIL', 'admin-codes@nexdo.test');
  vi.stubEnv('NEXDO_HEALTH_ENABLED', '');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
afterAll(async () => {
  if (saved.emails === undefined) delete process.env.NEXDO_ADMIN_EMAILS; else process.env.NEXDO_ADMIN_EMAILS = saved.emails;
  if (saved.secrets === undefined) delete process.env.ADMIN_API_SECRETS; else process.env.ADMIN_API_SECRETS = saved.secrets;
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('admin email codes', () => {
  it('emails a hashed, single-use, 10-minute code through SendGrid and creates a revocable session', async () => {
    const user = await account();
    const { id, code } = await emailedCode(user.email.toUpperCase());
    const [message] = sentTo(user.email);
    expect(message.subject).toBe('Your Nexdo admin sign-in code');
    expect(message.from).toEqual({ email: 'admin-codes@nexdo.test', name: 'Nexdo' });
    expect(message.text).toContain('It expires in 10 minutes.');
    expect(message.text).toContain("If you didn't try to sign in, ignore this email.");
    expect(message.html).not.toMatch(/<a\s/i);
    const stored = await prisma.adminLoginToken.findUniqueOrThrow({ where: { id } });
    expect(stored.codeHash).not.toContain(code);
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(590_000);
    expect(stored.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(600_000);
    const session = await verifyAdminCodeForEmail(user.email, code);
    expect(await adminUserForSession(session)).toMatchObject({ id: user.id });
    expect((await prisma.adminLoginToken.findUniqueOrThrow({ where: { id } })).sessionHash).toBe(adminTokenHash(session));
    await expect(verifyAdminCodeForEmail(user.email, code)).rejects.toThrow('INVALID_ADMIN_CODE');
    await revokeAdminSession(session);
    expect(await adminUserForSession(session)).toBeNull();
  });

  it('rejects wrong codes and locks the code after five wrong tries', async () => {
    const user = await account(); const { code } = await emailedCode(user.email);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await expect(verifyAdminCodeForEmail(user.email, wrong)).rejects.toThrow('INVALID_ADMIN_CODE');
    await expect(verifyAdminCodeForEmail(user.email, code)).rejects.toThrow('INVALID_ADMIN_CODE');
    await expect(verifyAdminCodeForEmail(user.email, 'abcdef')).rejects.toThrow('INVALID_ADMIN_CODE');
  });

  it('rejects expired codes and expired sessions', async () => {
    const user = await account(); const { id, code } = await emailedCode(user.email);
    await prisma.adminLoginToken.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(verifyAdminCodeForEmail(user.email, code)).rejects.toThrow('INVALID_ADMIN_CODE');
    const fresh = await emailedCode(user.email);
    const session = await verifyAdminCodeForEmail(user.email, fresh.code);
    await prisma.adminLoginToken.update({ where: { id: fresh.id }, data: { sessionExpiresAt: new Date(0) } });
    expect(await adminUserForSession(session)).toBeNull();
  });

  it('invalidates the previous code when a new one is requested', async () => {
    const user = await account();
    const first = await emailedCode(user.email);
    const second = await emailedCode(user.email);
    if (first.code !== second.code) await expect(verifyAdminCodeForEmail(user.email, first.code)).rejects.toThrow('INVALID_ADMIN_CODE');
    await expect(verifyAdminCode(first.id, first.code)).rejects.toThrow('INVALID_ADMIN_CODE');
    expect(await adminUserForSession(await verifyAdminCodeForEmail(user.email, second.code))).toMatchObject({ id: user.id });
  });

  it('allows only one concurrent redemption', async () => {
    const user = await account(); const { code } = await emailedCode(user.email);
    const results = await Promise.allSettled([verifyAdminCodeForEmail(user.email, code), verifyAdminCodeForEmail(user.email, code)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('sends nothing to unknown, non-admin, missing or deleted accounts, with the same result shape', async () => {
    const admin = await account();
    const ghost = `ghost-${crypto.randomUUID()}@nexdo.test`;
    const outsider = await prisma.user.create({ data: { email: `outsider-${crypto.randomUUID()}@nexdo.test`, name: 'Outsider', passwordHash: 'unused' } });
    ids.push(outsider.id);
    for (const email of ['stranger@nexdo.test', outsider.email]) {
      const result = await requestAdminCode(email);
      expect(Object.keys(result).sort()).toEqual(['delivery', 'id']);
      expect(result.id).toMatch(/^[a-f0-9]{64}$/);
      expect(await result.delivery).toEqual({ outcome: 'not_allowed' });
    }
    process.env.NEXDO_ADMIN_EMAILS = `${admin.email},${ghost}`;
    expect(await (await requestAdminCode(ghost)).delivery).toEqual({ outcome: 'no_account' });
    await prisma.user.update({ where: { id: admin.id }, data: { deletedAt: new Date() } });
    expect(await (await requestAdminCode(admin.email)).delivery).toEqual({ outcome: 'deleted_account' });
    expect(sent).toHaveLength(0);
    expect(await prisma.adminLoginToken.count({ where: { userId: { in: [admin.id, outsider.id] } } })).toBe(0);
    await expect(verifyAdminCodeForEmail('stranger@nexdo.test', '123456')).rejects.toThrow('INVALID_ADMIN_CODE');
  });

  it('rejects a code once the email is removed from NEXDO_ADMIN_EMAILS, and has no built-in admins', async () => {
    const user = await account(); const { code } = await emailedCode(user.email);
    process.env.NEXDO_ADMIN_EMAILS = '';
    await expect(verifyAdminCodeForEmail(user.email, code)).rejects.toThrow('INVALID_ADMIN_CODE');
    expect(await (await requestAdminCode('jsriramk@gmail.com')).delivery).toEqual({ outcome: 'not_allowed' });
    process.env.NEXDO_ADMIN_EMAILS = user.email;
    const session = await verifyAdminCodeForEmail(user.email, code);
    process.env.NEXDO_ADMIN_EMAILS = '';
    expect(await adminUserForSession(session)).toBeNull();
  });

  it('does not require emailVerifiedAt: receiving the code proves control of the inbox', async () => {
    const user = await account({ verified: false });
    const { code } = await emailedCode(user.email);
    expect(await adminUserForSession(await verifyAdminCodeForEmail(user.email, code))).toMatchObject({ id: user.id });
  });

  it('fails closed when SendGrid is not configured, rejects the email or cannot be reached, and reports why', async () => {
    const user = await account();
    vi.stubEnv('SENDGRID_API_KEY', '');
    expect(await (await requestAdminCode(user.email)).delivery).toEqual({ outcome: 'send_failed', errorCode: 'not_configured' });
    expect(await prisma.adminLoginToken.count({ where: { userId: user.id } })).toBe(0);
    vi.stubEnv('SENDGRID_API_KEY', 'test-sendgrid-key');
    sendgrid.mockImplementationOnce(async () => new Response('{"errors":[{"message":"secret detail"}]}', { status: 403 }));
    const rejected = await requestAdminCode(user.email);
    expect(await rejected.delivery).toEqual({ outcome: 'send_failed', providerStatus: 403, errorCode: undefined });
    expect((await prisma.adminLoginToken.findUniqueOrThrow({ where: { id: rejected.id } })).usedAt).not.toBeNull();
    sendgrid.mockImplementationOnce(async () => { throw new TypeError('fetch failed', { cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) }); });
    expect(await (await requestAdminCode(user.email)).delivery).toEqual({ outcome: 'send_failed', errorCode: 'ECONNRESET' });
  });

  it('requires an admin bearer from the admin frontend: neither app nor legacy admin cookies count', async () => {
    mocks.jar.set('harbor_session', 'normal-account-session');
    await expect(requireAdmin()).rejects.toThrow('UNAUTHENTICATED');
    const user = await account(); const { code } = await emailedCode(user.email);
    const session = await verifyAdminCodeForEmail(user.email, code);
    mocks.jar.set('nexdo_admin_session', session);
    await expect(requireAdmin()).rejects.toThrow('UNAUTHENTICATED');
    const secret = randomBytes(24).toString('hex');
    process.env.ADMIN_API_SECRETS = secret;
    mocks.headers = new Headers({ Authorization: `Bearer ${session}`, 'X-Admin-Client': secret });
    expect(await requireAdmin()).toMatchObject({ id: user.id });
  });
});

describe('admin frontend code sign-in and bearer sessions', () => {
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
  const post = (body: object, clientIp = ip(), clientSecret: string | null = secret) => sessionPOST(request('/api/admin/session', { method: 'POST', headers: client({ 'X-Admin-Client-IP': clientIp }, clientSecret), body }));
  /** Asks for a code through the API and waits for the (asynchronous) email. */
  async function requestCode(email: string, clientIp = ip()) {
    const before = sentTo(email).length;
    const response = await post({ action: 'request', email }, clientIp);
    expect(response.status).toBe(200);
    return vi.waitFor(() => { const message = sentTo(email)[before]; if (!message) throw new Error('No email yet'); return codeIn(message); });
  }
  async function signIn(email: string, clientIp = ip()) {
    return post({ action: 'verify', email, code: await requestCode(email, clientIp) }, clientIp);
  }
  const me = (headers?: Record<string, string>) => { request('/api/admin/me', { headers }); return meGET(); };
  const audits = (where: { targetId?: string; detail?: string }) => prisma.healthAudit.findMany({ where, orderBy: { createdAt: 'asc' } });
  beforeEach(() => { process.env.ADMIN_API_SECRETS = `unused-rotated-secret-value-000000000000,${secret}`; });

  it('answers every code request identically and emails only allowlisted accounts', async () => {
    const admin = await account();
    const outsider = await prisma.user.create({ data: { email: `outsider-${crypto.randomUUID()}@nexdo.test`, name: 'Outsider', passwordHash: 'unused' } });
    ids.push(outsider.id);
    const responses = [];
    for (const email of [admin.email, outsider.email, `nobody-${crypto.randomUUID()}@nexdo.test`]) {
      const response = await post({ action: 'request', email });
      responses.push({ status: response.status, body: await response.text(), cache: response.headers.get('cache-control') });
    }
    expect(new Set(responses.map((response) => JSON.stringify(response))).size).toBe(1);
    expect(responses[0]).toMatchObject({ status: 200, cache: 'private, no-store' });
    await vi.waitFor(() => expect(sentTo(admin.email)).toHaveLength(1));
    expect(sent).toHaveLength(1);
  });

  it('requires the admin client secret and accepts only request and verify actions', async () => {
    const user = await account();
    expect((await post({ action: 'request', email: user.email }, ip(), null)).status).toBe(401);
    expect((await post({ action: 'request', email: user.email }, ip(), 'wrong-secret-of-sufficient-length-0000000')).status).toBe(401);
    process.env.ADMIN_API_SECRETS = 'short';
    expect((await post({ action: 'request', email: user.email }, ip(), 'short')).status).toBe(401);
    process.env.ADMIN_API_SECRETS = secret;
    expect((await post({ email: user.email, password: 'valid-test-password' })).status).toBe(400);
    expect((await post({ action: 'login', email: user.email, password: 'valid-test-password' })).status).toBe(400);
    expect((await post({ action: 'verify', email: user.email, code: '12345' })).status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('issues a bearer session for a valid code and audits the whole flow without the email or code', async () => {
    const user = await account(); const clientIp = ip(); const started = new Date();
    const code = await requestCode(user.email, clientIp);
    const wrong = code === '000000' ? '111111' : '000000';
    const rejected = await post({ action: 'verify', email: user.email, code: wrong }, clientIp);
    expect(rejected.status).toBe(401);
    const response = await post({ action: 'verify', email: user.email, code }, clientIp);
    expect(response.status).toBe(200);
    const session = await response.json();
    expect(session).toMatchObject({ token: expect.stringMatching(/^[a-f0-9]{64}$/), user: { id: user.id, name: user.name, email: user.email } });
    expect(Object.keys(session.user).sort()).toEqual(['email', 'id', 'name']);
    expect(Date.parse(session.expiresAt) - Date.now()).toBeGreaterThan(7.9 * 60 * 60_000);
    expect((await post({ action: 'verify', email: user.email, code }, clientIp)).status).toBe(401);
    expect(mocks.jar.size).toBe(0);
    const current = await me(bearer(session.token));
    expect(await current.json()).toEqual({ id: user.id, name: user.name, email: user.email, canOperate: false });

    const ipTarget = adminIpTarget(clientIp);
    expect((await audits({ targetId: adminEmailTarget(user.email) })).map((row) => [row.action, row.detail])).toEqual([['ADMIN_CODE_REQUESTED', ipTarget]]);
    expect((await audits({ targetId: ipTarget })).map((row) => [row.action, row.actorId])).toEqual([['ADMIN_LOGIN_FAILED', 'anonymous'], ['ADMIN_LOGIN', user.id], ['ADMIN_LOGIN_FAILED', 'anonymous']]);
    const rows = JSON.stringify(await prisma.healthAudit.findMany({ where: { createdAt: { gte: started } } }));
    expect(rows).not.toContain(user.email);
    expect(rows).not.toContain(user.email.split('@')[0]);
    expect(rows).not.toContain(code);
    expect(rows).not.toContain(clientIp);
  });

  it('limits code requests per email, whether or not the address is an admin', async () => {
    const admin = await account(); const nobody = `nobody-${crypto.randomUUID()}@nexdo.test`;
    for (const email of [admin.email, nobody]) {
      for (let i = 0; i < ADMIN_CODE_REQUESTS_PER_EMAIL; i++) expect((await post({ action: 'request', email })).status).toBe(200);
      const limited = await post({ action: 'request', email });
      expect(limited.status).toBe(429);
      expect(await audits({ targetId: adminEmailTarget(email) })).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'ADMIN_RATE_LIMITED' })]));
    }
    await vi.waitFor(() => expect(sentTo(admin.email)).toHaveLength(ADMIN_CODE_REQUESTS_PER_EMAIL));
  });

  it('limits code requests per IP', async () => {
    const clientIp = ip();
    for (let i = 0; i < ADMIN_CODE_REQUESTS_PER_IP; i++) expect((await post({ action: 'request', email: `ip-${i}-${crypto.randomUUID()}@nexdo.test` }, clientIp)).status).toBe(200);
    expect((await post({ action: 'request', email: `ip-over-${crypto.randomUUID()}@nexdo.test` }, clientIp)).status).toBe(429);
    expect((await audits({ targetId: adminIpTarget(clientIp) })).map((row) => row.action)).toEqual(['ADMIN_RATE_LIMITED']);
    expect((await post({ action: 'request', email: `ip-other-${crypto.randomUUID()}@nexdo.test` })).status).toBe(200);
  });

  it('limits code attempts per IP, counting only the last 15 minutes', async () => {
    const user = await account(); const busyIp = ip(); const target = adminIpTarget(busyIp);
    const code = await requestCode(user.email, ip());
    await prisma.healthAudit.createMany({ data: Array.from({ length: ADMIN_VERIFY_ATTEMPTS_PER_IP }, () => ({ actorId: 'anonymous', action: 'ADMIN_LOGIN_FAILED', targetId: target, detail: 'seeded' })) });
    expect((await post({ action: 'verify', email: user.email, code }, busyIp)).status).toBe(429);
    expect((await audits({ targetId: target })).at(-1)).toMatchObject({ action: 'ADMIN_RATE_LIMITED', actorId: 'anonymous' });
    // HealthAudit is append-only, so the window is checked with rows seeded in the past.
    const agedIp = ip();
    await prisma.healthAudit.createMany({ data: Array.from({ length: ADMIN_VERIFY_ATTEMPTS_PER_IP + 5 }, () => ({ actorId: 'anonymous', action: 'ADMIN_LOGIN_FAILED', targetId: adminIpTarget(agedIp), detail: 'seeded', createdAt: new Date(Date.now() - 16 * 60_000) })) });
    expect((await post({ action: 'verify', email: user.email, code }, agedIp)).status).toBe(200);
  });

  it('logs one admin_code_request line per request with the outcome only', async () => {
    const lines: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, method).mockImplementation((...args) => { lines.push(args.map(String).join(' ')); });
    const entries = () => lines.map((line) => JSON.parse(line)).filter((entry) => entry.event === 'admin_code_request');
    const outcomeFor = async (email: string, clientIp = ip()) => {
      const before = entries().length;
      expect((await post({ action: 'request', email }, clientIp)).status).toBe(200);
      return vi.waitFor(() => { const next = entries().slice(before); expect(next).toHaveLength(1); return next[0]; });
    };
    const admin = await account(); const ghost = `ghost-${crypto.randomUUID()}@nexdo.test`;
    const removed = await prisma.user.create({ data: { email: `removed-${crypto.randomUUID()}@nexdo.test`, name: 'Removed', passwordHash: 'unused', deletedAt: new Date() } });
    ids.push(removed.id);
    process.env.NEXDO_ADMIN_EMAILS = [admin.email, ghost, removed.email].join(',');
    expect(await outcomeFor(admin.email)).toMatchObject({ level: 'info', outcome: 'sent' });
    expect(await outcomeFor(`nobody-${crypto.randomUUID()}@nexdo.test`)).toMatchObject({ outcome: 'not_allowed' });
    expect(await outcomeFor(ghost)).toMatchObject({ outcome: 'no_account' });
    expect(await outcomeFor(removed.email)).toMatchObject({ outcome: 'deleted_account' });
    sendgrid.mockImplementationOnce(async () => new Response('{"errors":[{"message":"The from address does not match a verified Sender Identity"}]}', { status: 403 }));
    expect(await outcomeFor(admin.email)).toMatchObject({ level: 'warn', outcome: 'send_failed', providerStatus: 403 });
    expect(await outcomeFor(admin.email)).toMatchObject({ outcome: 'sent' });
    expect((await post({ action: 'request', email: admin.email })).status).toBe(429);
    expect(entries().at(-1)).toMatchObject({ outcome: 'rate_limited_email' });
    const busyIp = ip();
    await prisma.healthAudit.createMany({ data: Array.from({ length: ADMIN_CODE_REQUESTS_PER_IP }, () => ({ actorId: 'anonymous', action: 'ADMIN_CODE_REQUESTED', targetId: 'email:seeded', detail: adminIpTarget(busyIp) })) });
    expect((await post({ action: 'request', email: `nobody-${crypto.randomUUID()}@nexdo.test` }, busyIp)).status).toBe(429);
    expect(entries().at(-1)).toMatchObject({ outcome: 'rate_limited_ip' });
    expect(entries()).toHaveLength(8);

    const all = lines.join('\n');
    for (const email of [admin.email, ghost, removed.email]) expect(all).not.toContain(email);
    for (const code of sent.map(codeIn)) expect(all).not.toContain(code);
    expect(all).not.toContain('Sender Identity');
    for (const entry of entries()) expect(Object.keys(entry).every((key) => ['ts', 'level', 'event', 'outcome', 'providerStatus', 'errorCode'].includes(key))).toBe(true);
  });

  it('never logs the email address or the code', async () => {
    const logged: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, method).mockImplementation((...args) => { logged.push(args.map(String).join(' ')); });
    const user = await account();
    const response = await signIn(user.email);
    expect(response.status).toBe(200);
    const code = codeIn(sentTo(user.email).at(-1)!);
    await post({ action: 'request', email: `nobody-${crypto.randomUUID()}@nexdo.test` });
    expect(logged.join('\n')).not.toContain(user.email);
    expect(logged.join('\n')).not.toContain(code);
  });

  it('rejects a bearer without the client secret, with a wrong secret, or in a malformed header', async () => {
    const user = await account();
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
    const user = await account();
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
    expect((await audits({ targetId: adminIpTarget(clientIp) })).map((row) => row.action)).toEqual(['ADMIN_LOGIN', 'ADMIN_LOGOUT']);
  });

  it('ignores the retired nexdo_admin_session cookie, even holding a live session', async () => {
    const user = await account();
    const token = (await (await signIn(user.email)).json()).token;
    mocks.jar.set('nexdo_admin_session', token);
    expect((await me()).status).toBe(401);
    expect((await me(bearer('0'.repeat(64)))).status).toBe(401);
    expect(await (await me(bearer(token))).json()).toMatchObject({ id: user.id });
  });
});
