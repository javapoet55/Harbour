'use client';
import { useRef, useState } from 'react';
import { Bot, CalendarDays, Eye, Mic2, Users } from 'lucide-react';
import { AdminUsersTable } from './admin-users-table';
import { formatNumber, MetricCard, Panel } from './admin-ui';
import { overviewDetails } from './overview-analytics';
import type { getAdminSnapshot } from '@/server/admin-analytics';
type Data=Awaited<ReturnType<typeof getAdminSnapshot>>;
const labels={users:'Total users',actions:'AI actions',voice:'Voice minutes',active:'Active users'};
type Detail=keyof typeof labels;
export function UsersAnalytics({data,label}:{data:Data;label:string}) {
 const [selected,setSelected]=useState<Detail|null>(null);const [page,setPage]=useState(0);const details=useRef<HTMLDivElement>(null);
 function view(key:Detail){setSelected(key);setPage(0);requestAnimationFrame(()=>{details.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});details.current?.focus({preventScroll:true});});}
 const eye=(key:Detail)=><button className="admin-voice-view" title={`View ${labels[key].toLowerCase()} details`} aria-label={`View ${labels[key].toLowerCase()} details`} aria-controls="users-details" aria-expanded={selected===key} onClick={()=>view(key)}><Eye size={18}/></button>;
 const table=selected?overviewDetails(data,selected):null;
 return <>
 <div className="admin-metrics">
 <MetricCard icon={<Users/>} value={formatNumber(data.metrics.totalUsers)} label="Total users" change={data.changes.newUsers} action={eye('users')}/>
 <MetricCard icon={<Bot/>} value={formatNumber(data.metrics.aiActions)} label="AI actions" change={data.changes.aiActions} action={eye('actions')}/>
 <MetricCard icon={<Mic2/>} value={`${formatNumber(data.metrics.voiceMinutes)} min`} label="Voice minutes" change={data.changes.voiceMinutes} action={eye('voice')}/>
 <MetricCard icon={<CalendarDays/>} value={formatNumber(data.metrics.activeUsers)} label="Active users" note={label} action={eye('active')}/>
 </div>
 <Panel title={`Users (${data.users.length.toLocaleString()})`}><p>Sign-up and activity timestamps use Pacific Time (PST/PDT).</p><AdminUsersTable users={data.users}/></Panel>
 <div id="users-details" ref={details} tabIndex={-1} className="admin-voice-details">{selected&&table&&<Panel title={`${labels[selected]} — details`} action={<button onClick={()=>setSelected(null)}>Close details</button>}>
 <p>{table.note} Activity timestamps use Pacific Time (PST/PDT).</p>
 <div className="admin-table-scroll"><table className="admin-list"><thead><tr>{table.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{table.rows.slice(page*25,page*25+25).map((row,i)=><tr key={page*25+i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table>{!table.rows.length&&<div className="admin-empty">No records in this period.</div>}</div>
 {table.rows.length>25&&<div className="admin-voice-pagination"><button disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1} of {Math.ceil(table.rows.length/25)} · {table.rows.length} rows</span><button disabled={(page+1)*25>=table.rows.length} onClick={()=>setPage(p=>p+1)}>Next</button></div>}
 </Panel>}</div>
 </>;
}
