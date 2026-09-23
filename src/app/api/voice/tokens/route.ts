import { healthRoute } from '@/server/health/telemetry';
import { requireUser } from '@/server/auth';
import { jsonError } from '@/lib/http';
import { voiceTokenReceipt } from '@/lib/voice-tokens';
import { recordVoiceTokens } from '@/server/voice/tokens';
export const runtime = 'nodejs';
export const POST = healthRoute('POST /api/voice/tokens', async (request: Request) => {
  try {
    const user = await requireUser();
    await recordVoiceTokens(user.id, voiceTokenReceipt.parse(await request.json()));
    return Response.json({recorded:true}, {headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {return jsonError(error);}
});
