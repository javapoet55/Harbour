import { z } from 'zod';
import { requireAdmin } from '@/server/admin-auth';
import { prisma } from '@/server/db';
import { adminJson, adminApiFailure } from '@/server/admin-api';
import { bugSchema } from '@/server/feedback/bugs';
import { healthRoute } from '@/server/health/telemetry';

async function list(req: Request) {
  try {
    await requireAdmin();
    const cursor = new URL(req.url).searchParams.get('cursor');
    if (cursor && !z.string().uuid().safeParse(cursor).success) return adminJson({ error: 'Invalid bug report cursor.' }, 400);
    const now = new Date();
    const rows = await prisma.feedback.findMany({
      where: { bugReport: { expiresAt: { gt: now } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, description: true, createdAt: true, bugReport: { select: {
        reference: true, metadata: true, screenshotExpiresAt: true,
      } } },
    });
    const page = rows.slice(0, 50);
    // Only query screenshot presence, never load or send the encrypted image in the list.
    const screenshots = await prisma.bugReport.findMany({ where: {
      id: { in: page.map(row => row.id) }, screenshot: { not: null }, screenshotExpiresAt: { gt: now },
    }, select: { id: true } });
    const screenshotIDs = new Set(screenshots.map(row => row.id));
    const bugs = page.map(row => {
      let metadata = null;
      try {
        const parsed = bugSchema.shape.metadata.safeParse(JSON.parse(row.bugReport!.metadata));
        if (parsed.success) metadata = parsed.data;
      } catch { /* Older or malformed diagnostics do not hide the report. */ }
      return { id: row.id, reference: row.bugReport!.reference, description: row.description,
        createdAt: row.createdAt, metadata, hasScreenshot: screenshotIDs.has(row.id) };
    });
    return adminJson({ bugs, nextCursor: rows.length > 50 ? page[49].id : null });
  } catch (error) { return adminApiFailure(error); }
}
export const GET = healthRoute('GET /api/admin/feedback/bugs', list);
