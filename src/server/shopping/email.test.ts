import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {prisma} from '@/server/db';
import {shoppingAction} from './service';
import {nextWeekly,scheduleInput,shoppingEmail} from './email-domain';
import {saveEmailSchedule,pauseEmailSchedule,runShoppingEmails,emailSchedule} from './email-service';
let userId='';
const now=new Date('2030-01-05T18:00:00Z'); // Saturday, 10 AM in Los Angeles
const settings={recipient:'manager@example.com',recipientName:'Alex',timeZone:'America/Los_Angeles',weekday:6,hour:10,minute:0,consent:true};
const provider={send:vi.fn(async()=>({kind:'sent' as const,id:'provider-receipt'}))};
beforeAll(async()=>{
 vi.stubEnv('SHOPPING_EMAIL_ENABLED','true');vi.stubEnv('MOMENTS_GOOGLE_CLIENT_ID','test');vi.stubEnv('MOMENTS_GOOGLE_CLIENT_SECRET','test');vi.stubEnv('MOMENTS_GOOGLE_REDIRECT_URI','https://example.com/callback');
 const user=await prisma.user.create({data:{email:randomUUID()+'@example.com',name:'Shopper',passwordHash:''}});userId=user.id;
 await prisma.momentEmailAccount.create({data:{userId,email:user.email,refreshToken:'not-used-by-mock'}});
});
afterAll(async()=>{await prisma.user.delete({where:{id:userId}});vi.unstubAllEnvs()});
async function setup(checked=false){
 const list=await prisma.shoppingList.create({data:{userId,title:'Weekly groceries',date:'2030-01-05',timeZone:settings.timeZone,weekly:true,items:{create:{id:randomUUID(),name:'Milk',quantity:'2',size:'litres',notes:'No substitutions',category:'Dairy',checked}}}});
 const schedule=await saveEmailSchedule(userId,list.id,settings,new Date(now.getTime()-60000));return {list,schedule};
}
it('keeps 10 AM local through DST and rolls strictly forward',()=>{
 expect(nextWeekly(new Date('2026-03-07T18:00:00Z'),settings).toISOString()).toBe('2026-03-14T17:00:00.000Z');
 expect(nextWeekly(new Date('2026-10-31T17:00:00Z'),settings).toISOString()).toBe('2026-11-07T18:00:00.000Z');
 expect(nextWeekly(now,settings).toISOString()).toBe('2030-01-12T18:00:00.000Z');
});
it('requires consent, a valid timezone, and a safe recipient',()=>{
 for(const changes of [{consent:false},{timeZone:'invalid'},{recipient:'x@example.com\r\nBcc:y@example.com'}])expect(scheduleInput.safeParse({...settings,...changes}).success).toBe(false);
});
it('only includes unpurchased items and preserves quantities and notes',()=>{
 const mail=shoppingEmail('Food','Alex',[{name:'Milk',quantity:'2',size:'litres',notes:'Organic',checked:false},{name:'Eggs',quantity:'1',size:'',notes:'',checked:true}]);
 expect(mail.body).toContain('Milk — 2 · litres (Organic)');expect(mail.body).not.toContain('Eggs');
});
it('rejects access by another user',async()=>{const {list}=await setup();await expect(emailSchedule('other',list.id)).rejects.toThrow('not found');await expect(pauseEmailSchedule('other',list.id)).rejects.toThrow('not found');await pauseEmailSchedule(userId,list.id)});
it('sends once, stores a receipt and does not repeat on the next tick',async()=>{
 const {schedule}=await setup();provider.send.mockClear();await runShoppingEmails(now,provider);await runShoppingEmails(now,provider);
 expect(provider.send).toHaveBeenCalledTimes(1);
 const run=await prisma.shoppingEmailRun.findFirstOrThrow({where:{scheduleId:schedule.id}});expect(run.status).toBe('sent');expect(run.providerId).toBe('provider-receipt');
});
it('skips empty lists and old missed runs',async()=>{
 const {schedule}=await setup(true);await runShoppingEmails(now,provider);expect((await prisma.shoppingEmailRun.findFirstOrThrow({where:{scheduleId:schedule.id}})).status).toBe('skipped');
 const old=await setup();await prisma.shoppingEmailSchedule.update({where:{id:old.schedule.id},data:{nextRunAt:new Date(now.getTime()-2*86400000)}});await runShoppingEmails(now,provider);expect((await prisma.shoppingEmailRun.findFirstOrThrow({where:{scheduleId:old.schedule.id}})).detail).toContain('24 hours');
});
it('pausing prevents a scheduled email',async()=>{const {list,schedule}=await setup();await pauseEmailSchedule(userId,list.id);await runShoppingEmails(now,provider);expect(await prisma.shoppingEmailRun.count({where:{scheduleId:schedule.id}})).toBe(0)});
it('pauses the schedule after a permanent rejection instead of failing every week',async()=>{
 const {schedule}=await setup();const rejected={send:vi.fn(async()=>({kind:'permanent' as const,error:'Email provider rejected the message.'}))};
 await runShoppingEmails(now,rejected);
 const run=await prisma.shoppingEmailRun.findFirstOrThrow({where:{scheduleId:schedule.id}});expect(run.status).toBe('failed');expect(run.detail).toContain('save the schedule');
 expect((await prisma.shoppingEmailSchedule.findUniqueOrThrow({where:{id:schedule.id}})).enabled).toBe(false);
});
it('keeps sending other schedules when one fails to queue',async()=>{
 const bad=await setup();const good=await setup();
 await prisma.shoppingEmailSchedule.update({where:{id:bad.schedule.id},data:{timeZone:'Invalid/Zone'}});
 const errors=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{
  await runShoppingEmails(now,provider);
  expect((await prisma.shoppingEmailRun.findFirstOrThrow({where:{scheduleId:good.schedule.id}})).status).toBe('sent');
  expect(await prisma.shoppingEmailRun.count({where:{scheduleId:bad.schedule.id}})).toBe(0);
  expect(String(errors.mock.calls[0]?.[0])).toContain('shopping_email_queue_failed');
 }finally{errors.mockRestore();await prisma.shoppingEmailSchedule.update({where:{id:bad.schedule.id},data:{enabled:false}})}
});
it('deletes finished run history after 90 days',async()=>{
 const {schedule}=await setup();await prisma.shoppingEmailSchedule.update({where:{id:schedule.id},data:{enabled:false}});
 const run=(days:number)=>prisma.shoppingEmailRun.create({data:{scheduleId:schedule.id,dueAt:new Date(now.getTime()-days*86400000),retryAt:new Date(now.getTime()-days*86400000),recipient:settings.recipient,subject:'Old',body:'Milk',status:'sent'}});
 const old=await run(91),recent=await run(30);await runShoppingEmails(now,provider);
 expect(await prisma.shoppingEmailRun.findUnique({where:{id:old.id}})).toBeNull();expect(await prisma.shoppingEmailRun.findUnique({where:{id:recent.id}})).not.toBeNull();
});
it('does not retry uncertain sends',async()=>{
 const {schedule}=await setup();const uncertain={send:vi.fn(async()=>({kind:'uncertain' as const,error:'Check Sent mail'}))};
 await runShoppingEmails(now,uncertain);await runShoppingEmails(new Date(now.getTime()+600000),uncertain);expect(uncertain.send).toHaveBeenCalledTimes(1);
 expect((await prisma.shoppingEmailRun.findFirstOrThrow({where:{scheduleId:schedule.id}})).status).toBe('uncertain');
});
it('retries definite rate limits with the same snapshot and cancels retry when paused',async()=>{
 const {list,schedule}=await setup();const limited={send:vi.fn(async()=>({kind:'retry' as const,error:'Rate limited'}))};
 await runShoppingEmails(now,limited);expect((await prisma.shoppingEmailRun.findFirstOrThrow({where:{scheduleId:schedule.id}})).status).toBe('pending');
 await pauseEmailSchedule(userId,list.id);await runShoppingEmails(new Date(now.getTime()+600000),limited);expect(limited.send).toHaveBeenCalledTimes(1);
});
it('does not send a second email the same week when the time is changed after it went out',async()=>{
 const {list,schedule}=await setup();await runShoppingEmails(now,provider);
 const saved=await saveEmailSchedule(userId,list.id,{...settings,hour:11},new Date(now.getTime()+5*60000));
 expect(saved.nextRunAt.toISOString()).toBe('2030-01-12T19:00:00.000Z');
 await runShoppingEmails(new Date('2030-01-05T19:00:00Z'),provider);
 expect(await prisma.shoppingEmailRun.count({where:{scheduleId:schedule.id,status:'sent'}})).toBe(1);
 await pauseEmailSchedule(userId,list.id);
});
it('still sends this week when the time is changed before the email goes out',async()=>{
 const {list}=await setup();
 const saved=await saveEmailSchedule(userId,list.id,{...settings,hour:11},new Date(now.getTime()-30000));
 expect(saved.nextRunAt.toISOString()).toBe('2030-01-05T19:00:00.000Z');await pauseEmailSchedule(userId,list.id);
});
it('turns the schedule off when a one-off list is completed',async()=>{
 const list=await prisma.shoppingList.create({data:{userId,title:'Party',date:'2030-01-05',timeZone:settings.timeZone,weekly:false,items:{create:{id:randomUUID(),name:'Cake',quantity:'1',size:'',notes:'',category:'Bakery',checked:false}}}});
 const schedule=await saveEmailSchedule(userId,list.id,settings,new Date(now.getTime()-60000));
 await shoppingAction(userId,{operation:'complete',id:list.id,revision:0});
 expect((await prisma.shoppingEmailSchedule.findUniqueOrThrow({where:{id:schedule.id}})).enabled).toBe(false);
 await runShoppingEmails(now,provider);expect(await prisma.shoppingEmailRun.count({where:{scheduleId:schedule.id}})).toBe(0);
});
it('moves a weekly schedule to the next list when completing a trip',async()=>{
 const {list,schedule}=await setup();const result=await shoppingAction(userId,{operation:'complete',id:list.id,revision:0});
 if(!('list' in result)||!result.list)throw Error('Missing next list');
 expect((await prisma.shoppingEmailSchedule.findUniqueOrThrow({where:{id:schedule.id}})).listId).toBe(result.list.id);await pauseEmailSchedule(userId,result.list.id);
});
it('skips that week when the trip is completed before the email goes out',async()=>{
 const {list,schedule}=await setup();const p={send:vi.fn(async()=>({kind:'sent' as const,id:'early'}))};
 const result=await shoppingAction(userId,{operation:'complete',id:list.id,revision:0});if(!('list' in result)||!result.list)throw Error('Missing next list');
 const moved=await prisma.shoppingEmailSchedule.findUniqueOrThrow({where:{id:schedule.id},include:{runs:true}});
 expect(moved.listId).toBe(result.list.id);expect(moved.nextRunAt.toISOString()).toBe('2030-01-12T18:00:00.000Z');
 expect(moved.runs.map(r=>[r.status,r.dueAt.toISOString()])).toEqual([['skipped','2030-01-05T18:00:00.000Z']]);
 await runShoppingEmails(now,p);expect(p.send).not.toHaveBeenCalled();await pauseEmailSchedule(userId,result.list.id);
});
it('keeps the next weekly time when the email went out before the trip was completed',async()=>{
 const {list,schedule}=await setup();await runShoppingEmails(now,provider);
 const result=await shoppingAction(userId,{operation:'complete',id:list.id,revision:0});if(!('list' in result)||!result.list)throw Error('Missing next list');
 expect((await prisma.shoppingEmailSchedule.findUniqueOrThrow({where:{id:schedule.id}})).nextRunAt.toISOString()).toBe('2030-01-12T18:00:00.000Z');
 await prisma.shoppingEmailSchedule.updateMany({where:{list:{userId},id:{not:schedule.id}},data:{enabled:false}});
 await runShoppingEmails(new Date('2030-01-12T18:00:00Z'),provider);
 const next=await prisma.shoppingEmailRun.findFirstOrThrow({where:{scheduleId:schedule.id,dueAt:new Date('2030-01-12T18:00:00Z')}});
 expect(next.status).toBe('sent');expect(next.body).toContain('Milk');await pauseEmailSchedule(userId,result.list.id);
});
it('marks abandoned sends uncertain rather than submitting twice',async()=>{
 const {schedule}=await setup();await prisma.shoppingEmailSchedule.update({where:{id:schedule.id},data:{nextRunAt:nextWeekly(now,settings)}});
 await prisma.shoppingEmailRun.create({data:{scheduleId:schedule.id,dueAt:now,retryAt:now,recipient:settings.recipient,subject:'Test',body:'Test',status:'sending',updatedAt:new Date(now.getTime()-11*60000)}});
 await runShoppingEmails(now,provider);expect((await prisma.shoppingEmailRun.findFirstOrThrow({where:{scheduleId:schedule.id}})).status).toBe('uncertain');
});
it('requires a connected account and pauses after provider access is revoked',async()=>{
 const {list,schedule}=await setup();const disconnected={send:vi.fn(async()=>({kind:'reconnect' as const,error:'Reconnect Gmail'}))};
 await runShoppingEmails(now,disconnected);expect((await prisma.shoppingEmailSchedule.findUniqueOrThrow({where:{id:schedule.id}})).enabled).toBe(false);
 await prisma.momentEmailAccount.update({where:{userId},data:{status:'reconnect'}});
 await expect(saveEmailSchedule(userId,list.id,settings,now)).rejects.toThrow('Connect your Gmail');
 await prisma.momentEmailAccount.update({where:{userId},data:{status:'connected'}});
});
it('serializes competing workers so only one provider call is made',async()=>{
 const {list,schedule}=await setup();const single={send:vi.fn(async()=>({kind:'sent' as const,id:'single'}))};
 await Promise.all([runShoppingEmails(now,single),runShoppingEmails(now,single)]);
 expect(single.send).toHaveBeenCalledTimes(1);expect(await prisma.shoppingEmailRun.count({where:{scheduleId:schedule.id}})).toBe(1);await pauseEmailSchedule(userId,list.id);
});
it('sends every due schedule in one tick, beyond a single batch',async()=>{
 const due=[];for(let i=0;i<25;i++)due.push(await setup());
 const bulk={send:vi.fn(async()=>({kind:'sent' as const,id:'bulk'}))};
 expect(await runShoppingEmails(now,bulk)).toEqual({processed:25});
 await runShoppingEmails(now,bulk);expect(bulk.send).toHaveBeenCalledTimes(25);
 expect(await prisma.shoppingEmailRun.count({where:{scheduleId:{in:due.map(d=>d.schedule.id)},status:'sent'}})).toBe(25);
 for(const {list} of due)await pauseEmailSchedule(userId,list.id);
});
it('stops starting sends when the tick budget is spent and continues next tick',async()=>{
 const {list,schedule}=await setup();const p={send:vi.fn(async()=>({kind:'sent' as const,id:'later'}))};
 await runShoppingEmails(now,p,0);expect(p.send).not.toHaveBeenCalled();
 expect((await prisma.shoppingEmailRun.findFirstOrThrow({where:{scheduleId:schedule.id}})).status).toBe('pending');
 await runShoppingEmails(now,p);expect(p.send).toHaveBeenCalledTimes(1);
 expect((await prisma.shoppingEmailRun.findFirstOrThrow({where:{scheduleId:schedule.id}})).status).toBe('sent');await pauseEmailSchedule(userId,list.id);
});
