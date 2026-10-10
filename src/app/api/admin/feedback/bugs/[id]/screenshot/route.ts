import { requireAdmin } from '@/server/admin-auth';
import { adminApiFailure } from '@/server/admin-api';
import { prisma } from '@/server/db';
import { decryptCredential } from '@/lib/credentials';
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const report = await prisma.bugReport.findUnique({ where: { id } });
    if (!report?.screenshot || report.screenshotExpiresAt <= new Date()) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(Buffer.from(decryptCredential(report.screenshot)!, 'base64')), { headers: {
      'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline; filename="bug-screenshot.jpg"', 'Content-Security-Policy': "default-src 'none'; sandbox",
    } });
  } catch (error) { return adminApiFailure(error); }
}
