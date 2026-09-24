import { healthRoute } from '@/server/health/telemetry';
import { readAdminSession } from '@/server/admin-session';
import { canOperate } from '@/server/health/access';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };

async function healthHandlerGET() {
  const user = await readAdminSession();
  if (!user) return Response.json({ error: 'Admin sign-in required' }, { status: 401, headers });
  return Response.json({ id: user.id, name: user.name, email: user.email, canOperate: canOperate(user.id) }, { headers });
}

export const GET = healthRoute('GET /api/admin/me', healthHandlerGET);
