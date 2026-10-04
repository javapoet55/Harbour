import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {prisma} from '@/server/db';
import {shoppingAction} from '../service';
import {matchOffer,sourceForList,storeForName,isCostco,type OfferRecord,type OfferSourceDef} from './domain';
import {flippOffers} from './flipp';
import {parseCostco,COSTCO_SOURCE} from './costco';
import {collectOffers,listOffers,chooseOffer} from './service';
const now=new Date();
const deal=(extra:Partial<OfferRecord>={}):OfferRecord=>({id:'deal',product:'Starbucks Ground Coffee',brand:'Starbucks',packageSize:'12 oz',price:'$7.99',savings:'$2 off',unitPrice:null,conditions:'Membership required',imageURL:null,sourceURL:COSTCO_SOURCE,startsAt:new Date(+now-86400000),expiresAt:new Date(+now+86400000),checkedAt:now,...extra});
it('distinguishes matching, unbranded, alternative, and unrelated products',()=>{
 const item={name:'Starbucks ground coffee',brand:'Starbucks',size:'12 oz',notes:''};
 expect(matchOffer(item,deal())?.category).toBe('matching');
 expect(matchOffer({...item,name:'Coffee',brand:null,size:''},deal())?.category).toBe('available');
 expect(matchOffer({...item,size:'32 oz'},deal())?.category).toBe('alternative');
 expect(matchOffer({...item,notes:'Organic'},deal())?.differences.join()).toContain('organic');
 expect(matchOffer({...item,brand:'Peet’s Coffee'},deal())?.category).toBe('alternative');
 expect(matchOffer({...item,name:'Coffee maker'},deal())).toBeNull();
 expect(matchOffer({...item,name:'Eggs'},deal())).toBeNull();
});
it('does not guess location support',()=>{
 expect(sourceForList('Costco','94040')?.id).toBe('costco-us-warehouse');
 for(const zip of ['99501','96701','00901','',null])expect(sourceForList('Costco',zip)).toBeNull();
 expect(sourceForList('Target','94040')).toBeNull();
});
it('maps Safeway-family store names to per-ZIP sources and keeps unsupported stores unsupported',()=>{
 expect(storeForName('Safeway')?.store).toBe('Safeway');
 expect(storeForName('safeway - bay area')?.merchant).toBe('safeway');
 expect(storeForName('VONS')?.merchant).toBe('vons');
 expect(storeForName('Jewel-Osco')?.merchant).toBe('jewelosco');
 expect(storeForName('Albertsons Market')?.merchant).toBe('albertsonsmarket');
 expect(storeForName('Tom Thumb')?.merchant).toBe('tomthumb');
 for(const name of ['Whole Foods','Trader Joe\'s','Costco Business Center',null])expect(storeForName(name)).toBeNull();
 expect(sourceForList('Safeway','95014')).toMatchObject({provider:'flipp',id:'flipp:safeway:95014',merchant:'safeway',zip:'95014'});
 expect(sourceForList('Vons','90210-1234')?.id).toBe('flipp:vons:90210');
 expect(sourceForList('Safeway','ABCDE')).toBeNull();
});
const flippPub={id:1,name:'Weekly Ad - Safeway - NorCal',pdf_url:'https://f.wishabi.net/flyers/1/x.pdf',valid_from:new Date(+now-86400000).toISOString(),valid_to:new Date(+now+86400000).toISOString()};
const safeway:OfferSourceDef={provider:'flipp',id:'flipp:safeway:95014',store:'Safeway',region:'ZIP 95014',merchant:'safeway',zip:'95014'};
const flippItem=(id:number,extra={})=>({id,name:'Lucerne Milk',brand:'Lucerne',price_text:'2.99',...extra});
it('maps Flipp weekly ad items to offers without inventing prices',()=>{
 const items=[
  flippItem(1),
  flippItem(2,{price_text:undefined,current_price:'5.00',pre_price_text:'2 for',post_price_text:'member price',brand:undefined,name:'Fresh Express Salad Kit'}),
  flippItem(3,{price_text:undefined,current_price:undefined,sale_story:'BUY 1 GET 1 FREE Member Price When you Buy 2',disclaimer_text:'EQUAL OR LESSER VALUE',name:'Chicken Breasts',image_url:'https://img/x'}),
  flippItem(4,{price_text:undefined,current_price:undefined,name:'Free Item'}), // no price or savings: skipped
 ];
 const offers=flippOffers(items,flippPub,safeway,now);
 expect(offers).toHaveLength(3);
 expect(offers[0].price).toBe('$2.99');expect(offers[0].brand).toBe('Lucerne');
 expect(offers[1].price).toBe('2 for $5.00 member price');
 expect(offers[2].savings).toContain('BUY 1 GET 1 FREE');expect(offers[2].conditions).toContain('Safeway');expect(offers[2].conditions).toContain('95014');expect(offers[2].imageURL).toBe('https://img/x');
 expect(new Set(offers.map(o=>o.id)).size).toBe(offers.length);
});
const tile=(i:number,availability:string,name='Peet&#x27;s Coffee Ground Coffee')=>`<a data-testid="Link" href="https://www.costco.com/product-${i}"><span class="mui-jde8tf">${name}</span></a><div data-testid="Text">${availability}</div><div id="x-item-description"><div data-testid="MarkdownRenderer" class="mui-1upc632"><div class="mui-1y8o037" data-testid="Text">${name}</div></div></div><div data-testid="MarkdownRenderer" class="mui-a1b2c3"><div class="mui-zz9" data-testid="Text">32 oz</div></div><div class="mui-x4n4mc"><div class="mui-1kmtvi0" data-testid="Text">Item ${100+i}</div>`;
function fixture(save:boolean){return 'Pricing may vary by location in AK, HI, PR, Costco Business Centers and online | Valid 9/21/26 - 10/18/26'+Array.from({length:5},(_,i)=>`${tile(i,'Warehouse')}<div>Limit 5.</div></div>${save?'<div data-testid="Text_prices_and_percentages_prepend_text">Save</div>':''}<p data-testid="Text_prices_and_percentages_prices"><span>$</span><span>6</span><span>.</span><span>50</span></p>${save?'':'<div data-testid="Text_prices_and_percentages_append_text">After $2 OFF</div>'}`).join('');}
it('extracts advertised savings without inventing a selling price or unit price',()=>{
 const savings=parseCostco(fixture(true),now);expect(savings).toHaveLength(5);expect(savings[0].price).toBeNull();expect(savings[0].savings).toBe('$6.50 off');expect(savings[0].unitPrice).toBeNull();expect(savings[0].packageSize).toBe('32 oz');
 const priced=parseCostco(fixture(false),now);expect(priced[0].price).toBe('$6.50');expect(priced[0].savings).toBe('$2 OFF');
 expect(()=>parseCostco('<html>Access denied</html>')).toThrow();
});
it('keeps Warehouse Only offers and drops Online Only ones',()=>{
 const price='<p data-testid="Text_prices_and_percentages_prices">$4</p><div data-testid="Text_prices_and_percentages_append_text">After $2 OFF</div>';
 const html=fixture(true)+tile(7,'Warehouse Only','Sukhi&#x27;s Butter Chicken')+'</div>'+price+tile(8,'Online Only','Online Coffee')+'</div>'+price;
 const offers=parseCostco(html,now);
 expect(offers.map(o=>o.product)).toContain("Sukhi's Butter Chicken");
 expect(offers.map(o=>o.product)).not.toContain('Online Coffee');
});
it('accepts common Costco store names but not Business Centers or other stores',()=>{
 for(const name of ['Costco','COSTCO Wholesale','Costco - Mountain View','costco.com'])expect(isCostco(name)).toBe(true);
 for(const name of ['Costco Business Center','Target','Costcutter',null])expect(isCostco(name)).toBe(false);
});
it('does not match staples to products that only mention them, and covers more Costco categories',()=>{
 const item=(name:string)=>({name,brand:null,size:'',notes:''});
 const offer=(product:string)=>deal({product,brand:null});
 expect(matchOffer(item('Butter'),offer('St Michel La Grande Galette French Butter Cookies'))).toBeNull();
 expect(matchOffer(item('Butter'),offer('Nature Valley Peanut Butter Dark Chocolate Protein Chewy Bars'))).toBeNull();
 expect(matchOffer(item('Rice'),offer("Kellogg's Original Rice Krispies Treats"))).toBeNull();
 expect(matchOffer(item('Rice'),offer('Weider Red Yeast Rice Plus'))).toBeNull();
 expect(matchOffer(item('Chicken'),offer("Campbell's Simply Chicken Noodle Soup"))).toBeNull();
 expect(matchOffer(item('Chicken'),offer('Blue Buffalo Top Chews Dog Treats Chicken & Apple Recipe Sausage Bites'))).toBeNull();
 expect(matchOffer(item('Protein bars'),offer('Nature Valley Peanut Butter Dark Chocolate Protein Chewy Bars'))?.category).toBe('available');
 expect(matchOffer(item('Shampoo'),offer('Pantene Essential Botanicals Hydrating Volume Shampoo'))?.category).toBe('available');
 expect(matchOffer(item('Sparkling water'),offer('Waterloo Sparkling Water'))?.category).toBe('available');
 expect(matchOffer(item('Tylenol'),offer('Tylenol Extra Strength'))?.category).toBe('available');
 expect(matchOffer(item('Tylenol'),offer('Advil Liqui-Gels'))).toBeNull();
 expect(matchOffer(item('Fish oil'),offer('OLLY Sleep'))).toBeNull();
});
let owner='',other='';
beforeAll(async()=>{owner=(await prisma.user.create({data:{email:randomUUID()+'@example.com',name:'Owner',passwordHash:''}})).id;other=(await prisma.user.create({data:{email:randomUUID()+'@example.com',name:'Other',passwordHash:''}})).id;});
beforeEach(async()=>{vi.stubEnv('SHOPPING_OFFERS_ENABLED','true');await prisma.shoppingOfferSource.deleteMany();});
afterAll(async()=>{vi.unstubAllEnvs();await prisma.user.deleteMany({where:{id:{in:[owner,other]}}});await prisma.shoppingOfferSource.deleteMany();});
async function makeList(store:{storeName?:string,storeAddress?:string,storeZip?:string}={},itemName='Coffee'){return (await shoppingAction(owner,{operation:'create',input:{title:'Weekly',date:'2030-10-01',timeZone:'America/Los_Angeles',weekly:true,storeName:'Costco',storeAddress:'Test address',storeZip:'94040',...store,items:[{id:randomUUID(),name:itemName,size:'',notes:'',category:'Drinks',quantity:'1',checked:false}]}}) as {list:NonNullable<Awaited<ReturnType<typeof prisma.shoppingList.findUnique>>> & {items:{id:string}[]}}).list;}
it('collects once per shared region and retries failures without presenting them as success',async()=>{
 const collect=vi.fn().mockResolvedValue([deal()]);
 await collectOffers(now,{costco:collect});await collectOffers(now,{costco:collect});expect(collect).toHaveBeenCalledTimes(1);
 await prisma.shoppingOfferSource.updateMany({data:{nextCheckAt:now}});
 await collectOffers(now,{costco:async()=>{throw Error('offline')}});
 const source=await prisma.shoppingOfferSource.findFirstOrThrow();expect(source.failures).toBe(1);expect(source.nextCheckAt>now).toBe(true);expect(source.lastSuccessAt?.getTime()).toBe(now.getTime());
});
it('matches saved edits, hides expired and stale offers, and isolates owners',async()=>{
 await collectOffers(now,{costco:async()=>[deal(),deal({id:'expired',expiresAt:new Date(+now-1)})]});
 const list=await makeList();expect((await listOffers(owner,list.id)).matches).toHaveLength(1);
 await expect(listOffers(other,list.id)).rejects.toMatchObject({status:404});
 await prisma.shoppingOfferSource.updateMany({data:{lastSuccessAt:new Date(+now-49*3600000)}});
 expect((await listOffers(owner,list.id)).matches).toHaveLength(0);
});
it('chooses, preserves through checkbox saves, removes and protects offer selections',async()=>{
 await collectOffers(now,{costco:async()=>[deal()]});const list=await makeList(),item=list.items[0];
 await expect(chooseOffer(other,list.id,item.id,'deal',0)).rejects.toMatchObject({status:404});
 await expect(chooseOffer(owner,list.id,item.id,'made-up',0)).rejects.toMatchObject({status:409});
 const chosen=(await chooseOffer(owner,list.id,item.id,'deal',0)).list!;
 expect(chosen.items[0].chosenOffer).toMatchObject({product:'Starbucks Ground Coffee',store:'Costco',packageSize:'12 oz'});
 const saved=(await shoppingAction(owner,{operation:'save',id:list.id,revision:chosen.revision,input:{...chosen,items:chosen.items.map(i=>({...i,checked:true}))}}) as {list:typeof chosen}).list;
 expect(saved.items[0].chosenOffer).toMatchObject({id:'deal'});
 await expect(chooseOffer(owner,list.id,item.id,null,0)).rejects.toMatchObject({status:409});
 expect((await chooseOffer(owner,list.id,item.id,null,saved.revision)).list!.items[0].chosenOffer).toBeNull();
});
it('clears chosen offers when preferences change and carries store settings to the next trip',async()=>{
 await collectOffers(now,{costco:async()=>[deal()]});const list=await makeList();const chosen=(await chooseOffer(owner,list.id,list.items[0].id,'deal',0)).list!;
 const changed=(await shoppingAction(owner,{operation:'save',id:list.id,revision:chosen.revision,input:{...chosen,items:chosen.items.map(i=>({...i,size:'32 oz'}))}}) as {list:typeof chosen}).list;
 expect(changed.items[0].chosenOffer).toBeNull();
 const next=(await shoppingAction(owner,{operation:'complete',id:list.id,revision:changed.revision}) as {list:typeof chosen}).list;
 expect(next.storeZip).toBe('94040');expect(next.items[0].chosenOffer).toBeNull();
});
it('creates a per-ZIP source only for stores customers use, collects it, and matches its offers',async()=>{
 const flipp=vi.fn(async()=>[deal({id:'flipp-deal',product:'Lucerne Milk',brand:'Lucerne',sourceURL:'https://f.wishabi.net/flyers/1/x.pdf'})]);
 const list=await makeList({storeName:'Safeway',storeAddress:'Homestead Rd',storeZip:'95014'},'Milk');
 await collectOffers(now,{flipp});
 const source=await prisma.shoppingOfferSource.findUnique({where:{id:'flipp:safeway:95014'}});
 expect(source).toMatchObject({store:'Safeway',region:'ZIP 95014',failures:0});
 expect(flipp).toHaveBeenCalledWith(expect.objectContaining({merchant:'safeway',zip:'95014'}),now);
 const snapshot=await listOffers(owner,list.id);
 expect(snapshot.matches[0].offer.store).toBe('Safeway');
 expect(snapshot.status).toContain('Safeway');
 expect(snapshot.status).toContain('95014');
 // A source is only kept while a list uses it.
 await prisma.shoppingList.deleteMany({where:{id:list.id}});
 await collectOffers(now,{flipp});
 expect(await prisma.shoppingOfferSource.findUnique({where:{id:'flipp:safeway:95014'}})).toBeNull();
});
it('lets a customer choose a weekly ad offer for their list',async()=>{
 const list=await makeList({storeName:'Safeway',storeZip:'95014'},'Milk');
 await prisma.shoppingOfferSource.create({data:{id:'flipp:safeway:95014',store:'Safeway',region:'ZIP 95014',url:'https://www.safeway.com/weeklyad',lastSuccessAt:now,lastCheckedAt:now,nextCheckAt:now}});
 await prisma.shoppingOffer.create({data:{...deal({id:'flipp-deal',product:'Lucerne Milk'}),sourceId:'flipp:safeway:95014'}});
 const chosen=(await chooseOffer(owner,list.id,list.items[0].id,'flipp-deal',list.revision)).list!;
 expect(chosen.items[0].chosenOffer).toMatchObject({product:'Lucerne Milk',store:'Safeway'});
});
