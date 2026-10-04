import {createHash} from 'node:crypto';
import {fromZonedTime} from 'date-fns-tz';
import {identifyBrand,type OfferRecord} from './domain';
export const COSTCO_SOURCE='https://www.costco.com/o/-/warehouse-savings';
function text(s:string){return s.replace(/<[^>]*>/g,'').replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();}
function date(s:string,end=false){const [m,d,y]=s.split('/').map(Number);return fromZonedTime(`${2000+y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T${end?'23:59:59':'00:00:00'}`,'America/Los_Angeles');}
/** Source-specific parser: requires validity dates and explicit savings. A layout change fails closed. */
export function parseCostco(html:string,now=new Date()):OfferRecord[]{
 const valid=html.match(/Pricing may vary by location in AK, HI, PR,[^<]*?Valid (\d{1,2}\/\d{1,2}\/\d{2}) - (\d{1,2}\/\d{1,2}\/\d{2})/);
 if(!valid)throw new Error('Savings validity dates unavailable');
 const startsAt=date(valid[1]),expiresAt=date(valid[2],true);
 if(!Number.isFinite(+startsAt)||expiresAt<startsAt||+expiresAt-+startsAt>70*86400000)throw new Error('Invalid savings period');
 const offers:OfferRecord[]=[];
 const blocks=html.split(/<a\b[^>]*data-testid="Link"[^>]*href="https:\/\/www\.costco\.com\//).slice(1);
 for(const block of blocks){
  // “Warehouse” (warehouse and online) and “Warehouse Only” are both in-store offers; “Online Only” is not.
  if(!/>Warehouse(?: Only)?<\/div>/.test(block))continue;
  const title=block.match(/<span[^>]*>([^<]+)<\/span>/)?.[1];
  const item=block.match(/>Item ([\d, /]+)</)?.[1];
  const priceHTML=block.match(/data-testid="Text_prices_and_percentages_prices"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  if(!title||!item||!priceHTML)continue;
  const product=text(title),amount=text(priceHTML),save=block.includes('data-testid="Text_prices_and_percentages_prepend_text">Save<');
  const after=block.match(/data-testid="Text_prices_and_percentages_append_text"[^>]*>([^<]+)</)?.[1];
  if(!/^\$\d+(?:\.\d{2})?$/.test(amount)||(!save&&!after?.match(/^After \$[\d.]+ OFF$/)))continue;
  // The package size is the text block directly before the item number; generated class names change between deploys.
  const size=block.match(/<div data-testid="MarkdownRenderer"[^>]*><div[^>]*data-testid="Text">([^<]+)<\/div><\/div><div[^>]*><div[^>]*data-testid="Text">Item /)?.[1];
  const conditions=block.match(/>Item [^<]+<\/div><div[^>]*>([\s\S]*?)<\/div>/)?.[1];
  const image=block.match(/<img[^>]*src="(https:\/\/gdx-assets\.costco\.com\/[^"<>]+)"/)?.[1];
  offers.push({id:createHash('sha256').update(`costco:${item}:${valid[1]}`).digest('hex'),product,brand:identifyBrand(product),packageSize:size?text(size):null,
   price:save?null:amount,savings:save?`${amount} off`:text(after!).replace(/^After /,''),unitPrice:null,
   conditions:`Costco membership required. Warehouse offer; selection and availability vary. ${conditions?text(conditions):'See source for limits and conditions.'}`,
   imageURL:image?text(image):null,sourceURL:COSTCO_SOURCE,startsAt,expiresAt,checkedAt:now});
 }
 if(offers.length<5)throw new Error('Savings page format changed or no verified offers');
 return [...new Map(offers.map(o=>[o.id,o])).values()];
}
export async function collectCostco(){
 const res=await fetch(COSTCO_SOURCE,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'NexDo-Offers/1.0 (weekly warehouse savings check)'},cache:'no-store'});
 if(!res.ok||!res.headers.get('content-type')?.includes('text/html'))throw new Error('Savings source unavailable');
 const reader=res.body!.getReader();let html='',size=0;const decoder=new TextDecoder();
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>6000000)throw new Error('Savings page too large');html+=decoder.decode(value,{stream:true});}}finally{await reader.cancel();}
 return parseCostco(html);
}
