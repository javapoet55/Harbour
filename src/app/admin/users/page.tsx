import { Bot, CalendarDays, Mic2, Users } from 'lucide-react';
import { AdminUsersTable } from '@/components/admin/admin-users-table';
import { DatePill, formatNumber, MetricCard, PageHeading } from '@/components/admin/admin-ui';
import { getAdminSnapshot } from '@/server/admin-analytics';

export default async function AdminUsersPage() {
  const data = await getAdminSnapshot(15);
  return <>
    <PageHeading title="Users" description="View account activity, plan selections, AI usage, and voice minutes."><DatePill days={15}/></PageHeading>
    <div className="admin-metrics">
      <MetricCard icon={<Users/>} value={formatNumber(data.metrics.totalUsers)} label="Total users" change={data.changes.newUsers}/>
      <MetricCard icon={<Bot/>} value={formatNumber(data.metrics.aiActions)} label="AI actions" change={data.changes.aiActions}/>
      <MetricCard icon={<Mic2/>} value={`${formatNumber(data.metrics.voiceMinutes)} min`} label="Voice minutes" change={data.changes.voiceMinutes}/>
      <MetricCard icon={<CalendarDays/>} value={formatNumber(data.metrics.activeUsers)} label="Active users" note="Last 15 days"/>
    </div>
    <section className="admin-panel"><div className="admin-panel-head"><h2>Users ({data.users.length.toLocaleString()})</h2></div><AdminUsersTable users={data.users}/></section>
  </>;
}
