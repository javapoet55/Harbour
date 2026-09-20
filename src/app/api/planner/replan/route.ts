import { healthRoute } from '@/server/health/telemetry';
import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { applyReplanProposal, generateReplanProposal } from '@/server/replanner';
import { jsonError } from '@/lib/http';

async function healthHandlerGET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await generateReplanProposal(user.id));
  } catch (error) { return jsonError(error); }
}

async function healthHandlerPOST(req: Request) {
  try {
    const user = await requireUser();
    const actionId = String((await req.json()).actionId || '');
    if (!actionId) return NextResponse.json({ error: 'A replan action is required.' }, { status: 400 });
    return NextResponse.json(await applyReplanProposal(user.id, actionId));
  } catch (error) {
    if (error instanceof Error && error.message === 'STALE_REPLAN') return NextResponse.json({ error: 'The schedule changed after this plan was generated. Review a fresh plan.' }, { status: 409 });
    return jsonError(error);
  }
}

export const GET = healthRoute('GET /api/planner/replan', healthHandlerGET);

export const POST = healthRoute('POST /api/planner/replan', healthHandlerPOST);
