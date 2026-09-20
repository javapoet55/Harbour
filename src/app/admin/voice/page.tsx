import { Clock3, Mic2, Radio, Users } from 'lucide-react';
import { BarChart, DatePill, Donut, formatNumber, LineChart, MetricCard, PageHeading, Panel } from '@/components/admin/admin-ui';
import { getAdminSnapshot } from '@/server/admin-analytics';

export default async function AdminVoicePage() {
  const data = await getAdminSnapshot(15);
  const realtime = data.recentVoice.filter((row)=>row.type==='Realtime').length;
  const transcription = Math.max(0,data.metrics.voiceSessions-realtime);
  const voiceUsers = data.users.filter((user)=>user.voiceMinutes>0).length;
  const average = data.metrics.voiceSessions ? data.metrics.voiceMinutes/data.metrics.voiceSessions : 0;
  return <>
    <PageHeading title="Voice Analytics" description="Track real-time voice usage, session activity, and user engagement."><DatePill days={15}/></PageHeading>
    <div className="admin-metrics">
      <MetricCard icon={<Mic2/>} value={`${formatNumber(data.metrics.voiceMinutes)} min`} label="Total voice minutes" change={data.changes.voiceMinutes}/>
      <MetricCard icon={<Users/>} value={formatNumber(voiceUsers)} label="Active voice users" note="Recorded minute usage"/>
      <MetricCard icon={<Clock3/>} value={`${average.toFixed(1)} min`} label="Average recorded session" note="Where duration is available"/>
      <MetricCard icon={<Radio/>} value={formatNumber(data.metrics.voiceSessions)} label="Voice records" note="Sessions and realtime usage"/>
    </div>
    <div className="admin-grid">
      <Panel title="Voice minutes trend" className="admin-span-8"><LineChart data={data.trends.voiceMinutes} color="#6950e8" valueLabel="Voice minutes by day"/></Panel>
      <Panel title="Usage by voice type" className="admin-span-4"><Donut values={[realtime,transcription]} colors={['#6544e8','#b9a8fb']} center={`${formatNumber(data.metrics.voiceMinutes)}`} label="Minutes"/><div className="admin-legend"><div className="admin-legend-row"><i style={{background:'#6544e8'}}/><span>Realtime usage records</span><strong>{realtime}</strong></div><div className="admin-legend-row"><i style={{background:'#b9a8fb'}}/><span>Voice sessions</span><strong>{transcription}</strong></div></div></Panel>
      <Panel title="Daily voice usage" className="admin-span-5"><BarChart data={data.trends.voiceMinutes} color="#28aaf2"/></Panel>
      <Panel title="Recent voice activity" className="admin-span-7"><table className="admin-list"><tbody>{data.recentVoice.map(row=><tr key={row.id}><td>{row.user}</td><td>{new Date(row.date).toLocaleString()}</td><td>{row.minutes===null?'Unavailable':`${row.minutes} min`}</td><td>{row.type}</td><td><span className="admin-status">{row.status}</span></td></tr>)}</tbody></table>{!data.recentVoice.length&&<div className="admin-empty">No voice activity was recorded in this period.</div>}</Panel>
    </div>
  </>;
}
