import { readAdminAuth } from '@/server/admin-session';
export function canOperate(userId: string) {
  return (process.env.NEXDO_HEALTH_OPERATOR_IDS ?? '').split(',').map(v=>v.trim()).filter(Boolean).includes(userId);
}
export async function healthAccess(write = false) {
  const auth = await readAdminAuth();
  if (!auth) throw new Error('UNAUTHENTICATED');
  if (write && !canOperate(auth.user.id)) throw new Error('FORBIDDEN');
  // viaBearer: authenticated by the admin frontend's bearer and client secret, not a browser cookie.
  return { ...auth.user, viaBearer: auth.viaBearer };
}
