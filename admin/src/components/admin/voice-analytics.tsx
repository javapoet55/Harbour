'use client';
import { useRef, useState } from 'react';
import { Hash, Clock3, Eye, Mic2, Radio, Users } from 'lucide-react';
import { BarChart, Donut, formatNumber, LineChart, MetricCard, Panel } from './admin-ui';
import { formatVoiceDate, voiceSummary, type VoiceRecord } from '@/lib/admin-voice';
import type { TrendPoint } from '@/contract/snapshot';
import {usd,VOICE_PRICING_DATE} from '@/lib/voice-costs';
import type { VoiceTokenRow } from '@/contract/voice-tokens';
const labels = { textCost:'Token cost · text (USD)',audioCost:'Voice cost · audio (USD)', tokens: 'Total token usage', minutes: 'Total voice minutes', users: 'Active voice users', average: 'Average recorded session', records: 'Voice records', types: 'Usage by voice type' };
type Detail = keyof typeof labels;
export function VoiceAnalytics({records,trend,change,tokens,rangeLabel}:{records:VoiceRecord[];trend:TrendPoint[];change:number;tokens:VoiceTokenRow[];rangeLabel:string}) {
 const [selected,setSelected]=useState<Detail|null>(null);
 const [page,setPage]=useState(0);
 const details=useRef<HTMLDivElement>(null);
 const summary=voiceSummary(records);
 const priced=tokens.reduce((n,r)=>n+r.pricedRecords,0),unpriced=tokens.reduce((n,r)=>n+r.unpricedRecords,0);
 const textCost=priced?tokens.reduce((n,r)=>n+r.textCostUsd,0):null,audioCost=priced?tokens.reduce((n,r)=>n+r.audioCostUsd,0):null;
 const costDetail=selected==='textCost'||selected==='audioCost';
 function view(key:Detail) {setSelected(key);setPage(0);requestAnimationFrame(()=>{details.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});details.current?.focus({preventScroll:true});});}
 const eye=(key:Detail)=><button className="admin-voice-view" onClick={()=>view(key)} title={`View ${labels[key].toLowerCase()} details`} aria-label={`View ${labels[key].toLowerCase()} details`} aria-controls="voice-details" aria-expanded={selected===key}><Eye size={18}/></button>;
 const rows=selected==='minutes'||selected==='average'?summary.measured:records;
 const count=selected==='tokens'||costDetail?tokens.length:selected==='users'?summary.users.length:rows.length;
 return <>
 <div className="admin-metrics">
 <MetricCard icon={<Hash/>} value={usd(textCost)} label={labels.textCost} note={`Estimated · ${priced} priced / ${priced+unpriced} receipts`} action={eye('textCost')}/>
 <MetricCard icon={<Mic2/>} value={usd(audioCost)} label={labels.audioCost} note="Estimated audio tokens + reported transcription duration" action={eye('audioCost')}/>
  <MetricCard icon={<Hash/>} value={tokens.some(r=>r.tokenRecords>0)?tokens.reduce((n,r)=>n+r.totalTokens,0).toLocaleString('en-US'):'Unavailable'} label={labels.tokens} note="Recorded input + output tokens" action={eye('tokens')}/>
  <MetricCard icon={<Mic2/>} value={`${formatNumber(summary.minutes)} min`} label={labels.minutes} change={change} action={eye('minutes')}/>
  <MetricCard icon={<Users/>} value={String(summary.users.length)} label={labels.users} note="Users with recorded voice activity" action={eye('users')}/>
  <MetricCard icon={<Clock3/>} value={summary.average===null?'Unavailable':`${formatNumber(summary.average)} min`} label={labels.average} note={`${summary.measured.length} records with duration`} action={eye('average')}/>
  <MetricCard icon={<Radio/>} value={formatNumber(records.length)} label={labels.records} note="Sessions and realtime usage" action={eye('records')}/>
 </div>
 <p className="admin-note">USD estimates for recorded usage, not invoices. Text and audio costs are separate components—do not add a per-minute Realtime charge. {unpriced} receipts lack model or billing detail and are excluded. Older sessions without receipts are also excluded. <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noopener noreferrer">Standard pricing verified {VOICE_PRICING_DATE}</a>.</p>
 <div className="admin-grid">
  <Panel title="Voice minutes trend" className="admin-span-8"><LineChart data={trend} color="#6950e8" valueLabel="Voice minutes by day (UTC)"/></Panel>
  <Panel title="Usage by voice type" className="admin-span-4" action={eye('types')}><Donut values={summary.types.map(t=>t.count)} colors={['#6544e8','#b9a8fb','#28aaf2']} center={formatNumber(records.length)} label="Records"/><div className="admin-legend">{summary.types.map((t,i)=><div className="admin-legend-row" key={t.type}><i style={{background:['#6544e8','#b9a8fb','#28aaf2'][i]}}/><span>{t.type}</span><strong>{t.count}</strong></div>)}</div></Panel>
  <Panel title="Daily voice usage (UTC)" className="admin-span-5"><BarChart data={trend} color="#28aaf2"/></Panel>
  <Panel title="Recent voice activity · Pacific Time" className="admin-span-7"><RecordTable rows={records.slice(0,8)}/></Panel>
 </div>
 <div id="voice-details" ref={details} tabIndex={-1} className="admin-voice-details">
 {selected&&<Panel title={`${labels[selected]} — details`} action={<button onClick={()=>setSelected(null)}>Close details</button>}>
 <p>{rangeLabel} · Filter dates use UTC; activity times are Pacific Time (PST/PDT). Duration is available for {summary.measured.length} of {records.length} records.</p>
 {selected==='average'&&<p>{formatNumber(summary.minutes)} recorded minutes ÷ {summary.measured.length} records with duration. Records without duration are excluded.</p>}
 {costDetail?<><p>Grouped by user and Pacific receipt date. Estimates account for cached input. Missing model, modality or duration data is unavailable, never assumed to be zero. Taxes, discounts, non-voice tool calls and unreported usage are excluded.</p><div className="admin-table-scroll"><table className="admin-list"><thead><tr><th>User</th><th>Date · Pacific</th><th>Text token cost · USD</th><th>Voice audio cost · USD</th><th>Combined estimate · USD</th><th>Coverage</th></tr></thead><tbody>{tokens.slice(page*25,page*25+25).map(r=><tr key={`${r.userId}:${r.date}`}><td>{r.user}</td><td>{r.date}</td><td>{usd(r.pricedRecords?r.textCostUsd:null)}</td><td>{usd(r.pricedRecords?r.audioCostUsd:null)}</td><td>{usd(r.pricedRecords?r.textCostUsd+r.audioCostUsd:null)}</td><td>{r.pricedRecords}/{r.records} receipts{r.unpricedRecords?' · Partial':''}</td></tr>)}</tbody></table>{!tokens.length&&<p>No cost-ready usage recorded for this period.</p>}</div></>:selected==='tokens'?<><p>Client-reported Realtime response and transcription tokens, grouped by user and Pacific date received. Older app versions do not report tokens; missing usage is not counted as zero. Cached input is included once in input tokens.</p><div className="admin-table-scroll"><table className="admin-list"><thead><tr><th>User</th><th>Date · Pacific Time</th><th>Input tokens</th><th>Output tokens</th><th>Total tokens</th></tr></thead><tbody>{tokens.slice(page*25,page*25+25).map(r=><tr key={`${r.userId}:${r.date}`}><td>{r.user}</td><td>{r.date}</td><td>{r.inputTokens.toLocaleString('en-US')}</td><td>{r.outputTokens.toLocaleString('en-US')}</td><td>{r.totalTokens.toLocaleString('en-US')}</td></tr>)}</tbody></table>{!tokens.length&&<p>No token counts recorded for this period. Rebuild the iPhone app with token reporting enabled to record new sessions.</p>}</div></>:selected==='types'?<div className="admin-table-scroll"><table className="admin-list"><thead><tr><th>Voice type</th><th>Records</th><th>Recorded minutes</th></tr></thead><tbody>{summary.types.map(t=><tr key={t.type}><td>{t.type}</td><td>{t.count}</td><td>{t.measured?formatNumber(t.minutes):'Unavailable'}</td></tr>)}</tbody></table></div>:selected==='users'?<div className="admin-table-scroll"><table className="admin-list"><thead><tr><th>User</th><th>Records</th><th>Recorded minutes</th><th>Last activity · Pacific Time</th></tr></thead><tbody>{summary.users.slice(page*25,page*25+25).map(u=><tr key={u.user}><td>{u.user}</td><td>{u.count}</td><td>{u.measured?formatNumber(u.minutes):'Unavailable'}</td><td>{formatVoiceDate(u.last)}</td></tr>)}</tbody></table>{!count&&<p>No voice users in this period.</p>}</div>:<RecordTable rows={rows.slice(page*25,page*25+25)}/>}
 {selected!=='types'&&count>25&&<div className="admin-voice-pagination"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1} of {Math.ceil(count/25)} · {count} rows</span><button disabled={(page+1)*25>=count} onClick={()=>setPage(p=>p+1)}>Next</button></div>}
 </Panel>}
 </div>
 </>;
}
function RecordTable({rows}:{rows:VoiceRecord[]}) {
 return rows.length?<div className="admin-table-scroll"><table className="admin-list"><thead><tr><th>User</th><th>Date · Pacific Time</th><th>Duration</th><th>Type</th><th>Status</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.user}</td><td>{formatVoiceDate(row.date)}</td><td>{row.minutes===null?'Unavailable':`${formatNumber(row.minutes)} min`}</td><td>{row.type}</td><td>{row.status}</td></tr>)}</tbody></table></div>:<div className="admin-empty">No voice activity was recorded in this period.</div>;
}
