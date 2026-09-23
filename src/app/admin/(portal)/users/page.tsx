import { readAdminSession } from '@/server/admin-session';
import { redirect } from 'next/navigation';
import { UsersAnalytics } from '@/components/admin/users-analytics';
import { AdminDateRangeFilter } from '@/components/admin/admin-date-range-filter';
import { PageHeading } from '@/components/admin/admin-ui';
import { adminDateRangeLabel, parseAdminDateRange } from '@/lib/admin-date-range';
import { getAdminSnapshot } from '@/server/admin-analytics';

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  if (!await readAdminSession()) redirect('/admin/login');
  const params = await searchParams;
  const range = parseAdminDateRange(params.from, params.to);
  const data = await getAdminSnapshot(range.days, { from: range.fromDate, to: range.toDate });
  const label = adminDateRangeLabel(range);
  return <>
    <PageHeading title="Users" description="View account activity, plan selections, AI usage, and voice minutes."><AdminDateRangeFilter key={`${range.from}-${range.to}`} from={range.from} to={range.to} today={new Date().toISOString().slice(0,10)} label={label}/></PageHeading>
    <UsersAnalytics key={`${range.from}-${range.to}`} data={data} label={label}/>
  </>;
}
