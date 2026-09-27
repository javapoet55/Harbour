import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/server/admin-auth', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/server/db', () => ({ prisma: { feedback: { findMany: vi.fn() } } }));
import { requireAdmin } from '@/server/admin-auth';
import { prisma } from '@/server/db';
import { GET } from './route';
beforeEach(() => { vi.resetAllMocks(); vi.mocked(prisma.feedback.findMany).mockResolvedValue([]); });
it('requires admin access before reading feedback', async () => {
  vi.mocked(requireAdmin).mockRejectedValue(new Error('UNAUTHENTICATED'));
  expect((await GET(new Request('http://localhost/api/admin/feedback'))).status).toBe(401);
  expect(prisma.feedback.findMany).not.toHaveBeenCalled();
});
it('sorts newest first with stable pagination', async () => {
  const rows = Array.from({ length: 51 }, (_, index) => ({ id: `row-${index}` }));
  vi.mocked(prisma.feedback.findMany).mockResolvedValue(rows as Awaited<ReturnType<typeof prisma.feedback.findMany>>);
  const response = await GET(new Request('http://localhost/api/admin/feedback'));
  const body = await response.json();
  expect(body.feedback).toHaveLength(50); expect(body.nextCursor).toBe('row-49');
  expect(prisma.feedback.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51 }));
  expect(response.headers.get('Cache-Control')).toContain('no-store');
});
it('rejects malformed cursors', async () => {
  expect((await GET(new Request('http://localhost/api/admin/feedback?cursor=invalid'))).status).toBe(400);
  expect(prisma.feedback.findMany).not.toHaveBeenCalled();
});
it('returns an empty state', async () => {
  expect(await (await GET(new Request('http://localhost/api/admin/feedback'))).json()).toEqual({ feedback: [], nextCursor: null });
});
