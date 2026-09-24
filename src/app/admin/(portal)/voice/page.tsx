import { readAdminSession } from '@/server/admin-session';
import { redirect } from 'next/navigation';
import { PageHeading } from '@/components/admin/admin-ui';
import { VoiceAnalytics } from '@/components/admin/voice-analytics';
import { getAdminSnapshot } from '@/server/admin-analytics';

import { AdminDateRangeFilter } from '@/components/admin/admin-date-range-filter';
import { parseAdminDateRange, adminDateRangeLabel } from '@/lib/admin-date-range';
import { getVoiceTokens } from '@/server/voice/tokens';

export default async function AdminVoicePage({searchParams}:{searchParams:Promise<{from?:string;to?:string}>}) {
  if (!await readAdminSession()) redirect('/admin/login');
  const params = await searchParams;
  const range = parseAdminDateRange(params.from, params.to);
  const end = new Date(range.toDate); end.setUTCHours(23,59,59,999);
  const [data,tokens] = await Promise.all([getAdminSnapshot(range.days,{from:range.fromDate,to:range.toDate}), getVoiceTokens(range.fromDate,end)]);
  const label = adminDateRangeLabel(range);
  return <>
    <PageHeading title="Voice Analytics" description="Track real-time voice usage, session activity, and user engagement."><AdminDateRangeFilter key={`${range.from}-${range.to}`} from={range.from} to={range.to} today={new Date().toISOString().slice(0,10)} label={label} pathname="/admin/voice"/></PageHeading>
    <VoiceAnalytics key={`${range.from}-${range.to}`} tokens={tokens} rangeLabel={label} records={data.voiceRecords} trend={data.trends.voiceMinutes} change={data.changes.voiceMinutes}/>
  </>;
}
