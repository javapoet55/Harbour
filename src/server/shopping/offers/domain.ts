export type OfferRecord = {
 id:string; product:string; brand:string|null; packageSize:string|null; price:string|null;
 savings:string|null; unitPrice:string|null; conditions:string; imageURL:string|null;
 sourceURL:string; startsAt:Date; expiresAt:Date; checkedAt:Date;
};
type Item = {name:string; brand?:string|null; size:string; notes:string};
const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9%]+/g,' ').trim();
// Explicit product families prevent “coffee” matching coffee makers or “milk” matching chocolate.
// First match wins: specific product types (soups, cookies, pet treats, supplements…) come before the
// staple they mention, so “Butter” never matches butter cookies and “Rice” never matches Rice Krispies.
const families:[string,RegExp][]=[
 ['air purifier filters',/\b(?:air purifier|air cleaner)\b.*\b(?:filters?|replacement)\b|\b(?:filters?|replacement)\b.*\b(?:air purifier|air cleaner)\b/],
 ['air purifiers',/\bair purifiers?\b/],
 ['pet food',/\b(?:dogs?|cats?|pets?|puppy|kitten)\b/],
 ['supplements',/\b(?:vitamins?|multivitamins?|multi(?! purpose)|supplements?|probiotics?|fish oil|omega 3|melatonin|zinc|magnesium|calcium|collagen|turmeric|coq10|b 12|b complex|iron|elderberry|red yeast rice|lutein|ashwagandha|l theanine)\b/],
 ['medicine',/\b(?:pain relie(?:f|ver)|advil|tylenol|aleve|motrin|excedrin|mucinex|dayquil|nyquil|robitussin|theraflu|delsym|vicks|ibuprofen|acetaminophen|naproxen|cough|cold flu)\b/],
 ['prepared meals',/\b(?:butter chicken|yakisoba|ravioli|bake kit)\b/],
 ['snack bars',/\bbars?\b|\bkrispies treats\b/],
 ['peanut butter',/\bpeanut butter\b/],
 ['cookies',/\bcookies?\b|\bbiscoff\b/],
 ['candy',/\b(?:candy|chocolate|gummi|nougat)\b/],
 ['soup',/\bsoups?\b|\bpho\b/],
 ['pizza',/\bpizza\b/],
 ['dumplings',/\bdumplings?\b/],
 ['chips',/\b(?:potato |tortilla )?chips\b|\bsunchips\b/],
 ['popcorn',/\bpopcorn\b/],
 ['cereal',/\bcereal\b/],
 ['pasta sauce',/\b(?:pasta|marinara|tomato) sauce\b/],
 ['cream cheese',/\bcream cheese\b/],
 ['cheese bread',/\bcheese bread\b/],
 ['coconut water',/\bcoconut water\b/],
 ['sparkling water',/\b(?:sparkling|mineral|seltzer) water\b|\bseltzer\b/],
 ['energy drinks',/\benergy (?:drinks?|shots?)\b/],
 ['nutrition shakes',/\b(?:nutrition|protein) shakes?\b|\bensure\b|\bglucerna\b/],
 ['juice',/\bjuices?\b/],
 ['coconut milk',/\bcoconut milk\b/],['plant milk',/\b(?:almond|oat|soy|cashew|rice) milk\b/],
 ['coffee',/\bcoffee\b(?!\s*(?:maker|machine|table|creamer))|\bk cups?\b/],['avocado oil',/\bavocado oil\b/],
 ['olive oil',/\bolive oil\b/],['milk',/\bmilk\b(?!\s*(?:chocolate|candy|shake))/],
 ['eggs',/\beggs?\b/],['bread',/\bbread\b/],['butter',/\bbutter\b/],['yogurt',/\byogurt\b/],
 ['rice',/\brice\b/],['pasta',/\bpasta\b/],['paper towels',/\bpaper towels?\b/],['toilet paper',/\b(?:toilet paper|bath tissue)\b/],
 ['facial tissue',/\b(?:facial )?tissues?\b|\bkleenex\b/],
 ['detergent',/\bdetergent\b/],['chicken',/\bchicken\b/],['salmon',/\bsalmon\b/],['cheese',/\bcheese\b/],
 ['water',/\bwater\b/],['shampoo',/\bshampoo\b/],['conditioner',/\bconditioner\b/],['body wash',/\bbody wash\b/],
 ['toothpaste',/\btoothpaste\b/],['toothbrush',/\btoothbrush(?:es)?\b/],['wipes',/\bwipes\b/],
 ['paper plates',/\bplates?\b/],['batteries',/\bbatter(?:y|ies)\b/],['sponges',/\bsponges?\b/]
];
const family=(s:string)=>families.find(([,r])=>r.test(normalize(s)))?.[0];
// Families too broad to imply the same product: an offer must share at least one of the item's own words.
const broad=new Set(['pet food','supplements','medicine']);
const singular=(w:string)=>w.length>3&&w.endsWith('s')&&!w.endsWith('ss')?w.slice(0,-1):w;
export const brands=['Winix','Kirkland Signature','Starbucks','Peet’s Coffee',"Peet's Coffee",'Chosen Foods','Chobani','Oikos','Tide','Bounty','Charmin','Horizon','Fairlife','Kerrygold','Dawn','Cascade','CJ Foods bibigo'];
export function identifyBrand(product:string){return brands.find(b=>normalize(product).includes(normalize(b)))??null;}
export function matchOffer(item:Item,offer:OfferRecord){
 const a=family(item.name),b=family(offer.product);
 if(!a||a!==b)return null;
 const reasons:string[]=[`Product: ${a}`],differences:string[]=[];
 const brand=item.brand?.trim()||identifyBrand(item.name);
 const offerBrand=offer.brand?.trim()||identifyBrand(offer.product);
 if(brand){if(normalize(offerBrand??'')===normalize(brand))reasons.push(`Matches your ${brand} brand`);else differences.push(`Brand: ${offerBrand??'not specified by source'}; requested ${brand}`);}
 const size=normalize(item.size).replace(/\s/g,'');
 if(size){if(size===normalize(offer.packageSize??'').replace(/\s/g,''))reasons.push(`Matches requested size: ${item.size}`);else differences.push(`Package: ${offer.packageSize??'not specified'}; requested ${item.size}`);}
 // Retain all stated preferences, including dietary needs and free-form notes. Unverified preferences never count as a match.
 const requested=normalize([item.name,item.notes].join(' ')).split(' ').filter(w=>w.length>1 && !normalize([a,brand??''].join(' ')).split(' ').includes(w));
 const offered=new Set(normalize(offer.product).split(' ').map(singular));
 const missing=[...new Set(requested.filter(w=>!offered.has(singular(w))))];
 if(broad.has(a)&&requested.length&&missing.length===new Set(requested).size)return null;
 if(missing.length)differences.push(`Not confirmed by the ad: ${missing.join(', ')}`);
 return {category:differences.length?'alternative':brand?'matching':'available',reasons,differences};
}
export type OfferProvider='costco'|'flipp';
export interface OfferSourceDef{provider:OfferProvider;id:string;store:string;region:string;merchant?:string;zip?:string;}
export interface StoreInfo{provider:OfferProvider;store:string;merchant?:string;}
// Albertsons-family banners whose weekly ads are Flipp-powered. Alias, display name, Flipp merchant id.
const stores:[RegExp,string,OfferProvider,string?][]=[
 [/\bcostco\b/,'Costco','costco'],
 [/\bsafeway\b/,'Safeway','flipp','safeway'],
 [/\bvons\b/,'Vons','flipp','vons'],
 [/\bjewel\b/,'Jewel-Osco','flipp','jewelosco'],
 [/\bacme\b/,'ACME Markets','flipp','acmemarkets'],
 [/\bshaws?\b/,"Shaw's",'flipp','shaws'],
 [/\btom thumb\b/,'Tom Thumb','flipp','tomthumb'],
 [/\brandalls?\b/,'Randalls','flipp','randalls'],
 [/\bpavilions\b/,'Pavilions','flipp','pavilions'],
 [/\balbertsons?\s*markets?\b/,'Albertsons Market','flipp','albertsonsmarket'],
 [/\balbertsons?\b/,'Albertsons','flipp','albertsons'],
 [/\bandronicos?\b/,"Andronico's",'flipp','andronicoscommunitymarkets'],
 [/\bbalduccis?\b/,"Balducci's",'flipp','balduccis'],
 [/\bunited supermarkets?\b/,'United Supermarkets','flipp','unitedsupermarkets'],
 [/\bmarket street\b/,'Market Street','flipp','marketstreet'],
 [/\bhaggens?\b/,'Haggen','flipp','haggen'],
 [/\bcarrs\b/,'Carrs','flipp','carrsqc'],
 [/\bamigos\b/,'Amigos','flipp','amigosunited'],
 [/\bkings food\b/,'Kings Food Markets','flipp','kingsfoodmarkets'],
 [/\bstar markets?\b/,'Star Market','flipp','starmarket']
];
/** “Costco”, “Costco Wholesale” or “Costco - Mountain View”; Business Centers have different pricing. */
export function isCostco(name:string|null){const n=normalize(name??'');return /\bcostco\b/.test(n)&&!/\bbusiness\b/.test(n);}
/** The offer provider for a user-typed store name, or null when no source covers it. */
export function storeForName(name:string|null):StoreInfo|null{
 const n=normalize(name??'');
 for(const [re,store,provider,merchant] of stores)if(re.test(n)&&!(provider==='costco'&&/\bbusiness\b/.test(n)))return{provider,store,merchant};
 return null;
}
/** The offer source a list reads from: one shared source for Costco, one per ZIP for local-priced stores. */
export function sourceForList(name:string|null,zip:string|null):OfferSourceDef|null{
 const info=storeForName(name);
 if(!info)return null;
 if(info.provider==='costco'){
  // The published warehouse region excludes AK, HI, PR and territories; do not apply its prices there.
  const prefix=Number((zip??'').slice(0,3));
  return /^\d{5}(?:-\d{4})?$/.test(zip??'')&&prefix>=10&&prefix<967?{provider:'costco',id:'costco-us-warehouse',store:'Costco',region:'US contiguous warehouses'}:null;
 }
 const z=(zip??'').match(/^(\d{5})(?:-\d{4})?$/)?.[1];
 return z?{provider:'flipp',id:`flipp:${info.merchant}:${z}`,store:info.store,region:`ZIP ${z}`,merchant:info.merchant,zip:z}:null;
}
