import { NextResponse } from 'next/server';
import { workerCall } from '@/server/nutrition/auth';
import { sessionForCall } from '@/server/nutrition/calls';
import { nutritionErrorResponse } from '@/server/nutrition/errors';

/** Voice worker: the Realtime session configuration for an answered call. */
export async function POST(request: Request) {
  try {
    const body = await request.json() as { callToken?: unknown; twilioCallSid?: unknown };
    const callId = workerCall(request, body);
    if (!callId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json(await sessionForCall(callId, typeof body.twilioCallSid === 'string' ? body.twilioCallSid : undefined));
  } catch (error) { return nutritionErrorResponse(error); }
}
