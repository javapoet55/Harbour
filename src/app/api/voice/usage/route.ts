import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { jsonError } from '@/lib/http';
import { currentVoiceUsage, recordVoiceUsage } from '@/server/voice/usage';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
const input = z.object({ sessionId: z.string().uuid(), durationSeconds: z.number().nonnegative().max(14400) });

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json(await currentVoiceUsage(user.id, user.timeZone), { headers });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = input.parse(await request.json());
    return Response.json(await recordVoiceUsage(user.id, user.timeZone, body.sessionId, body.durationSeconds), { headers });
  } catch (error) { return jsonError(error); }
}
