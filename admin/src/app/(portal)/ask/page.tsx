import { AdminDataAssistant } from '@/components/admin/admin-data-assistant';
import { AdminDateRangeFilter } from '@/components/admin/admin-date-range-filter';
import { PageHeading } from '@/components/admin/admin-ui';
import { adminDateRangeLabel, parseAdminDateRange } from '@/lib/admin-date-range';

export default async function AdminAskNexdoPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const params = await searchParams;
  const range = parseAdminDateRange(params.from, params.to);
  return <div className="admin-ask-page">
    <PageHeading title="Ask Nexdo" description="Ask questions about live platform usage and get database-grounded answers with relevant visualizations.">
      <AdminDateRangeFilter key={`${range.from}-${range.to}`} from={range.from} to={range.to} today={new Date().toISOString().slice(0, 10)} label={adminDateRangeLabel(range)} pathname="/ask"/>
    </PageHeading>
    <AdminDataAssistant days={range.days} from={range.from} to={range.to}/>
  </div>;
}
