import { afterEach, describe, expect, it, vi } from 'vitest';
import { CacheStorage, FoodCache, foodKey } from './cache';
import { baseFacts, compare, normalizeQuery } from './model';
import { matchUSDA, normalizeOFF, normalizeUSDA, OpenFoodFactsClient, providerRequest, USDAFoodDataClient } from './providers';
import { ProductDataService } from './service';
import { explain, statements } from './explanation';

const usda=(fat=3.25)=>({fdcId:171265,description:'Milk, whole, 3.25% milkfat, with added vitamin D',dataType:'SR Legacy',foodNutrients:[{nutrient:{id:1008,unitName:'kcal'},amount:61},{nutrient:{id:1003,unitName:'g'},amount:3.15},{nutrient:{id:1004,unitName:'g'},amount:fat},{nutrient:{id:1093,unitName:'mg'},amount:43},{nutrient:{id:1087,unitName:'mg'},amount:113}]});
const off=()=>({code:'0123456789012',product_name:'Whole Milk',brands:'Example',nutrition_data_per:'100g',nutriments:{'energy-kcal_100g':61,proteins_100g:3.15,fat_100g:3.25,sodium_100g:0.043,calcium_100g:0.113},ingredients_text:'Milk, vitamin D',allergens_tags:['en:milk'],traces_tags:['en:peanuts'],labels_tags:['en:vegetarian'],ingredients_analysis_tags:['en:vegan'],last_modified_t:1700000000});
function memory(){const rows=new Map<string,NonNullable<Awaited<ReturnType<CacheStorage['read']>>>>();const storage:CacheStorage={read:async k=>rows.get(k)||null,claim:async(k,n)=>{const r=rows.get(k);if(r && +r.leaseUntil>+n)return false;rows.set(k,{...(r||{payload:null,schemaVersion:1,expiresAt:new Date(0),staleUntil:new Date(0)}),leaseUntil:new Date(+n+60000)});return true;},write:async(k,p,e,s)=>{rows.set(k,{payload:p,schemaVersion:1,expiresAt:e,staleUntil:s,leaseUntil:new Date(0)});},release:async k=>{const r=rows.get(k);if(r)r.leaseUntil=new Date(0);}};return {storage,rows};}
const generic=()=>normalizeUSDA(usda(),'representative_generic')!;
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

it('reuses a cache result completed between reading and acquiring its lease',async()=>{
  const {storage}=memory();
  const claim=storage.claim;
  storage.claim=async(key,now)=>{
    const acquired=await claim(key,now);
    await storage.write(key,JSON.stringify({value:42}),new Date(Date.now()+60000),new Date(Date.now()+120000));
    return acquired;
  };
  const load=vi.fn(async()=>({value:99}));
  expect((await new FoodCache(storage).get('race',60,load)).value).toEqual({value:42});
  expect(load).not.toHaveBeenCalled();
});

