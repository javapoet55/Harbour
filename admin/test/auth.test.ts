import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as authPOST } from '@/app/api/admin/auth/route';
import { POST as insightsPOST } from '@/app/api/admin/insights/route';
import { GET as healthGET, POST as healthPOST } from '@/app/api/admin/health/route';
import { GET as sessionExpiredGET } from '@/app/session-expired/route';
import { adminData } from '@/server/admin-data';
import { adminMeSchema } from '@/contract/session';
import { LOGIN_ATTEMPTS_PER_IP, resetLoginAttempts } from '@/server/login-limit';

const mocks = vi.hoisted(() => ({ cookie: undefined as string | undefined }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => (name === '__Host-nexdo_admin' && mocks.cookie ? { value: mocks.cookie } : undefined) }) }));

const TOKEN = 'a'.repeat(64);
const NEXT = 'b'.repeat(64);
const SECRET = 'test-admin-client-secret-0123456789abcdef';
const backend = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
const call = (index: number) => {
  const [url, init] = backend.mock.calls[index];
  return { url, method: init.method, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
};

function adminRequest(path: string, init: { method?: string; body?: object; origin?: string | null; cookie?: string; forwardedFor?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.origin !== null) headers.origin = init.origin ?? 'https://admin.nexdo.test';
  if (init.cookie) headers.cookie = `__Host-nexdo_admin=${init.cookie}`;
  if (init.forwardedFor) headers['x-forwarded-for'] = init.forwardedFor;
  return new NextRequest(`https://admin.nexdo.test${path}`, { method: init.method ?? 'POST', headers, body: init.body ? JSON.stringify(init.body) : undefined });
}
const auth = (body: object, init: Parameters<typeof adminRequest>[1] = {}) => authPOST(adminRequest('/api/admin/auth', { body, forwardedFor: '203.0.113.9, 10.0.0.2', ...init }));
const requestCode = (init: Parameters<typeof adminRequest>[1] = {}) => auth({ action: 'request', email: 'admin@nexdo.test' }, init);
const verify = (init: Parameters<typeof adminRequest>[1] = {}) => auth({ action: 'verify', email: 'admin@nexdo.test', code: '042917' }, init);
const session = { token: TOKEN, expiresAt: new Date(Date.now() + 8 * 3_600_000).toISOString(), user: { id: 'admin-1', name: 'Admin', email: 'admin@nexdo.test' } };
const accepted = { ok: true, message: 'If this email can sign in to Nexdo Admin, a 6-digit code is on its way.' };

beforeEach(() => { backend.mockReset(); vi.stubGlobal('fetch', backend); resetLoginAttempts(); mocks.cookie = undefined; });
afterEach(() => vi.unstubAllGlobals());

describe('admin sign-in', () => {
  it('forwards a code request with the client secret and IP, and passes the uniform answer through', async () => {
    backend.mockResolvedValue(Response.json({ ...accepted, extra: 'dropped' }));
    const response = await requestCode();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(accepted);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(call(0)).toMatchObject({ url: 'http://backend.test/api/admin/session', method: 'POST', body: { action: 'request', email: 'admin@nexdo.test' } });
    expect(call(0).headers).toMatchObject({ 'X-Admin-Client': SECRET, 'X-Admin-Client-IP': '203.0.113.9' });
    expect(call(0).headers.Authorization).toBeUndefined();
  });

  it('verifies the code through the backend and sets a host-only, httpOnly, Secure, SameSite=Strict cookie', async () => {
    backend.mockResolvedValue(Response.json(session));
    const response = await verify();
    expect(response.status).toBe(200);
    expect(call(0)).toMatchObject({ method: 'POST', body: { action: 'verify', email: 'admin@nexdo.test', code: '042917' } });
    expect(call(0).headers).toMatchObject({ 'X-Admin-Client': SECRET, 'X-Admin-Client-IP': '203.0.113.9' });
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toMatch(new RegExp(`^__Host-nexdo_admin=${TOKEN};`));
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).toMatch(/; HttpOnly/i);
    expect(cookie).toMatch(/; Secure/i);
    expect(cookie).toMatch(/; SameSite=strict/i);
    expect(cookie).toMatch(/; Expires=/i);
    expect(cookie).not.toMatch(/Domain=/i);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('rejects cross-origin and origin-less requests before contacting the backend', async () => {
    expect((await requestCode({ origin: 'https://evil.test' })).status).toBe(403);
    expect((await verify({ origin: null })).status).toBe(403);
    expect((await verify({ origin: 'null' })).status).toBe(403);
    expect((await insightsPOST(adminRequest('/api/admin/insights', { origin: 'https://evil.test', cookie: TOKEN, body: { question: 'How is usage?', days: 30 } }))).status).toBe(403);
    expect((await healthPOST(adminRequest('/api/admin/health', { origin: null, cookie: TOKEN, body: { type: 'incident', id: 'i', action: 'RESOLVED' } }))).status).toBe(403);
    expect(backend).not.toHaveBeenCalled();
  });

  it('rejects passwords, bad emails and malformed codes without contacting the backend', async () => {
    expect((await auth({ action: 'login', email: 'admin@nexdo.test', password: 'correct horse' })).status).toBe(400);
    expect(await (await auth({ action: 'request', email: 'not-an-email' })).json()).toEqual({ error: 'Enter a valid email address.' });
    const shortCode = await auth({ action: 'verify', email: 'admin@nexdo.test', code: '12345' });
    expect(shortCode.status).toBe(400);
    expect(await shortCode.json()).toEqual({ error: 'Enter the 6-digit code from the email.' });
    expect(backend).not.toHaveBeenCalled();
  });

  it('relays a rejected code or a limit without setting a cookie, and hides unexpected backend failures', async () => {
    backend.mockResolvedValueOnce(Response.json({ error: 'That code is incorrect or has expired.' }, { status: 401 }));
    const rejected = await verify();
    expect(rejected.status).toBe(401);
    expect(await rejected.json()).toEqual({ error: 'That code is incorrect or has expired.' });
    expect(rejected.headers.get('set-cookie')).toBeNull();
    backend.mockResolvedValueOnce(Response.json({ error: 'Too many attempts. Please try again in 15 minutes.' }, { status: 429 }));
    expect((await requestCode()).status).toBe(429);
    backend.mockResolvedValueOnce(Response.json({ error: 'stack trace: secret' }, { status: 500 }));
    const failed = await verify();
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain('secret');
    backend.mockResolvedValueOnce(Response.json({ token: 'not-a-token' }));
    expect((await verify()).status).toBe(503);
    backend.mockResolvedValueOnce(Response.json({ sent: true }));
    expect((await requestCode()).status).toBe(503);
  });

  it('limits code requests and attempts together per client IP in memory', async () => {
    backend.mockImplementation(async () => Response.json({ error: 'That code is incorrect or has expired.' }, { status: 401 }));
    for (let i = 0; i < LOGIN_ATTEMPTS_PER_IP; i++) expect((await (i % 2 ? requestCode() : verify())).status).toBe(401);
    expect((await verify()).status).toBe(429);
    expect((await requestCode()).status).toBe(429);
    expect(backend).toHaveBeenCalledTimes(LOGIN_ATTEMPTS_PER_IP);
    expect((await verify({ forwardedFor: '198.51.100.7' })).status).toBe(401);
  });

  it('revokes the previous session when signing in again', async () => {
    backend.mockResolvedValueOnce(Response.json({ ...session, token: NEXT })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const response = await verify({ cookie: TOKEN });
    expect(response.headers.get('set-cookie')).toContain(`__Host-nexdo_admin=${NEXT}`);
    expect(call(1)).toMatchObject({ method: 'DELETE', url: 'http://backend.test/api/admin/session' });
    expect(call(1).headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });
});

describe('admin sign-out', () => {
  const logout = (cookie?: string) => authPOST(adminRequest('/api/admin/auth', { body: { action: 'logout' }, cookie }));

  it('calls DELETE on the backend with the bearer and clears the cookie', async () => {
    backend.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await logout(TOKEN);
    expect(response.status).toBe(200);
    expect(call(0)).toMatchObject({ url: 'http://backend.test/api/admin/session', method: 'DELETE' });
    expect(call(0).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}`, 'X-Admin-Client': SECRET });
    expect(response.headers.get('set-cookie')).toMatch(/^__Host-nexdo_admin=;.*Max-Age=0/i);
  });

  it('keeps the cookie when the backend could not revoke the session', async () => {
    backend.mockResolvedValue(Response.json({ error: 'down' }, { status: 503 }));
    const response = await logout(TOKEN);
    expect(response.status).toBe(503);
    expect(response.headers.get('set-cookie')).toBeNull();
    backend.mockResolvedValue(Response.json({ error: 'Admin sign-in required' }, { status: 401 }));
    expect((await logout(TOKEN)).headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('clears a cookie without calling the backend when there is no valid token', async () => {
    const response = await logout('not-a-token');
    expect(response.status).toBe(200);
    expect(backend).not.toHaveBeenCalled();
  });
});

describe('expired sessions', () => {
  it('sends a page render with a backend 401 to /login through a cookie-clearing redirect', async () => {
    mocks.cookie = TOKEN;
    backend.mockResolvedValue(Response.json({ error: 'Admin sign-in required' }, { status: 401 }));
    await expect(adminData('/api/admin/me', adminMeSchema)).rejects.toMatchObject({ digest: expect.stringContaining(';/session-expired;') });
    expect(call(0).headers.Authorization).toBe(`Bearer ${TOKEN}`);
    const expired = sessionExpiredGET();
    expect(expired.status).toBe(303);
    expect(expired.headers.get('location')).toBe('/login');
    expect(expired.headers.get('set-cookie')).toMatch(/^__Host-nexdo_admin=;.*Max-Age=0/i);
  });

  it('redirects straight to /login without a session cookie, and returns contract-checked data with one', async () => {
    await expect(adminData('/api/admin/me', adminMeSchema)).rejects.toMatchObject({ digest: expect.stringContaining(';/login;') });
    expect(backend).not.toHaveBeenCalled();
    mocks.cookie = TOKEN;
    backend.mockResolvedValueOnce(Response.json({ id: 'admin-1', name: 'Admin', email: 'admin@nexdo.test', canOperate: true, extra: 'dropped' }));
    expect(await adminData('/api/admin/me', adminMeSchema)).toEqual({ id: 'admin-1', name: 'Admin', email: 'admin@nexdo.test', canOperate: true });
    backend.mockResolvedValueOnce(Response.json({ id: 'admin-1' }));
    await expect(adminData('/api/admin/me', adminMeSchema)).rejects.toMatchObject({ status: 502 });
  });

  it('clears the cookie when a proxied API call gets a backend 401', async () => {
    backend.mockResolvedValue(Response.json({ error: 'Admin sign-in required' }, { status: 401 }));
    const insights = await insightsPOST(adminRequest('/api/admin/insights', { cookie: TOKEN, body: { question: 'How is usage?', days: 30 } }));
    expect(insights.status).toBe(401);
    expect(insights.headers.get('set-cookie')).toContain('Max-Age=0');
    const health = await healthGET(adminRequest('/api/admin/health?range=1H', { method: 'GET', cookie: TOKEN }));
    expect(health.status).toBe(401);
    expect(call(1)).toMatchObject({ url: 'http://backend.test/api/admin/health?range=1H', method: 'GET' });
  });
});

describe('API proxies', () => {
  it('forwards insights with the bearer and the long timeout, and validates the answer', async () => {
    backend.mockResolvedValueOnce(Response.json({ answer: 'Steady.', chart: null, generatedAt: '2026-09-24T00:00:00.000Z', days: 30 }));
    const response = await insightsPOST(adminRequest('/api/admin/insights', { cookie: TOKEN, body: { question: 'How is usage?', days: 30 } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ answer: 'Steady.', chart: null, generatedAt: '2026-09-24T00:00:00.000Z', days: 30 });
    expect(call(0)).toMatchObject({ url: 'http://backend.test/api/admin/insights', method: 'POST', body: { question: 'How is usage?', days: 30 } });
    backend.mockResolvedValueOnce(Response.json({ error: 'You have asked the maximum number of questions for this hour.' }, { status: 429 }));
    const limited = await insightsPOST(adminRequest('/api/admin/insights', { cookie: TOKEN, body: { question: 'How is usage?', days: 30 } }));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'You have asked the maximum number of questions for this hour.' });
    backend.mockResolvedValueOnce(Response.json({ answer: 42 }));
    expect((await insightsPOST(adminRequest('/api/admin/insights', { cookie: TOKEN, body: { question: 'How is usage?', days: 30 } }))).status).toBe(502);
  });

  it('never calls the backend without a session or with an invalid request', async () => {
    expect((await insightsPOST(adminRequest('/api/admin/insights', { body: { question: 'How is usage?', days: 30 } }))).status).toBe(401);
    expect((await insightsPOST(adminRequest('/api/admin/insights', { cookie: TOKEN, body: { question: 'x', days: 30 } }))).status).toBe(400);
    expect((await healthGET(adminRequest('/api/admin/health?range=2Y', { method: 'GET', cookie: TOKEN }))).status).toBe(400);
    expect((await healthPOST(adminRequest('/api/admin/health', { cookie: TOKEN, body: { type: 'drop-table' } }))).status).toBe(400);
    expect(backend).not.toHaveBeenCalled();
  });

  it('reports an unreachable backend without leaking details', async () => {
    backend.mockRejectedValue(new TypeError('connect ECONNREFUSED 10.0.0.5:8080'));
    const response = await healthGET(adminRequest('/api/admin/health', { method: 'GET', cookie: TOKEN }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('10.0.0.5');
  });
});
