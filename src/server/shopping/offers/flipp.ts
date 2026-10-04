import {createHash} from 'node:crypto';
import {identifyBrand,type OfferRecord,type OfferSourceDef} from './domain';

const UA='NexDo-Offers/1.0 (weekly ad check)';
const headers={'user-agent':UA};

// Weekly ads for the Albertsons-family banners (Safeway, Vons, Jewel-Osco, …) are served by Flipp.
// Each banner's own weekly-ad page publishes its public merchant identifier and access token in the
// JS bundle it serves to every visitor, so they are resolved at runtime instead of being hardcoded.
interface Banner{merchant:string;token:string;}
let banners:Promise<Map<string,Banner>>|null=null;
async function flippBanners(site='https://www.safeway.com'):Promise<Map<string,Banner>>{
 banners??=(async()=>{
  const page=await (await fetch(`${site}/weeklyad`,{headers,signal:AbortSignal.timeout(30000)})).text();
  const js=page.match(/weeklyad\/dist\/weeklyad\/main\.[0-9a-f]+\.js/)?.[0];
  if(!js)throw new Error('Weekly ad app not found');
  const bundle=await (await fetch(`${site}/${js}`,{headers,signal:AbortSignal.timeout(30000)})).text();
  const out=new Map<string,Banner>();
  for(const m of bundle.matchAll(/(\w+):\{url:"https:\/\/aq\.flippenterprise\.net\/\d+\/iframe\.js",accessToken:"([0-9a-f]{32})"[^}]*?merchantName:"(\w+)"/g))
   out.set(m[3],{merchant:m[3],token:m[2]});
  if(out.size<5)throw new Error('Weekly ad app configuration not found');
  return out;
 })();
 return banners;
}

interface FlippPublication{id:number;name?:string;pdf_url?:string;valid_from:string;valid_to:string;}
interface FlippItem{id:number;name?:string;brand?:string;price_text?:string;current_price?:string;pre_price_text?:string;post_price_text?:string;sale_story?:string;dollars_off?:number;percent_off?:number;disclaimer_text?:string;disclaimer?:string;hosted_coupon_image?:string;image_url?:string;large_image_url?:string;}

/** Maps one publication's product list to offer records; shared by tests and the collector. */
export function flippOffers(items:FlippItem[],pub:FlippPublication,def:OfferSourceDef,now=new Date()):OfferRecord[]{
 const offers:OfferRecord[]=[];
 for(const p of items){
  const product=String(p.name??'').replace(/\s+/g,' ').trim();
  if(product.length<3)continue;
  const priceText=String(p.price_text??p.current_price??'').trim();
  const price=/^\d+(?:[.,]\d{1,2})?$/.test(priceText)?`${p.pre_price_text?p.pre_price_text+' ':''}$${priceText}${p.post_price_text?' '+p.post_price_text:''}`:null;
  const savings=p.sale_story?String(p.sale_story).replace(/\s+/g,' ').trim():p.dollars_off?`$${p.dollars_off} OFF`:p.percent_off?`${p.percent_off}% OFF`:null;
  if(!price&&!savings)continue;
  const brand=String(p.brand??'').replace(/[®™]/g,'').trim()||identifyBrand(product);
  const terms=[p.sale_story,p.disclaimer_text??p.disclaimer].map(t=>t?String(t).replace(/\s+/g,' ').trim().replace(/\.*$/,'.'):null).filter(Boolean).join(' ');
  offers.push({
   id:createHash('sha256').update(`flipp:${p.id}`).digest('hex'),
   product,brand,packageSize:null,price,savings,unitPrice:null,
   conditions:`${terms?terms+' ':''}${def.store} Weekly Ad offer near ZIP ${def.zip}, valid ${pub.valid_from.slice(0,10)} to ${pub.valid_to.slice(0,10)}. Member prices may require a free loyalty account.`,
   imageURL:p.hosted_coupon_image??p.image_url??p.large_image_url??null,
   sourceURL:pub.pdf_url??`https://${def.merchant}.com/weeklyad`,
   startsAt:new Date(pub.valid_from),expiresAt:new Date(pub.valid_to),checkedAt:now
  });
 }
 return offers;
}

async function json(url:string){
 const r=await fetch(url,{headers,signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw new Error(`Weekly ad request failed: HTTP ${r.status}`);
 return r.json();
}

export async function collectFlipp(def:OfferSourceDef,now=new Date()):Promise<OfferRecord[]>{
 const banner=(await flippBanners()).get(def.merchant!);
 if(!banner)throw new Error(`No weekly ad app found for ${def.store}`);
 const pubs:FlippPublication[]=await json(`https://api.flipp.com/flyerkit/v4.0/publications/${banner.merchant}?locale=en-US&postal_code=${def.zip}&access_token=${banner.token}`);
 if(!Array.isArray(pubs)||!pubs.length)throw new Error(`No weekly ad for ${def.store} near ZIP ${def.zip}`);
 const pub=pubs.find(p=>/weekly ad/i.test(p.name??''))??pubs[0];
 const startsAt=new Date(pub.valid_from),expiresAt=new Date(pub.valid_to);
 if(!Number.isFinite(+startsAt)||!Number.isFinite(+expiresAt)||expiresAt<startsAt||+expiresAt-+startsAt>31*86400000)
  throw new Error('Invalid weekly ad period');
 const body=await json(`https://api.flipp.com/flyerkit/v4.0/publication/${pub.id}/products?locale=en-US&access_token=${banner.token}`);
 const items:FlippItem[]=Array.isArray(body)?body:body?.products;
 if(!Array.isArray(items))throw new Error('Weekly ad products unavailable');
 const offers=flippOffers(items,pub,def,now);
 if(offers.length<10)throw new Error(`Weekly ad format changed or too few verified offers (${offers.length})`);
 return offers;
}