describe('food normalization and matching',()=>{
  it('matches fresh tomato varieties to representative raw tomatoes without matching cooked or branded products',async()=>{
    const raw={fdcId:170457,description:'Tomatoes, red, ripe, raw, year round average',dataType:'SR Legacy'};
    const foods=[{...raw,fdcId:1,description:'Tomatoes, red, ripe, cooked'}, {...raw,fdcId:2,dataType:'Branded'}, raw];
    for(const name of ['Roma tomatoes','Vine-ripened tomatoes','Plum tomatoes','Cherry tomatoes']) {
      expect(matchUSDA({name},foods,false)?.fdcId).toBe(170457);
      expect(matchUSDA({name},foods.slice(0,2),false)).toBeUndefined();
      expect(matchUSDA({name},[raw],true)).toBeUndefined();
    }
    expect(matchUSDA({name:'Tomato sauce'},[raw],false)).toBeUndefined();
    vi.stubEnv('USDA_FDC_API_KEY','test');
    const fetch=vi.fn(async(url:Parameters<typeof globalThis.fetch>[0])=>Response.json(String(url).includes('/foods/search')?{foods}:{...raw,foodNutrients:[{nutrient:{id:1008,unitName:'kcal'},amount:18}]}));
    const facts=await new USDAFoodDataClient({fetch,permit:async()=>true,sleep:async()=>{}}).search({name:'Roma tomatoes'});
    expect(facts).toMatchObject({source:'USDA',matchQuality:'representative_generic',nutrition:{calories:18}});
  });
  it('maps USDA full-detail nutrient IDs and units without label-serving confusion',()=>{
    const result=normalizeUSDA({...usda(),labelNutrients:{fat:{value:8}}},'representative_generic')!;
    expect(result.nutrition).toMatchObject({servingAmount:100,servingUnit:'g',calories:61,totalFat:3.25,sodium:43,calcium:113});
    expect(result.nutrition?.sugar).toBeUndefined();
    expect(normalizeUSDA({...usda(),foodNutrients:[{nutrient:{id:1079,unitName:'g'},amount:6}]},'representative_generic')?.nutrition?.fiber).toBe(6);expect(result.matchQuality).toBe('representative_generic');expect(result.allergenStatus).toBe('unknown');
  });
  it('maps OFF declared allergens and traces separately and converts g to mg',()=>{
    const result=normalizeOFF(off(),'exact_barcode')!;
    expect(result.contains).toEqual(['Milk']);expect(result.mayContain).toEqual(['Peanuts']);expect(result.dietary).toEqual(['Vegetarian']);expect(result.nutrition?.sodium).toBe(43);expect(result.nutrition?.calcium).toBe(113);
    expect(result.ingredientText).toBe('Milk, vitamin D');expect(result.freeFrom).toEqual([]);
  });
  it('keeps unknown allergens unknown and never infers claims from ingredient analysis',()=>{
    const result=normalizeOFF({...off(),allergens_tags:[],traces_tags:[],labels_tags:[]},'exact_barcode')!;
    expect(result.allergenStatus).toBe('unknown');expect(result.dietary).toEqual([]);expect(result.freeFrom).toEqual([]);
  });
  it('ignores incomplete or invalid nutrition and conflicting dietary claims',()=>{
    const result=normalizeOFF({...off(),nutrition_data_per:'serving',labels_tags:['en:vegan','en:dairy-free']},'exact_barcode')!;
    expect(result.nutritionUnavailable).toBe(true);expect(result.dietary).toEqual([]);
    expect(normalizeUSDA({...usda(),foodNutrients:[{nutrient:{id:1004,unitName:'g'},amount:-3}]},'representative_generic')?.nutrition).toBeUndefined();
  });
  it('does not confuse food containing milk, flavored milk, or buttermilk with whole milk',()=>{
    const foods=['Cheese, whole milk','Milk, buttermilk, fluid, whole','Milk, chocolate, whole',usda().description].map((description,i)=>({description,fdcId:i+1,dataType:'SR Legacy'}));
    expect(matchUSDA({name:'whole milk'},foods,false)?.fdcId).toBe(4);
    expect(matchUSDA({name:'whole milk'},foods.slice(0,3),false)).toBeUndefined();
    expect(matchUSDA({name:'Milk'},foods,false)?.fdcId).toBe(4);
  });
  it('matches representative loaf bread rather than pita or unrelated foods',()=>{
    const foods=[{description:'Bread, pita, whole-wheat',fdcId:1,dataType:'SR Legacy'},{description:'Bread, whole-wheat, commercially prepared',fdcId:2,dataType:'SR Legacy'},{description:'Bread, multi-grain (includes whole-grain)',fdcId:3,dataType:'SR Legacy'},{description:'Bread, white, commercially prepared',fdcId:4,dataType:'SR Legacy'}];
    expect(matchUSDA({name:'Whole wheat bread'},foods,false)?.fdcId).toBe(2);
    expect(matchUSDA({name:'Multigrain bread'},foods,false)?.fdcId).toBe(3);
    expect(matchUSDA({name:'Bread'},foods,false)?.fdcId).toBe(4);
  });
  it('requires exact barcode or product/brand match for branded claims',()=>{
    const foods=[{description:'Whole Milk',brandOwner:'Example',dataType:'Branded',gtinUpc:'0123456789012'}];
    expect(matchUSDA({name:'Milk',barcode:'123456789012'},foods,true)).toBeDefined();
    expect(matchUSDA({name:'Whole Milk',brand:'Other'},foods,true)).toBeUndefined();
    expect(matchUSDA({name:'Whole Milk',brand:'Example'},foods,true)).toBeDefined();
  });
  it('normalizes queries and shared cache keys deterministically',()=>{
    expect(normalizeQuery('  WHOLE---Milk  ')).toBe('whole milk');expect(foodKey('search','whole milk')).toBe(foodKey('search','whole milk'));
  });
  it('compares lower higher same unknown and compatible servings without GPT',()=>{
    const a=generic(),b=normalizeUSDA(usda(2),'representative_generic')!;
    expect(compare(a,b).totalFat).toEqual({state:'lower',amount:1.25});expect(compare(b,a).totalFat.state).toBe('higher');expect(compare(a,b).protein.state).toBe('same');expect(compare(a,b).sugar.state).toBe('unknown');
    b.nutrition!.servingAmount=50;b.nutrition!.totalFat=1.625;expect(compare(a,b).totalFat.state).toBe('same');b.nutrition!.servingUnit='ml';expect(compare(a,b).totalFat.state).toBe('unknown');
  });
});

