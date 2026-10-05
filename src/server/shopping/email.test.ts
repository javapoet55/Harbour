import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {prisma} from '@/server/db';
import {shoppingAction} from './service';
import {nextWeekly,scheduleInput,shoppingEmail} from './email-domain';
import {saveEmailSchedule,pauseEmailSchedule,runShoppingEmails,emailSchedule} from './email-service';
let userId='';
const now=new Date('2030-01-05T18:00:00Z'); // Saturday, 10 AM in Los Angeles
const settings={customerPhone:'+15555550123',recipient:'manager@example.com',recipientName:'Alex',timeZone:'America/Los_Angeles',weekday:6,hour:10,minute:0,consent:true};
const provider={send:vi.fn(async()=>({kind:'sent' as const,id:'provider-receipt'}))};
beforeAll(async()=>{
 vi.stubEnv('SHOPPING_EMAIL_ENABLED','true');vi.stubEnv('MOMENTS_GOOGLE_CLIENT_ID','test');vi.stubEnv('MOMENTS_GOOGLE_CLIENT_SECRET','test');vi.stubEnv('MOMENTS_GOOGLE_REDIRECT_URI','https://example.com/callback');
 const user=await prisma.user.create({data:{email:randomUUID()+'@example.com',name:'Shopper',passwordHash:''}});userId=user.id;
 await prisma.momentEmailAccount.create({data:{userId,email:user.email,refreshToken:'not-used-by-mock'}});
});
afterAll(async()=>{await prisma.user.delete({where:{id:userId}});vi.unstubAllEnvs()});
async function setup(checked=true){
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
it('only includes checked items and preserves quantities and notes',()=>{
 const mail=shoppingEmail('Alex',[{name:'Milk',quantity:'2',size:'litres',notes:'Organic',checked:true},{name:'Eggs',quantity:'1',size:'',notes:'',checked:false}]);
 expect(mail.body).toContain('Milk — 2 litres (Organic)');expect(mail.body).not.toContain('Eggs');
});
it('rejects access by another user',async()=>{const {list}=await setup();await expect(emailSchedule('other',list.id)).rejects.toThrow('not found');await expect(pauseEmailSchedule('other',list.id)).rejects.toThrow('not found');await pauseEmailSchedule(userId,list.id)});
it('sends once, stores a receipt and does not repeat on the next tick',async()=>{
 const {schedule}=await setup();provider.send.mockClear();await runShoppingEmails(now,provider);await runShoppingEmails(now,provider);
 expect(provider.send).toHaveBeenCalledTimes(1);
 const run=await prisma.shoppingEmailRun.findFirstOrThrow({where:{scheduleId:schedule.id}});expect(run.status).toBe('sent');expect(run.providerId).toBe('provider-receipt');
});
it('skips empty lists and old missed runs',async()=>{
 const {schedule}=await setup(false);await runShoppingEmails(now,provider);expect((await prisma.shoppingEmailRun.findFirstOrThrow({where:{scheduleId:schedule.id}})).status).toBe('skipped');
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
 await prisma.shoppingItem.updateMany({where:{listId:result.list!.id},data:{checked:true}});
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

it('snapshots the latest checked items at run time and excludes unchecked items',async()=>{
 const {list,schedule}=await setup(false);
 await prisma.shoppingItem.create({data:{id:randomUUID(),listId:list.id,name:'Eggs',quantity:'1',size:'dozen',notes:'Free range',category:'Dairy',checked:false}});
 await prisma.shoppingItem.updateMany({where:{listId:list.id,name:'Milk'},data:{checked:true}});
 const sender={send:vi.fn(async()=>({kind:'sent' as const,id:'selected-receipt'}))};
 await runShoppingEmails(now,sender);
 const run=await prisma.shoppingEmailRun.findFirstOrThrow({where:{scheduleId:schedule.id}});
 expect(run.body).toContain('Milk — 2 litres (No substitutions)');
 expect(run.body).not.toContain('Eggs');
 expect(sender.send).toHaveBeenCalledWith(userId,settings.recipient,run.subject,run.body,run.id);
});
it('treats both an empty list and a fully unchecked list as empty email content',()=>{
 expect(shoppingEmail('Alex',[]).empty).toBe(true);
 expect(shoppingEmail('Alex',[{name:'Milk',quantity:'1',size:'',notes:'',checked:false}]).empty).toBe(true);
});
it('validates pickup dates and one-hour windows from 9 AM through 8 PM',()=>{
 for(const extra of [{pickupDate:'2030-02-30',pickupStartHour:9},{pickupDate:'2030-01-05',pickupStartHour:20},{pickupDate:'2030-01-05',pickupStartHour:8},{pickupDate:'2030-01-05'}])expect(scheduleInput.safeParse({...settings,...extra}).success).toBe(false);
 expect(scheduleInput.safeParse({...settings,pickupDate:'2030-01-05',pickupStartHour:19}).success).toBe(true);
});
it('persists pickup preferences and includes them in the scheduled email',async()=>{
 const {list,schedule}=await setup();
 await saveEmailSchedule(userId,list.id,{...settings,pickupDate:'2030-01-06',pickupStartHour:9},new Date(+now-60000));
 const saved=await emailSchedule(userId,list.id);
 expect(saved.schedule?.pickupDate).toBe('2030-01-06');expect(saved.schedule?.pickupStartHour).toBe(9);
 await runShoppingEmails(now,provider);
 const run=await prisma.shoppingEmailRun.findFirstOrThrow({where:{scheduleId:schedule.id}});
 expect(run.body).toContain('Sun, Jan 6, 2030');expect(run.body).toContain('9 AM–10 AM PST');
 expect(run.body).toContain('Please confirm this pickup window');
});
it('advances an old pickup date weekly and formats the last window correctly',()=>{
 const mail=shoppingEmail('Alex',[{name:'Milk',quantity:'1',size:'',notes:'',checked:true}],{pickupDate:'2029-12-29',pickupStartHour:19,timeZone:settings.timeZone,runAt:now});
 expect(mail.body).toContain('Sat, Jan 5, 2030');expect(mail.body).toContain('7 PM–8 PM');
 const past=shoppingEmail('Alex',[],{pickupDate:'2030-01-05',pickupStartHour:9,timeZone:settings.timeZone,runAt:now});
 expect(past.body).toContain('Sat, Jan 12, 2030');
});

it('uses the requested template with sender identity and daylight-saving timezone',()=>{
 const mail=shoppingEmail('Sri',[{name:'Eggs',quantity:'1',size:'dozen',notes:'Organic',checked:true}],{pickupDate:'2026-10-03',pickupStartHour:9,timeZone:'America/Los_Angeles',runAt:new Date('2026-10-02T18:00:00Z')},{name:'Sender Name',phoneNumber:'+15555550123'});
 expect(mail.subject).toBe('Shopping list');
 expect(mail.body).toBe('Hi Sri,\n\nHere is my shopping list:\n\n• Eggs — 1 dozen (Organic)\n\nPreferred pickup: Sat, Oct 3, 2026 · 9 AM–10 AM PDT.\n\nPlease confirm this pickup window. Please let me know about availability and any substitutions.\n\nPlease call and email me once my items are ready to be picked up.\n\nThank you!\nSender Name\n+15555550123\nSent with NexDo');
});
it('uses the form phone instead of a different saved profile phone',async()=>{
 await prisma.userPreference.upsert({where:{userId},create:{userId,phoneNumber:'+15555550999'},update:{phoneNumber:'+15555550999'}});
 const {schedule}=await setup();await runShoppingEmails(now,provider);
 const run=await prisma.shoppingEmailRun.findFirstOrThrow({where:{scheduleId:schedule.id}});
 expect(run.body).toContain('Thank you!\nShopper\n+15555550123\nSent with NexDo');
});
it('omits missing sender details rather than printing placeholders',()=>{
 const mail=shoppingEmail('Alex',[],undefined,{name:'Shopper',phoneNumber:null});
 expect(mail.body).toContain('Thank you!\nShopper\nSent with NexDo');
 expect(mail.body).not.toContain('undefined');expect(mail.body).not.toContain('confirm this pickup window');
});

it('requires a customer phone with country code and normalizes formatting',()=>{
 for(const customerPhone of [undefined,'','4155550123','+123','+1notaphone','+0123456789'])expect(scheduleInput.safeParse({...settings,customerPhone}).success).toBe(false);
 expect(scheduleInput.parse({...settings,customerPhone:'+1 (415) 555-0123'}).customerPhone).toBe('+14155550123');
});
it('persists the form phone and returns it when reopening the schedule',async()=>{
 const {list}=await setup();
 await saveEmailSchedule(userId,list.id,{...settings,customerPhone:'+44 20 7946 0123'},now);
 expect((await emailSchedule(userId,list.id)).schedule?.customerPhone).toBe('+442079460123');
 await pauseEmailSchedule(userId,list.id);
});
it('keeps legacy schedules saved before the phone field existed sending without a number',async()=>{
 const {schedule}=await setup();await prisma.shoppingEmailSchedule.update({where:{id:schedule.id},data:{customerPhone:null}});
 const sender={send:vi.fn(async()=>({kind:'sent' as const,id:'legacy-receipt'}))};await runShoppingEmails(now,sender);
 expect(sender.send).toHaveBeenCalledTimes(1);
 expect((await prisma.shoppingEmailSchedule.findUniqueOrThrow({where:{id:schedule.id}})).enabled).toBe(true);
 const run=await prisma.shoppingEmailRun.findFirstOrThrow({where:{scheduleId:schedule.id}});
 expect(run.status).toBe('sent');expect(run.body).toContain('Thank you!\nShopper\nSent with NexDo');
});
