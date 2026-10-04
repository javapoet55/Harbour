import {randomUUID} from 'node:crypto';
import {prisma} from '@/server/db';
import {Prisma} from '@/generated/prisma';
import {log} from '@/lib/logger';
import {MomentError} from '@/server/moments/domain';
import {matchOffer,sourceForList,storeForName,type OfferProvider,type OfferRecord,type OfferSourceDef} from './domain';
import {collectCostco,COSTCO_SOURCE} from './costco';
import {collectFlipp} from './flipp';
const COSTCO:OfferSourceDef={provider:'costco',id:'costco-us-warehouse',store:'Costco',region:'US contiguous warehouses'};
const SOURCE_URL:Record<OfferProvider,string>={costco:COSTCO_SOURCE,flipp:'https://www.safeway.com/weeklyad'};
const FRESH=48*3600000;
type Collector=(def:OfferSourceDef,now:Date)=>Promise<OfferRecord[]>;
const collectors:Record<OfferProvider,Collector>={costco:async()=>collectCostco(),flipp:(def,now)=>collectFlipp(def,now)};
export async function listOffers(userId:string,listId:string,now=new Date()){
 const list=await prisma.shoppingList.findFirst({where:{id:listId,userId},include:{items:true}});
 if(!list)throw new MomentError('List not found',404);
 const src=sourceForList(list.storeName,list.storeZip);
 if(!src)return {matches:[],status:!list.storeName||!list.storeZip?'Add your store name, address and ZIP code in List Settings.':!storeForName(list.storeName)?'Offers are available for Costco, Safeway, Albertsons, Vons, Jewel-Osco and other supported stores.':'Offers are not available for this store location.',lastCheckedAt:null,sourceURL:null};
 const source=await prisma.shoppingOfferSource.findUnique({where:{id:src.id}});
 const fresh=source?.lastSuccessAt && +now-+source.lastSuccessAt<=FRESH;
 const offers=fresh?await prisma.shoppingOffer.findMany({where:{sourceId:src.id,startsAt:{lte:now},expiresAt:{gt:now}}}):[];
 const matches=list.items.flatMap(item=>offers.flatMap(offer=>{
  const match=matchOffer(item,offer);return match?[{itemId:item.id,itemName:item.name,...match,offer:{...offer,store:source!.store},selected:(item.chosenOffer as {id?:string}|null)?.id===offer.id}]:[];
 }));
 return {matches,lastCheckedAt:source?.lastCheckedAt??null,sourceURL:source?.url??SOURCE_URL[src.provider],status:!source?.lastSuccessAt?'Offers are awaiting their first verified daily check.':!fresh?'Offer checks are delayed. Deals are hidden until refreshed.':source.error?'Last check failed; showing previously verified, unexpired offers.':src.provider==='costco'?'Warehouse offers for the contiguous US. Availability may vary by store.':`Weekly Ad offers for ${src.store} near ZIP ${src.zip}. Prices and loyalty terms vary by store.`};
}
export async function chooseOffer(userId:string,listId:string,itemId:string,offerId:string|null,revision:number){
 return prisma.$transaction(async tx=>{
  const list=await tx.shoppingList.findFirst({where:{id:listId,userId},include:{items:true}});
  if(!list||!list.items.some(i=>i.id===itemId))throw new MomentError('List item not found',404);
  if(list.completedAt)throw new MomentError('This trip is complete',409);
  let selection:Prisma.InputJsonValue|typeof Prisma.DbNull=Prisma.DbNull;
  if(offerId){
   const now=new Date(),src=sourceForList(list.storeName,list.storeZip);
   const offer=src?await tx.shoppingOffer.findFirst({where:{id:offerId,sourceId:src.id,startsAt:{lte:now},expiresAt:{gt:now},source:{lastSuccessAt:{gte:new Date(+now-FRESH)}}},include:{source:true}}):null;
   if(!offer||!matchOffer(list.items.find(i=>i.id===itemId)!,offer))throw new MomentError('This offer is no longer available. Refresh offers.',409);
   selection={id:offer.id,product:offer.product,brand:offer.brand,packageSize:offer.packageSize,store:offer.source.store,sourceURL:offer.sourceURL,expiresAt:offer.expiresAt.toISOString()};
  }
  const claim=await tx.shoppingList.updateMany({where:{id:listId,userId,revision},data:{revision:{increment:1}}});
  if(!claim.count)throw new MomentError('Your list changed. Refresh before choosing an offer.',409);
  await tx.shoppingItem.update({where:{id:itemId},data:{chosenOffer:selection}});
  return {list:await tx.shoppingList.findUnique({where:{id:listId},include:{items:{orderBy:{sortOrder:'asc'}}}})};
 });
}
async function collectSource(src:OfferSourceDef,collect:Collector,now:Date){
 const token=randomUUID();
 const claim=await prisma.shoppingOfferSource.updateMany({where:{id:src.id,nextCheckAt:{lte:now},OR:[{leaseUntil:null},{leaseUntil:{lt:now}}]},data:{leaseUntil:new Date(+now+120000),leaseToken:token}});
 if(!claim.count)return {sourceId:src.id,claimed:false};
 try{
  const offers=await collect(src,now);
  await prisma.$transaction(async tx=>{
   const owns=await tx.shoppingOfferSource.updateMany({where:{id:src.id,leaseToken:token},data:{lastCheckedAt:now,lastSuccessAt:now,nextCheckAt:new Date(+now+86400000),leaseToken:null,leaseUntil:null,error:null,failures:0}});
   if(!owns.count)throw new Error('Collection lease replaced');
   // One authoritative snapshot per source, reused by every customer. Expired deals disappear on reads as well.
   await tx.shoppingOffer.deleteMany({where:{sourceId:src.id}});
   for(const offer of offers.filter(o=>o.expiresAt>now))await tx.shoppingOffer.create({data:{...offer,sourceId:src.id}});
  });
  return {sourceId:src.id,checked:true,count:offers.length};
 }catch(e){
  // Only the reason is logged: no page content or customer data.
  log('error','shopping_offers_check_failed',{sourceId:src.id,error:e instanceof Error?e.message:'unknown'});
  const source=await prisma.shoppingOfferSource.findUnique({where:{id:src.id}});
  const failures=(source?.failures??0)+1;
  await prisma.shoppingOfferSource.updateMany({where:{id:src.id,leaseToken:token},data:{lastCheckedAt:now,error:'Source check failed; retry scheduled',failures,nextCheckAt:new Date(+now+Math.min(6*3600000,15*60000*2**Math.min(failures-1,5))),leaseToken:null,leaseUntil:null}});
  return {sourceId:src.id,checked:false,retrying:true};
 }
}
export async function collectOffers(now=new Date(),extra:Partial<Record<OfferProvider,Collector>>={}){
 if(process.env.SHOPPING_OFFERS_ENABLED!=='true')return {disabled:true};
 // Sources exist only for stores and ZIPs customers actually use; sources no list uses are removed.
 const wanted=new Map([[COSTCO.id,COSTCO] as const]);
 for(const l of await prisma.shoppingList.findMany({where:{storeName:{not:null},storeZip:{not:null}},select:{storeName:true,storeZip:true},distinct:['storeName','storeZip']})){
  const s=sourceForList(l.storeName,l.storeZip);if(s)wanted.set(s.id,s);
 }
 for(const s of wanted.values())await prisma.shoppingOfferSource.upsert({where:{id:s.id},update:{store:s.store,region:s.region,url:SOURCE_URL[s.provider]},create:{id:s.id,store:s.store,region:s.region,url:SOURCE_URL[s.provider],nextCheckAt:now}});
 await prisma.shoppingOfferSource.deleteMany({where:{id:{notIn:[...wanted.keys()]}}});
 const due=await prisma.shoppingOfferSource.findMany({where:{id:{in:[...wanted.keys()]},nextCheckAt:{lte:now},OR:[{leaseUntil:null},{leaseUntil:{lt:now}}]},orderBy:{nextCheckAt:'asc'},take:10});
 const results=[];
 for(const s of due)results.push(await collectSource(wanted.get(s.id)!,extra[COSTCO.id===s.id?'costco':'flipp']??collectors[COSTCO.id===s.id?'costco':'flipp'],now));
 return {claimed:results.length,results};
}
