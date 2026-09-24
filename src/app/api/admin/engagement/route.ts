import { healthRoute } from '@/server/health/telemetry';
import { requireAdmin } from '@/server/admin-auth';
import { getFirebaseEngagement } from '@/server/firebase-engagement';
import { adminApiFailure, adminJson, adminQueryRange, invalidRange } from '@/server/admin-api';

export const runtime = 'nodejs';

// Always 200 once authorized: not_configured and unavailable are reported in the body, as on the page.
async function healthHandlerGET(request: Request) {
  try {
    await requireAdmin();
    const range = adminQueryRange(request);
    if (!range) return invalidRange();
    return adminJson(await getFirebaseEngagement(range.from, range.to));
  } catch (error) { return adminApiFailure(error); }
}

export const GET = healthRoute('GET /api/admin/engagement', healthHandlerGET);
