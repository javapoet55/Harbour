import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {prisma} from '@/server/db';
import {z} from 'zod';
import {listInput,nextShoppingDate,parseShopping} from './domain';
import {nextWeekly} from './email-domain';
import {MomentError} from '@/server/moments/domain';
import {recommendShoppingAlternatives} from './alternatives';
const include={items:{orderBy:{sortOrder:'asc' as const}}};
export async function shoppingLists(userId:string){return prisma.shoppingList.findMany({where:{userId},include,orderBy:[{date:'desc'},{createdAt:'desc'}],take:200});}
export async function shoppingAction(userId:string,raw:unknown,idempotencyKey?:string){
 const p=z.object({operation:z.enum(['create','save','delete','complete','share','revoke','parse','alternatives']),id:z.string().optional(),revision:z.number().int().nonnegative().optional(),input:z.unknown().optional()}).parse(raw);
 if(p.operation==='parse'){const {text}=z.object({text:z.string().min(1).max(12000)}).parse(p.input);return {items:parseShopping(text).map(i=>({...i,id:randomUUID()}))};}
 if(p.operation==='alternatives'){
  const input=z.object({name:z.string().trim().min(1).max(120),category:z.string().max(80).optional(),quantity:z.string().max(40).optional(),size:z.string().max(80).optional(),brand:z.string().trim().max(120).optional(),barcode:z.string().regex(/^\d{8,14}$/).optional(),goal:z.enum(['Lower fat','Lower sugar','Lower calorie','Higher protein','Lactose-free','Plant-based','Lower price']).optional()}).parse(p.input);
  return recommendShoppingAlternatives(userId,input);
 }
 if(p.operation==='create'){
  const input=listInput.parse(p.input);const {items,...data}=input;
  const id=idempotencyKey ? createHash('sha256').update(userId+':'+idempotencyKey).digest('hex') : randomUUID();
  return {list:await prisma.shoppingList.upsert({where:{id},update:{},create:{id,...data,userId,items:{create:items.map((i,sortOrder)=>({...i,id:randomUUID(),sortOrder}))}},include})};
 }
 if(!p.id)throw new MomentError('List not found.',404);
 return prisma.$transaction(async tx=>{
  const list=await tx.shoppingList.findFirst({where:{id:p.id,userId},include});
  if(!list)throw new MomentError('List not found.',404);
  if(p.operation==='share'){
   const saved=await tx.shoppingList.update({where:{id:list.id},data:{shareToken:list.shareToken??randomBytes(32).toString('hex')},include});return {list:saved};
  }
  if(p.operation==='revoke')return {list:await tx.shoppingList.update({where:{id:list.id},data:{shareToken:null},include})};
  if(p.revision!==list.revision)throw new MomentError('This list changed on another device. Refresh before saving.',409);
  const claim=await tx.shoppingList.updateMany({where:{id:list.id,userId,revision:p.revision},data:{revision:{increment:1}}});
  if(!claim.count)throw new MomentError('This list changed. Refresh and try again.',409);
  if(p.operation==='delete'){await tx.shoppingList.delete({where:{id:list.id}});return {ok:true};}
  if(p.operation==='complete'){
   if(list.completedAt)return {list};
   await tx.shoppingList.update({where:{id:list.id},data:{completedAt:new Date()}});
   if(!list.weekly)return {list:await tx.shoppingList.findUnique({where:{id:list.id},include})};
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:list.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const nextList=await tx.shoppingList.create({data:{userId,title:list.title,date:nextShoppingDate(list.date,today),timeZone:list.timeZone,weekly:true,generatedFrom:list.id,items:{create:list.items.map((i,sortOrder)=>({id:randomUUID(),name:i.name,category:i.category,quantity:i.quantity,size:i.size,notes:i.notes,imageData:i.imageData,brand:i.brand,barcode:i.barcode,favorite:i.favorite,favoriteAlternatives:i.favoriteAlternatives??undefined,checked:false,sortOrder}))}},include});
   await tx.shoppingEmailSchedule.updateMany({where:{listId:list.id},data:{updatedAt:new Date()}});
   const schedule=await tx.shoppingEmailSchedule.findUnique({where:{listId:list.id}});
   if(schedule){
    // A trip finished before its email went out skips that week instead of emailing next week's list early.
    const attached=new Date(Math.max(list.createdAt.getTime(),schedule.createdAt.getTime()));
    const skip=schedule.enabled&&!await tx.shoppingEmailRun.count({where:{scheduleId:schedule.id,dueAt:{gte:attached}}});
    if(skip)await tx.shoppingEmailRun.create({data:{scheduleId:schedule.id,dueAt:schedule.nextRunAt,retryAt:schedule.nextRunAt,status:'skipped',recipient:schedule.recipient,subject:`Shopping list: ${list.title}`,body:'',detail:'Shopping trip completed before the scheduled email'}});
    await tx.shoppingEmailSchedule.update({where:{id:schedule.id},data:{listId:nextList.id,...(skip?{nextRunAt:nextWeekly(new Date(Math.max(Date.now(),schedule.nextRunAt.getTime())),schedule)}:{})}});
   }
   return {list:nextList};
  }
  if(list.completedAt)throw new MomentError('Copy this completed list to make changes.');
  const {items,...data}=listInput.parse(p.input);
  await tx.shoppingItem.deleteMany({where:{listId:list.id}});
  // Preserve IDs already owned by this list; never accept IDs from another list.
  return {list:await tx.shoppingList.update({where:{id:list.id},data:{...data,items:{create:items.map((i,sortOrder)=>({...i,imageData:i.imageData === undefined ? list.items.find(old=>old.id===i.id)?.imageData ?? null : i.imageData,id:list.items.some(old=>old.id===i.id)?i.id:randomUUID(),sortOrder}))}},include})};
 });
}
