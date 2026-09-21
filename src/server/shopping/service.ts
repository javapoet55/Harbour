import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {prisma} from '@/server/db';
import {z} from 'zod';
import {listInput,nextShoppingDate,parseShopping} from './domain';
import {MomentError} from '@/server/moments/domain';
import {recommendShoppingAlternatives} from './alternatives';
const include={items:{orderBy:{sortOrder:'asc' as const}}};
export async function shoppingLists(userId:string){return prisma.shoppingList.findMany({where:{userId},include,orderBy:[{date:'desc'},{createdAt:'desc'}],take:200});}
export async function shoppingAction(userId:string,raw:unknown,idempotencyKey?:string){
 const p=z.object({operation:z.enum(['create','save','delete','complete','share','revoke','parse','alternatives']),id:z.string().optional(),revision:z.number().int().nonnegative().optional(),input:z.unknown().optional()}).parse(raw);
 if(p.operation==='parse'){const {text}=z.object({text:z.string().min(1).max(12000)}).parse(p.input);return {items:parseShopping(text).map(i=>({...i,id:randomUUID()}))};}
 if(p.operation==='alternatives'){
  const input=z.object({name:z.string().trim().min(1).max(120),category:z.string().max(80).optional(),quantity:z.string().max(40).optional(),size:z.string().max(80).optional()}).parse(p.input);
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
   return {list:await tx.shoppingList.create({data:{userId,title:list.title,date:nextShoppingDate(list.date,today),timeZone:list.timeZone,weekly:true,generatedFrom:list.id,items:{create:list.items.map((i,sortOrder)=>({id:randomUUID(),name:i.name,category:i.category,quantity:i.quantity,size:i.size,notes:i.notes,imageData:i.imageData,checked:false,sortOrder}))}},include})};
  }
  if(list.completedAt)throw new MomentError('Copy this completed list to make changes.');
  const {items,...data}=listInput.parse(p.input);
  await tx.shoppingItem.deleteMany({where:{listId:list.id}});
  // Always allocate server IDs so a client cannot move another list's items.
  return {list:await tx.shoppingList.update({where:{id:list.id},data:{...data,items:{create:items.map((i,sortOrder)=>({...i,imageData:i.imageData === undefined ? list.items.find(old=>old.id===i.id)?.imageData ?? null : i.imageData,id:randomUUID(),sortOrder}))}},include})};
 });
}
