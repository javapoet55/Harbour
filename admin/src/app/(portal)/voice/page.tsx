import { PageHeading } from '@/components/admin/admin-ui';
import { VoiceAnalytics } from '@/components/admin/voice-analytics';

import { AdminDateRangeFilter } from '@/components/admin/admin-date-range-filter';
import { parseAdminDateRange, adminDateRangeLabel } from '@/lib/admin-date-range';
import { rangeQuery } from '@/lib/admin-api-paths';
import { adminSnapshotSchema } from '@/contract/snapshot';
import { voiceTokensSchema } from '@/contract/voice-tokens';
import { adminData } from '@/server/admin-data';

export default async function AdminVoicePage({searchParams}:{searchParams:Promise<{from?:string;to?:string}>}) {
  const params = await searchParams;
  const range = parseAdminDateRange(params.from, params.to);
  const [data,tokens] = await Promise.all([adminData(`/api/admin/snapshot?${rangeQuery(range)}`,adminSnapshotSchema), adminData(`/api/admin/voice-tokens?${rangeQuery(range)}`,voiceTokensSchema)]);
  const label = adminDateRangeLabel(range);
  return <>
    <PageHeading title="Voice Analytics" description="Track real-time voice usage, session activity, and user engagement."><AdminDateRangeFilter key={`${range.from}-${range.to}`} from={range.from} to={range.to} today={new Date().toISOString().slice(0,10)} label={label} pathname="/voice"/></PageHeading>
    <VoiceAnalytics key={`${range.from}-${range.to}`} tokens={tokens} rangeLabel={label} records={data.voiceRecords} trend={data.trends.voiceMinutes} change={data.changes.voiceMinutes}/>
  </>;
}
