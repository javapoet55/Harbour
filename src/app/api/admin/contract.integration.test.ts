import bcrypt from 'bcryptjs';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/server/db';
// The admin frontend parses every backend response with these schemas. Validate the real handlers against them.
import { adminMeSchema, adminSessionSchema } from '../../../../admin/src/contract/session';
import { adminSnapshotSchema } from '../../../../admin/src/contract/snapshot';
import { voiceTokensSchema } from '../../../../admin/src/contract/voice-tokens';
import { adminUserDashboardSchema } from '../../../../admin/src/contract/user-dashboard';
import { engagementResultSchema } from '../../../../admin/src/contract/engagement';
import { healthSchema, okSchema } from '../../../../admin/src/contract/health';
import { adminAnswerSchema } from '../../../../admin/src/contract/insights';
import { POST as sessionPOST } from './session/route';
import { GET as meGET } from './me/route';
import { GET as snapshotGET } from './snapshot/route';
import { GET as voiceTokensGET } from './voice-tokens/route';
import { GET as userGET } from './users/[userId]/route';
import { GET as engagementGET } from './engagement/route';
import { GET as healthGET, POST as healthPOST } from './health/route';
import { POST as insightsPOST } from './insights/route';

const mocks = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => mocks.headers }));

const secret = randomBytes(24).toString('hex');
const traceId = randomBytes(16).toString('hex');
const keys = ['NEXDO_ADMIN_EMAILS', 'ADMIN_API_SECRETS', 'NEXDO_HEALTH_OPERATOR_IDS', 'OPENAI_API_KEY', 'NEXDO_HEALTH_ENABLED', 'GA4_PROPERTY_ID', 'GA4_SERVICE_ACCOUNT_JSON', 'GA4_STREAM_ID'];
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const ids: string[] = [];
let token = '';
let userId = '';

function request(path: string, init: { method?: string; body?: object; bearer?: boolean } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Admin-Client': secret, 'X-Admin-Client-IP': '192.0.2.10' };
  if (init.bearer !== false) headers.Authorization = `Bearer ${token}`;
  const value = new Request(`http://backend.test${path}`, { method: init.method ?? 'GET', headers, body: init.body ? JSON.stringify(init.body) : undefined });
  mocks.headers = value.headers;
  return value;
}
// Structural type on purpose: the schemas come from admin/'s own zod install, and asking tsc to relate two
// zod versions' generic types exhausts its memory.
type Parser = { safeParse(value: unknown): { success: true } | { success: false; error: { issues: unknown[] } } };
async function contract(response: Response, schema: Parser) {
  expect(response.status).toBe(200);
  const body = await response.json();
  const parsed = schema.safeParse(body);
  expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
  return body;
}
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const range = () => `from=${day(-6)}&to=${day(0)}`;

// Google and OpenAI are the only outbound calls; answer them with realistic payloads.
function report(metrics: string[], dimension?: string) {
  return {
    metricHeaders: metrics.map((name) => ({ name })),
    dimensionHeaders: dimension ? [{ name: dimension }] : [],
    rows: [{ dimensionValues: dimension ? [{ value: dimension === 'date' ? day(0).replaceAll('-', '') : `${dimension}-a` }] : [], metricValues: metrics.map((_, index) => ({ value: String(index + 1) })) }],
    metadata: { timeZone: 'America/Los_Angeles' },
  };
}
const outbound = vi.fn(async (input: string | URL | Request) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'test-access-token', expires_in: 3600 });
  if (url.includes('analyticsdata.googleapis.com')) return Response.json({ reports: [
    report(['activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'engagementRate', 'userEngagementDuration', 'screenPageViews', 'eventCount']),
    report(['activeUsers', 'sessions'], 'date'), report(['eventCount', 'totalUsers'], 'eventName'),
    report(['screenPageViews', 'activeUsers'], 'unifiedScreenClass'), report(['activeUsers', 'sessions'], 'appVersion'),
  ] });
  if (url.startsWith('https://api.openai.com/')) return Response.json({ output_text: JSON.stringify({ answer: 'Voice usage rose.', chart: { type: 'bar', title: 'Voice minutes', xLabel: 'Day', yLabel: 'Minutes', series: [{ name: 'Voice', color: '#287ff5', data: [{ label: 'Sep 20', value: 2 }] }] } }) });
  throw new Error(`Unexpected outbound request in contract test: ${url}`);
});

