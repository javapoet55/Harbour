import { z } from 'zod';
import { requireAdmin } from '@/server/admin-auth';
import { prisma } from '@/server/db';
import { adminJson, adminApiFailure } from '@/server/admin-api';
import { healthRoute } from '@/server/health/telemetry';
async function list(req: Request) {
  try {
    await requireAdmin();
    const cursor = new URL(req.url).searchParams.get('cursor');
    if (cursor && !z.string().uuid().safeParse(cursor).success) return adminJson({ error: 'Invalid feedback cursor.' }, 400);
    const rows = await prisma.feedback.findMany({
      where: { OR: [{ bugReport: null }, { bugReport: { expiresAt: { gt: new Date() } } }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, customerName: true, title: true, description: true, stars: true, createdAt: true },
    });
    const feedback = rows.slice(0, 50);
    return adminJson({ feedback, nextCursor: rows.length > 50 ? feedback[49].id : null });
  } catch (error) { return adminApiFailure(error); }
}
export const GET = healthRoute('GET /api/admin/feedback', list);
