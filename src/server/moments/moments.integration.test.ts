import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '@/server/db';
import { saveMoment, generateDraft, approveDraft, schedule, changePlan, runJobs, listMoments } from './service';
import { fallback, occurrence, nextAnnual, mayTransition } from './domain';
import { randomUUID } from 'node:crypto';
let userId='';
const input={type:'birthday',title:'Test birthday',firstName:'Test',email:'test@example.com',phone:'+15555550123',occurrenceDate:'2000-02-29',yearly:true,timeZoneID:'America/Los_Angeles',sourceKey:'test'};
async function ready() { const m=await saveMoment(userId,{...input,sourceKey:randomUUID(),email:randomUUID()+'@example.com'});const {draft}=await generateDraft(userId,{momentID:m.id,tone:'Warm'});await approveDraft(userId,{id:draft.id,body:draft.body,approved:true});return draft; }
async function plan(channel='messages', automaticDelivery=false) { const draft=await ready();return schedule(userId,{draftID:draft.id,channel,recipient:channel==='email'?'test@example.com':'+15555550123',scheduledAtUTC:new Date(Date.now()+3600000).toISOString(),timeZoneID:'America/Los_Angeles',automaticDelivery,reminderOffset:60,repeatYearly:false,idempotencyKey:randomUUID(),approved:true}); }
beforeAll(async()=>{ const u=await prisma.user.create({data:{email:randomUUID()+'@example.com',name:'Moment Test',passwordHash:''}});userId=u.id;await prisma.momentEmailAccount.create({data:{userId,email:'sender@example.com',refreshToken:'test-only'}});process.env.MOMENTS_SCHEDULER_ENABLED='true'; });
afterAll(async()=>{ await prisma.user.delete({where:{id:userId}}); });
describe('Important Moments',()=>{
 it('observes leap birthdays without losing the source date',()=>{ expect(occurrence('2000-02-29',true,'America/Los_Angeles',new Date('2027-02-27T20:00:00Z'))).toBe('2027-02-28');expect(occurrence('2000-02-29',true,'America/Los_Angeles',new Date('2028-02-27T20:00:00Z'))).toBe('2028-02-29'); });
 it('preserves local annual clock across DST and leap years',()=>{ expect(nextAnnual(new Date('2026-03-08T16:00:00Z'),'America/Los_Angeles').toISOString()).toBe('2027-03-08T17:00:00.000Z');expect(nextAnnual(new Date('2028-02-29T17:00:00Z'),'America/Los_Angeles').toISOString()).toBe('2029-02-28T17:00:00.000Z'); });
 it('has bounded deterministic tones and terminal sent states',()=>{ for(const tone of ['Warm','Personal','Short','Fun']) expect(fallback('Sam','birthday',tone).length).toBeLessThan(500);expect(mayTransition('SENT','SCHEDULED')).toBe(false);expect(mayTransition('SCHEDULED','SENDING')).toBe(true); });
 it('persists and deduplicates imported moments',async()=>{const a=await saveMoment(userId,input);const b=await saveMoment(userId,input);expect(a.id).toBe(b.id);expect((await listMoments(userId)).moments.some(m=>m.id===a.id)).toBe(true);});
 it('requires approval and rejects past schedules or unattended messages',async()=>{const d=await ready();const base={draftID:d.id,channel:'messages',recipient:'+15555550123',scheduledAtUTC:new Date(0).toISOString(),timeZoneID:'America/Los_Angeles',automaticDelivery:false,reminderOffset:0,repeatYearly:false,idempotencyKey:randomUUID(),approved:true};await expect(schedule(userId,base)).rejects.toThrow('future');await expect(schedule(userId,{...base,automaticDelivery:true})).rejects.toThrow('confirmation');});
 it('rejects cross-account changes and cancellation after sending',async()=>{const p=await plan();await expect(changePlan('other',{id:p.id,action:'cancel'})).rejects.toThrow('not found');await changePlan(userId,{id:p.id,action:'sent'});await expect(changePlan(userId,{id:p.id,action:'cancel'})).rejects.toThrow('editable');});
 it('does not mark cancellation as sent',async()=>{const p=await plan();await changePlan(userId,{id:p.id,action:'cancel'});expect((await prisma.deliveryPlan.findUnique({where:{id:p.id}}))?.sentAt).toBeNull();});
 it('claims once with concurrent workers and records provider ID',async()=>{const p=await plan('email',true);await prisma.deliveryPlan.update({where:{id:p.id},data:{nextAttemptAt:new Date(0)}});let calls=0;const provider={send:async()=>{calls++;return {kind:'sent' as const,id:'fixture-id'};}};await Promise.all([runJobs(provider,p.id),runJobs(provider,p.id)]);expect(calls).toBe(1);expect((await prisma.deliveryPlan.findUnique({where:{id:p.id}}))?.providerMessageID).toBe('fixture-id');});
 it('never sends cancelled plans',async()=>{const p=await plan('email',true);await changePlan(userId,{id:p.id,action:'cancel'});let calls=0;await runJobs({send:async()=>{calls++;return {kind:'sent',id:'bad'};}},p.id);expect(calls).toBe(0);});
 it('retries explicit throttles, never ambiguous or permanent sends',async()=>{for(const kind of ['retry','uncertain','permanent','reconnect'] as const){const p=await plan('email',true);await prisma.deliveryPlan.update({where:{id:p.id},data:{nextAttemptAt:new Date(0)}});await runJobs({send:async()=>({kind,error:'fixture'})},p.id);const saved=await prisma.deliveryPlan.findUniqueOrThrow({where:{id:p.id}});expect(saved.status).toBe(kind==='retry'?'SCHEDULED':kind==='uncertain'?'UNCERTAIN':'FAILED');expect(saved.attempts).toBe(1);}});
 it('uses editable fallback after AI failure and accepts a valid AI draft',async()=>{const m=await saveMoment(userId,{...input,sourceKey:randomUUID(),email:randomUUID()+'@example.com'});const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-only';try {vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));const failed=await generateDraft(userId,{momentID:m.id,tone:'Warm',aiConsent:true});expect(failed.usedAI).toBe(false);vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'Happy birthday, Test!'}}]}),{status:200})));const success=await generateDraft(userId,{momentID:m.id,tone:'Warm',aiConsent:true});expect(success.usedAI).toBe(true);expect(success.draft.status).toBe('NEEDS_REVIEW');} finally {vi.unstubAllGlobals();if(old)process.env.OPENAI_API_KEY=old;else delete process.env.OPENAI_API_KEY;}});
 it('limits retries and preserves failed states',async()=>{const p=await plan('email',true);for(let i=0;i<4;i++){await prisma.deliveryPlan.update({where:{id:p.id},data:{nextAttemptAt:new Date(0)}});await runJobs({send:async()=>({kind:'retry',error:'rate limited'})},p.id);}expect((await prisma.deliveryPlan.findUniqueOrThrow({where:{id:p.id}})).status).toBe('FAILED');});
 it('recovers crashed claims without sending them again',async()=>{const p=await plan('email',true);await prisma.deliveryPlan.update({where:{id:p.id},data:{status:'SENDING',claimedAt:new Date(0)}});let calls=0;await runJobs({send:async()=>{calls++;return {kind:'sent',id:'unexpected'};}},p.id);expect(calls).toBe(0);expect((await prisma.deliveryPlan.findUniqueOrThrow({where:{id:p.id}})).status).toBe('UNCERTAIN');});
 it('repeats a confirmed Messages wish without automatic sending',async()=>{const p=await plan();await prisma.deliveryPlan.update({where:{id:p.id},data:{repeatYearly:true}});await changePlan(userId,{id:p.id,action:'sent'});const next=await prisma.deliveryPlan.findUniqueOrThrow({where:{idempotencyKey:`${p.id}:annual`}});expect(next.automaticDelivery).toBe(false);expect(next.status).toBe('AWAITING_CONFIRMATION');});
 it('returns the same plan for an idempotent replay',async()=>{const d=await ready();const key=randomUUID();const v={draftID:d.id,channel:'copy',recipient:'',scheduledAtUTC:new Date().toISOString(),timeZoneID:'UTC',automaticDelivery:false,reminderOffset:0,repeatYearly:false,idempotencyKey:key,approved:true,sendNow:true};const a=await schedule(userId,v);expect((await schedule(userId,v)).id).toBe(a.id);});
});

it('recreating an archived source opens a fresh active moment and preserves history',async()=>{
 const value={...input,sourceKey:randomUUID(),email:randomUUID()+'@example.com',source:'contacts'};
 const old=await saveMoment(userId,value);
 await prisma.importantMoment.update({where:{id:old.id},data:{enabled:false,festivalSettings:JSON.stringify({archived:true})}});
 const saved=await saveMoment(userId,value);
 expect(saved.id).not.toBe(old.id);
 expect(saved.enabled).toBe(true);
 expect(saved.nextOccurrence).toMatch(/^\d{4}-\d{2}-\d{2}$/);
 expect(saved.drafts).toEqual([]);
 expect((await saveMoment(userId,value)).id).toBe(saved.id);
 expect(JSON.parse((await prisma.importantMoment.findUniqueOrThrow({where:{id:old.id}})).festivalSettings).archived).toBe(true);
});
it('explicit new manual moments do not inherit an existing recipient record',async()=>{
 const details={...input,source:'manual',email:randomUUID()+'@example.com',sourceKey:randomUUID()};
 const first=await saveMoment(userId,details);
 const second=await saveMoment(userId,{...details,sourceKey:randomUUID(),firstName:'New recipient'});
 expect(second.id).not.toBe(first.id);
 expect(second.firstName).toBe('New recipient');
 expect((await saveMoment(userId,details)).id).toBe(first.id);
});

it('expires overdue manual wishes on owner refresh but retains recent and sent wishes',async()=>{
 const expired=await plan(),recent=await plan(),sent=await plan();
 await prisma.deliveryPlan.update({where:{id:expired.id},data:{scheduledAtUTC:new Date(Date.now()-25*3600000)}});
 await prisma.deliveryPlan.update({where:{id:recent.id},data:{scheduledAtUTC:new Date(Date.now()-23*3600000)}});
 await prisma.deliveryPlan.update({where:{id:sent.id},data:{status:'SENT',scheduledAtUTC:new Date(0)}});
 await listMoments(userId);
 expect((await prisma.deliveryPlan.findUniqueOrThrow({where:{id:expired.id}})).status).toBe('EXPIRED');
 expect((await prisma.deliveryPlan.findUniqueOrThrow({where:{id:recent.id}})).status).toBe('AWAITING_CONFIRMATION');
 expect((await prisma.deliveryPlan.findUniqueOrThrow({where:{id:sent.id}})).status).toBe('SENT');
});
it('a per-plan send does not recover or repeat unrelated plans or scan catalog users',async()=>{
 const target=await plan('email',true),stale=await plan('email',true),repeat=await plan();
 await prisma.deliveryPlan.update({where:{id:target.id},data:{nextAttemptAt:new Date(0)}});
 await prisma.deliveryPlan.update({where:{id:stale.id},data:{status:'SENDING',claimedAt:new Date(0)}});
 await prisma.deliveryPlan.update({where:{id:repeat.id},data:{status:'SENT',repeatYearly:true}});
 await runJobs({send:async()=>({kind:'sent',id:'scoped'})},target.id);
 expect((await prisma.deliveryPlan.findUniqueOrThrow({where:{id:stale.id}})).status).toBe('SENDING');
 expect(await prisma.deliveryPlan.findUnique({where:{idempotencyKey:repeat.id+':annual'}})).toBeNull();
});
it('records an opened SMS composer without claiming sent or failed',async()=>{
 const p=await plan();await changePlan(userId,{id:p.id,action:'opened'});
 const saved=await prisma.deliveryPlan.findUniqueOrThrow({where:{id:p.id}});
 expect(saved.status).toBe('AWAITING_CONFIRMATION');expect(saved.sentAt).toBeNull();expect(saved.lastError).toContain('not confirmed');
 await changePlan(userId,{id:p.id,action:'sent'});
 expect((await prisma.deliveryPlan.findUniqueOrThrow({where:{id:p.id}})).lastError).toBeNull();
 await expect(changePlan(userId,{id:p.id,action:'opened'})).rejects.toThrow('awaiting');
 const email=await plan('email',true);await expect(changePlan(userId,{id:email.id,action:'opened'})).rejects.toThrow('awaiting');
});
it('uses the dedicated wish model independently of the assistant model',async()=>{
 const m=await saveMoment(userId,{...input,sourceKey:randomUUID()});
 vi.stubEnv('OPENAI_API_KEY','fixture');vi.stubEnv('OPENAI_MODEL','assistant-model');vi.stubEnv('MOMENTS_DRAFT_MODEL','wish-model');
 const fetcher=vi.fn().mockResolvedValue(Response.json({choices:[{message:{content:'Happy birthday!'}}]}));vi.stubGlobal('fetch',fetcher);
 try {await generateDraft(userId,{momentID:m.id,tone:'Warm',aiConsent:true});expect(JSON.parse(fetcher.mock.calls[0][1].body).model).toBe('wish-model');}finally{vi.unstubAllEnvs();vi.unstubAllGlobals();}
});
it('logs only the reason when a requested AI wish falls back',async()=>{
 const m=await saveMoment(userId,{...input,firstName:'Priyanka',sourceKey:randomUUID()});
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
 const reply=(content:string,finish_reason='stop')=>Response.json({choices:[{message:{content},finish_reason}]});
 const timeout=()=>Promise.reject(new DOMException('The operation was aborted due to timeout','TimeoutError'));
 const cases:[string,(()=>Promise<Response>)|null][]=[
  ['no_key',null],
  ['http_429',async()=>Response.json({error:{message:'slow down'}},{status:429})],
  ['timeout',timeout],
  ['network',()=>Promise.reject(new TypeError('fetch failed'))],
  ['empty',async()=>reply('  ')],
  ['too_long',async()=>reply('Happy birthday! '.repeat(40))],
  ['too_long',async()=>reply('Happy birthday, Priyanka! Wishing you a','length')],
  ['bad_json',async()=>new Response('<html>oops</html>',{status:200})],
 ];
 try {
  for(const [reason,respond] of cases) {
   warn.mockClear();
   vi.stubEnv('OPENAI_API_KEY',respond?'sk-secret-fixture':'');vi.stubGlobal('fetch',vi.fn(respond??(async()=>reply('unused'))));
   const result=await generateDraft(userId,{momentID:m.id,tone:'Warm',aiConsent:true,personalContext:'loves hiking'});
   expect(result.usedAI).toBe(false);
   expect(warn).toHaveBeenCalledTimes(1);
   const line=String(warn.mock.calls[0][0]);
   expect(JSON.parse(line)).toMatchObject({level:'warn',event:'wish_ai_fallback',reason});
   for(const secret of ['Priyanka','hiking','sk-secret-fixture','Happy birthday','Warm']) expect(line).not.toContain(secret);
  }
  // No log when AI was not requested, or when the AI wish is used.
  warn.mockClear();
  await generateDraft(userId,{momentID:m.id,tone:'Warm',aiConsent:false});
  vi.stubEnv('OPENAI_API_KEY','sk-secret-fixture');const fetcher=vi.fn(async()=>reply('Happy birthday, Priyanka!'));vi.stubGlobal('fetch',fetcher);
  expect((await generateDraft(userId,{momentID:m.id,tone:'Warm',aiConsent:true})).usedAI).toBe(true);
  expect(warn).not.toHaveBeenCalled();
  // The model is asked for a reply that fits the 500-character wish, not one it would have to discard.
  expect(JSON.parse((fetcher.mock.calls[0] as unknown as [string,{body:string}])[1].body).max_tokens).toBeLessThanOrEqual(150);
 } finally {warn.mockRestore();vi.unstubAllEnvs();vi.unstubAllGlobals();}
});
