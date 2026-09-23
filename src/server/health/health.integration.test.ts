import { it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { getHealth,incidentAction,updateRule,evaluateAlerts } from './service';
import { healthContext,recordEvent,observedFetch } from './telemetry';
it('persists sanitized correlated measurements and retrieves missing states honestly',async()=>{
 vi.stubEnv('NEXDO_HEALTH_ENABLED','true');const traceId=randomUUID().replaceAll('-','');
 await healthContext.run({traceId,feature:'Ask AI'},()=>recordEvent({kind:'api',service:'API',operation:'GET /api/health-fixture',status:200,durationMs:12}));
 const event=await prisma.healthEvent.findFirstOrThrow({where:{traceId}});expect(event.operation).toBe('GET /api/health-fixture');
 const data=await getHealth('1H');expect(data.available).toBe(true);expect(data.sections.find(s=>s.name==='iOS')?.status).toBe('Unknown');expect(data.metrics.requests).toBeGreaterThan(0);vi.unstubAllEnvs();
});
it('extracts numeric AI usage without persisting prompts or output',async()=>{
 vi.stubEnv('NEXDO_HEALTH_ENABLED','true');vi.stubEnv('NEXDO_AI_PRICES_JSON','{"test-model":{"input":1,"output":2}}');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({usage:{input_tokens:100,output_tokens:20},output:'PRIVATE RESPONSE'})));
 const response=await observedFetch('https://api.openai.com/v1/responses',{body:JSON.stringify({model:'test-model',input:'PRIVATE PROMPT'})});
 expect((await response.json()).output).toBe('PRIVATE RESPONSE');
 const event=await prisma.healthEvent.findFirstOrThrow({where:{model:'test-model'}});expect(event.inputTokens).toBe(100);expect(event.costUsd).toBeCloseTo(.00014);expect(JSON.stringify(event)).not.toContain('PRIVATE');vi.unstubAllEnvs();vi.unstubAllGlobals();
});
it('audits incident transitions atomically and rejects resolved incidents',async()=>{
 const incident=await prisma.healthIncident.create({data:{service:'fixture',severity:'SEV-2',trigger:'test'}});
 await incidentAction('operator',incident.id,'ACKNOWLEDGED');await incidentAction('operator',incident.id,'RESOLVED');
 expect(await prisma.healthAudit.count({where:{targetId:incident.id}})).toBe(2);
 await expect(incidentAction('operator',incident.id,'INVESTIGATING')).rejects.toThrow('CONFLICT');
 const audit=await prisma.healthAudit.findFirstOrThrow({where:{targetId:incident.id}});
 await expect(prisma.healthAudit.update({where:{id:audit.id},data:{detail:'tamper'}})).rejects.toThrow();
 await expect(prisma.healthAudit.delete({where:{id:audit.id}})).rejects.toThrow();
});
it('creates one incident per rule breach and audits rule edits',async()=>{
 await updateRule('operator','api-errors',1,1,true);
 await prisma.healthEvent.create({data:{kind:'api',service:'API',operation:'GET /api/fixture',feature:'Other',traceId:'a'.repeat(32),status:500,durationMs:5}});
 await evaluateAlerts();await evaluateAlerts();
 expect(await prisma.healthIncident.count({where:{activeKey:'api-errors'}})).toBe(1);
 expect(await prisma.healthAudit.count({where:{action:'RULE_UPDATED',targetId:'api-errors'}})).toBeGreaterThan(0);
});

it('derives Voice, Jobs and Security summaries from recent measurements', async () => {
 const traceId=randomUUID().replaceAll('-','');
 try {
  await prisma.healthEvent.createMany({data:['Voice','Authentication','Jobs'].flatMap(feature=>Array.from({length:5},()=>({kind:feature==='Jobs'?'scheduler':'api',service:feature==='Jobs'?'test-worker':'API',operation:'test-summary',feature,traceId,status:200,durationMs:10}))) });
  const data=await getHealth('1H');
  for(const name of ['Voice','Jobs','Security']) expect(data.sections.find(s=>s.name===name)?.status).toBe('Healthy');
  expect(data.sections.find(s=>s.name==='iOS')?.status).toBe('Unknown');
 } finally {await prisma.healthEvent.deleteMany({where:{traceId}});}
});