describe('cache lifetime and coalescing',()=>{
  it('hits the cache, caches not found, and deduplicates concurrent misses',async()=>{
    const {storage}=memory(),cache=new FoodCache(storage),load=vi.fn(async()=>({name:'Milk'}));
    const values=await Promise.all(Array.from({length:100},()=>cache.get('one',30,load)));
    expect(load).toHaveBeenCalledTimes(1);expect(values.every(x=>x.value?.name==='Milk')).toBe(true);
    await cache.get('one',30,load);expect(load).toHaveBeenCalledTimes(1);
    const missing=vi.fn(async()=>null);await cache.get('none',30,missing);await cache.get('none',30,missing);expect(missing).toHaveBeenCalledTimes(1);
  });
  it('serves stale while refreshing, then expires beyond the stale window',async()=>{
    const {storage}=memory();let now=1000;const jobs:(()=>Promise<unknown>)[]=[];const cache=new FoodCache(storage,()=>now,job=>jobs.push(job));let version=1;
    await cache.get('one',1,async()=>version);now=2500;version=2;
    expect(await cache.get('one',1,async()=>version)).toEqual({value:1,stale:true});await jobs.shift()!();
    expect((await cache.get('one',1,async()=>3)).value).toBe(2);now+=4*86400000;
    expect((await cache.get('one',1,async()=>3)).value).toBe(3);
  });
  it('retains usable stale data on outage and never negative-caches failure',async()=>{
    const {storage,rows}=memory();let now=1000;const jobs:(()=>Promise<unknown>)[]=[];const cache=new FoodCache(storage,()=>now,job=>jobs.push(job));
    await cache.get('one',1,async()=>1);now=3000;expect((await cache.get('one',1,async()=>{throw Error('outage');})).value).toBe(1);
    await expect(jobs[0]()).rejects.toThrow();expect(JSON.parse(rows.get('one')!.payload!)).toBe(1);
    const fail=vi.fn(async()=>{throw Error('outage');});await cache.get('new',1,fail);await cache.get('new',1,fail);expect(fail).toHaveBeenCalledTimes(2);
  });
  it('does not use incompatible schema records',async()=>{
    const {storage,rows}=memory();await storage.claim('one',new Date());await storage.write('one','1',new Date(Date.now()+99999),new Date(Date.now()+999999));rows.get('one')!.schemaVersion=99;
    expect((await new FoodCache(storage).get('one',10,async()=>2)).value).toBe(2);
  });
  it('expires negative records and retries lookup after their TTL',async()=>{
    vi.stubEnv('FOOD_NEGATIVE_TTL_SECONDS','1');let now=1000;
    const {storage}=memory(),cache=new FoodCache(storage,()=>now),load=vi.fn(async()=>null);
    await cache.get('absent',30,load);await cache.get('absent',30,load);expect(load).toHaveBeenCalledTimes(1);
    now=3000;await cache.get('absent',30,load);expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('provider failures and source precedence',()=>{
  it('uses an exact OFF product without mixing contradictory USDA nutrition',async()=>{
    const {storage}=memory(),exact=normalizeOFF(off(),'exact_barcode')!;
    const providers={off:{barcode:vi.fn(async()=>exact),search:vi.fn(async()=>null)},usda:{search:vi.fn(async()=>generic())}};
    const service=new ProductDataService(new FoodCache(storage),providers);
    expect((await service.lookup({name:'Milk',barcode:off().code}))?.source).toBe('OPEN_FOOD_FACTS');expect(providers.usda.search).not.toHaveBeenCalled();
    await service.lookup({name:'Different display name',barcode:off().code});expect(providers.off.barcode).toHaveBeenCalledTimes(1);
  });
  it('uses USDA generic and labels branded fallback representative',async()=>{
    const {storage}=memory(),providers={off:{barcode:vi.fn(async()=>null),search:vi.fn(async()=>null)},usda:{search:vi.fn(async(_q,branded)=>branded?null:generic())}};
    const result=await new ProductDataService(new FoodCache(storage),providers).lookup({name:'Whole Milk',brand:'Unavailable brand'});
    expect(result?.matchQuality).toBe('representative_generic');expect(result?.brand).toBeUndefined();
  });
  it('never falls back from an unmatched barcode to generic nutrition',async()=>{
    const {storage}=memory(),providers={off:{barcode:vi.fn(async()=>null),search:vi.fn(async()=>null)},usda:{search:vi.fn(async()=>null)}};
    expect(await new ProductDataService(new FoodCache(storage),providers).lookup({name:'Milk',barcode:off().code})).toBeNull();expect(providers.usda.search).toHaveBeenCalledWith(expect.anything(),true);
  });
  it('bounds retries for timeout/outage and stops on rate limiting',async()=>{
    const deps={fetch:vi.fn().mockRejectedValue(new DOMException('timeout','TimeoutError')),permit:vi.fn(async()=>true),sleep:vi.fn(async()=>{})};
    await expect(providerRequest('usda',new URL('https://api.nal.usda.gov/fdc/v1/foods/search'),{},deps)).rejects.toMatchObject({code:'unavailable'});expect(deps.fetch).toHaveBeenCalledTimes(2);
    deps.fetch.mockReset().mockResolvedValue(new Response('',{status:429}));await expect(providerRequest('usda',new URL('https://api.nal.usda.gov/fdc/v1/foods/search'),{},deps)).rejects.toMatchObject({code:'rate_limit'});expect(deps.fetch).toHaveBeenCalledTimes(1);
  });
  it('sends credentials only to USDA and configurable User-Agent to OFF',async()=>{
    vi.stubEnv('USDA_FDC_API_KEY','test-private');vi.stubEnv('OPEN_FOOD_FACTS_CONTACT_EMAIL','support@example.test');
    const deps={fetch:vi.fn(async(_url:Parameters<typeof fetch>[0],_init?:RequestInit)=>new Response(JSON.stringify({product:off()}))),permit:vi.fn(async()=>true),sleep:vi.fn(async()=>{})};
    await new OpenFoodFactsClient(deps).barcode(off().code);expect(deps.fetch.mock.calls[0][1]?.headers).toEqual({'User-Agent':'NexDo/1.0 (contact: support@example.test)'});
    await new USDAFoodDataClient(deps).details(171265,'representative_generic');const call=deps.fetch.mock.calls[1];expect(String(call[0])).not.toContain('test-private');expect(call[1]?.headers).toMatchObject({'X-Api-Key':'test-private'});
  });
});

describe('grounded explanations',()=>{
  it('only returns allowed factual statements and caches GPT selection',async()=>{
    vi.stubEnv('OPENAI_API_KEY','test');vi.stubEnv('FOOD_GPT_EXPLANATIONS_ENABLED','true');
    const fetch=vi.fn(async()=>new Response(JSON.stringify({output_text:JSON.stringify({indices:[2]})})));vi.stubGlobal('fetch',fetch);
    const a=generic(),b=normalizeUSDA(usda(2),'representative_generic')!,{storage}=memory(),cache=new FoodCache(storage);
    const result=await explain(a,b,'Lower fat',cache);expect(result.text).toBe(statements(a,b)[2]);expect(result.usedAI).toBe(true);
    await explain(a,b,'Lower fat',cache);expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects injected text and never asks GPT without factual statements',async()=>{
    vi.stubEnv('OPENAI_API_KEY','test');vi.stubEnv('FOOD_GPT_EXPLANATIONS_ENABLED','true');
    const fetch=vi.fn(async()=>new Response(JSON.stringify({output_text:JSON.stringify({indices:[999],text:'Nut free and cures illness'})})));vi.stubGlobal('fetch',fetch);
    const {storage}=memory();expect((await explain(generic(),generic(),'Lower fat',new FoodCache(storage))).text).not.toContain('Nut free');
    expect((await explain(null,null,'Lower fat')).usedAI).toBe(false);expect(fetch).toHaveBeenCalledTimes(1);
  });
});
