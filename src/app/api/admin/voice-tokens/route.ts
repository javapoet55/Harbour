import { healthRoute } from '@/server/health/telemetry';
import { requireAdmin } from '@/server/admin-auth';
import { getVoiceTokens } from '@/server/voice/tokens';
import { adminRangeEnd } from '@/lib/admin-date-range';
import { adminApiFailure, adminJson, adminQueryRange, invalidRange } from '@/server/admin-api';

export const runtime = 'nodejs';

async function healthHandlerGET(request: Request) {
  try {
    await requireAdmin();
    const range = adminQueryRange(request);
    if (!range) return invalidRange();
    return adminJson(await getVoiceTokens(range.fromDate, adminRangeEnd(range)));
  } catch (error) { return adminApiFailure(error); }
}

export const GET = healthRoute('GET /api/admin/voice-tokens', healthHandlerGET);
