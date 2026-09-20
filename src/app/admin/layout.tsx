import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/admin-shell';
import { currentUser } from '@/server/auth';
import { isAdminEmail } from '@/server/admin-auth';
import './admin.css';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login?next=/admin');
  if (!isAdminEmail(user.email)) notFound();
  return <AdminShell name={user.name} email={user.email}>{children}</AdminShell>;
}
