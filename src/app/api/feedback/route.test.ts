import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/server/auth', () => ({ requireUser: vi.fn() }));
vi.mock('@/server/db', () => ({ prisma: { feedback: { upsert: vi.fn() } } }));
import { requireUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { POST } from './route';
const input = { id: 'b90d5792-5c65-46d5-b974-bef7b9d02a01', title: ' Great app ', description: ' Useful focus timer ', stars: 5 };
const send = (body: unknown) => POST(new Request('http://localhost/api/feedback', { method: 'POST', body: JSON.stringify(body) }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ id: 'customer', name: 'Customer Name' } as Awaited<ReturnType<typeof requireUser>>);
  vi.mocked(prisma.feedback.upsert).mockResolvedValue({ userId: 'customer' } as NonNullable<Awaited<ReturnType<typeof prisma.feedback.upsert>>>);
});
it('uses authenticated customer identity and trims feedback', async () => {
  expect((await send({ ...input, userId: 'attacker', customerName: 'Fake', createdAt: '2000-01-01' })).status).toBe(200);
  expect(prisma.feedback.upsert).toHaveBeenCalledWith({ where: { id: input.id }, create: { ...input, title: 'Great app', description: 'Useful focus timer', userId: 'customer', customerName: 'Customer Name' }, update: {} });
});
it.each([{ stars: 0 }, { stars: 6 }, { stars: 2.5 }, { title: ' ' }, { description: '' }, { title: 'x'.repeat(161) }, { description: 'x'.repeat(5001) }])('rejects invalid feedback %j', async override => {
  expect((await send({ ...input, ...override })).status).toBe(400);
  expect(prisma.feedback.upsert).not.toHaveBeenCalled();
});
it('requires sign-in', async () => {
  vi.mocked(requireUser).mockRejectedValue(new Error('UNAUTHENTICATED'));
  expect((await send(input)).status).toBe(401);
  expect(prisma.feedback.upsert).not.toHaveBeenCalled();
});
it('allows a retry for the same owner without a second insert', async () => {
  expect((await send(input)).status).toBe(200);
});
it('rejects reuse of another customer’s submission ID', async () => {
  vi.mocked(prisma.feedback.upsert).mockResolvedValue({ userId: 'other' } as NonNullable<Awaited<ReturnType<typeof prisma.feedback.upsert>>>);
  expect((await send(input)).status).toBe(409);
});
it('reports persistence failure rather than thanking the customer', async () => {
  vi.mocked(prisma.feedback.upsert).mockRejectedValue(new Error('Unavailable'));
  expect((await send(input)).status).toBe(500);
});
