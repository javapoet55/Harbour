import { readAdminSession } from '@/server/admin-session';
export function canOperate(userId: string) {
  return (process.env.NEXDO_HEALTH_OPERATOR_IDS ?? '').split(',').map(v=>v.trim()).filter(Boolean).includes(userId);
}
export async function healthAccess(write = false) {
  const user = await readAdminSession();
  if (!user) throw new Error('UNAUTHENTICATED');
  if (write && !canOperate(user.id)) throw new Error('FORBIDDEN');
  return user;
}
