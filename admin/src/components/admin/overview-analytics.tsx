'use client';
import { useRef, useState } from 'react';
import { formatVoiceDate } from '@/lib/admin-voice';
import { Activity, Bot, Eye, Mic2, UserPlus, Users } from 'lucide-react';
import { Donut, formatNumber, LineChart, MetricCard, Panel, ProgressList } from '@/components/admin/admin-ui';
import type { AdminSnapshot } from '@/contract/snapshot';

type Data=AdminSnapshot;
const names={users:'Total users',signups:'New signups',actions:'AI actions',voice:'Voice minutes',active:'Active users',growth:'User growth',aiTrend:'AI assistant usage',voiceTrend:'Voice usage',devices:'Users by device',features:'Feature usage',health:'System health',recentVoice:'Recent voice activity'};
type Detail=keyof typeof names;
export function OverviewAnalytics({data,rangeLabel}:{data:Data;rangeLabel:string}) {
 const [selected,setSelected]=useState<Detail|null>(null);const [page,setPage]=useState(0);const details=useRef<HTMLDivElement>(null);
 const signups=data.users.filter(u=>u.createdAt>=data.rangeStart&&u.createdAt<=data.rangeEnd);
 function view(key:Detail){setSelected(key);setPage(0);requestAnimationFrame(()=>{details.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});details.current?.focus({preventScroll:true});});}
 const eye=(key:Detail)=><button className="admin-voice-view" aria-label={`View ${names[key].toLowerCase()} details`} title={`View ${names[key].toLowerCase()} details`} aria-controls="overview-details" aria-expanded={selected===key} onClick={()=>view(key)}><Eye size={18}/></button>;
 const table=selected?overviewDetails(data,selected):null;
  const devices = overviewDevices(data);
  return <>
    <div className="admin-metrics admin-overview-metrics">
      <MetricCard icon={<Users/>} value={formatNumber(data.metrics.totalUsers)} label="Total users" action={eye('users')} change={data.changes.newUsers}/>
      <MetricCard icon={<UserPlus/>} value={formatNumber(data.metrics.newUsers)} label="New signups" action={eye('signups')} change={data.changes.newUsers}/>
      <MetricCard icon={<Activity/>} value={formatNumber(data.metrics.activeUsers)} label="Active users" action={eye('active')} note={`Activity during ${rangeLabel}`}/>
      <MetricCard icon={<Bot/>} value={formatNumber(data.metrics.aiActions)} label="AI actions" action={eye('actions')} change={data.changes.aiActions}/>
      <MetricCard icon={<Mic2/>} value={`${formatNumber(data.metrics.voiceMinutes)} min`} label="Voice minutes" action={eye('voice')} change={data.changes.voiceMinutes}/>
    </div>
    <div className="admin-grid admin-overview-grid">
      <Panel title="User growth" action={eye('growth')} className="admin-span-6"><LineChart data={data.trends.totalUsers} valueLabel="Total user trend"/></Panel>
      <Panel title="AI assistant usage" action={eye('aiTrend')} className="admin-span-3"><BarChartPanel data={data.trends.aiActions} /></Panel>
      <Panel title="Voice usage" action={eye('voiceTrend')} className="admin-span-3"><BarChartPanel data={data.trends.voiceMinutes} color="#18aee8"/></Panel>
      <Panel title="Users by device" action={eye('devices')} className="admin-span-4">
        <Donut values={devices.map((device) => device.value)} colors={devices.map((device) => device.color)} center={formatNumber(data.metrics.totalUsers)} label="Users" />
        <div className="admin-legend">{devices.map((device) => <div className="admin-legend-row" key={device.label}><i style={{background:device.color}}/><span>{device.label}</span><strong>{device.value}</strong></div>)}</div>
      </Panel>
      <Panel title="Feature usage" action={eye('features')} className="admin-span-4"><ProgressList rows={data.featureCounts}/></Panel>
      <Panel title="System health" action={eye('health')} className="admin-span-4">
        <table className="admin-list"><tbody><tr><td>Application</td><td><span className="admin-status">Online</span></td></tr><tr><td>Database</td><td><span className="admin-status">Connected</span></td></tr><tr><td>Admin access</td><td><span className="admin-status">Enforced</span></td></tr><tr><td>Metrics refreshed</td><td>{formatVoiceDate(data.generatedAt)}</td></tr></tbody></table>
      </Panel>
      <Panel title="Recent signups" className="admin-span-6" action={eye('signups')}><table className="admin-list"><tbody>{signups.slice(0,6).map((user)=><tr key={user.id}><td>{user.email}</td><td>{user.plan}</td><td>{formatVoiceDate(user.createdAt)}</td></tr>)}</tbody></table></Panel>
      <Panel title="Recent voice activity" className="admin-span-6" action={eye('recentVoice')}><table className="admin-list"><tbody>{data.recentVoice.slice(0,6).map((row)=><tr key={row.id}><td>{row.user}</td><td>{formatVoiceDate(row.date)}</td><td>{row.minutes === null ? 'Duration unavailable' : `${row.minutes} min`}</td><td>{row.type}</td></tr>)}</tbody></table></Panel>
    </div>
 <div id="overview-details" ref={details} tabIndex={-1} className="admin-voice-details">{selected&&table&&<Panel title={`${names[selected]} — details`} action={<button onClick={()=>setSelected(null)}>Close details</button>}>
 <p>{table.note} Activity timestamps use Pacific Time (PST/PDT).</p>
 <div className="admin-table-scroll"><table className="admin-list"><thead><tr>{table.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{table.rows.slice(page*25,page*25+25).map((row,i)=><tr key={page*25+i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table>{!table.rows.length&&<div className="admin-empty">No records in this period.</div>}</div>
 {table.rows.length>25&&<div className="admin-voice-pagination"><button disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1} of {Math.ceil(table.rows.length/25)} · {table.rows.length} rows</span><button disabled={(page+1)*25>=table.rows.length} onClick={()=>setPage(p=>p+1)}>Next</button></div>}
 </Panel>}</div>
 </>;
}

function overviewDevices(data: Data) {
  const counts = data.deviceCounts;
  return [
    { label: 'iPhone', value: counts?.iPhone ?? 0, color: '#177cf6' },
    { label: 'Android', value: counts?.Android ?? 0, color: '#079e74' },
    { label: 'Other or unknown', value: counts?.otherOrUnknown ?? data.metrics.totalUsers, color: '#a8b5c9' },
  ].filter(device => device.value > 0 || device.label !== 'Other or unknown');
}

function BarChartPanel({ data, color }: { data: Array<{label:string;value:number}>; color?: string }) {
  const max = Math.max(...data.map((point)=>point.value),1);
  return <div className="admin-bars">{data.map((point,index)=><div className="admin-bar-slot" key={`${point.label}-${index}`}><div className="admin-bar" style={{height:`${Math.max(4,(point.value/max)*100)}%`,background:color??'#7251e9'}} title={`${point.label}: ${point.value}`}/></div>)}</div>;
}

export function overviewDetails(data:Data,key:Detail):{columns:string[];rows:(string|number)[][];note:string} {
 const period='Records in the selected date range. Daily chart buckets use UTC.';
 if(key==='actions')return {columns:['User','Date · Pacific Time','Action','Executed'],rows:data.actionRecords.map(r=>[r.user,formatVoiceDate(r.date),r.intent,r.executed?'Yes':'No']),note:period};
 if(key==='voice'||key==='recentVoice')return {columns:['User','Date · Pacific Time','Minutes','Type','Status'],rows:data.voiceRecords.filter(r=>key==='recentVoice'||r.minutes!==null).map(r=>[r.user,formatVoiceDate(r.date),r.minutes===null?'Unavailable':formatNumber(r.minutes),r.type,r.status]),note:period};
 if(key==='growth'||key==='aiTrend'||key==='voiceTrend')return {columns:['Day (UTC)',key==='growth'?'Users':key==='aiTrend'?'AI actions':'Voice minutes'],rows:data.trends[key==='growth'?'totalUsers':key==='aiTrend'?'aiActions':'voiceMinutes'].map(r=>[r.label,r.value]),note:period};
 if(key==='features')return {columns:['Feature','Recorded activity'],rows:data.featureCounts.map(r=>[r.label,r.value]),note:period};
 if(key==='devices')return {columns:['Recorded device','Users'],rows:overviewDevices(data).map(({label,value})=>[label,value]),note:'Each current user is counted once. Device comes from saved device information or the latest push subscription. Other or unknown includes users without an identifiable iPhone or Android device.'};
 if(key==='health')return {columns:['Check','Observation'],rows:[['Application','This overview request completed'],['Database','The overview data query completed'],['Admin access','An admin session was required'],['Metrics refreshed',formatVoiceDate(data.generatedAt)]],note:'Snapshot observations only. Open System Health for measured service availability and incidents.'};
 const users=key==='signups'?data.users.filter(u=>u.createdAt>=data.rangeStart&&u.createdAt<=data.rangeEnd):key==='active'?data.users.filter(u=>u.activeInPeriod):data.users;
 return {columns:['User','Plan','Signed up · Pacific Time','Last activity · Pacific Time'],rows:users.map(u=>[u.email,u.plan,formatVoiceDate(u.createdAt),formatVoiceDate(u.lastActiveAt)]),note:key==='users'?'All current non-deleted users.':period};
}
