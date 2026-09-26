import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/server/db';
import { shoppingAction, shoppingLists } from '../service';
import { FoodCache, foodKey, providerPermit } from './cache';
import { USDAFoodDataClient } from './providers';
let owner='';
beforeAll(async()=>{owner=(await prisma.user.create({data:{email:`${randomUUID()}@example.test`,name:'Food data test',passwordHash:''}})).id;});
afterAll(async()=>{await prisma.user.delete({where:{id:owner}});});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('shares durable cache across service instances, versions and independent users',async()=>{
  const key=foodKey('test',randomUUID()),load=vi.fn(async()=>{await new Promise(r=>setTimeout(r,30));return {source:'USDA',value:42};});
  const a=new FoodCache(),b=new FoodCache();
  const results=await Promise.all([a.get(key,60,load),b.get(key,60,load)]);
  expect(load).toHaveBeenCalledTimes(1);expect(results[0].value).toEqual(results[1].value);
  expect((await new FoodCache().get(key,60,load)).value).toMatchObject({value:42});expect(load).toHaveBeenCalledTimes(1);
});
it('retrieves facts through the existing shopping API action and persists a targeted swap and favorites',async()=>{
  vi.stubEnv('USDA_FDC_API_KEY','fixture-private');
  const provider=new USDAFoodDataClient({permit:async()=>true,sleep:async()=>{},fetch:async(input)=>{
    const url=String(input);return new Response(JSON.stringify(url.includes('/foods/search')?{foods:[{fdcId:987654321,description:'Milk, whole, fluid',dataType:'SR Legacy'}]}:{fdcId:987654321,description:'Milk, whole, fluid',foodNutrients:[{nutrient:{id:1004,unitName:'g'},amount:3.25}]}));
  }});
  const facts=await provider.search({name:'whole milk'});expect(facts?.nutrition?.totalFat).toBe(3.25);
  // Prepopulate the same durable contract used by the real provider; API must consume it without an upstream request.
  await new FoodCache().get(foodKey('search-v3',{name:'whole milk'}),60,async()=>facts);
  const result=await shoppingAction(owner,{operation:'alternatives',input:{name:'Whole Milk',category:'Dairy & Eggs'}});
  expect(result).toMatchObject({originalFacts:{source:'USDA',matchQuality:'representative_generic'}});
  const item={id:randomUUID(),name:'Whole Milk',category:'Dairy & Eggs',quantity:'2',size:'gallon',notes:'Keep cold',checked:true};
  const input={title:'Groceries',date:'2026-09-25',timeZone:'UTC',weekly:true,items:[item]};
  const created=await shoppingAction(owner,{operation:'create',input});if(!('list' in created)||!created.list)throw Error('Missing list');
  const before=(await shoppingLists(owner)).find(v=>v.id===created.list!.id)!;
  const replacement={...before.items[0],name:'2% Milk',barcode:'0123456789012',brand:'Example',favorite:true,favoriteAlternatives:['1% milk|Dairy & Eggs|1|gallon']};
  await shoppingAction(owner,{operation:'save',id:before.id,revision:before.revision,input:{...input,items:[replacement]}});
  const saved=(await shoppingLists(owner)).find(v=>v.id===before.id)!;
  expect(saved.items).toHaveLength(1);expect(saved.items[0]).toMatchObject({id:before.items[0].id,name:'2% Milk',quantity:'2',checked:true,notes:'Keep cold',favorite:true,barcode:'0123456789012',favoriteAlternatives:replacement.favoriteAlternatives});
  expect(saved.weekly).toBe(true);
});
it('enforces a shared provider budget rather than per-user limits',async()=>{
  await prisma.foodProviderBudget.deleteMany({where:{key:'food:off_search'}});
  const allowed=await Promise.all(Array.from({length:12},()=>providerPermit('off_search')));
  expect(allowed.filter(Boolean)).toHaveLength(9);
});
