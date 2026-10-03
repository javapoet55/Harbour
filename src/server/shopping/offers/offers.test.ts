import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {prisma} from '@/server/db';
import {shoppingAction} from '../service';
import {matchOffer,sourceForStore,type OfferRecord} from './domain';
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
 expect(sourceForStore('Costco','94040')).toBe('costco-us-warehouse');
 for(const zip of ['99501','96701','00901','',null])expect(sourceForStore('Costco',zip)).toBeNull();
 expect(sourceForStore('Target','94040')).toBeNull();
});
function fixture(save:boolean){return 'Pricing may vary by location in AK, HI, PR, Costco Business Centers and online | Valid 9/21/26 - 10/18/26'+Array.from({length:5},(_,i)=>`<a data-testid="Link" href="https://www.costco.com/product-${i}"><span>Peet&#x27;s Coffee Ground Coffee</span></a><div>Warehouse</div><div class="mui-17ue058" data-testid="Text">32 oz</div><div>Item ${100+i}</div><div>Limit 5.</div>${save?'<div data-testid="Text_prices_and_percentages_prepend_text">Save</div>':''}<p data-testid="Text_prices_and_percentages_prices"><span>$</span><span>6</span><span>.</span><span>50</span></p>${save?'':'<div data-testid="Text_prices_and_percentages_append_text">After $2 OFF</div>'}`).join('');}
it('extracts advertised savings without inventing a selling price or unit price',()=>{
 const savings=parseCostco(fixture(true),now);expect(savings).toHaveLength(5);expect(savings[0].price).toBeNull();expect(savings[0].savings).toBe('$6.50 off');expect(savings[0].unitPrice).toBeNull();expect(savings[0].packageSize).toBe('32 oz');
 const priced=parseCostco(fixture(false),now);expect(priced[0].price).toBe('$6.50');expect(priced[0].savings).toBe('$2 OFF');
 expect(()=>parseCostco('<html>Access denied</html>')).toThrow();
});
let owner='',other='';
beforeAll(async()=>{owner=(await prisma.user.create({data:{email:randomUUID()+'@example.com',name:'Owner',passwordHash:''}})).id;other=(await prisma.user.create({data:{email:randomUUID()+'@example.com',name:'Other',passwordHash:''}})).id;});
beforeEach(async()=>{vi.stubEnv('SHOPPING_OFFERS_ENABLED','true');await prisma.shoppingOfferSource.deleteMany();});
afterAll(async()=>{vi.unstubAllEnvs();await prisma.user.deleteMany({where:{id:{in:[owner,other]}}});await prisma.shoppingOfferSource.deleteMany();});
async function makeList(){return (await shoppingAction(owner,{operation:'create',input:{title:'Weekly',date:'2030-10-01',timeZone:'America/Los_Angeles',weekly:true,storeName:'Costco',storeAddress:'Test address',storeZip:'94040',items:[{id:randomUUID(),name:'Coffee',size:'',notes:'',category:'Drinks',quantity:'1',checked:false}]}}) as {list:NonNullable<Awaited<ReturnType<typeof prisma.shoppingList.findUnique>>> & {items:{id:string}[]}}).list;}
it('collects once per shared region and retries failures without presenting them as success',async()=>{
 const collect=vi.fn().mockResolvedValue([deal()]);
 await collectOffers(collect,now);await collectOffers(collect,now);expect(collect).toHaveBeenCalledTimes(1);
 await prisma.shoppingOfferSource.updateMany({data:{nextCheckAt:now}});
 await collectOffers(async()=>{throw Error('offline')},now);
 const source=await prisma.shoppingOfferSource.findFirstOrThrow();expect(source.failures).toBe(1);expect(source.nextCheckAt>now).toBe(true);expect(source.lastSuccessAt?.getTime()).toBe(now.getTime());
});
it('matches saved edits, hides expired and stale offers, and isolates owners',async()=>{
 await collectOffers(async()=>[deal(),deal({id:'expired',expiresAt:new Date(+now-1)})],now);
 const list=await makeList();expect((await listOffers(owner,list.id)).matches).toHaveLength(1);
 await expect(listOffers(other,list.id)).rejects.toMatchObject({status:404});
 await prisma.shoppingOfferSource.updateMany({data:{lastSuccessAt:new Date(+now-49*3600000)}});
 expect((await listOffers(owner,list.id)).matches).toHaveLength(0);
});
it('chooses, preserves through checkbox saves, removes and protects offer selections',async()=>{
 await collectOffers(async()=>[deal()],now);const list=await makeList(),item=list.items[0];
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
 await collectOffers(async()=>[deal()],now);const list=await makeList();const chosen=(await chooseOffer(owner,list.id,list.items[0].id,'deal',0)).list!;
 const changed=(await shoppingAction(owner,{operation:'save',id:list.id,revision:chosen.revision,input:{...chosen,items:chosen.items.map(i=>({...i,size:'32 oz'}))}}) as {list:typeof chosen}).list;
 expect(changed.items[0].chosenOffer).toBeNull();
 const next=(await shoppingAction(owner,{operation:'complete',id:list.id,revision:changed.revision}) as {list:typeof chosen}).list;
 expect(next.storeZip).toBe('94040');expect(next.items[0].chosenOffer).toBeNull();
});
