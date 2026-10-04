import {prisma} from '@/server/db';
import {log} from '@/lib/logger';
import {MomentError} from '@/server/moments/domain';
import {gmail,emailConfigured, type WishEmailProvider} from '@/server/moments/email';
import {nextWeekly,scheduleInput,shoppingEmail} from './email-domain';
const WEEK_MS=7*86400000;
const active=()=>process.env.SHOPPING_EMAIL_ENABLED==='true';
async function owned(userId:string,listId:string){
 const list=await prisma.shoppingList.findFirst({where:{id:listId,userId},include:{items:{orderBy:{sortOrder:'asc'}}}});
 if(!list)throw new MomentError('List not found.',404);return list;
}
export async function emailSchedule(userId:string,listId:string){
 await owned(userId,listId);
 const [schedule,account]=await Promise.all([
  prisma.shoppingEmailSchedule.findUnique({where:{listId},include:{runs:{orderBy:{dueAt:'desc'},take:10}}}),
  prisma.momentEmailAccount.findUnique({where:{userId},select:{email:true,status:true}}),
 ]);
 return {schedule,account,available:active()&&emailConfigured()};
}
export async function saveEmailSchedule(userId:string,listId:string,raw:unknown,now=new Date()){
 const input=scheduleInput.parse(raw);const list=await owned(userId,listId);
 if(list.completedAt)throw new MomentError('Schedule email on your current shopping list.');
 if(!active()||!emailConfigured())throw new MomentError('Weekly shopping email is not enabled on this server.',503);
 const account=await prisma.momentEmailAccount.findUnique({where:{userId}});
 if(account?.status!=='connected')throw new MomentError('Connect your Gmail account before scheduling.',409);
 const {consent,...settings}=input;void consent;
 return prisma.$transaction(async tx=>{
  await tx.shoppingEmailSchedule.updateMany({where:{listId},data:{updatedAt:now}});
  const previous=await tx.shoppingEmailSchedule.findUnique({where:{listId}});
  if(previous){
   if(await tx.shoppingEmailRun.count({where:{scheduleId:previous.id,status:'sending'}}))throw new MomentError('An email is being sent. Try again shortly.',409);
   await tx.shoppingEmailRun.updateMany({where:{scheduleId:previous.id,status:'pending'},data:{status:'cancelled',detail:'Schedule changed'}});
  }
  // Editing after this week's email went out (or was skipped) must not send another one within the same 7 days.
  const last=previous&&await tx.shoppingEmailRun.findFirst({where:{scheduleId:previous.id,status:{in:['sent','uncertain','skipped']}},orderBy:{dueAt:'desc'}});
  const nextRunAt=nextWeekly(last?new Date(Math.max(now.getTime(),last.dueAt.getTime()+WEEK_MS-1)):now,settings);
  return tx.shoppingEmailSchedule.upsert({where:{listId},create:{listId,...settings,consentAt:now,nextRunAt},update:{...settings,enabled:true,consentAt:now,nextRunAt}});
 });
}
export async function pauseEmailSchedule(userId:string,listId:string){
 await owned(userId,listId);
 return prisma.$transaction(async tx=>{
  await tx.shoppingEmailSchedule.updateMany({where:{listId},data:{updatedAt:new Date()}});
  const s=await tx.shoppingEmailSchedule.findUnique({where:{listId}});if(!s)return;
  if(await tx.shoppingEmailRun.count({where:{scheduleId:s.id,status:'sending'}}))throw new MomentError('An email is already being sent. Try again shortly.',409);
  await tx.shoppingEmailSchedule.update({where:{id:s.id},data:{enabled:false}});
  await tx.shoppingEmailRun.updateMany({where:{scheduleId:s.id,status:'pending'},data:{status:'cancelled',detail:'Schedule paused'}});
 });
}
// Used when the shared Gmail account is disconnected, so schedules don't keep showing as active.
export const shoppingEmailSending=(userId:string)=>prisma.shoppingEmailRun.count({where:{status:'sending',schedule:{list:{userId}}}});
export function stopShoppingEmails(userId:string){
 return [
  prisma.shoppingEmailRun.updateMany({where:{status:'pending',schedule:{list:{userId}}},data:{status:'cancelled',detail:'Gmail disconnected'}}),
  prisma.shoppingEmailSchedule.updateMany({where:{enabled:true,list:{userId}},data:{enabled:false}}),
 ] as const;
}
const RUN_RETENTION_MS=90*86400000, TERMINAL=['sent','skipped','cancelled','failed','uncertain','reconnect'];
const errorName=(e:unknown)=>e instanceof Error?e.name:'Error';
// Token refresh plus send can take ~35s, so new sends stop early enough to finish within the worker's 55s request timeout.
const SEND_BUDGET_MS=20000, SEND_CONCURRENCY=5, QUEUE_BATCH=50;
type DueSchedule={id:string;listId:string;recipient:string;recipientName:string;timeZone:string;weekday:number;hour:number;minute:number;nextRunAt:Date;pickupDate:string|null;pickupStartHour:number|null;customerPhone:string|null};
async function queueRun(s:DueSchedule,now:Date){
 await prisma.$transaction(async tx=>{
  const claim=await tx.shoppingEmailSchedule.updateMany({where:{id:s.id,enabled:true,nextRunAt:s.nextRunAt},data:{nextRunAt:nextWeekly(now,s)}});
  if(!claim.count)return;
  const list=await tx.shoppingList.findUniqueOrThrow({where:{id:s.listId},include:{items:{orderBy:{sortOrder:'asc'}}}});
  const sender=await tx.user.findUniqueOrThrow({where:{id:list.userId},select:{name:true}});
  const mail=shoppingEmail(list.title,s.recipientName,list.items,{pickupDate:s.pickupDate,pickupStartHour:s.pickupStartHour,timeZone:s.timeZone,runAt:now},{name:sender.name,phoneNumber:s.customerPhone});
  const stale=now.getTime()-s.nextRunAt.getTime()>24*3600000;
  const missingPhone=!s.customerPhone;
  if(missingPhone)await tx.shoppingEmailSchedule.update({where:{id:s.id},data:{enabled:false}});
  const skip=mail.empty||!!list.completedAt||stale||missingPhone;
  await tx.shoppingEmailRun.create({data:{scheduleId:s.id,dueAt:s.nextRunAt,retryAt:now,recipient:s.recipient,subject:mail.subject,body:mail.body,status:skip?'skipped':'pending',detail:missingPhone?'Add your phone number in Share List and save to resume emails':stale?'Missed run is more than 24 hours old':list.completedAt?'Shopping trip completed':mail.empty?'No selected items':null}});
 });
}
const findJob=(now:Date,failed:Set<string>)=>prisma.shoppingEmailRun.findFirst({where:{status:'pending',retryAt:{lte:now},schedule:{enabled:true},id:{notIn:[...failed]}},include:{schedule:{include:{list:true}}},orderBy:{retryAt:'asc'}});
type Job=NonNullable<Awaited<ReturnType<typeof findJob>>>;
// A job that errors is skipped for the rest of the tick; one stuck in 'sending' becomes 'uncertain' after 10 minutes.
async function sendNext(now:Date,provider:WishEmailProvider,failed:Set<string>){
 const job=await findJob(now,failed);
 if(!job)return 'empty';
 try{return await send(job,now,provider)}
 catch(e){failed.add(job.id);log('error','shopping_email_send_failed',{runId:job.id,error:errorName(e)});return 'error'}
}
async function send(job:Job,now:Date,provider:WishEmailProvider){
 const claim=await prisma.$transaction(async tx=>{
  const lock=await tx.shoppingEmailSchedule.updateMany({where:{id:job.scheduleId,enabled:true},data:{updatedAt:now}});
  if(!lock.count)return {count:0};
  return tx.shoppingEmailRun.updateMany({where:{id:job.id,status:'pending',attempts:job.attempts},data:{status:'sending',attempts:{increment:1}}});
 });if(!claim.count)return 'claimed';
 const result=await provider.send(job.schedule.list.userId,job.recipient,job.subject,job.body,job.id).catch(()=>({kind:'uncertain' as const,error:'Delivery could not be verified. Check your Gmail Sent folder.'}));
 const retry=result.kind==='retry'&&job.attempts<2&&now.getTime()-job.dueAt.getTime()<24*3600000;
 await prisma.shoppingEmailRun.update({where:{id:job.id},data:{status:retry?'pending':result.kind==='retry'?'failed':result.kind==='permanent'?'failed':result.kind,providerId:result.kind==='sent'?result.id:null,detail:result.kind==='sent'?'Accepted by Gmail; store confirmation is separate.':result.kind==='permanent'?`${result.error} Check the recipient, then save the schedule to resume.`:result.error,retryAt:new Date(now.getTime()+5*60000)}});
 // Retrying a rejected address or revoked access every week would fail the same way; the user must re-save.
 if(result.kind==='reconnect'||result.kind==='permanent')await prisma.shoppingEmailSchedule.update({where:{id:job.scheduleId},data:{enabled:false}});
 return 'processed';
}
export async function runShoppingEmails(now=new Date(),provider:WishEmailProvider=gmail,budgetMs=SEND_BUDGET_MS){
 if(!active())return {processed:0};
 // A crashed sender may already have submitted: do not risk sending the same email twice.
 await prisma.shoppingEmailRun.updateMany({where:{status:'sending',updatedAt:{lt:new Date(now.getTime()-10*60000)}},data:{status:'uncertain',detail:'Delivery could not be verified. Check your Gmail Sent folder.'}});
 await prisma.shoppingEmailRun.deleteMany({where:{status:{in:TERMINAL},retryAt:{lt:new Date(now.getTime()-RUN_RETENTION_MS)}}});
 // Every queued schedule moves to next week, so this drains all due schedules. A schedule that errors is
 // left due for the next tick and skipped for the rest of this one, so it cannot hold up everyone else.
 const failedSchedules:string[]=[];
 for(;;){
  const due=await prisma.shoppingEmailSchedule.findMany({where:{enabled:true,nextRunAt:{lte:now},id:{notIn:failedSchedules}},take:QUEUE_BATCH,orderBy:{nextRunAt:'asc'}});
  for(const s of due)await queueRun(s,now).catch(e=>{failedSchedules.push(s.id);log('error','shopping_email_queue_failed',{scheduleId:s.id,error:errorName(e)})});
  if(due.length<QUEUE_BATCH)break;
 }
 await prisma.shoppingEmailRun.updateMany({where:{status:'pending',dueAt:{lt:new Date(now.getTime()-24*3600000)}},data:{status:'skipped',detail:'Queued email is more than 24 hours old'}});
 const deadline=Date.now()+budgetMs,failedRuns=new Set<string>();let processed=0;
 await Promise.all(Array.from({length:SEND_CONCURRENCY},async()=>{
  while(Date.now()<deadline){const r=await sendNext(now,provider,failedRuns);if(r==='empty')return;if(r==='processed')processed++;}
 }));
 return {processed};
}
