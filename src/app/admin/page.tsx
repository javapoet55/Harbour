import Link from 'next/link';
import { Activity, Bot, CircleDollarSign, Mic2, UserPlus, Users } from 'lucide-react';
import { DatePill, Donut, formatCurrency, formatNumber, LineChart, MetricCard, PageHeading, Panel, ProgressList } from '@/components/admin/admin-ui';
import { getAdminSnapshot } from '@/server/admin-analytics';

export default async function AdminOverviewPage() {
  const data = await getAdminSnapshot(30);
  const plans = [
    { label: 'Pro', value: data.planCounts.PRO, color: '#177cf6' },
    { label: 'Max', value: data.planCounts.MAX, color: '#7854e8' },
    { label: 'Free', value: data.planCounts.FREE, color: '#a8b5c9' },
  ];
  return <>
    <PageHeading title="Overview" description="Live metrics and insights for the Nexdo platform."><DatePill days={30}/></PageHeading>
    <div className="admin-metrics six">
      <MetricCard icon={<Users/>} value={formatNumber(data.metrics.totalUsers)} label="Total users" change={data.changes.newUsers}/>
      <MetricCard icon={<UserPlus/>} value={formatNumber(data.metrics.newUsers)} label="New signups" change={data.changes.newUsers}/>
      <MetricCard icon={<Bot/>} value={formatNumber(data.metrics.aiActions)} label="AI actions" change={data.changes.aiActions}/>
      <MetricCard icon={<Mic2/>} value={`${formatNumber(data.metrics.voiceMinutes)} min`} label="Voice minutes" change={data.changes.voiceMinutes}/>
      <MetricCard icon={<CircleDollarSign/>} value={formatCurrency(data.metrics.estimatedMrr)} label="Estimated MRR" note="From current plan selections"/>
      <MetricCard icon={<Activity/>} value={formatNumber(data.metrics.activeUsers)} label="Active users" note="Activity in the last 30 days"/>
    </div>
    <div className="admin-grid">
      <Panel title="User growth" className="admin-span-6"><LineChart data={data.trends.totalUsers} valueLabel="Total user trend"/></Panel>
      <Panel title="AI assistant usage" className="admin-span-3"><BarChartPanel data={data.trends.aiActions} /></Panel>
      <Panel title="Voice usage" className="admin-span-3"><BarChartPanel data={data.trends.voiceMinutes} color="#18aee8"/></Panel>
      <Panel title="Users by plan" className="admin-span-4">
        <Donut values={plans.map((plan) => plan.value)} colors={plans.map((plan) => plan.color)} center={formatNumber(data.metrics.totalUsers)} label="Users" />
        <div className="admin-legend">{plans.map((plan) => <div className="admin-legend-row" key={plan.label}><i style={{background:plan.color}}/><span>{plan.label}</span><strong>{plan.value}</strong></div>)}</div>
      </Panel>
      <Panel title="Feature usage" className="admin-span-4"><ProgressList rows={data.featureCounts}/></Panel>
      <Panel title="System health" className="admin-span-4">
        <table className="admin-list"><tbody><tr><td>Application</td><td><span className="admin-status">Online</span></td></tr><tr><td>Database</td><td><span className="admin-status">Connected</span></td></tr><tr><td>Admin access</td><td><span className="admin-status">Enforced</span></td></tr><tr><td>Metrics refreshed</td><td>{new Date(data.generatedAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</td></tr></tbody></table>
      </Panel>
      <Panel title="Recent signups" className="admin-span-6" action={<Link href="/admin/users">View all</Link>}><table className="admin-list"><tbody>{data.users.slice(0,6).map((user)=><tr key={user.id}><td>{user.email}</td><td>{user.plan}</td><td>{new Date(user.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></Panel>
      <Panel title="Recent voice activity" className="admin-span-6" action={<Link href="/admin/voice">View all</Link>}><table className="admin-list"><tbody>{data.recentVoice.slice(0,6).map((row)=><tr key={row.id}><td>{row.user}</td><td>{row.minutes === null ? 'Duration unavailable' : `${row.minutes} min`}</td><td>{row.type}</td></tr>)}</tbody></table></Panel>
    </div>
  </>;
}

function BarChartPanel({ data, color }: { data: Array<{label:string;value:number}>; color?: string }) {
  const max = Math.max(...data.map((point)=>point.value),1);
  return <div className="admin-bars">{data.map((point,index)=><div className="admin-bar-slot" key={`${point.label}-${index}`}><div className="admin-bar" style={{height:`${Math.max(4,(point.value/max)*100)}%`,background:color??'#7251e9'}} title={`${point.label}: ${point.value}`}/></div>)}</div>;
}
