import { healthRoute } from '@/server/health/telemetry';
import { requireAdmin } from '@/server/admin-auth';
import { getAdminUserDashboard } from '@/server/admin-user-dashboard';
import { adminApiFailure, adminJson } from '@/server/admin-api';
import { adminAudit } from '@/server/admin-audit';

export const runtime = 'nodejs';

async function healthHandlerGET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requireAdmin();
    const { userId } = await params;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) return adminJson({ error: 'Invalid user' }, 400);
    const data = await getAdminUserDashboard(userId, 15);
    if (!data) return adminJson({ error: 'User not found' }, 404);
    await adminAudit(admin.id, 'ADMIN_VIEW_USER', userId, 'Viewed user dashboard');
    return adminJson(data);
  } catch (error) { return adminApiFailure(error); }
}

export const GET = healthRoute('GET /api/admin/users/[userId]', healthHandlerGET);
