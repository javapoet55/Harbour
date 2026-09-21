import { healthRoute } from '@/server/health/telemetry';
import { requireUser } from '@/server/auth';
import { jsonError } from '@/lib/http';
import { getProtectedTimeProposal, respondProtectedTime } from '@/server/protected-time';
import { z } from 'zod';
async function healthHandlerGET() {
  try { const user = await requireUser(); return Response.json(await getProtectedTimeProposal(user.id), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { return jsonError(error); }
}
const input = z.object({ action: z.enum(['accept', 'dismiss']), taskId: z.string().min(1).max(200), startAt: z.string().datetime({ offset: true }), expectedUpdatedAt: z.string().datetime({ offset: true }) }).strict();
async function healthHandlerPOST(req: Request) {
  try {
    const user = await requireUser(), parsed = input.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: 'Invalid protected-time proposal.' }, { status: 400 });
    return Response.json(await respondProtectedTime(user.id, parsed.data));
  } catch (error) {
    if (error instanceof Error && error.message === 'STALE_PROTECTED_TIME') return Response.json({ error: 'Your task or availability changed. Refresh to review a new protected-time proposal.' }, { status: 409 });
    return jsonError(error);
  }
}

export const GET = healthRoute('GET /api/protected-time', healthHandlerGET);

export const POST = healthRoute('POST /api/protected-time', healthHandlerPOST);
