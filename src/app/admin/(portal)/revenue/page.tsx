import { readAdminSession } from '@/server/admin-session';
import { redirect } from 'next/navigation';
import { CircleDollarSign, CreditCard, RefreshCw, Users } from 'lucide-react';
import { DatePill, Donut, formatCurrency, MetricCard, PageHeading, Panel, ProgressList } from '@/components/admin/admin-ui';
import { getAdminSnapshot } from '@/server/admin-analytics';

export default async function AdminRevenuePage() {
  if (!await readAdminSession()) redirect('/admin/login');
  const data = await getAdminSnapshot(30);
  const paid = data.planCounts.PRO + data.planCounts.MAX;
  const planRows = [
    {label:'Nexdo Pro',value:data.planCounts.PRO,color:'#177cf6'},
    {label:'Nexdo Max',value:data.planCounts.MAX,color:'#7654e8'},
    {label:'Free',value:data.planCounts.FREE,color:'#a8b5c9'},
  ];
  return <>
    <PageHeading title="Revenue" description="Monitor current plan mix and estimated recurring revenue."><DatePill days={30}/></PageHeading>
    <div className="admin-callout"><CircleDollarSign size={20}/><div><strong>Revenue is currently estimated.</strong><br/>The app stores plan selections but does not yet have a payment transaction ledger. Estimates use $9.99/month for Pro and $19.99/month for Max; no invoices or payments are inferred.</div></div>
    <div className="admin-metrics">
      <MetricCard icon={<CircleDollarSign/>} value={formatCurrency(data.metrics.estimatedMrr)} label="Estimated monthly revenue" note="Current plan selections"/>
      <MetricCard icon={<Users/>} value={paid.toLocaleString()} label="Paid-plan users" note="Pro and Max selections"/>
      <MetricCard icon={<CreditCard/>} value={paid ? formatCurrency(data.metrics.estimatedMrr/paid) : '$0.00'} label="Estimated ARPU" note="Across paid-plan users"/>
      <MetricCard icon={<RefreshCw/>} value={formatCurrency(data.metrics.estimatedMrr*12)} label="Estimated annual run rate" note="Monthly estimate × 12"/>
    </div>
    <div className="admin-grid">
      <Panel title="Estimated revenue by plan" className="admin-span-5"><Donut values={[data.planCounts.PRO*9.99,data.planCounts.MAX*19.99]} colors={['#177cf6','#7654e8']} center={formatCurrency(data.metrics.estimatedMrr)} label="Est. MRR"/><div className="admin-legend"><div className="admin-legend-row"><i style={{background:'#177cf6'}}/><span>Nexdo Pro</span><strong>{formatCurrency(data.planCounts.PRO*9.99)}</strong></div><div className="admin-legend-row"><i style={{background:'#7654e8'}}/><span>Nexdo Max</span><strong>{formatCurrency(data.planCounts.MAX*19.99)}</strong></div></div></Panel>
      <Panel title="Users by plan" className="admin-span-7"><ProgressList rows={planRows}/></Panel>
      <Panel title="Revenue data readiness" className="admin-span-12"><table className="admin-list"><tbody><tr><td>Plan selections</td><td><span className="admin-status">Available</span></td></tr><tr><td>Monthly estimates</td><td><span className="admin-status">Available</span></td></tr><tr><td>Payment transactions</td><td><span className="admin-status pending">Payment provider needed</span></td></tr><tr><td>Refunds, churn, and invoices</td><td><span className="admin-status pending">Payment provider needed</span></td></tr></tbody></table></Panel>
    </div>
  </>;
}
