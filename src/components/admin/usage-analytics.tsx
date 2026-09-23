'use client';
import { useRef, useState } from 'react';
import { Activity, Bot, Eye, ListChecks, Users } from 'lucide-react';
import { BarChart, Donut, formatNumber, LineChart, MetricCard, Panel, ProgressList } from './admin-ui';
import { overviewDetails } from './overview-analytics';
import type { getAdminSnapshot } from '@/server/admin-analytics';
type Data=Awaited<ReturnType<typeof getAdminSnapshot>>;
const labels={actions:'AI actions',users:'Total users',active:'Active users',features:'Tracked feature actions',aiTrend:'AI activity trend',daily:'Daily activity',breakdown:'Feature usage breakdown',top:'Top features by usage'};
type Detail=keyof typeof labels;
export function UsageAnalytics({data}:{data:Data}) {
 const [selected,setSelected]=useState<Detail|null>(null);const [page,setPage]=useState(0);const details=useRef<HTMLDivElement>(null);
 function view(key:Detail){setSelected(key);setPage(0);requestAnimationFrame(()=>{details.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});details.current?.focus({preventScroll:true});});}
 const eye=(key:Detail)=><button className="admin-voice-view" title={`View ${labels[key].toLowerCase()} details`} aria-label={`View ${labels[key].toLowerCase()} details`} aria-controls="usage-details" aria-expanded={selected===key} onClick={()=>view(key)}><Eye size={18}/></button>;
 const detailKey=selected==='daily'?'aiTrend':selected==='breakdown'||selected==='top'?'features':selected;
 const table=detailKey?overviewDetails(data,detailKey):null;
 const total=data.featureCounts.reduce((sum,row)=>sum+row.value,0);
 return <>
 <div className="admin-metrics">
 <MetricCard icon={<Bot/>} value={formatNumber(data.metrics.aiActions)} label="AI actions" change={data.changes.aiActions} action={eye('actions')}/>
 <MetricCard icon={<Users/>} value={formatNumber(data.metrics.totalUsers)} label="Total users" change={data.changes.newUsers} action={eye('users')}/>
 <MetricCard icon={<Activity/>} value={formatNumber(data.metrics.activeUsers)} label="Active users" note="Last 15 days" action={eye('active')}/>
 <MetricCard icon={<ListChecks/>} value={formatNumber(total)} label="Tracked feature actions" note="Last 15 days" action={eye('features')}/>
 </div>
 <div className="admin-grid">
 <Panel title="AI activity trend" className="admin-span-8" action={eye('aiTrend')}><LineChart data={data.trends.aiActions} valueLabel="AI actions by day (UTC)"/></Panel>
 <Panel title="Daily activity" className="admin-span-4" action={eye('daily')}><BarChart data={data.trends.aiActions}/></Panel>
 <Panel title="Feature usage breakdown" className="admin-span-5" action={eye('breakdown')}><Donut values={data.featureCounts.map(row=>row.value)} colors={data.featureCounts.map(row=>row.color)} center={formatNumber(total)} label="Actions"/><div className="admin-legend">{data.featureCounts.map(row=><div className="admin-legend-row" key={row.label}><i style={{background:row.color}}/><span>{row.label}</span><strong>{row.value}</strong></div>)}</div></Panel>
 <Panel title="Top features by usage" className="admin-span-7" action={eye('top')}><ProgressList rows={data.featureCounts}/></Panel>
 </div>
 <div id="usage-details" ref={details} tabIndex={-1} className="admin-voice-details">{selected&&table&&<Panel title={`${labels[selected]} — details`} action={<button onClick={()=>setSelected(null)}>Close details</button>}>
 <p>{table.note} Activity timestamps use Pacific Time (PST/PDT).</p>
 <div className="admin-table-scroll"><table className="admin-list"><thead><tr>{table.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{table.rows.slice(page*25,page*25+25).map((row,i)=><tr key={page*25+i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table>{!table.rows.length&&<div className="admin-empty">No records in this period.</div>}</div>
 {table.rows.length>25&&<div className="admin-voice-pagination"><button disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1} of {Math.ceil(table.rows.length/25)} · {table.rows.length} rows</span><button disabled={(page+1)*25>=table.rows.length} onClick={()=>setPage(p=>p+1)}>Next</button></div>}
 </Panel>}</div>
 </>;
}
