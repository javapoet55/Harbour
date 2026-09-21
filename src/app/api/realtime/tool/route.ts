import { healthRoute } from '@/server/health/telemetry';
import { calendarVoiceToolNames } from '@/server/voice/configuration';
import { requireUser } from '@/server/auth';
import { executeVoiceTool, validateVoiceTool } from '@/server/voice/tools';
import { z } from 'zod';
const envelope = z.object({ consent: z.literal(true), scope: z.enum(['general', 'calendar']).optional(), sessionId: z.string().uuid(), callId: z.string().min(1).max(200), name: z.string().max(50), arguments: z.record(z.string(), z.unknown()) }).strict();
const headers = { 'Cache-Control': 'private, no-store' };
async function healthHandlerPOST(req: Request) {
  try {
    const user = await requireUser();
    const raw = await req.text();
    if (raw.length > 16384) return Response.json({ success: false, error: 'Request too large.' }, { status: 413, headers });
    let body;
    try { body = envelope.parse(JSON.parse(raw)); validateVoiceTool(body.name, body.arguments); }
    catch { return Response.json({ success: false, error: 'Invalid tool arguments. Ask the user to clarify.' }, { status: 400, headers }); }
    if (body.scope === 'calendar' && !calendarVoiceToolNames.includes(body.name)) return Response.json({ success: false, error: 'Calendar voice only supports appointments and events.' }, { status: 400, headers });
    const result = await executeVoiceTool(user.id, body.sessionId, body.callId, body.name, body.arguments);
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') return Response.json({ success: false, error: 'Sign in required.' }, { status: 401, headers });
    return Response.json({ success: false, uncertain: true, error: 'Could not confirm the operation. It may have partially succeeded. Check current tasks before retrying; never claim success.' }, { status: 500, headers });
  }
}

export const POST = healthRoute('POST /api/realtime/tool', healthHandlerPOST);
