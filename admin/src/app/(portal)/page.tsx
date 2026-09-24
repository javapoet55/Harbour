import { OverviewAnalytics } from '@/components/admin/overview-analytics';
import { PageHeading } from '@/components/admin/admin-ui';
import { AdminDateRangeFilter } from '@/components/admin/admin-date-range-filter';
import { adminDateRangeLabel, parseAdminDateRange } from '@/lib/admin-date-range';
import { adminSnapshotSchema } from '@/contract/snapshot';
import { adminData } from '@/server/admin-data';
import { rangeQuery } from '@/lib/admin-api-paths';

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const params = await searchParams;
  const range = parseAdminDateRange(params.from, params.to);
  const data = await adminData(`/api/admin/snapshot?${rangeQuery(range)}`, adminSnapshotSchema);
  const rangeLabel = adminDateRangeLabel(range);
  return <>
    <PageHeading title="Overview" description="Live metrics and insights for the Nexdo platform."><AdminDateRangeFilter key={`${range.from}-${range.to}`} from={range.from} to={range.to} today={new Date().toISOString().slice(0,10)} label={rangeLabel} pathname="/"/></PageHeading>
    <OverviewAnalytics key={`${range.from}-${range.to}`} data={data} rangeLabel={rangeLabel}/>
  </>;
}
