import { z } from 'zod';
import { requireAdmin } from '@/server/admin-auth';
import { prisma } from '@/server/db';
import { adminJson, adminApiFailure } from '@/server/admin-api';
import { bugReportStatuses, closedBugReportStatuses } from '@/server/feedback/bug-status';
import { bugSchema } from '@/server/feedback/bugs';
import { healthRoute } from '@/server/health/telemetry';

function parseMetadata(value: string) {
  try {
    const parsed = bugSchema.shape.metadata.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function list(req: Request) {
  try {
    await requireAdmin();
    const params = new URL(req.url).searchParams;
    const cursor = params.get('cursor');
    const direction = params.get('direction') === 'asc' ? 'asc' : 'desc';
    if (cursor && !z.string().uuid().safeParse(cursor).success) return adminJson({ error: 'Invalid bug report cursor.' }, 400);
    const now = new Date();
    const where = { bugReport: { expiresAt: { gt: now } } };
    const sortByApp = params.get('sort') === 'app';
    let appPage: string[] | undefined;
    if (sortByApp) {
      // Read only the fields needed to sort the retained reports before paging.
      const candidates = await prisma.feedback.findMany({
        where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, bugReport: { select: { metadata: true } } },
      });
      const ordered = candidates.map(row => ({
        id: row.id, app: parseMetadata(row.bugReport!.metadata)?.screen,
      })).sort((a, b) => {
        if (!a.app || !b.app) return Number(!a.app) - Number(!b.app);
        return a.app.localeCompare(b.app) * (direction === 'asc' ? 1 : -1);
      });
      const offset = cursor ? ordered.findIndex(row => row.id === cursor) + 1 : 0;
      appPage = ordered.slice(offset, offset + 51).map(row => row.id);
    }
    const rows = await prisma.feedback.findMany({
      where: appPage ? { ...where, id: { in: appPage } } : where,
      orderBy: [{ createdAt: direction }, { id: direction }], take: 51,
      ...(cursor && !appPage ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, description: true, createdAt: true, bugReport: { select: {
        reference: true, metadata: true, screenshotExpiresAt: true, status: true,
      } } },
    });
    const rank = new Map(appPage?.map((id, index) => [id, index]));
    if (appPage) rows.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    const page = rows.slice(0, 50);
    // Only query screenshot presence, never load or send the encrypted image in the list.
    const screenshots = await prisma.bugReport.findMany({ where: {
      id: { in: page.map(row => row.id) }, screenshot: { not: null }, screenshotExpiresAt: { gt: now },
    }, select: { id: true } });
    const screenshotIDs = new Set(screenshots.map(row => row.id));
    const bugs = page.map(row => {
      const metadata = parseMetadata(row.bugReport!.metadata);
      return { id: row.id, reference: row.bugReport!.reference, description: row.description,
        createdAt: row.createdAt, status: row.bugReport!.status, metadata, hasScreenshot: screenshotIDs.has(row.id) };
    });
    return adminJson({ bugs, nextCursor: rows.length > 50 ? page[49].id : null });
  } catch (error) { return adminApiFailure(error); }
}
export const GET = healthRoute('GET /api/admin/feedback/bugs', list);

const statusInput = z.union([
  z.object({ id: z.string().uuid(), status: z.enum(bugReportStatuses) }).strict(),
  z.object({ id: z.string().uuid(), closed: z.boolean() }).strict()
    .transform(({ id, closed }) => ({ id, status: closed ? 'closed' as const : 'open' as const })),
]);
const closedStatuses = new Set<string>(closedBugReportStatuses);

async function updateStatus(req: Request) {
  try {
    await requireAdmin();
    const parsed = statusInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return adminJson({ error: 'Invalid bug report status.' }, 400);

    const { id, status } = parsed.data;
    const now = new Date();
    const where = { id, expiresAt: { gt: now } };
    const updated = await prisma.bugReport.updateMany({
      where: { ...where, status: { not: status } },
      data: { status, closedAt: closedStatuses.has(status) ? now : null },
    });
    if (updated.count === 0 && !await prisma.bugReport.findFirst({ where, select: { id: true } })) {
      return adminJson({ error: 'Bug report not found.' }, 404);
    }
    return adminJson({ status });
  } catch (error) {
    return adminApiFailure(error);
  }
}

export const PATCH = healthRoute('PATCH /api/admin/feedback/bugs', updateStatus);
