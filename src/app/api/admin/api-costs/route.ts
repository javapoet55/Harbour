import { requireAdmin } from '@/server/admin-auth';
import { apiCostReport } from '@/server/ai-api-costs';
import { adminRangeEnd } from '@/lib/admin-date-range';
import { adminApiFailure, adminJson, adminQueryRange, invalidRange } from '@/server/admin-api';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const range = adminQueryRange(request);
    if (!range) return invalidRange();
    return adminJson(await apiCostReport(range.fromDate, adminRangeEnd(range)));
  } catch (error) { return adminApiFailure(error); }
}
