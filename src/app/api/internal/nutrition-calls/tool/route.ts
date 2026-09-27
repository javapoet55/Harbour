import { NextResponse } from 'next/server';
import { workerCall } from '@/server/nutrition/auth';
import { executeTool } from '@/server/nutrition/calls';
import { nutritionErrorResponse } from '@/server/nutrition/errors';

/** Voice worker: run one model tool call. Arguments arrive as the model's JSON string. */
export async function POST(request: Request) {
  try {
    const body = await request.json() as { callToken?: unknown; name?: unknown; arguments?: unknown };
    const callId = workerCall(request, body);
    if (!callId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    let args: unknown = {};
    try { args = typeof body.arguments === 'string' && body.arguments ? JSON.parse(body.arguments) : {}; } catch { return NextResponse.json({ result: { error: 'invalid_json_arguments' } }); }
    return NextResponse.json({ result: await executeTool(callId, String(body.name ?? ''), args) });
  } catch (error) { return nutritionErrorResponse(error); }
}
