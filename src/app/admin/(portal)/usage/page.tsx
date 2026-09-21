import { readAdminSession } from '@/server/admin-session';
import { redirect } from 'next/navigation';
import { Activity, Bot, ListChecks, Users } from 'lucide-react';
import { BarChart, DatePill, Donut, formatNumber, LineChart, MetricCard, PageHeading, Panel, ProgressList } from '@/components/admin/admin-ui';
import { getAdminSnapshot } from '@/server/admin-analytics';

export default async function AdminUsagePage() {
  if (!await readAdminSession()) redirect('/admin/login');
  const data = await getAdminSnapshot(15);
  const total = data.featureCounts.reduce((sum,row)=>sum+row.value,0);
  return <>
    <PageHeading title="Usage Analytics" description="See how Nexdo is used across tasks, AI, voice, shopping, and moments."><DatePill days={15}/></PageHeading>
    <div className="admin-callout"><Activity size={20}/><div><strong>Accurate activity reporting</strong><br/>Nexdo currently stores completed product actions rather than model token counts, so this dashboard reports auditable AI actions and feature activity.</div></div>
    <div className="admin-metrics">
      <MetricCard icon={<Bot/>} value={formatNumber(data.metrics.aiActions)} label="AI actions" change={data.changes.aiActions}/>
      <MetricCard icon={<Users/>} value={formatNumber(data.metrics.totalUsers)} label="Total users" change={data.changes.newUsers}/>
      <MetricCard icon={<Activity/>} value={formatNumber(data.metrics.activeUsers)} label="Active users" note="Last 15 days"/>
      <MetricCard icon={<ListChecks/>} value={formatNumber(total)} label="Tracked feature actions" note="Last 15 days"/>
    </div>
    <div className="admin-grid">
      <Panel title="AI activity trend" className="admin-span-8"><LineChart data={data.trends.aiActions} valueLabel="AI actions by day"/></Panel>
      <Panel title="Daily activity" className="admin-span-4"><BarChart data={data.trends.aiActions}/></Panel>
      <Panel title="Feature usage breakdown" className="admin-span-5"><Donut values={data.featureCounts.map((row)=>row.value)} colors={data.featureCounts.map((row)=>row.color)} center={formatNumber(total)} label="Actions"/><div className="admin-legend">{data.featureCounts.map(row=><div className="admin-legend-row" key={row.label}><i style={{background:row.color}}/><span>{row.label}</span><strong>{row.value}</strong></div>)}</div></Panel>
      <Panel title="Top features by usage" className="admin-span-7"><ProgressList rows={data.featureCounts}/></Panel>
    </div>
  </>;
}