beforeAll(async () => {
  const email = `admin-contract-${crypto.randomUUID()}@nexdo.test`;
  const user = await prisma.user.create({ data: { email, name: 'Contract Admin', passwordHash: await bcrypt.hash('valid-test-password', 4), emailVerifiedAt: new Date() } });
  ids.push(user.id); userId = user.id;
  const receipt = { id: `resp_${randomBytes(6).toString('hex')}`, source: 'response', model: 'gpt-realtime-2.1', inputTokens: 100, outputTokens: 50, totalTokens: 150, breakdown: { textInput: 60, audioInput: 40, textOutput: 30, audioOutput: 20, cachedText: 10, cachedAudio: 0 } };
  await prisma.userMemory.createMany({ data: [
    { userId, key: 'billing:plan', value: 'PRO', kind: 'preference' },
    { userId, key: 'profile:city', value: 'Chennai', kind: 'profile' },
    { userId, key: 'voice-usage:contract', value: '180', kind: 'voice_usage', source: 'ios-realtime' },
    { userId, key: `voice-token:response:${receipt.id}`, value: JSON.stringify(receipt), kind: 'voice_tokens', source: 'ios-realtime' },
  ] });
  await prisma.assistantAction.create({ data: { userId, intent: 'add_task', payloadJson: '{}', executed: true } });
  await prisma.task.create({ data: { userId, title: 'Contract task' } });
  await prisma.voiceSession.create({ data: { userId, status: 'completed' } });
  await prisma.healthEvent.createMany({ data: [200, 404].map((status) => ({ kind: 'api', service: 'API', operation: 'GET /api/contract-fixture', feature: 'Other', traceId, status, durationMs: 12 })) });

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  Object.assign(process.env, {
    NEXDO_ADMIN_EMAILS: email, ADMIN_API_SECRETS: secret, NEXDO_HEALTH_OPERATOR_IDS: userId, OPENAI_API_KEY: 'test-openai-key',
    GA4_PROPERTY_ID: '555023551', GA4_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: 'service_account', client_email: 'reports@nexdo-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
  });
  delete process.env.NEXDO_HEALTH_ENABLED; delete process.env.GA4_STREAM_ID;
  vi.stubGlobal('fetch', outbound);
});
afterAll(async () => {
  vi.unstubAllGlobals();
  for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  await prisma.healthEvent.deleteMany({ where: { traceId } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('backend responses satisfy the admin frontend contract', () => {
  it('session and me', async () => {
    const session = await contract(await sessionPOST(request('/api/admin/session', { method: 'POST', bearer: false, body: { email: (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email, password: 'valid-test-password' } })), adminSessionSchema);
    token = session.token;
    request('/api/admin/me');
    await contract(await meGET(), adminMeSchema);
  });

  it('snapshot for a range and for a day count', async () => {
    const snapshot = await contract(await snapshotGET(request(`/api/admin/snapshot?${range()}`)), adminSnapshotSchema);
    expect(snapshot.users.find((row: { id: string }) => row.id === userId)).toMatchObject({ plan: 'PRO', city: 'Chennai', aiActions: 1 });
    expect(snapshot.voiceRecords.length).toBeGreaterThan(0);
    expect(snapshot.actionRecords.length).toBeGreaterThan(0);
    await contract(await snapshotGET(request('/api/admin/snapshot?days=30')), adminSnapshotSchema);
  });

  it('voice tokens', async () => {
    const rows = await contract(await voiceTokensGET(request(`/api/admin/voice-tokens?${range()}`)), voiceTokensSchema);
    expect(rows.find((row: { userId: string }) => row.userId === userId)).toMatchObject({ totalTokens: 150, pricedRecords: 1 });
  });

  it('user dashboard', async () => {
    const dashboard = await contract(await userGET(request(`/api/admin/users/${userId}`), { params: Promise.resolve({ userId }) }), adminUserDashboardSchema);
    expect(dashboard.recentActivity.length).toBeGreaterThan(0);
    expect(dashboard.aiBreakdown.length).toBeGreaterThan(0);
  });

  it('engagement when connected and when not configured', async () => {
    const connected = await contract(await engagementGET(request(`/api/admin/engagement?${range()}`)), engagementResultSchema);
    expect(connected).toMatchObject({ status: 'connected', data: { propertyId: '555023551', summary: { activeUsers: 1 } } });
    delete process.env.GA4_PROPERTY_ID;
    expect(await contract(await engagementGET(request(`/api/admin/engagement?${range()}`)), engagementResultSchema)).toMatchObject({ status: 'not_configured' });
  });

  it('System Health read and operator action', async () => {
    const health = await contract(await healthGET(request('/api/admin/health?range=1H')), healthSchema);
    expect(health.endpoints.some((row: { name: string }) => row.name === 'GET /api/contract-fixture')).toBe(true);
    expect(health.failures.length).toBeGreaterThan(0);
    expect(health.audit.length).toBeGreaterThan(0);
    await contract(await healthPOST(request('/api/admin/health', { method: 'POST', body: { type: 'rule', id: 'api-errors', threshold: 5, minimumSamples: 20, enabled: true } })), okSchema);
  });

  it('Ask Nexdo insights', async () => {
    const answer = await contract(await insightsPOST(request('/api/admin/insights', { method: 'POST', body: { question: 'How is voice usage changing?', days: 7, from: day(-6), to: day(0) } })), adminAnswerSchema);
    expect(answer.chart.series[0].data).toHaveLength(1);
  });
});
