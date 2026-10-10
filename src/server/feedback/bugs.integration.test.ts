import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
vi.mock('@/server/auth', () => ({ requireUser: vi.fn() }));
vi.mock('@/server/admin-auth', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/providers', () => ({ emailProvider: { send: vi.fn() }, emailDeliveryMocked: () => false }));
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';
import { requireAdmin } from '@/server/admin-auth';
import { emailProvider } from '@/providers';
import { bugSchema, maintainBugReports, referenceFor, saveBug } from './bugs';
import { POST } from '@/app/api/feedback/bugs/route';
import { GET } from '@/app/api/admin/feedback/bugs/[id]/screenshot/route';
const owners: string[] = [];
const input = () => ({ id: randomUUID(), description: 'The calendar button does not respond.', screenshotConsent: false, metadata: {
  appVersion: '1.0', buildNumber: '32', deviceModel: 'iPhone18,2', iosVersion: '26.0', screen: 'calendar' as const,
  timestamp: new Date().toISOString(), correlationID: randomUUID(),
} });
async function user() {
  const id = randomUUID(); owners.push(id);
  return prisma.user.create({ data: { id, name: 'Test', email: `${id}@example.test`, passwordHash: 'test' } });
}
const post = (body: unknown) => POST(new Request('http://localhost/api/feedback/bugs', { method: 'POST', body: JSON.stringify(body) }));
beforeEach(() => { vi.clearAllMocks(); });
afterAll(async () => { await prisma.user.deleteMany({ where: { id: { in: owners } } }); });
it('requires authentication before accepting a report', async () => {
  vi.mocked(requireUser).mockRejectedValue(new Error('UNAUTHENTICATED'));
  expect((await post(input())).status).toBe(401);
});
it('rejects excess fields, secret metadata, invalid descriptions and unconsented screenshots', () => {
  for (const override of [{ description: '' }, { description: 'x'.repeat(2001) }, { screenshot: 'abc' }, { logs: 'secret' }, { metadata: { ...input().metadata, token: 'secret' } }]) {
    expect(bugSchema.safeParse({ ...input(), ...override }).success).toBe(false);
  }
});
it('persists before receipt, redacts known secrets, and retries return one stable reference', async () => {
  const u = await user(); vi.mocked(requireUser).mockResolvedValue({ ...u, preference: null });
  const body = { ...input(), description: 'password=hunter2 Bearer abcdef broken button' };
  const first = await post(body); expect(first.status).toBe(200);
  const receipt = await first.json(); expect(receipt.reference).toBe(referenceFor(body.id));
  expect(await (await post({ ...body, description: 'changed retry' })).json()).toEqual(receipt);
  expect(await prisma.feedback.count({ where: { id: body.id } })).toBe(1);
  const row = await prisma.feedback.findUniqueOrThrow({ where: { id: body.id }, include: { bugReport: true } });
  expect(row.description).not.toContain('hunter2'); expect(row.description).not.toContain('abcdef');
  expect(row.bugReport?.emailSentAt).toBeNull(); expect(emailProvider.send).not.toHaveBeenCalled();
  await expect(saveBug(await user(), body)).rejects.toThrow('BUG_ID_CONFLICT');
});
it('encrypts consented screenshots and enforces admin access and expiry', async () => {
  const u = await user();
  const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#6366f1' } }).png().toBuffer();
  const body = { ...input(), screenshotConsent: true, screenshot: bytes.toString('base64') };
  await saveBug(u, body);
  const row = await prisma.bugReport.findUniqueOrThrow({ where: { id: body.id } });
  expect(row.screenshot).not.toContain(body.screenshot);
  const ctx = { params: Promise.resolve({ id: body.id }) };
  vi.mocked(requireAdmin).mockRejectedValueOnce(new Error('UNAUTHENTICATED'));
  expect((await GET(new Request('http://localhost'), ctx)).status).toBe(401);
  const response = await GET(new Request('http://localhost'), ctx);
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store');
  expect((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format).toBe('jpeg');
  await prisma.bugReport.update({ where: { id: body.id }, data: { screenshotExpiresAt: new Date(0) } });
  expect((await GET(new Request('http://localhost'), ctx)).status).toBe(404);
  await maintainBugReports();
  expect((await prisma.bugReport.findUniqueOrThrow({ where: { id: body.id } })).screenshot).toBeNull();
  await expect(saveBug(u, { ...input(), screenshotConsent: true, screenshot: 'bm90IGFuIGltYWdl' })).rejects.toThrow('INVALID_SCREENSHOT');
});
it('retries failed support delivery and purges expired reports and screenshots', async () => {
  const u = await user(); const body = input(); await saveBug(u, body);
  vi.mocked(emailProvider.send).mockResolvedValue({ id: 'failed-test', status: 'FAILED' });
  await maintainBugReports();
  expect((await prisma.bugReport.findUniqueOrThrow({ where: { id: body.id } })).emailSentAt).toBeNull();
  vi.mocked(emailProvider.send).mockResolvedValue({ id: 'sent-test', status: 'SENT' });
  await maintainBugReports(new Date(Date.now() + 16 * 60000));
  expect((await prisma.bugReport.findUniqueOrThrow({ where: { id: body.id } })).emailSentAt).not.toBeNull();
  expect(emailProvider.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'support@nexdoapp.com', subject: expect.stringContaining(referenceFor(body.id)) }));
  await maintainBugReports(new Date(Date.now() + 91 * 86400000));
  expect(await prisma.feedback.findUnique({ where: { id: body.id } })).toBeNull();
});
it('limits new reports while allowing a retry of a received report', async () => {
  const u = await user(); const first = input(); await saveBug(u, first);
  for (let n = 0; n < 4; n++) await saveBug(u, input());
  await expect(saveBug(u, input())).rejects.toThrow('AUTH_RATE_LIMITED');
  expect(await saveBug(u, first)).toBe(referenceFor(first.id));
});
it('generates unique references from distinct submission IDs', () => {
  for (let i = 0; i < 1000; i++) expect(referenceFor(randomUUID())).toMatch(/^BR-\d{6}$/);
});
it('rejects malformed and oversized HTTP bodies without storing a report', async () => {
  const u = await user(); vi.mocked(requireUser).mockResolvedValue({ ...u, preference: null });
  expect((await POST(new Request('http://localhost', { method: 'POST', body: '{' }))).status).toBe(400);
  expect((await POST(new Request('http://localhost', { method: 'POST', body: 'x'.repeat(2_850_001) }))).status).toBe(413);
  expect(await prisma.feedback.count({ where: { userId: u.id } })).toBe(0);
});
it('does not issue a receipt when persistence fails', async () => {
  const u = await user(); vi.mocked(requireUser).mockResolvedValue({ ...u, preference: null });
  const body = input();
  const originalUpsert = prisma.feedback.upsert;
  const failedWrite = vi.spyOn(prisma.feedback, 'upsert').mockRejectedValueOnce(new Error('Unavailable'));
  expect((await post(body)).status).toBe(500);
  failedWrite.mockRestore();
  prisma.feedback.upsert = originalUpsert;
  expect(await prisma.feedback.findUnique({ where: { id: body.id } })).toBeNull();
  expect((await post(body)).status).toBe(200);
});
it('accepts concurrent retries without duplicate records', async () => {
  const u = await user(); const body = input();
  const results = await Promise.all([saveBug(u, body), saveBug(u, body)]);
  expect(results).toEqual([referenceFor(body.id), referenceFor(body.id)]);
  expect(await prisma.feedback.count({ where: { id: body.id } })).toBe(1);
});
it('requires the worker secret before delivering reports', async () => {
  const { POST: tick } = await import('@/app/api/feedback/bug-tick/route');
  expect((await tick(new Request('http://localhost', { method: 'POST', headers: { authorization: 'Bearer wrong' } }))).status).toBe(401);
});

it('recovers a short-reference collision and preserves the receipt on retry', async () => {
  const u = await user();
  const occupied = input(); const body = input();
  await saveBug(u, occupied);
  await prisma.bugReport.update({ where: { id: occupied.id }, data: { reference: referenceFor(body.id) } });
  const receipt = await saveBug(u, body);
  expect(receipt).toMatch(/^BR-\d{6}$/);
  expect(receipt).not.toBe(referenceFor(body.id));
  expect(await saveBug(u, body)).toBe(receipt);
  expect(await prisma.feedback.count({ where: { id: body.id } })).toBe(1);
});
