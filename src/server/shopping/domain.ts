import {z} from 'zod';
export const categories=['Produce','Dairy & Eggs','Meat & Seafood','Bakery','Pantry','Frozen','Drinks','Household','Other'] as const;
export const itemInput=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(120),category:z.enum(categories).default('Other'),quantity:z.string().trim().max(40).default('1'),size:z.string().trim().max(80).default(''),notes:z.string().trim().max(300).default(''),imageData:z.string().max(90000).regex(/^\/9j\/[A-Za-z0-9+/]*={0,2}$/).nullable().optional(),checked:z.boolean().default(false)});
export const listInput=z.object({title:z.string().trim().min(1).max(100),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const d=new Date(s+'T12:00:00Z');return !isNaN(+d)&&d.toISOString().slice(0,10)===s},'Choose a valid date'),timeZone:z.string().refine(s=>{try{new Intl.DateTimeFormat('en',{timeZone:s});return true}catch{return false}},'Invalid time zone'),weekly:z.boolean(),items:z.array(itemInput).max(300).refine(a=>new Set(a.map(i=>i.id)).size===a.length,'Duplicate item IDs')});
export function nextShoppingDate(day:string,today:string) {
 const d=new Date(day+'T12:00:00Z');
 do{d.setUTCDate(d.getUTCDate()+7)}while(d.toISOString().slice(0,10)<=today);
 return d.toISOString().slice(0,10);
}
export function categoryFor(name:string):typeof categories[number] {
 for(const [category,pattern] of [
 ['Frozen',/frozen|ice cream/i],
 ['Produce',/banana|apple|tomato|spinach|lettuce|onion|potato|carrot|avocado|berry|berries|lemon|orange|broccoli|pepper|cucumber|grape/i],
 ['Dairy & Eggs',/milk|egg|cheese|yogurt|butter|cream/i],
 ['Meat & Seafood',/chicken|beef|pork|salmon|fish|shrimp|turkey/i],
 ['Bakery',/bread|bagel|bun|tortilla|croissant/i],
 ['Drinks',/water|juice|soda|coffee|tea\b/i],
 ['Household',/soap|detergent|tissue|towel|shampoo|toilet/i],
 ['Pantry',/rice|pasta|flour|sugar|salt|oil|sauce|bean|cereal|oat|can|honey/i]
 ] as const) if(pattern.test(name))return category;
 return 'Other';
}
/** Deterministic, private parsing. Every result is editable before saving. */
export function parseShopping(text:string) {
 const numbers:Record<string,string>={a:'1',an:'1',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10',eleven:'11',twelve:'12',half:'0.5'};
 return text.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten) and a half\b/gi,(_,n)=>String(Number(numbers[n.toLowerCase()])+0.5)).replace(/mac and cheese/gi,'mac & cheese').replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|a|an)\b/gi,m=>numbers[m.toLowerCase()])
 .split(/[,;\n]+|\s+and\s+/i).map(part=>{
  let name=part.trim().replace(/^(?:please\s+)?(?:add|buy|we need|i need|also|then)\s+/i,'').replace(/[.!]+$/,'').trim();
  let quantity='1',size='';
  const leading=name.match(/^(\d+(?:\.\d+)?(?:\/\d+)?)\s+/);
  if(leading){quantity=leading[1];name=name.slice(leading[0].length)}
  const pack=name.match(/^(bottles?|bags?|boxes|box|packs?|cans?|cartons?|dozen|gallons?|liters?|litres?|pounds?|lbs?|kg|grams?|ounces?|oz)\s+(?:of\s+)?/i);
  if(pack){size=pack[1];name=name.slice(pack[0].length)}
  const amount=name.match(/\s+(\d+(?:\.\d+)?\s*(?:oz|ounces?|gallons?|gal|liters?|litres?|ml|kg|g|lbs?|pounds?))\b/i);
  if(amount){size=[size,amount[1]].filter(Boolean).join(' · ');name=name.replace(amount[0],'')}
  name=name.trim();
  return {name,quantity,size,notes:'',category:categoryFor(name),checked:false};
 }).filter(i=>i.name.length>0).slice(0,100);
}
