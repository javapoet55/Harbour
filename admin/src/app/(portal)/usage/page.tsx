import { Activity } from 'lucide-react';
import { DatePill, PageHeading } from '@/components/admin/admin-ui';
import { UsageAnalytics } from '@/components/admin/usage-analytics';
import { adminSnapshotSchema } from '@/contract/snapshot';
import { adminData } from '@/server/admin-data';

export default async function AdminUsagePage() {
  const data = await adminData('/api/admin/snapshot?days=15', adminSnapshotSchema);
  return <>
    <PageHeading title="Usage Analytics" description="See how Nexdo is used across tasks, AI, voice, shopping, and moments."><DatePill days={15}/></PageHeading>
    <div className="admin-callout"><Activity size={20}/><div><strong>Accurate activity reporting</strong><br/>Nexdo currently stores completed product actions rather than model token counts, so this dashboard reports auditable AI actions and feature activity.</div></div>
    <UsageAnalytics data={data}/>
  </>;
}
