import { Bot, CalendarDays, Mic2, Users } from 'lucide-react';
import { AdminUsersTable } from '@/components/admin/admin-users-table';
import { AdminDateRangeFilter } from '@/components/admin/admin-date-range-filter';
import { formatNumber, MetricCard, PageHeading } from '@/components/admin/admin-ui';
import { adminDateRangeLabel, parseAdminDateRange } from '@/lib/admin-date-range';
import { getAdminSnapshot } from '@/server/admin-analytics';

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const params = await searchParams;
  const range = parseAdminDateRange(params.from, params.to);
  const data = await getAdminSnapshot(range.days, { from: range.fromDate, to: range.toDate });
  const label = adminDateRangeLabel(range);
  return <>
    <PageHeading title="Users" description="View account activity, plan selections, AI usage, and voice minutes."><AdminDateRangeFilter key={`${range.from}-${range.to}`} from={range.from} to={range.to} today={new Date().toISOString().slice(0,10)} label={label}/></PageHeading>
    <div className="admin-metrics">
      <MetricCard icon={<Users/>} value={formatNumber(data.metrics.totalUsers)} label="Total users" change={data.changes.newUsers}/>
      <MetricCard icon={<Bot/>} value={formatNumber(data.metrics.aiActions)} label="AI actions" change={data.changes.aiActions}/>
      <MetricCard icon={<Mic2/>} value={`${formatNumber(data.metrics.voiceMinutes)} min`} label="Voice minutes" change={data.changes.voiceMinutes}/>
      <MetricCard icon={<CalendarDays/>} value={formatNumber(data.metrics.activeUsers)} label="Active users" note={label}/>
    </div>
    <section className="admin-panel"><div className="admin-panel-head"><h2>Users ({data.users.length.toLocaleString()})</h2></div><AdminUsersTable users={data.users}/></section>
  </>;
}
