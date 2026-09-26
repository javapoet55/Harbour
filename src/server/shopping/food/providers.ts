import { observedFetch } from '@/server/health/telemetry';
import { inc } from '@/lib/metrics';
import { foodConfig } from './config';
import { providerPermit, providerBackoff } from './cache';
import { baseFacts, canonicalBarcode, complete, finite, FoodFacts, FoodQuery, MatchQuality, normalizeQuery, Nutrition } from './model';
type Raw = Record<string, unknown>;
const obj=(v:unknown):Raw=>v!==null && typeof v==='object'&&!Array.isArray(v)?v as Raw:{};
const text=(v:unknown)=>typeof v==='string'?v.trim():'';
const array=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
const strings=(v:unknown)=>array(v).filter((x):x is string=>typeof x==='string');
export class FoodProviderError extends Error {constructor(readonly code:'unavailable'|'rate_limit'|'not_configured'){super(`Food provider ${code}`);}}
type Dependencies={fetch:typeof observedFetch;permit:typeof providerPermit;sleep:(ms:number)=>Promise<void>};
const defaults:Dependencies={fetch:observedFetch,permit:providerPermit,sleep:ms=>new Promise(r=>setTimeout(r,ms))};
export async function providerRequest(provider:'usda'|'off_product'|'off_search',url:URL,init:RequestInit={},deps:Dependencies=defaults):Promise<Raw|null> {
  for(let attempt=0;attempt<2;attempt++){
    if(!await deps.permit(provider))throw new FoodProviderError('rate_limit');
    inc(`food.${provider}.request`);
    try {
      const response=await deps.fetch(url,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(foodConfig().timeoutMs)});
      if(response.status===404)return null;
      if(response.status===429){
        inc(`food.${provider}.rate_limit`);
        const retry=Number(response.headers.get('retry-after'));
        if(deps===defaults)await providerBackoff(provider,Number.isFinite(retry)&&retry>0?Math.min(retry,3600):provider==='usda'?3600:60);
        throw new FoodProviderError('rate_limit');
      }
      if(response.ok)return obj(await response.json());
      if(response.status<500)throw new FoodProviderError('unavailable');
    }catch(error){
      inc(`food.${provider}.error`);
      if(error instanceof FoodProviderError)throw error;
      // Never propagate an upstream exception, URL, request body, or credentials.
    }
    if(attempt===0)await deps.sleep(200+Math.floor(Math.random()*100));
  }
  if(deps===defaults)await providerBackoff(provider,15);
  throw new FoodProviderError('unavailable');
}
export function normalizeUSDA(raw:unknown,match:MatchQuality):FoodFacts|null {
  const r=obj(raw),id=finite(r.fdcId),name=text(r.description);if(!id||!name)return null;
  const facts=baseFacts('USDA',String(id),name,match);
  facts.brand=text(r.brandOwner)||text(r.brandName)||undefined;facts.barcode=text(r.gtinUpc)||undefined;
  facts.size=text(r.packageWeight)||undefined;facts.lastUpdated=text(r.modifiedDate)||text(r.publicationDate)||undefined;
  // Full FDC food details amounts are per 100 g, including branded records. Never treat labelNutrients as per 100 g.
  const n:Nutrition={servingSize:'100 g',servingAmount:100,servingUnit:'g'};
  const mapping:Record<number,keyof Nutrition>={1008:'calories',2048:'calories',1003:'protein',1004:'totalFat',1258:'saturatedFat',1005:'carbohydrates',2000:'sugar',1067:'sugar',1093:'sodium',1087:'calcium',1079:'fiber'};
  for(const entry of array(r.foodNutrients)){
    const value=obj(entry),nutrient=obj(value.nutrient),id=Number(nutrient.id),key=mapping[id],amount=finite(value.amount),unit=text(nutrient.unitName).toLowerCase();
    if(!key||amount===undefined)continue;
    const target=key==='calories'?'kcal':key==='sodium'||key==='calcium'?'mg':'g';
    const converted=unit===target?amount:unit==='g'&&target==='mg'?amount*1000:unit==='mg'&&target==='g'?amount/1000:undefined;
    if(converted!==undefined && finite(converted)!==undefined && (n[key]===undefined || id===1008))Object.assign(n,{[key]:converted});
  }
  facts.nutrition=n;
  // USDA ingredients are label text, not a verified free-from/allergen declaration.
  if(match!=='representative_generic')facts.ingredientText=text(r.ingredients)||undefined;
  return complete(facts);
}
export function normalizeOFF(raw:unknown,match:MatchQuality):FoodFacts|null {
  const r=obj(raw),code=text(r.code),name=text(r.product_name_en)||text(r.product_name);
  if(!canonicalBarcode(code)||!name)return null;
  const f=baseFacts('OPEN_FOOD_FACTS',code,name,match);f.barcode=code;f.brand=text(r.brands)||undefined;f.size=text(r.quantity)||undefined;
  const image=text(r.image_front_url);if(/^https:\/\/images\.openfoodfacts\.org\//.test(image))f.imageURL=image;
  const modified=finite(r.last_modified_t);if(modified)f.lastUpdated=new Date(modified*1000).toISOString();
  f.ingredientText=text(r.ingredients_text_en)||text(r.ingredients_text)||undefined;
  // OFF stores _100g values per 100g or 100ml. Without an explicit volume basis use mass; never convert g↔ml.
  const unit=text(r.nutrition_data_per)==='100ml'?'ml':'g';
  const n:Nutrition={servingSize:`100 ${unit}`,servingAmount:100,servingUnit:unit},values=obj(r.nutriments);
  const keys={calories:'energy-kcal',protein:'proteins',totalFat:'fat',saturatedFat:'saturated-fat',carbohydrates:'carbohydrates',sugar:'sugars',sodium:'sodium',calcium:'calcium',fiber:'fiber'} as const;
  if(r.no_nutrition_data!=='on' && ['100g','100ml'].includes(text(r.nutrition_data_per)))for(const [key,off] of Object.entries(keys)){
    const value=finite(values[`${off}_100g`]);if(value!==undefined)Object.assign(n,{[key]:value*(key==='sodium'||key==='calcium'?1000:1)});
  }
  f.nutrition=n;
  const labels=(v:unknown)=>strings(v).filter(t=>/^en:[a-z-]+$/.test(t)).map(t=>t.slice(3).replace(/-/g,' ')).map(t=>t[0].toUpperCase()+t.slice(1));
  f.contains=labels(r.allergens_tags);f.mayContain=labels(r.traces_tags);
  f.allergenStatus=f.contains.length||f.mayContain.length?'declared':'unknown';
  // Only explicit label tags; deliberately ignore computed ingredients_analysis_tags.
  const dietary:Record<string,string>={'en:vegan':'Vegan','en:vegetarian':'Vegetarian','en:gluten-free':'Gluten-free','en:lactose-free':'Lactose-free','en:dairy-free':'Dairy-free','en:plant-based':'Plant-based'};
  f.dietary=strings(r.labels_tags).flatMap(tag=>dietary[tag]?[dietary[tag]]:[]);
  // Suppress contradictory absence claims; explicit "contains" declarations win.
  if(f.contains.includes('Milk'))f.dietary=f.dietary.filter(v=>!['Dairy-free','Vegan','Plant-based'].includes(v));
  if(f.contains.some(v=>['Gluten','Wheat'].includes(v)))f.dietary=f.dietary.filter(v=>v!=='Gluten-free');
  f.freeFrom=[];
  return complete(f);
}
function compatibleName(query:FoodQuery,name:string,brand=''):boolean {
  const q=normalizeQuery(query.name),p=normalizeQuery(name),b=normalizeQuery(brand);
  return (q===p || q===`${b} ${p}` || `${normalizeQuery(query.brand||'')} ${q}`.trim()===`${b} ${p}`) && (!query.brand || b===normalizeQuery(query.brand));
}
// Variety names use representative raw tomato data, never a branded or cooked match.
const freshTomatoNames = new Set(['tomato', 'tomatoes', 'roma tomato', 'roma tomatoes', 'vine ripened tomatoes', 'plum tomatoes', 'cherry tomatoes']);
function genericFoodName(name: string): string {
  const normalized = normalizeQuery(name);
  return freshTomatoNames.has(normalized) ? 'tomatoes red ripe raw' : normalized;
}
export function matchUSDA(query:FoodQuery,foods:unknown[],branded:boolean):Raw|undefined {
  const aliases:Record<string,string>={'milk':'whole milk','low fat milk':'1% milk','bread':'white bread','multigrain bread':'multi grain bread'};
  const q=aliases[normalizeQuery(query.name)]||genericFoodName(query.name);
  const tokens=q.split(' ').filter(w=>!['fluid','and','with','the'].includes(w));
  const forbidden=['pita','bagel','bagels','stuffing','crumbs','chocolate','strawberry','powder','dry','yogurt','cheese','infant','condensed','evaporated','buttermilk','goat','sheep','human','solids'];
  return foods.map(obj).sort((a,b)=>text(a.description).length-text(b.description).length).find(food=>{
    if(query.barcode)return canonicalBarcode(text(food.gtinUpc))===canonicalBarcode(query.barcode);
    if(branded)return compatibleName(query,text(food.description),text(food.brandOwner)||text(food.brandName));
    const name=normalizeQuery(text(food.description));
    if(tokens.includes('milk') && !tokens.some(t=>['oat','soy','almond','coconut'].includes(t)) && !name.startsWith('milk '))return false;
    return food.dataType!=='Branded' && tokens.every(t=>name.split(' ').includes(t)) && !forbidden.some(t=>name.split(' ').includes(t)&&!tokens.includes(t));
  });
}
export class USDAFoodDataClient {
  constructor(private deps=defaults){}
  private headers(){const key=process.env.USDA_FDC_API_KEY?.trim();if(!key)throw new FoodProviderError('not_configured');return {'X-Api-Key':key,'Content-Type':'application/json'};}
  async search(query:FoodQuery,branded=false):Promise<FoodFacts|null>{
    const url=new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
    const genericQueries:Record<string,string>={'bread':'Bread white commercially prepared','whole wheat bread':'Bread whole wheat commercially prepared','multigrain bread':'Bread mixed grain','milk':'Milk whole fluid','whole milk':'Milk whole fluid','2% milk':'Milk reduced fat fluid 2% milkfat','1% milk':'Milk lowfat fluid 1% milkfat','low fat milk':'Milk lowfat fluid 1% milkfat'};
    const search=branded?[query.brand,query.name].filter(Boolean).join(' '):genericQueries[normalizeQuery(query.name)]||genericFoodName(query.name);
    const raw=await providerRequest('usda',url,{method:'POST',headers:this.headers(),body:JSON.stringify({query:query.barcode||search,dataType:branded?['Branded']:['Foundation','SR Legacy'],pageSize:100})},this.deps);
    const match=matchUSDA(query,array(raw?.foods),branded);if(!match)return null;
    return this.details(Number(match.fdcId),query.barcode?'exact_barcode':branded?'branded_match':'representative_generic');
  }
  async details(id:number,quality:MatchQuality):Promise<FoodFacts|null>{
    if(!Number.isSafeInteger(id)||id<=0)return null;
    const raw=await providerRequest('usda',new URL(`https://api.nal.usda.gov/fdc/v1/food/${id}`),{headers:this.headers()},this.deps);
    return raw?normalizeUSDA(raw,quality):null;
  }
}
const offFields='code,product_name,product_name_en,brands,quantity,nutriments,nutrition_data_per,no_nutrition_data,ingredients_text,ingredients_text_en,allergens_tags,traces_tags,labels_tags,image_front_url,last_modified_t';
export class OpenFoodFactsClient {
  constructor(private deps=defaults){}
  private headers(){const contact=process.env.OPEN_FOOD_FACTS_CONTACT_EMAIL?.trim();if(!contact||/[\r\n]/.test(contact))throw new FoodProviderError('not_configured');return {'User-Agent':`NexDo/1.0 (contact: ${contact})`};}
  async barcode(code:string):Promise<FoodFacts|null>{
    if(!canonicalBarcode(code))return null;
    const url=new URL(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);url.searchParams.set('fields',offFields);
    const raw=await providerRequest('off_product',url,{headers:this.headers()},this.deps);
    const f=normalizeOFF(raw?.product,'exact_barcode');return f&&canonicalBarcode(f.barcode||'')===canonicalBarcode(code)?f:null;
  }
  async search(query:FoodQuery):Promise<FoodFacts|null>{
    // The supported v2 search has no full-text parameter; use explicit brand filtering when known.
    if(!query.brand)return null;
    const url=new URL('https://world.openfoodfacts.org/api/v2/search');url.searchParams.set('brands_tags',normalizeQuery(query.brand).replace(/ /g,'-'));url.searchParams.set('page_size','20');url.searchParams.set('fields',offFields);
    const raw=await providerRequest('off_search',url,{headers:this.headers()},this.deps);
    const match=array(raw?.products).map(obj).find(p=>compatibleName(query,text(p.product_name_en)||text(p.product_name),text(p.brands)));
    return match?normalizeOFF(match,'branded_match'):null;
  }
}
