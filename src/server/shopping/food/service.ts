import { after } from 'next/server';
import { FoodCache, foodKey } from './cache';
import { foodConfig } from './config';
import { canonicalBarcode, FoodFacts, FoodQuery, normalizeQuery } from './model';
import { USDAFoodDataClient, OpenFoodFactsClient } from './providers';
import { inc } from '@/lib/metrics';
export const productCache=new FoodCache(undefined,undefined,job=>{try{after(async()=>{await job().catch(()=>{});});}catch{void job().catch(()=>{});}});
type Providers={usda:Pick<USDAFoodDataClient,'search'>;off:Pick<OpenFoodFactsClient,'barcode'|'search'>};
export class ProductDataService {
  constructor(private cache=productCache,private providers:Providers={usda:new USDAFoodDataClient(),off:new OpenFoodFactsClient()}){}
  async lookup(input:FoodQuery):Promise<FoodFacts|null>{
    const query={name:normalizeQuery(input.name),...(input.brand?{brand:normalizeQuery(input.brand)}:{}),...(input.barcode?{barcode:canonicalBarcode(input.barcode)}:{})};
    if(!query.name || input.barcode&&!query.barcode)return null;
    const cfg=foodConfig(),key=foodKey(query.barcode?'barcode':'search-v2',query.barcode||query);
    const result=await this.cache.get<FoodFacts>(key,query.barcode?cfg.exactTTL:cfg.searchTTL,async()=>{
      let failed=false;
      const safely=async(fn:()=>Promise<FoodFacts|null>)=>{try{return await fn();}catch{failed=true;return null;}};
      let facts:FoodFacts|null=null;
      if(query.barcode){
        facts=await safely(()=>this.providers.off.barcode(query.barcode!));
        if(!facts)facts=await safely(()=>this.providers.usda.search(query,true));
        // Never attach generic facts to an unmatched UPC.
      }else if(query.brand){
        facts=await safely(()=>this.providers.off.search(query));
        if(!facts)facts=await safely(()=>this.providers.usda.search(query,true));
        if(!facts)facts=await safely(()=>this.providers.usda.search({name:query.name}));
      }else{
        facts=await safely(()=>this.providers.usda.search(query));
        if(!facts)facts=await safely(()=>this.providers.usda.search(query,true));
      }
      if(facts?.source==='USDA' && facts.matchQuality==='branded_match' && facts.barcode){
        const exact=await safely(()=>this.providers.off.barcode(facts!.barcode!));
        if(exact)facts=exact; // Replace the record wholesale; never mix generic values into a label.
      }
      if(!facts){if(failed)throw new Error('Food data temporarily unavailable');return null;}
      inc(`food.match.${facts.matchQuality}`);
      facts.expiresAt=new Date(Date.now()+(facts.matchQuality==='representative_generic'?cfg.genericTTL:cfg.exactTTL)*1000).toISOString();
      // Canonical product keys share normalized records independently of the query and user.
      const canonical=await this.cache.get<FoodFacts>(foodKey('normalized',facts.id),facts.matchQuality==='representative_generic'?cfg.genericTTL:cfg.exactTTL,async()=>facts);
      return canonical.value?{...canonical.value,freshness:canonical.stale?'stale':'fresh'}:facts;
    });
    if(!result.value)return null;
    return {...result.value,freshness:result.stale||result.value.freshness==='stale'||Date.parse(result.value.expiresAt)<Date.now()?'stale':'fresh'};
  }
}
export const productData=new ProductDataService();
