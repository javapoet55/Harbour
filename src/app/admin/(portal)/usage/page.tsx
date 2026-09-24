import { readAdminSession } from '@/server/admin-session';
import { redirect } from 'next/navigation';
import { Activity } from 'lucide-react';
import { DatePill, PageHeading } from '@/components/admin/admin-ui';
import { UsageAnalytics } from '@/components/admin/usage-analytics';
import { getAdminSnapshot } from '@/server/admin-analytics';

export default async function AdminUsagePage() {
  if (!await readAdminSession()) redirect('/admin/login');
  const data = await getAdminSnapshot(15);
  return <>
    <PageHeading title="Usage Analytics" description="See how Nexdo is used across tasks, AI, voice, shopping, and moments."><DatePill days={15}/></PageHeading>
    <div className="admin-callout"><Activity size={20}/><div><strong>Accurate activity reporting</strong><br/>Nexdo currently stores completed product actions rather than model token counts, so this dashboard reports auditable AI actions and feature activity.</div></div>
    <UsageAnalytics data={data}/>
  </>;
}
