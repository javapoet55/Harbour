import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/server/db';
import { signInAdminPassword } from '@/server/admin-otp';
import { ADMIN_INSIGHTS_HOURLY_LIMIT } from '@/server/admin-audit';
import { GET as healthGET, POST as healthPOST } from './health/route';
import { POST as insightsPOST } from './insights/route';

const mocks = vi.hoisted(() => ({ headers: new Headers(), jar: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (key: string) => mocks.jar.has(key) ? { value: mocks.jar.get(key) } : undefined, set: () => {}, delete: () => {} }),
  headers: async () => mocks.headers,
}));

const secret = randomBytes(24).toString('hex');
const saved = { ...process.env };
const ids: string[] = [];
let admin = { id: '', token: '' };
const openai = vi.fn(async () => Response.json({ output_text: JSON.stringify({ answer: 'Usage is steady.', chart: null }) }));

type Auth = 'bearer' | 'bearer-without-secret' | 'cookie' | 'none';
function request(path: string, auth: Auth, init: { method?: string; body?: object; origin?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.origin ? { origin: init.origin } : {}) };
  if (auth === 'bearer' || auth === 'bearer-without-secret') headers.Authorization = `Bearer ${admin.token}`;
  if (auth === 'bearer') headers['X-Admin-Client'] = secret;
  mocks.jar.clear();
  if (auth === 'cookie') mocks.jar.set('nexdo_admin_session', admin.token);
  const value = new Request(`http://backend.test${path}`, { method: init.method ?? 'GET', headers, body: init.body ? JSON.stringify(init.body) : undefined });
  mocks.headers = value.headers;
  return value;
}
const rule = { type: 'rule', id: 'api-errors', threshold: 5, minimumSamples: 20, enabled: true };
const question = { question: 'How is usage trending?', days: 30 };
const insightRows = (action: string) => prisma.healthAudit.findMany({ where: { targetId: 'admin-insights', actorId: admin.id, action } });

beforeAll(async () => {
  const email = `admin-bearer-${crypto.randomUUID()}@nexdo.test`;
  const user = await prisma.user.create({ data: { email, name: 'Bearer Admin', passwordHash: await bcrypt.hash('valid-test-password', 4), emailVerifiedAt: new Date() } });
  ids.push(user.id);
  process.env.NEXDO_ADMIN_EMAILS = email;
  process.env.ADMIN_API_SECRETS = secret;
  process.env.NEXDO_HEALTH_OPERATOR_IDS = user.id;
  process.env.OPENAI_API_KEY = 'test-openai-key';
  delete process.env.NEXDO_HEALTH_ENABLED;
  admin = { id: user.id, token: await signInAdminPassword(email, 'valid-test-password') };
});
beforeEach(() => { openai.mockClear(); vi.stubGlobal('fetch', openai); });
afterAll(async () => {
  vi.unstubAllGlobals();
  for (const key of ['NEXDO_ADMIN_EMAILS', 'ADMIN_API_SECRETS', 'NEXDO_HEALTH_OPERATOR_IDS', 'OPENAI_API_KEY', 'NEXDO_HEALTH_ENABLED']) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('bearer access to existing admin routes', () => {
  it('serves System Health to a bearer session and to the cookie as before', async () => {
    const bearer = await healthGET(request('/api/admin/health?range=1H', 'bearer'));
    expect(bearer.status).toBe(200);
    expect(await bearer.json()).toMatchObject({ range: '1H', canOperate: true });
    expect((await healthGET(request('/api/admin/health?range=1H', 'cookie'))).status).toBe(200);
    expect((await healthGET(request('/api/admin/health?range=1H', 'bearer-without-secret'))).status).toBe(401);
    expect((await healthGET(request('/api/admin/health?range=1H', 'none'))).status).toBe(401);
  });

  it('lets a bearer mutation through without Origin, but still requires Origin for cookies', async () => {
    expect((await healthPOST(request('/api/admin/health', 'bearer', { method: 'POST', body: rule }))).status).toBe(200);
    expect((await healthPOST(request('/api/admin/health', 'cookie', { method: 'POST', body: rule }))).status).toBe(403);
    expect((await healthPOST(request('/api/admin/health', 'cookie', { method: 'POST', body: rule, origin: 'https://evil.test' }))).status).toBe(403);
    expect((await healthPOST(request('/api/admin/health', 'cookie', { method: 'POST', body: rule, origin: 'http://backend.test' }))).status).toBe(200);
    expect((await healthPOST(request('/api/admin/health', 'bearer-without-secret', { method: 'POST', body: rule }))).status).toBe(401);
  });

  it('answers insights for bearer and cookie sessions and audits only the question length', async () => {
    const response = await insightsPOST(request('/api/admin/insights', 'bearer', { method: 'POST', body: question }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ answer: 'Usage is steady.', chart: null, days: 30 });
    expect(openai).toHaveBeenCalledTimes(1);
    expect((await insightsPOST(request('/api/admin/insights', 'cookie', { method: 'POST', body: question }))).status).toBe(200);
    const rows = await insightRows('ADMIN_INSIGHTS');
    expect(rows).toHaveLength(2);
    expect(JSON.parse(rows[0].detail)).toEqual({ days: 30, from: null, to: null, questionLength: question.question.length });
    expect(rows.map((row) => row.detail).join(' ')).not.toContain('trending');

    openai.mockClear();
    expect((await insightsPOST(request('/api/admin/insights', 'bearer-without-secret', { method: 'POST', body: question }))).status).toBe(401);
    expect(openai).not.toHaveBeenCalled();
    expect(await insightRows('ADMIN_INSIGHTS')).toHaveLength(2);
  });

  it('stops at the hourly question limit before calling the model', async () => {
    const used = (await insightRows('ADMIN_INSIGHTS')).length;
    await prisma.healthAudit.createMany({ data: Array.from({ length: ADMIN_INSIGHTS_HOURLY_LIMIT - used - 1 }, () => ({ actorId: admin.id, action: 'ADMIN_INSIGHTS', targetId: 'admin-insights', detail: '{}' })) });
    expect((await insightsPOST(request('/api/admin/insights', 'bearer', { method: 'POST', body: question }))).status).toBe(200);
    openai.mockClear();
    const limited = await insightsPOST(request('/api/admin/insights', 'bearer', { method: 'POST', body: question }));
    expect(limited.status).toBe(429);
    expect(openai).not.toHaveBeenCalled();
    expect(await insightRows('ADMIN_RATE_LIMITED')).toHaveLength(1);
    expect(await insightRows('ADMIN_INSIGHTS')).toHaveLength(ADMIN_INSIGHTS_HOURLY_LIMIT);
  });
});
