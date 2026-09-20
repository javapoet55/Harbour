import { readAdminSession } from '@/server/admin-session';
import { redirect } from 'next/navigation';
import { Activity, Clock, Eye, MousePointerClick, Users } from 'lucide-react';
import { AdminDateRangeFilter } from '@/components/admin/admin-date-range-filter';
import { EmptyState, formatNumber, LineChart, MetricCard, PageHeading, Panel } from '@/components/admin/admin-ui';
import { adminDateRangeLabel, parseAdminDateRange } from '@/lib/admin-date-range';
import { getFirebaseEngagement, type EngagementRow } from '@/server/firebase-engagement';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const consoleURL = 'https://console.firebase.google.com/project/nexdoapp-19f07/analytics/overview';
function seconds(value: number) { const rounded = Math.round(value); return `${Math.floor(rounded / 60)}m ${rounded % 60}s`; }
function Breakdown({ rows, dimension, metrics }: { rows: EngagementRow[]; dimension: string; metrics: [string, string][] }) {
  if (!rows.length) return <EmptyState>No recorded activity in this reporting period.</EmptyState>;
  return <div className="admin-table-scroll"><table className="admin-table" style={{ minWidth: 0, width: '100%' }}><thead><tr><th>{dimension}</th>{metrics.map(([key, title]) => <th key={key}>{title}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={`${row.label}-${index}`}><td style={{ overflowWrap: 'anywhere' }}>{row.label}</td>{metrics.map(([key]) => <td key={key}>{formatNumber(row.values[key] ?? 0)}</td>)}</tr>)}</tbody></table></div>;
}
export default async function AdminEngagementPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  if (!await readAdminSession()) redirect('/admin/login');
  const params = await searchParams;
  const range = parseAdminDateRange(params.from, params.to);
  const result = await getFirebaseEngagement(range.from, range.to);
  const heading = <PageHeading title="Firebase Engagement" description="App usage and engagement reported by Google Analytics for Firebase."><AdminDateRangeFilter key={`${range.from}-${range.to}`} from={range.from} to={range.to} today={new Date().toISOString().slice(0, 10)} label={adminDateRangeLabel(range)} pathname="/admin/engagement"/></PageHeading>;
  if (result.status !== 'connected') return <>{heading}<div className="admin-callout" role="status"><Activity/><div><strong>{result.status === 'not_configured' ? 'Connection needed' : 'Reporting unavailable'}</strong><p>{result.message}</p></div></div>
    <Panel title="Connect Firebase engagement"><p>This report uses the Google Analytics Data API with read-only access. A Firebase app configuration file or Google account password cannot authorize these reports.</p>
      <ol><li>Use Nexdo’s verified GA4 property ID: 555023551.</li><li>Enable the Google Analytics Data API in the service account’s Cloud project.</li><li>Give a dedicated service account Viewer access to that GA4 property.</li><li>Configure GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_JSON as server secrets. Optionally set GA4_STREAM_ID to restrict reports to one app stream.</li></ol>
      <a href={consoleURL} target="_blank" rel="noreferrer">Open Firebase console ↗</a>
    </Panel></>;
  const { data } = result;
  const m = data.summary;
  const active = m.activeUsers ?? 0;
  return <>{heading}
    <div className="admin-callout"><Activity/><div><strong>Connected · GA4 property {data.propertyId} · {data.streamId ? `App stream ${data.streamId}` : 'iOS app engagement'}</strong><p>Dates use {data.timeZone}. Fetched {new Date(data.fetchedAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC; reports refresh after five minutes. Recent activity may take time to appear in Google Analytics.</p><p>These are aggregate app analytics, not named Nexdo account activity. Consent, device identity, and reporting rules can make counts differ from Usage Analytics.</p>{data.limited && <p role="status">Google applied privacy thresholds, sampling, or grouped rows. Some data may be limited.</p>}</div></div>
    <div className="admin-metrics">
      <MetricCard icon={<Users/>} value={formatNumber(active)} label="Active users" note="Unique users across the selected period"/>
      <MetricCard icon={<Users/>} value={formatNumber(m.newUsers ?? 0)} label="New users" note="First opens / visits reported by GA4"/>
      <MetricCard icon={<Activity/>} value={formatNumber(m.sessions ?? 0)} label="Sessions"/>
      <MetricCard icon={<MousePointerClick/>} value={`${((m.engagementRate ?? 0) * 100).toFixed(1)}%`} label="Engagement rate" note={`${formatNumber(m.engagedSessions ?? 0)} engaged sessions`}/>
      <MetricCard icon={<Clock/>} value={seconds(active ? (m.userEngagementDuration ?? 0) / active : 0)} label="Engagement per active user"/>
      <MetricCard icon={<Clock/>} value={seconds(m.sessions ? (m.userEngagementDuration ?? 0) / m.sessions : 0)} label="Engagement per session"/>
      <MetricCard icon={<Eye/>} value={formatNumber(m.screenPageViews ?? 0)} label="Screen views"/>
      <MetricCard icon={<MousePointerClick/>} value={formatNumber(m.eventCount ?? 0)} label="Recorded events"/>
    </div>
    <div className="admin-grid">
      <Panel title="Daily active users" className="admin-span-8">{data.daily.length ? <LineChart data={data.daily.map(row => ({ label: row.label.replace(/^(\d{4})(\d{2})(\d{2})$/, '$2/$3'), value: row.values.activeUsers ?? 0 }))} valueLabel="GA4 daily active users"/> : <EmptyState>No activity recorded in this period.</EmptyState>}</Panel>
      <Panel title="App versions · top 20" className="admin-span-4"><Breakdown rows={data.versions} dimension="Version" metrics={[["activeUsers", "Users"], ["sessions", "Sessions"]]}/></Panel>
      <Panel title="Events · top 20" className="admin-span-6"><Breakdown rows={data.events} dimension="Event" metrics={[["eventCount", "Events"], ["totalUsers", "Users"]]}/></Panel>
      <Panel title="Screens · top 20" className="admin-span-6"><Breakdown rows={data.screens} dimension="Screen class" metrics={[["screenPageViews", "Views"], ["activeUsers", "Users"]]}/><p>Screen names reflect the events currently sent by the app.</p></Panel>
    </div>
    <p><a href={consoleURL} target="_blank" rel="noreferrer">Open Firebase reports ↗</a></p>
  </>;
}
