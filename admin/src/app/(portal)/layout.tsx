import { AdminShell } from '@/components/admin/admin-shell';
import { adminMeSchema } from '@/contract/session';
import { adminData } from '@/server/admin-data';

export default async function AdminPortalLayout({ children }: { children: React.ReactNode }) {
  const user = await adminData('/api/admin/me', adminMeSchema);
  return <AdminShell name={user.name} email={user.email}>{children}</AdminShell>;
}
