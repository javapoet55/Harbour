import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {prisma} from '@/server/db';
import {shoppingAction,shoppingLists} from './service';
import {parseShopping,nextShoppingDate,listInput} from './domain';
let owner='',other='';
beforeAll(async()=>{owner=(await prisma.user.create({data:{email:randomUUID()+'@example.com',name:'Shopper',passwordHash:''}})).id;other=(await prisma.user.create({data:{email:randomUUID()+'@example.com',name:'Other',passwordHash:''}})).id});
afterAll(async()=>{await prisma.user.deleteMany({where:{id:{in:[owner,other]}}})});
const input=()=>({title:'Weekly Shopping',date:'2030-09-21',timeZone:'America/Los_Angeles',weekly:true,items:[{id:randomUUID(),name:'Milk',category:'Dairy & Eggs',quantity:'2',size:'1 gallon',notes:'Organic',checked:true}]});
describe('shopping lists',()=>{
 it('parses continuous dictation into editable quantities and sizes',()=>{
  const result=parseShopping('Add six bananas, one gallon of milk; eggs and four organic tomatoes.');
  expect(result.map(i=>[i.name,i.quantity,i.size])).toEqual([['bananas','6',''],['milk','1','gallon'],['eggs','1',''],['organic tomatoes','4','']]);
  expect(result.map(i=>i.category)).toEqual(['Produce','Dairy & Eggs','Dairy & Eggs','Produce']);
  expect(parseShopping('one and a half pounds of chicken')[0]).toMatchObject({quantity:'1.5',size:'pounds',name:'chicken'});
  expect(parseShopping('ice cream')[0].category).toBe('Frozen');
  expect(parseShopping('mac and cheese')).toHaveLength(1);
  expect(parseShopping('two bags of rice 5 kg')[0]).toMatchObject({quantity:'2',size:'bags · 5 kg',name:'rice'});
 });
 it('preserves local weekly dates across month/year and skipped weeks',()=>{
  expect(nextShoppingDate('2026-12-26','2026-12-26')).toBe('2027-01-02');
  expect(nextShoppingDate('2026-09-05','2026-09-22')).toBe('2026-09-26');
  expect(listInput.safeParse({...input(),date:'2030-02-30'}).success).toBe(false);
 });
 it('persists item details, rejects stale edits and prevents cross-account access',async()=>{
  const created=await shoppingAction(owner,{operation:'create',input:input()});
  if(!('list' in created)||!created.list)throw Error('Missing list');
  const list=created.list;
  expect(list.items[0]).toMatchObject({quantity:'2',size:'1 gallon',notes:'Organic'});
  await expect(shoppingAction(other,{operation:'save',id:list.id,revision:0,input:input()})).rejects.toThrow('not found');
  await shoppingAction(owner,{operation:'save',id:list.id,revision:0,input:{...input(),title:'Costco'}});
  await expect(shoppingAction(owner,{operation:'save',id:list.id,revision:0,input:input()})).rejects.toThrow('changed');
  expect((await shoppingLists(other))).toHaveLength(0);
 });
 it('completes a trip once and copies groceries unchecked into next week',async()=>{
  const created=await shoppingAction(owner,{operation:'create',input:input()});if(!('list'in created)||!created.list)throw Error();
  const result=await shoppingAction(owner,{operation:'complete',id:created.list.id,revision:0});if(!('list'in result)||!result.list)throw Error();
  expect(result.list.date).toBe('2030-09-28');expect(result.list.items[0].checked).toBe(false);
  expect(result.list.items[0].size).toBe('1 gallon');
  expect((await prisma.shoppingList.findUniqueOrThrow({where:{id:created.list.id}})).completedAt).not.toBeNull();
  await expect(shoppingAction(owner,{operation:'complete',id:created.list.id,revision:0})).rejects.toThrow('changed');
  expect(await prisma.shoppingList.count({where:{generatedFrom:created.list.id}})).toBe(1);
 });
 it('only shares explicitly, revokes access and deletes owned items',async()=>{
  const created=await shoppingAction(owner,{operation:'create',input:input()});if(!('list'in created)||!created.list)throw Error();
  const list=created.list;expect(list.shareToken).toBeNull();
  const shared=await shoppingAction(owner,{operation:'share',id:list.id});if(!('list'in shared)||!shared.list)throw Error();
  expect(shared.list.shareToken).toMatch(/^[a-f0-9]{64}$/);
  await expect(shoppingAction(other,{operation:'share',id:list.id})).rejects.toThrow('not found');
  await shoppingAction(owner,{operation:'revoke',id:list.id});
  expect(await prisma.shoppingList.findUnique({where:{shareToken:shared.list.shareToken!}})).toBeNull();
  await shoppingAction(owner,{operation:'delete',id:list.id,revision:0});
  expect(await prisma.shoppingItem.count({where:{listId:list.id}})).toBe(0);
 });
 it('keeps attached images through save and weekly copy, and removes them explicitly',async()=>{
  const data={...input(),items:[{...input().items[0],imageData:'/9j/AA=='}]};
  const created=await shoppingAction(owner,{operation:'create',input:data});if(!('list'in created)||!created.list)throw Error();
  expect(created.list.items[0].imageData).toBe('/9j/AA==');
  const copied=await shoppingAction(owner,{operation:'complete',id:created.list.id,revision:0});if(!('list'in copied)||!copied.list)throw Error();
  expect(copied.list.items[0].imageData).toBe('/9j/AA==');
  const saved=await shoppingAction(owner,{operation:'save',id:copied.list.id,revision:0,input:{...data,items:[{...data.items[0],imageData:null}]}});
  if(!('list'in saved)||!saved.list)throw Error();expect(saved.list.items[0].imageData).toBeNull();
  expect(listInput.safeParse({...data,items:[{...data.items[0],imageData:'<svg onload=bad>'}]}).success).toBe(false);
 });

});
