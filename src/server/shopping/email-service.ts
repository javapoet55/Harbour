import {prisma} from '@/server/db';
import {MomentError} from '@/server/moments/domain';
import {gmail,emailConfigured, type WishEmailProvider} from '@/server/moments/email';
import {nextWeekly,scheduleInput,shoppingEmail} from './email-domain';
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
  return tx.shoppingEmailSchedule.upsert({where:{listId},create:{listId,...settings,consentAt:now,nextRunAt:nextWeekly(now,settings)},update:{...settings,enabled:true,consentAt:now,nextRunAt:nextWeekly(now,settings)}});
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
export async function runShoppingEmails(now=new Date(),provider:WishEmailProvider=gmail){
 if(!active())return {processed:0};
 // A crashed sender may already have submitted: do not risk sending the same email twice.
 await prisma.shoppingEmailRun.updateMany({where:{status:'sending',updatedAt:{lt:new Date(now.getTime()-10*60000)}},data:{status:'uncertain',detail:'Delivery could not be verified. Check your Gmail Sent folder.'}});
 const due=await prisma.shoppingEmailSchedule.findMany({where:{enabled:true,nextRunAt:{lte:now}},take:20,orderBy:{nextRunAt:'asc'}});
 for(const s of due){
  await prisma.$transaction(async tx=>{
   const claim=await tx.shoppingEmailSchedule.updateMany({where:{id:s.id,enabled:true,nextRunAt:s.nextRunAt},data:{nextRunAt:nextWeekly(now,s)}});
   if(!claim.count)return;
   const list=await tx.shoppingList.findUniqueOrThrow({where:{id:s.listId},include:{items:{orderBy:{sortOrder:'asc'}}}});
   const mail=shoppingEmail(list.title,s.recipientName,list.items);
   const stale=now.getTime()-s.nextRunAt.getTime()>24*3600000;
   const skip=mail.empty||!!list.completedAt||stale;
   await tx.shoppingEmailRun.create({data:{scheduleId:s.id,dueAt:s.nextRunAt,retryAt:now,recipient:s.recipient,subject:mail.subject,body:mail.body,status:skip?'skipped':'pending',detail:stale?'Missed run is more than 24 hours old':list.completedAt?'Shopping trip completed':mail.empty?'No unpurchased items':null}});
  });
 }
 await prisma.shoppingEmailRun.updateMany({where:{status:'pending',dueAt:{lt:new Date(now.getTime()-24*3600000)}},data:{status:'skipped',detail:'Queued email is more than 24 hours old'}});
 const jobs=await prisma.shoppingEmailRun.findMany({where:{status:'pending',retryAt:{lte:now},schedule:{enabled:true}},include:{schedule:{include:{list:true}}},take:1,orderBy:{retryAt:'asc'}});
 let processed=0;
 for(const job of jobs){
  const claim=await prisma.$transaction(async tx=>{
   const lock=await tx.shoppingEmailSchedule.updateMany({where:{id:job.scheduleId,enabled:true},data:{updatedAt:now}});
   if(!lock.count)return {count:0};
   return tx.shoppingEmailRun.updateMany({where:{id:job.id,status:'pending'},data:{status:'sending',attempts:{increment:1}}});
  });if(!claim.count)continue;
  const result=await provider.send(job.schedule.list.userId,job.recipient,job.subject,job.body,job.id).catch(()=>({kind:'uncertain' as const,error:'Delivery could not be verified. Check your Gmail Sent folder.'}));
  const retry=result.kind==='retry'&&job.attempts<2&&now.getTime()-job.dueAt.getTime()<24*3600000;
  await prisma.shoppingEmailRun.update({where:{id:job.id},data:{status:retry?'pending':result.kind==='retry'?'failed':result.kind==='permanent'?'failed':result.kind,providerId:result.kind==='sent'?result.id:null,detail:result.kind==='sent'?'Accepted by Gmail; store confirmation is separate.':result.error,retryAt:new Date(now.getTime()+5*60000)}});
  if(result.kind==='reconnect')await prisma.shoppingEmailSchedule.update({where:{id:job.scheduleId},data:{enabled:false}});
  processed++;
 }
 return {processed};
}
