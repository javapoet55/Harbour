import { snapshot } from '@/lib/metrics';
import { AIModelConfiguration } from '@/server/voice/configuration';
import { prisma } from '@/server/db';
import { breached, overall, ruleDefinitions, state, summarize, windows, type Status } from './metrics';

// Inventory from implemented adapters; configuration is deliberately not a health signal.
export const integrations = ['OpenAI','Google Calendar','Microsoft Calendar','Gmail','Google OAuth','Microsoft OAuth','Apple Authentication','Hostinger Mail','SendGrid','Twilio','Firebase Analytics','Web Push','iOS Contacts'];
export async function getHealth(range: keyof typeof windows = '24H') {
  const now = new Date(); const since = new Date(+now-windows[range]*3600000);
  const start = performance.now(); let database: Status = 'Unknown'; let databaseLatency: number | null = null;
  try { await prisma.$queryRaw`SELECT 1`; database='Healthy'; databaseLatency=performance.now()-start; } catch { database='Down'; }
  let databaseStats: {connections:number;maximum:number;bytes:number;rollbacks:number;deadlocks:number}|null=null;
  if(database==='Healthy' && /^postgres/.test(process.env.HARBOR_DATABASE_URL??'')) {
    try {
      const rows=await prisma.$queryRaw<{connections:bigint;maximum:number;bytes:bigint;rollbacks:bigint;deadlocks:bigint}[]>`SELECT numbackends::bigint AS connections, current_setting('max_connections')::int AS maximum, pg_database_size(current_database()) AS bytes, xact_rollback AS rollbacks, deadlocks FROM pg_stat_database WHERE datname=current_database()`;
      const row=rows[0]; if(row)databaseStats={connections:Number(row.connections),maximum:row.maximum,bytes:Number(row.bytes),rollbacks:Number(row.rollbacks),deadlocks:Number(row.deadlocks)};
    } catch { /* Managed database may restrict statistics. */ }
  }
  const result = await Promise.allSettled([
    prisma.healthEvent.findMany({where:{createdAt:{gte:since}},orderBy:{createdAt:'desc'},take:20001}),
    prisma.healthIncident.findMany({where:{OR:[{resolvedAt:null},{resolvedAt:{gte:since}}]},orderBy:{startedAt:'desc'},take:100}),
    prisma.healthRule.findMany(),
    prisma.healthAudit.findMany({orderBy:{createdAt:'desc'},take:100}),
    prisma.deliveryPlan.groupBy({by:['status'],_count:true}),
    prisma.deliveryPlan.findMany({where:{status:{in:['FAILED','UNCERTAIN']}},select:{id:true,createdAt:true,claimedAt:true,updatedAt:true,attempts:true,status:true},orderBy:{updatedAt:'desc'},take:30}),
    prisma.deliveryPlan.count({where:{status:'SCHEDULED',automaticDelivery:true,nextAttemptAt:{lte:now}}}),
    prisma.deliveryPlan.findFirst({where:{status:'SCHEDULED',automaticDelivery:true,nextAttemptAt:{lte:now}},select:{createdAt:true},orderBy:{createdAt:'asc'}}),
    prisma.reminder.groupBy({by:['status'],_count:true}),
    prisma.userMemory.findMany({where:{kind:'voice_usage',updatedAt:{gte:since}},select:{value:true},take:20001}),
    prisma.healthEvent.findMany({where:{kind:'scheduler'},distinct:['service'],orderBy:{createdAt:'desc'},take:10}),
  ] as const);
  const [eventsR,incidentsR,rulesR,auditR,jobsR,failedR,dueR,oldestR,remindersR,voiceR,heartbeatR]=result;
  const events=eventsR.status==='fulfilled'?eventsR.value.slice(0,20000):[];
  const available=eventsR.status==='fulfilled'; const truncated=eventsR.status==='fulfilled'&&eventsR.value.length>20000;
  const api=events.filter(e=>e.kind==='api'&&!e.operation.includes('/admin/health')&&!e.operation.includes('/internal/health'));
  const providers=events.filter(e=>e.kind==='provider');
  const metrics=summarize(api,windows[range]*60);
  const group=(rows: typeof events, key: (row: typeof events[number])=>string)=>Array.from(new Set(rows.map(key))).map(name=>({name,status:state(rows.filter(r=>key(r)===name)),...summarize(rows.filter(r=>key(r)===name),windows[range]*60)}));
  const sections: {name:string;status:Status}[]=[{name:'API',status:state(api)},{name:'Database',status:database},{name:'AI',status:state(providers.filter(e=>e.service==='OpenAI'))},{name:'Voice',status:'Unknown'},{name:'Integrations',status:overall(integrations.map(s=>state(providers.filter(e=>e.service===s))))},{name:'Jobs',status:'Unknown'},{name:'iOS',status:'Unknown'},{name:'Security',status:'Unknown'}];
  const buckets=Array.from({length:24},(_,i)=>{ const from=+since+i*(+now-+since)/24; const to=+since+(i+1)*(+now-+since)/24; const rows=api.filter(e=>+e.createdAt>=from&&+e.createdAt<to); return {time:new Date(from).toISOString(),...summarize(rows,(to-from)/60000)}; });
  const aiRows=providers.filter(e=>e.service==='OpenAI');
  const usageRows=aiRows.filter(e=>e.inputTokens!==null&&e.outputTokens!==null);
  const pricedRows=aiRows.filter(e=>e.costUsd!==null);
  const usage={input:usageRows.length?usageRows.reduce((n,e)=>n+e.inputTokens!,0):null,output:usageRows.length?usageRows.reduce((n,e)=>n+e.outputTokens!,0):null,cost:pricedRows.length?pricedRows.reduce((n,e)=>n+e.costUsd!,0):null,reported:usageRows.length,priced:pricedRows.length,requests:aiRows.length};
  const costTrend=Array.from({length:24},(_,i)=>{const from=+since+i*(+now-+since)/24;const to=+since+(i+1)*(+now-+since)/24;const rows=pricedRows.filter(e=>+e.createdAt>=from&&+e.createdAt<to);return {time:new Date(from).toISOString(),cost:rows.length?rows.reduce((n,e)=>n+e.costUsd!,0):null};});
  const rules=ruleDefinitions.map(def=>({...def,...(rulesR.status==='fulfilled'?rulesR.value.find(r=>r.id===def.id):undefined),enabled:rulesR.status==='fulfilled'?(rulesR.value.find(r=>r.id===def.id)?.enabled??true):false}));
  const heartbeats=heartbeatR.status==='fulfilled'?heartbeatR.value:[];
  return {asOf:now.toISOString(),range,available,enabled:process.env.NEXDO_HEALTH_ENABLED==='true',truncated,usage,costTrend,processMetrics:snapshot(),modelInventory:Array.from(new Set([process.env.OPENAI_MODEL||'gpt-5.4-mini',process.env.MOMENTS_DRAFT_MODEL||'gpt-4o-mini',process.env.OPENAI_IMAGE_MODEL||'gpt-image-1.5',AIModelConfiguration.quickVoiceTask,'gpt-4o-transcribe','gpt-live-transcribe','gpt-4o-mini-transcribe','gpt-4o-mini-tts'])).filter(m=>/^[a-z0-9][a-z0-9._-]{0,79}$/.test(m)),voiceBuckets:buckets.map((b,i)=>{const from=+since+i*(+now-+since)/24;const to=+since+(i+1)*(+now-+since)/24;return {time:b.time,...summarize(api.filter(e=>e.feature==='Voice'&&+e.createdAt>=from&&+e.createdAt<to),(to-from)/60000)};}),overall:overall(sections.map(s=>s.status)),sections,metrics,buckets,database:{status:database,latency:databaseLatency,stats:databaseStats},
    endpoints:group(api,e=>e.operation).sort((a,b)=>b.errors-a.errors),
    ai:group(providers.filter(e=>e.service==='OpenAI'),e=>`${e.model??'Model not reported'} · ${e.feature} · ${e.operation}`),
    integrations:integrations.map(name=>({name,status:state(providers.filter(e=>e.service===name)),...summarize(providers.filter(e=>e.service===name),windows[range]*60)})),
    integrationSummary:summarize(providers.filter(e=>e.service!=='OpenAI'),windows[range]*60),jobSummary:group(events.filter(e=>e.kind==='job'),e=>e.service),
    voice: summarize(api.filter(e=>e.feature==='Voice'),windows[range]*60),
    voiceReportedMinutes:voiceR.status==='fulfilled'&&voiceR.value.length<=20000?voiceR.value.reduce((s,r)=>s+Math.min(14400,Math.max(0,Number(r.value)||0)),0)/60:null,
    security:summarize(api.filter(e=>e.feature==='Authentication'),windows[range]*60),
    failures:events.filter(e=>e.status===0||e.status>=400).slice(0,100).map(e=>({id:e.id,time:e.createdAt.toISOString(),service:e.service,operation:e.operation,traceId:e.traceId,status:e.status,error:e.errorCode??`HTTP_${e.status}`})),
    incidents:incidentsR.status==='fulfilled'?incidentsR.value:null,audit:auditR.status==='fulfilled'?auditR.value:null,rules,
    jobs:jobsR.status==='fulfilled'?jobsR.value:null,failedJobs:failedR.status==='fulfilled'?failedR.value.map(j=>({...j,traceId:events.find(e=>e.kind==='job'&&e.operation===j.id)?.traceId??null})):null,reminders:remindersR.status==='fulfilled'?remindersR.value:null,
    due:dueR.status==='fulfilled'?dueR.value:null,oldest:oldestR.status==='fulfilled'?oldestR.value?.createdAt.toISOString()??null:null,
    heartbeats:heartbeats.map(e=>({service:e.service,time:e.createdAt.toISOString(),status:e.status,durationMs:e.durationMs,traceId:e.traceId})),
  };
}
export async function evaluateAlerts() {
  const data=await getHealth('1H');
  if(!data.available || data.truncated) throw new Error('TELEMETRY_UNAVAILABLE');
  const voice=data.voice; const ai=data.integrations.find(i=>i.name==='OpenAI')!;
  const heartbeat=data.heartbeats.find(h=>h.service==='Moments scheduler');
  const measures: Record<string,[number|null,number]>={
    'api-errors':[data.metrics.requests?data.metrics.errors5xx/data.metrics.requests*100:null,data.metrics.requests],
    'api-latency':[data.metrics.p95,data.metrics.requests], 'ai-errors':[ai.requests?ai.errors/ai.requests*100:null,ai.requests],
    'voice-errors':[voice.requests?voice.errors/voice.requests*100:null,voice.requests],
    'auth-errors':[data.security.requests?data.security.errors5xx/data.security.requests*100:null,data.security.requests],
    'integration-errors':[data.integrationSummary.requests?data.integrationSummary.errors/data.integrationSummary.requests*100:null,data.integrationSummary.requests],
    'database-down':[data.database.status==='Down'?1:0,1],'queue-backlog':[data.due,1],
    'scheduler-stale':[process.env.MOMENTS_SCHEDULER_ENABLED==='true'&&heartbeat?(Date.now()-Date.parse(heartbeat.time))/60000:null,1],
  };
  for(const rule of data.rules) {
    const [value,samples]=measures[rule.id];
    if(!breached(value,samples,rule)) continue;
    await prisma.$transaction(async tx=>{
      const incident=await tx.healthIncident.upsert({where:{activeKey:rule.id},update:{},create:{activeKey:rule.id,service:rule.service,severity:rule.severity,trigger:`${rule.label}: ${value?.toFixed(2)} >= ${rule.threshold}`}});
      // One creation entry per incident, even with overlapping scheduler invocations.
      await tx.healthAudit.upsert({where:{id:`incident-${incident.id}`},update:{},create:{id:`incident-${incident.id}`,actorId:'system',action:'INCIDENT_OPENED',targetId:incident.id,detail:incident.trigger}});
    });
  }
  await prisma.healthEvent.deleteMany({where:{createdAt:{lt:new Date(Date.now()-31*86400000)}}});
  return {checkedAt:new Date().toISOString()};
}
export async function incidentAction(actorId:string,id:string,action:'ACKNOWLEDGED'|'INVESTIGATING'|'RESOLVED') {
  return prisma.$transaction(async tx=>{
    const current=await tx.healthIncident.findUniqueOrThrow({where:{id}});
    if(current.status==='RESOLVED') throw new Error('CONFLICT');
    const changed=await tx.healthIncident.updateMany({where:{id,status:current.status,updatedAt:current.updatedAt},data:{status:action,ownerId:actorId,...(action==='RESOLVED'?{resolvedAt:new Date(),activeKey:null}:{})}});
    if(!changed.count) throw new Error('CONFLICT');
    await tx.healthAudit.create({data:{actorId,action:`INCIDENT_${action}`,targetId:id,detail:`${current.status} → ${action}`}});
  });
}
export async function updateRule(actorId:string,id:string,threshold:number,minimumSamples:number,enabled:boolean) {
  if(!ruleDefinitions.some(r=>r.id===id)) throw new Error('INVALID_RULE');
  return prisma.$transaction(async tx=>{
    const before=await tx.healthRule.findUnique({where:{id}});
    const rule=await tx.healthRule.upsert({where:{id},create:{id,threshold,minimumSamples,enabled},update:{threshold,minimumSamples,enabled}});
    await tx.healthAudit.create({data:{actorId,action:'RULE_UPDATED',targetId:id,detail:JSON.stringify({before:before?{threshold:before.threshold,minimumSamples:before.minimumSamples,enabled:before.enabled}:null,after:{threshold,minimumSamples,enabled}})}});
    return rule;
  });
}
// Future adapters must supply aggregate measurements, never raw crash/conversation content.
export interface MobileHealthAdapter { snapshot(): Promise<{ productionVersion:string|null; crashFreeSessions:number|null; crashCount:number|null; source:string }> }
export interface HealthNotificationChannel { send(incident:{id:string;severity:string;service:string;trigger:string}):Promise<void> }
