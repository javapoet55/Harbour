import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/server/db';
import { signInAdminPassword } from '@/server/admin-otp';
import { getAdminSnapshot } from '@/server/admin-analytics';
import { GET as snapshotGET } from './snapshot/route';
import { GET as voiceTokensGET } from './voice-tokens/route';
import { GET as userGET } from './users/[userId]/route';
import { GET as engagementGET } from './engagement/route';

const mocks = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => mocks.headers }));
// Wrap, not replace: the handler runs the real query and the test compares against the exact value it serialized.
// A second direct call could differ because other test files write to the same database concurrently.
vi.mock('@/server/admin-analytics', async (original) => {
  const actual = await original<typeof import('@/server/admin-analytics')>();
  return { ...actual, getAdminSnapshot: vi.fn(actual.getAdminSnapshot) };
});

const secret = randomBytes(24).toString('hex');
const saved = { emails: process.env.NEXDO_ADMIN_EMAILS, secrets: process.env.ADMIN_API_SECRETS, property: process.env.GA4_PROPERTY_ID, account: process.env.GA4_SERVICE_ACCOUNT_JSON };
const ids: string[] = [];
let token = '';
let adminId = '';

function request(path: string, auth = true) {
  const value = new Request(`http://backend.test${path}`, { headers: auth ? { 'X-Admin-Client': secret, Authorization: `Bearer ${token}` } : {} });
  mocks.headers = value.headers;
  return value;
}
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const restore = (key: string, value: string | undefined) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; };

beforeAll(async () => {
  const email = `admin-read-${crypto.randomUUID()}@nexdo.test`;
  const admin = await prisma.user.create({ data: { email, name: 'Read Admin', passwordHash: await bcrypt.hash('valid-test-password', 4), emailVerifiedAt: new Date() } });
  ids.push(admin.id); adminId = admin.id;
  process.env.NEXDO_ADMIN_EMAILS = email;
  process.env.ADMIN_API_SECRETS = secret;
  token = await signInAdminPassword(email, 'valid-test-password');
});
beforeEach(() => { vi.mocked(getAdminSnapshot).mockClear(); });
afterAll(async () => {
  restore('NEXDO_ADMIN_EMAILS', saved.emails); restore('ADMIN_API_SECRETS', saved.secrets);
  restore('GA4_PROPERTY_ID', saved.property); restore('GA4_SERVICE_ACCOUNT_JSON', saved.account);
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('admin read API', () => {
  it('requires an admin session on every endpoint', async () => {
    const range = `from=${day(-6)}&to=${day(0)}`;
    const responses = [
      await snapshotGET(request(`/api/admin/snapshot?${range}`, false)),
      await voiceTokensGET(request(`/api/admin/voice-tokens?${range}`, false)),
      await userGET(request(`/api/admin/users/${adminId}`, false), { params: Promise.resolve({ userId: adminId }) }),
      await engagementGET(request(`/api/admin/engagement?${range}`, false)),
    ];
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
    expect(getAdminSnapshot).not.toHaveBeenCalled();
  });

  it('rejects bad, mismatched or oversized ranges and day counts', async () => {
    const bad = [
      `from=${day(-6)}`, `to=${day(0)}`, `from=bad&to=${day(0)}`, `from=${day(0)}&to=${day(-6)}`, `from=${day(0)}&to=${day(1)}`,
      `from=${day(-400)}&to=${day(0)}`, `from=2026-02-30&to=${day(0)}`, `from=${day(-6)}&to=${day(0)}&days=7`,
      '', 'days=0', 'days=367', 'days=abc', 'days=1.5', 'days=-3',
    ];
    for (const query of bad) expect((await snapshotGET(request(`/api/admin/snapshot?${query}`))).status, query).toBe(400);
    for (const query of bad.slice(0, 7)) {
      expect((await voiceTokensGET(request(`/api/admin/voice-tokens?${query}`))).status, query).toBe(400);
      expect((await engagementGET(request(`/api/admin/engagement?${query}`))).status, query).toBe(400);
    }
    expect(getAdminSnapshot).not.toHaveBeenCalled();
  });

  it('returns exactly the serialized snapshot for a range or a day count', async () => {
    const from = day(-6); const to = day(0);
    const response = await snapshotGET(request(`/api/admin/snapshot?from=${from}&to=${to}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const [days, range] = vi.mocked(getAdminSnapshot).mock.calls[0];
    expect(days).toBe(7);
    expect(range).toEqual({ from: new Date(`${from}T00:00:00.000Z`), to: new Date(`${to}T00:00:00.000Z`) });
    const direct = await vi.mocked(getAdminSnapshot).mock.results[0].value;
    expect(await response.json()).toEqual(JSON.parse(JSON.stringify(direct)));

    const trailing = await snapshotGET(request('/api/admin/snapshot?days=30'));
    expect(trailing.status).toBe(200);
    expect(vi.mocked(getAdminSnapshot).mock.calls[1]).toEqual([30]);
    expect(await trailing.json()).toEqual(JSON.parse(JSON.stringify(await vi.mocked(getAdminSnapshot).mock.results[1].value)));
  });

  it('includes voice token receipts through the end of the final day', async () => {
    const user = await prisma.user.create({ data: { email: `voice-${crypto.randomUUID()}@nexdo.test`, name: 'Voice', passwordHash: 'unused' } });
    ids.push(user.id);
    const yesterday = day(-1);
    const receipt = { id: `resp_${randomBytes(6).toString('hex')}`, source: 'response', model: 'gpt-realtime-2.1', inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    await prisma.userMemory.create({ data: { userId: user.id, key: `voice-token:response:${receipt.id}`, kind: 'voice_tokens', source: 'ios-realtime', value: JSON.stringify(receipt), createdAt: new Date(`${yesterday}T23:30:00.000Z`) } });
    const response = await voiceTokensGET(request(`/api/admin/voice-tokens?from=${yesterday}&to=${yesterday}`));
    expect(response.status).toBe(200);
    const rows = await response.json() as Array<{ userId: string; totalTokens: number }>;
    expect(rows.filter((row) => row.userId === user.id)).toMatchObject([{ totalTokens: 15 }]);
    const earlier = await (await voiceTokensGET(request(`/api/admin/voice-tokens?from=${day(-3)}&to=${day(-2)}`))).json() as Array<{ userId: string }>;
    expect(earlier.filter((row) => row.userId === user.id)).toEqual([]);
  });

  it('returns a user dashboard, audits the view, and 404s unknown users', async () => {
    const response = await userGET(request(`/api/admin/users/${adminId}`), { params: Promise.resolve({ userId: adminId }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ user: { id: adminId, name: 'Read Admin' }, range: { days: 15 } });
    expect(await prisma.healthAudit.findMany({ where: { targetId: adminId, action: 'ADMIN_VIEW_USER' } })).toMatchObject([{ actorId: adminId }]);

    const missing = 'c'.repeat(25);
    expect((await userGET(request(`/api/admin/users/${missing}`), { params: Promise.resolve({ userId: missing }) })).status).toBe(404);
    expect(await prisma.healthAudit.count({ where: { targetId: missing } })).toBe(0);
    expect((await userGET(request('/api/admin/users/x'), { params: Promise.resolve({ userId: '../secret' }) })).status).toBe(400);
  });

  it('reports engagement as not configured when GA4 is unset', async () => {
    delete process.env.GA4_PROPERTY_ID; delete process.env.GA4_SERVICE_ACCOUNT_JSON;
    const response = await engagementGET(request(`/api/admin/engagement?from=${day(-6)}&to=${day(0)}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'not_configured', message: expect.any(String) });
  });
});
