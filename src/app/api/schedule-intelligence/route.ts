import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { getScheduleIntelligence } from '@/server/schedule-intelligence';
import { generateReplanProposal } from '@/server/replanner';
import { jsonError } from '@/lib/http';
import { proactiveNextAction, dismissNextAction } from '@/server/executive-companion';
import { z } from 'zod';

async function healthHandlerGET(req: Request) {
  try {
    const user = await requireUser();
    const params = new URL(req.url).searchParams;
    const scope = params.get('scope');
    const bufferMinutes = params.has('bufferMinutes') ? Number(params.get('bufferMinutes')) : undefined;
    if ((scope && scope !== 'today') || (bufferMinutes !== undefined && (!Number.isInteger(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 120))) {
      return NextResponse.json({ error: 'Choose a buffer between 0 and 120 minutes.' }, { status: 400 });
    }
    return NextResponse.json(await getScheduleIntelligence(user.id, new Date(), { scope: scope === 'today' ? 'today' : undefined, bufferMinutes }), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return jsonError(error); }
}

async function healthHandlerPOST(req: Request) {
  try {
    const user = await requireUser();
    const body = req ? await req.json().catch(() => null) : null;
    if (body?.operation) {
      const parsed = z.discriminatedUnion('operation', [z.object({ operation: z.literal('next-action') }), z.object({ operation: z.literal('dismiss-next-action'), contextActionId: z.string().min(1).max(100) })]).safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: 'Invalid next-action request.' }, { status: 400 });
      if (parsed.data.operation === 'dismiss-next-action') { await dismissNextAction(user.id, parsed.data.contextActionId); return NextResponse.json({ ok: true }); }
      return NextResponse.json(await proactiveNextAction(user.id), { headers: { 'Cache-Control': 'private, no-store' } });
    }
    // Existing replanner only changes Harbor-owned tasks after the user approves it.
    return NextResponse.json({ proposal: await generateReplanProposal(user.id) });
  } catch (error) { return jsonError(error); }
}

export const GET = healthRoute('GET /api/schedule-intelligence', healthHandlerGET);

export const POST = healthRoute('POST /api/schedule-intelligence', healthHandlerPOST);
