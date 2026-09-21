import { readAdminSession } from './admin-session';
export { adminEmails, isAdminEmail } from './admin-allowlist';

export async function requireAdmin() {
  const user = await readAdminSession();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}
