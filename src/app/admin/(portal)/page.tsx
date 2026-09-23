import { readAdminSession } from '@/server/admin-session';
import { redirect } from 'next/navigation';
import { OverviewAnalytics } from '@/components/admin/overview-analytics';
import { PageHeading } from '@/components/admin/admin-ui';
import { AdminDateRangeFilter } from '@/components/admin/admin-date-range-filter';
import { adminDateRangeLabel, parseAdminDateRange } from '@/lib/admin-date-range';
import { getAdminSnapshot } from '@/server/admin-analytics';

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  if (!await readAdminSession()) redirect('/admin/login');
  const params = await searchParams;
  const range = parseAdminDateRange(params.from, params.to);
  const data = await getAdminSnapshot(range.days, { from: range.fromDate, to: range.toDate });
  const rangeLabel = adminDateRangeLabel(range);
  return <>
    <PageHeading title="Overview" description="Live metrics and insights for the Nexdo platform."><AdminDateRangeFilter key={`${range.from}-${range.to}`} from={range.from} to={range.to} today={new Date().toISOString().slice(0,10)} label={rangeLabel} pathname="/admin"/></PageHeading>
    <OverviewAnalytics key={`${range.from}-${range.to}`} data={data} rangeLabel={rangeLabel}/>
  </>;
}
