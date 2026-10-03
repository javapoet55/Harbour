import {randomUUID} from 'node:crypto';
import {prisma} from '@/server/db';
import {Prisma} from '@/generated/prisma';
import {MomentError} from '@/server/moments/domain';
import {matchOffer,sourceForStore} from './domain';
import {collectCostco,COSTCO_SOURCE} from './costco';
const SOURCE='costco-us-warehouse';
export async function listOffers(userId:string,listId:string,now=new Date()){
 const list=await prisma.shoppingList.findFirst({where:{id:listId,userId},include:{items:true}});
 if(!list)throw new MomentError('List not found',404);
 const sourceId=sourceForStore(list.storeName,list.storeZip);
 if(!sourceId)return {matches:[],status:!list.storeName||!list.storeZip?'Add your store name, address and ZIP code in List Settings.':'Verified offers are not yet available for this store location.',lastCheckedAt:null,sourceURL:null};
 const source=await prisma.shoppingOfferSource.findUnique({where:{id:sourceId}});
 const fresh=source?.lastSuccessAt && +now-+source.lastSuccessAt<=48*3600000;
 const offers=fresh?await prisma.shoppingOffer.findMany({where:{sourceId,startsAt:{lte:now},expiresAt:{gt:now}}}):[];
 const matches=list.items.flatMap(item=>offers.flatMap(offer=>{
  const match=matchOffer(item,offer);return match?[{itemId:item.id,itemName:item.name,...match,offer:{...offer,store:source!.store},selected:(item.chosenOffer as {id?:string}|null)?.id===offer.id}]:[];
 }));
 return {matches,lastCheckedAt:source?.lastCheckedAt??null,sourceURL:COSTCO_SOURCE,status:!source?.lastSuccessAt?'Offers are awaiting their first verified daily check.':!fresh?'Offer checks are delayed. Deals are hidden until refreshed.':source.error?'Last check failed; showing previously verified, unexpired offers.':'Warehouse offers for the contiguous US. Availability may vary by store.'};
}
export async function chooseOffer(userId:string,listId:string,itemId:string,offerId:string|null,revision:number){
 return prisma.$transaction(async tx=>{
  const list=await tx.shoppingList.findFirst({where:{id:listId,userId},include:{items:true}});
  if(!list||!list.items.some(i=>i.id===itemId))throw new MomentError('List item not found',404);
  if(list.completedAt)throw new MomentError('This trip is complete',409);
  let selection:Prisma.InputJsonValue|typeof Prisma.DbNull=Prisma.DbNull;
  if(offerId){
   const now=new Date(),sourceId=sourceForStore(list.storeName,list.storeZip);
   const offer=sourceId?await tx.shoppingOffer.findFirst({where:{id:offerId,sourceId,startsAt:{lte:now},expiresAt:{gt:now},source:{lastSuccessAt:{gte:new Date(+now-48*3600000)}}},include:{source:true}}):null;
   if(!offer||!matchOffer(list.items.find(i=>i.id===itemId)!,offer))throw new MomentError('This offer is no longer available. Refresh offers.',409);
   selection={id:offer.id,product:offer.product,brand:offer.brand,packageSize:offer.packageSize,store:offer.source.store,sourceURL:offer.sourceURL,expiresAt:offer.expiresAt.toISOString()};
  }
  const claim=await tx.shoppingList.updateMany({where:{id:listId,userId,revision},data:{revision:{increment:1}}});
  if(!claim.count)throw new MomentError('Your list changed. Refresh before choosing an offer.',409);
  await tx.shoppingItem.update({where:{id:itemId},data:{chosenOffer:selection}});
  return {list:await tx.shoppingList.findUnique({where:{id:listId},include:{items:{orderBy:{sortOrder:'asc'}}}})};
 });
}
export async function collectOffers(collector=collectCostco,now=new Date()){
 if(process.env.SHOPPING_OFFERS_ENABLED!=='true')return {disabled:true};
 await prisma.shoppingOfferSource.upsert({where:{id:SOURCE},update:{},create:{id:SOURCE,store:'Costco',region:'US contiguous warehouses',url:COSTCO_SOURCE,nextCheckAt:now}});
 const token=randomUUID();
 const claim=await prisma.shoppingOfferSource.updateMany({where:{id:SOURCE,nextCheckAt:{lte:now},OR:[{leaseUntil:null},{leaseUntil:{lt:now}}]},data:{leaseUntil:new Date(+now+120000),leaseToken:token}});
 if(!claim.count)return {claimed:false};
 try{
  const offers=await collector();
  await prisma.$transaction(async tx=>{
   const owns=await tx.shoppingOfferSource.updateMany({where:{id:SOURCE,leaseToken:token},data:{lastCheckedAt:now,lastSuccessAt:now,nextCheckAt:new Date(+now+86400000),leaseToken:null,leaseUntil:null,error:null,failures:0}});
   if(!owns.count)throw new Error('Collection lease replaced');
   // One authoritative snapshot per region, reused by every customer. Expired deals disappear on reads as well.
   await tx.shoppingOffer.deleteMany({where:{sourceId:SOURCE}});
   for(const offer of offers.filter(o=>o.expiresAt>now))await tx.shoppingOffer.create({data:{...offer,sourceId:SOURCE}});
  });
  return {checked:true,count:offers.length};
 }catch{
  const source=await prisma.shoppingOfferSource.findUnique({where:{id:SOURCE}});
  const failures=(source?.failures??0)+1;
  await prisma.shoppingOfferSource.updateMany({where:{id:SOURCE,leaseToken:token},data:{lastCheckedAt:now,error:'Source check failed; retry scheduled',failures,nextCheckAt:new Date(+now+Math.min(6*3600000,15*60000*2**Math.min(failures-1,5))),leaseToken:null,leaseUntil:null}});
  return {checked:false,retrying:true};
 }
}
