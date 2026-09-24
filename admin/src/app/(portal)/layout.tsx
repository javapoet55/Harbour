import type { ReactNode } from 'react';
import { adminMeSchema } from '@/contract/session';
import { adminData } from '@/server/admin-data';

export const dynamic = 'force-dynamic';

export default async function AdminPortalLayout({ children }: { children: ReactNode }) {
  const me = await adminData('/api/admin/me', adminMeSchema);
  return <div data-admin={me.email}>{children}</div>;
}
