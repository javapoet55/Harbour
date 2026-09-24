import { UsersAnalytics } from '@/components/admin/users-analytics';
import { AdminDateRangeFilter } from '@/components/admin/admin-date-range-filter';
import { PageHeading } from '@/components/admin/admin-ui';
import { adminDateRangeLabel, parseAdminDateRange } from '@/lib/admin-date-range';
import { adminSnapshotSchema } from '@/contract/snapshot';
import { adminData } from '@/server/admin-data';
import { rangeQuery } from '@/lib/admin-api-paths';

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const params = await searchParams;
  const range = parseAdminDateRange(params.from, params.to);
  const data = await adminData(`/api/admin/snapshot?${rangeQuery(range)}`, adminSnapshotSchema);
  const label = adminDateRangeLabel(range);
  return <>
    <PageHeading title="Users" description="View account activity, plan selections, AI usage, and voice minutes."><AdminDateRangeFilter key={`${range.from}-${range.to}`} from={range.from} to={range.to} today={new Date().toISOString().slice(0,10)} label={label}/></PageHeading>
    <UsersAnalytics key={`${range.from}-${range.to}`} data={data} label={label}/>
  </>;
}
