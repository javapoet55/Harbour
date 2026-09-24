import { healthRoute } from '@/server/health/telemetry';
import { requireAdmin } from '@/server/admin-auth';
import { getAdminSnapshot } from '@/server/admin-analytics';
import { adminApiFailure, adminJson, adminQueryRange, invalidRange } from '@/server/admin-api';

export const runtime = 'nodejs';

// Either an exact from/to range or a trailing number of days (1–366), never both.
async function healthHandlerGET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const days = params.get('days');
    if (params.has('from') || params.has('to')) {
      const range = adminQueryRange(request);
      if (!range || days !== null) return invalidRange();
      return adminJson(await getAdminSnapshot(range.days, { from: range.fromDate, to: range.toDate }));
    }
    if (!days || !/^\d{1,3}$/.test(days) || +days < 1 || +days > 366) return adminJson({ error: 'Choose from and to dates, or days between 1 and 366.' }, 400);
    return adminJson(await getAdminSnapshot(Number(days)));
  } catch (error) { return adminApiFailure(error); }
}

export const GET = healthRoute('GET /api/admin/snapshot', healthHandlerGET);
