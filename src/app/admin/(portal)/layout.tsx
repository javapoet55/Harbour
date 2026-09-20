import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/admin-shell';
import { readAdminSession } from '@/server/admin-session';

export default async function AdminPortalLayout({ children }: { children: React.ReactNode }) {
  const user = await readAdminSession();
  if (!user) redirect('/admin/login');
  return <AdminShell name={user.name} email={user.email}>{children}</AdminShell>;
}
