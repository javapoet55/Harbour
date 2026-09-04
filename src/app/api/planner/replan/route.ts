import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { applyReplanProposal, generateReplanProposal } from '@/server/replanner';
import { jsonError } from '@/lib/http';

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await generateReplanProposal(user.id));
  } catch (error) { return jsonError(error); }
}

export async function POST(req: Request) {
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
