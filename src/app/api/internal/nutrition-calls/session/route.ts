import { NextResponse } from 'next/server';
import { workerCall } from '@/server/nutrition/auth';
import { sessionForCall } from '@/server/nutrition/calls';
import { nutritionErrorResponse } from '@/server/nutrition/errors';
import { sessionForMomentCall } from '@/server/moment-calls/service';
import { MomentError } from '@/server/moments/domain';

/** Voice worker: the Realtime session configuration for an answered call. */
export async function POST(request: Request) {
  try {
    const body = await request.json() as { callToken?: unknown; twilioCallSid?: unknown };
    const callId = workerCall(request, body);
    if (!callId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const sid = typeof body.twilioCallSid === 'string' ? body.twilioCallSid : undefined;
    if (callId.startsWith('moment:')) return NextResponse.json(await sessionForMomentCall(callId.slice(7), sid));
    return NextResponse.json(await sessionForCall(callId, sid));
  } catch (error) { if (error instanceof MomentError) return NextResponse.json({ error: error.message }, { status: error.status }); return nutritionErrorResponse(error); }
}
