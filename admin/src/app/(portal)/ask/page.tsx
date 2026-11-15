import { AdminDataAssistant } from '@/components/admin/admin-data-assistant';
import { AdminDateRangeFilter } from '@/components/admin/admin-date-range-filter';
import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import { adminDateRangeLabel, parseAdminDateRange } from '@/lib/admin-date-range';

export default async function AdminAskNexdoPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const params = await searchParams;
  const range = parseAdminDateRange(params.from, params.to);
  return <div className="admin-ask-page">
    <header className="admin-ask-hero">
      <div className="admin-ask-title">
        <Sparkles aria-hidden="true"/>
        <div><h1>Ask <span>Nexdo</span></h1><p>Ask questions about live platform usage and get source-grounded answers with relevant visualizations.</p></div>
      </div>
      <Image className="admin-ask-art" src="/ask-analytics-art.webp" alt="" width={440} height={253}/>

      <AdminDateRangeFilter key={`${range.from}-${range.to}`} from={range.from} to={range.to} today={new Date().toISOString().slice(0, 10)} label={adminDateRangeLabel(range)} pathname="/ask"/>
    </header>
    <AdminDataAssistant days={range.days} from={range.from} to={range.to}/>
  </div>;
}
