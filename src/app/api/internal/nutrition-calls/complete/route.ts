import { NextResponse } from 'next/server';
import { workerCall } from '@/server/nutrition/auth';
import { completeCall } from '@/server/nutrition/calls';
import { nutritionErrorResponse } from '@/server/nutrition/errors';
import { completeMomentCall } from '@/server/moment-calls/service';
import { MomentError } from '@/server/moments/domain';

/** Voice worker: end-of-call report with both transcripts. */
export async function POST(request: Request) {
  try {
    const body = await request.json() as { callToken?: unknown };
    const callId = workerCall(request, body);
    if (!callId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { callToken: _token, ...report } = body as Record<string, unknown>;
    void _token;
    if (callId.startsWith('moment:')) return NextResponse.json(await completeMomentCall(callId.slice(7)));
    return NextResponse.json(await completeCall(callId, report));
  } catch (error) { if (error instanceof MomentError) return NextResponse.json({ error: error.message }, { status: error.status }); return nutritionErrorResponse(error); }
}
