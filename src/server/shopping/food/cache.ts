import { createHash } from 'node:crypto';
import { prisma } from '@/server/db';
import { inc } from '@/lib/metrics';
import { foodConfig } from './config';
export const foodKey = (kind: string, value: unknown) => `food:v1:${kind}:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
type Row = {payload:string|null;schemaVersion:number;expiresAt:Date;staleUntil:Date;leaseUntil:Date};
export interface CacheStorage { read(key:string):Promise<Row|null>; claim(key:string,now:Date):Promise<boolean>; write(key:string,payload:string,expiresAt:Date,staleUntil:Date):Promise<void>; release(key:string):Promise<void> }
export const databaseStorage: CacheStorage = {
  read:key=>prisma.foodDataCache.findUnique({where:{key}}),
  async claim(key,now) {
    await prisma.foodDataCache.upsert({where:{key},update:{},create:{key,expiresAt:new Date(0),staleUntil:new Date(0),leaseUntil:new Date(0)}});
    const updated=await prisma.foodDataCache.updateMany({where:{key,leaseUntil:{lte:now}},data:{leaseUntil:new Date(+now+60000)}});
    return updated.count===1;
  },
  async write(key,payload,expiresAt,staleUntil) {await prisma.foodDataCache.update({where:{key},data:{payload,expiresAt,staleUntil,schemaVersion:1,leaseUntil:new Date(0)}});},
  async release(key) {await prisma.foodDataCache.updateMany({where:{key},data:{leaseUntil:new Date(0)}});},
};
export class FoodCache {
  private flights=new Map<string,Promise<unknown>>();
  constructor(private storage:CacheStorage=databaseStorage, private now=()=>Date.now(), private defer:(job:()=>Promise<unknown>)=>void=job=>{void job().catch(()=>{});}){}
  async get<T>(key:string,ttl:number,load:()=>Promise<T|null>):Promise<{value:T|null;stale:boolean}> {
    let row:Row|null;
    try {row=await this.storage.read(key);} catch {inc('food.cache.error');return {value:null,stale:false};} // Cache outages must not stampede providers.
    let cached:T|null=null;
    if(row?.schemaVersion===1 && row.payload!==null) {try{cached=JSON.parse(row.payload);}catch{row=null;}}
    if(row?.schemaVersion!==1)row=null;
    if(row && +row.expiresAt>this.now()){inc('food.cache.hit');return {value:cached,stale:false};}
    const stale=!!row && cached!==null && +row.staleUntil>this.now();
    const refresh=async()=>{
      if(this.flights.has(key))return this.flights.get(key) as Promise<T|null>;
      const job=(async()=>{
        const claimed=await this.storage.claim(key,new Date(this.now()));
        if(!claimed){
          // Another server owns the lease. Wait briefly for its persisted result; never duplicate upstream work.
          for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,250));const next=await this.storage.read(key);if(next?.schemaVersion===1 && next.payload!==null && +next.expiresAt>this.now())return JSON.parse(next.payload) as T|null;}
          return stale?cached:null;
        }
        try {
          // A previous owner may have completed between our initial read and claim.
          const latest=await this.storage.read(key);
          if(latest?.schemaVersion===1 && latest.payload!==null && +latest.expiresAt>this.now()) {
            try { return JSON.parse(latest.payload) as T|null; } catch { /* Refresh malformed cache data. */ }
          }
          const value=await load();const life=value===null?foodConfig().negativeTTL:ttl;
          await this.storage.write(key,JSON.stringify(value),new Date(this.now()+life*1000),new Date(this.now()+(life+(value===null?0:foodConfig().staleTTL))*1000));
          return value;
        } finally {await this.storage.release(key);}
      })();
      this.flights.set(key,job);try{return await job;}finally{this.flights.delete(key);}
    };
    if(stale){inc('food.cache.stale');this.defer(refresh);return {value:cached,stale:true};}
    inc('food.cache.miss');
    try {return {value:await refresh(),stale:false};}catch {inc('food.cache.refresh_error');return {value:stale?cached:null,stale};}
  }
}
// Shared fixed-window budgets across workers/replicas; no personal queries are stored here.
export async function providerPermit(provider:'usda'|'off_product'|'off_search'):Promise<boolean> {
  const interval=provider==='usda'?3600000:60000, limit=provider==='usda'?900:provider==='off_product'?14:9;
  const key=`food:${provider}`,now=new Date();
  try {
    await prisma.foodProviderBudget.upsert({where:{key},update:{},create:{key,count:0,resetAt:new Date(+now+interval)}});
    await prisma.foodProviderBudget.updateMany({where:{key,resetAt:{lte:now}},data:{count:0,resetAt:new Date(+now+interval)}});
    return (await prisma.foodProviderBudget.updateMany({where:{key,count:{lt:limit}},data:{count:{increment:1}}})).count===1;
  }catch {inc('food.budget.error');return false;}
}
export async function providerBackoff(provider:string,seconds:number):Promise<void> {
  await prisma.foodProviderBudget.updateMany({where:{key:`food:${provider}`},data:{count:1000000,resetAt:new Date(Date.now()+seconds*1000)}}).catch(()=>{inc('food.budget.error');});
}
