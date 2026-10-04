export type OfferRecord = {
 id:string; product:string; brand:string|null; packageSize:string|null; price:string|null;
 savings:string|null; unitPrice:string|null; conditions:string; imageURL:string|null;
 sourceURL:string; startsAt:Date; expiresAt:Date; checkedAt:Date;
};
type Item = {name:string; brand?:string|null; size:string; notes:string};
const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9%]+/g,' ').trim();
// Explicit product families prevent “coffee” matching coffee makers or “milk” matching chocolate.
const families:[string,RegExp][]=[
 ['coffee',/\bcoffee\b(?!\s*(?:maker|machine|table|creamer))/],['avocado oil',/\bavocado oil\b/],
 ['olive oil',/\bolive oil\b/],['milk',/^(?:(?:organic|whole|skim|low fat|2%|1%|kirkland signature|horizon|fairlife)\s+)*milk\b|\b(?:whole|2%|1%|skim) milk\b/],
 ['eggs',/\beggs?\b/],['bread',/\bbread\b/],['butter',/\bbutter\b/],['yogurt',/\byogurt\b/],
 ['rice',/\brice\b/],['pasta',/\bpasta\b/],['paper towels',/\bpaper towels?\b/],['toilet paper',/\b(?:toilet paper|bath tissue)\b/],
 ['detergent',/\bdetergent\b/],['chicken',/\bchicken\b/],['salmon',/\bsalmon\b/],['cheese',/\bcheese\b/]
];
const family=(s:string)=>families.find(([,r])=>r.test(normalize(s)))?.[0];
export const brands=['Kirkland Signature','Starbucks','Peet’s Coffee',"Peet's Coffee",'Chosen Foods','Chobani','Oikos','Tide','Bounty','Charmin','Horizon','Fairlife','Kerrygold','Dawn','Cascade','CJ Foods bibigo'];
export function identifyBrand(product:string){return brands.find(b=>normalize(product).includes(normalize(b)))??null;}
export function matchOffer(item:Item,offer:OfferRecord){
 const a=family(item.name),b=family(offer.product);
 if(!a||a!==b)return null;
 const reasons:string[]=[`Product: ${a}`],differences:string[]=[];
 const brand=item.brand?.trim()||identifyBrand(item.name);
 if(brand){if(normalize(offer.brand??'')===normalize(brand))reasons.push(`Matches your ${brand} brand`);else differences.push(`Brand: ${offer.brand??'not specified by source'}; requested ${brand}`);}
 const size=normalize(item.size).replace(/\s/g,'');
 if(size){if(size===normalize(offer.packageSize??'').replace(/\s/g,''))reasons.push(`Matches requested size: ${item.size}`);else differences.push(`Package: ${offer.packageSize??'not specified'}; requested ${item.size}`);}
 // Retain all stated preferences, including dietary needs and free-form notes. Unverified preferences never count as a match.
 const requested=normalize([item.name,item.notes].join(' ')).split(' ').filter(w=>w.length>1 && !normalize([a,brand??''].join(' ')).split(' ').includes(w));
 const offered=new Set(normalize(offer.product).split(' '));
 const missing=[...new Set(requested.filter(w=>!offered.has(w)))];
 if(missing.length)differences.push(`Not confirmed by the ad: ${missing.join(', ')}`);
 return {category:differences.length?'alternative':brand?'matching':'available',reasons,differences};
}
export function sourceForStore(name:string|null,zip:string|null){
 if(normalize(name??'')!=='costco')return null;
 // The published warehouse region excludes AK, HI, PR and territories; do not apply its prices there.
 const prefix=Number((zip??'').slice(0,3));
 return /^\d{5}(?:-\d{4})?$/.test(zip??'')&&prefix>=10&&prefix<967?'costco-us-warehouse':null;
}
