import { readAdminSession } from '@/server/admin-session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ListChecks,
  MapPin,
  Mic2,
  MonitorSmartphone,
  ShoppingCart,
} from 'lucide-react';
import { Donut, EmptyState, formatNumber, LineChart, MetricCard, Panel } from '@/components/admin/admin-ui';
import { getAdminUserDashboard } from '@/server/admin-user-dashboard';

function formatDate(value: string, includeTime = false) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

const colors = ['#287ff5', '#7b5ce8', '#29bfa8', '#ffb522', '#f05c6b', '#ef793e'];

export default async function AdminUserDashboardPage({ params }: { params: Promise<{ userId: string }> }) {
  if (!await readAdminSession()) redirect('/admin/login');
  const { userId } = await params;
  const data = await getAdminUserDashboard(userId, 15);
  if (!data) notFound();
  const location = [data.user.city, data.user.country].filter(Boolean).join(', ') || 'Not provided';
  const aiTotal = data.aiBreakdown.reduce((sum, row) => sum + row.value, 0);
  const voiceTotal = data.voiceBreakdown.reduce((sum, row) => sum + row.value, 0);

  return <>
    <header className="admin-user-breadcrumb">
      <div><Link href="/admin/users">Users</Link><span>›</span><strong>{data.user.name}</strong></div>
      <Link href="/admin/users" className="admin-secondary-button"><ArrowLeft size={16}/> Back to Users</Link>
    </header>

    <section className="admin-user-hero">
      <div className="admin-user-identity"><span>{data.user.initials}</span><div><div><h1>{data.user.name}</h1><b className={data.user.verified ? '' : 'pending'}>{data.user.verified ? 'Verified' : 'Unverified'}</b></div><p>{data.user.email}</p><small>User ID&nbsp; {data.user.id}</small></div></div>
      <dl className="admin-user-facts">
        <div><dt>Current plan</dt><dd><span className={`admin-plan plan-${data.user.plan.toLowerCase()}`}>{data.user.plan === 'MAX' ? 'Max' : data.user.plan === 'PRO' ? 'Pro' : 'Free'}</span></dd></div>
        <div><dt>Status</dt><dd><span className="admin-status">{data.user.status}</span></dd></div>
        <div><dt>Sign up date</dt><dd><CalendarDays size={16}/><span>{formatDate(data.user.createdAt)}</span></dd></div>
        <div><dt>Last activity</dt><dd><Clock3 size={16}/><span>{formatDate(data.user.lastActiveAt, true)}</span></dd></div>
        <div><dt>Platform</dt><dd><MonitorSmartphone size={16}/><span>{data.device.platform}</span></dd></div>
        <div><dt>Location</dt><dd><MapPin size={16}/><span>{location}</span></dd></div>
      </dl>
    </section>

    <nav className="admin-user-tabs" aria-label="User dashboard sections">
      <a href="#overview" className="active">Overview</a><a href="#usage">Usage &amp; Analytics</a><a href="#voice">Voice Usage</a><a href="#feedback">Feedback</a><a href="#activity">Activity Log</a><a href="#devices">Devices</a><a href="#settings">Settings</a>
    </nav>

    <div id="overview" className="admin-metrics admin-user-metrics">
      <MetricCard icon={<Bot/>} value={formatNumber(data.metrics.aiActions)} label="AI actions" change={data.changes.aiActions}/>
      <MetricCard icon={<Mic2/>} value={`${formatNumber(data.metrics.voiceMinutes)} min`} label="Real-time voice usage" change={data.changes.voiceMinutes}/>
      <MetricCard icon={<ListChecks/>} value={formatNumber(data.metrics.tasksCreated)} label="Tasks created" change={data.changes.tasksCreated}/>
      <MetricCard icon={<ShoppingCart/>} value={formatNumber(data.metrics.shoppingLists)} label="Shopping lists created" change={data.changes.shoppingLists}/>
    </div>

    <div id="usage" className="admin-grid admin-user-dashboard-grid">
      <Panel title="Usage trend (last 15 days)" className="admin-span-6"><div className="admin-user-trend-legend"><span><i/>AI actions</span><span><i/>Voice minutes</span></div><div className="admin-dual-chart"><LineChart data={data.trends.aiActions} valueLabel="AI actions by day"/><div className="admin-user-voice-overlay"><LineChart data={data.trends.voiceMinutes} color="#7b5ce8" valueLabel="Voice minutes by day"/></div></div></Panel>
      <Panel title="AI usage by feature" className="admin-span-3">
        {data.aiBreakdown.length ? <><Donut values={data.aiBreakdown.map((row) => row.value)} colors={data.aiBreakdown.map((_, index) => colors[index])} center={formatNumber(aiTotal)} label="actions"/><Legend rows={data.aiBreakdown}/></> : <EmptyState>No AI actions recorded in this period.</EmptyState>}
      </Panel>
      <Panel title="Voice usage by type" className="admin-span-3" >
        <div id="voice">{data.voiceBreakdown.length ? <><Donut values={data.voiceBreakdown.map((row) => row.value)} colors={['#287ff5','#52c8ca']} center={formatNumber(voiceTotal)} label="minutes"/><Legend rows={data.voiceBreakdown}/></> : <EmptyState>No voice usage recorded in this period.</EmptyState>}</div>
      </Panel>

      <Panel title="Recent activity" className="admin-span-6" action={<a href="#activity">Latest recorded events</a>}>
        <div id="activity" className="admin-user-activity-list">{data.recentActivity.length ? data.recentActivity.map((row) => <div key={row.id}><span><CheckCircle2 size={16}/></span><time>{formatDate(row.date, true)}</time><strong>{row.activity}</strong><p>{row.details}</p></div>) : <EmptyState>No activity recorded in this period.</EmptyState>}</div>
      </Panel>
      <Panel title="Recent feedback" className="admin-span-3">
        <div id="feedback"><EmptyState>Feedback collection is not currently stored for this account.</EmptyState></div>
      </Panel>
      <Panel title="Device & app info" className="admin-span-3">
        <div id="devices" className="admin-device-list">
          <Info label="Platform" value={data.device.platform}/><Info label="Device" value={data.device.device}/><Info label="App version" value={data.device.appVersion}/><Info label="Push notifications" value={data.device.pushNotifications}/><Info label="Calendar" value={data.device.calendar}/><Info label="Email notifications" value={data.device.email}/><Info label="Voice" value={data.device.voice}/><div id="settings"><span>Time zone</span><strong>{data.user.timeZone}</strong></div>
        </div>
      </Panel>
    </div>
  </>;
}

function Legend({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
  return <div className="admin-legend">{rows.map((row, index) => <div className="admin-legend-row" key={row.label}><i style={{ background: colors[index] }}/><span>{row.label}</span><strong>{Math.round(row.value / total * 100)}%</strong></div>)}</div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
