import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {prisma} from './db';
import {executeModuleTool,moduleSchemas} from './assistant-modules';
import {voiceTools} from './voice/configuration';
let owner='',other='';
beforeAll(async()=>{for(const who of ['owner','other']){const u=await prisma.user.create({data:{email:randomUUID()+'@example.com',name:who,passwordHash:''}});if(who==='owner')owner=u.id;else other=u.id;}});
afterAll(async()=>{await prisma.user.deleteMany({where:{id:{in:[owner,other]}}});});
it('exposes the same validated module tools to voice',()=>{for(const name of Object.keys(moduleSchemas))expect(voiceTools.some(t=>t.name===name)).toBe(true);});
it('creates each category without festival lookup and deduplicates retry',async()=>{
 for(const type of ['birthday','anniversary','festival','getWellSoon']){
 const args={title:type,type,date:'2030-09-18',yearly:type!=='getWellSoon',firstName:'Sam'};
 await executeModuleTool(owner,type,'create_moment',args);await executeModuleTool(owner,type,'create_moment',args);
 }
 expect(await prisma.importantMoment.count({where:{userId:owner}})).toBe(4);
 expect((await executeModuleTool(other,'read','find_moments',{query:''})).moments).toEqual([]);
});
it('preserves quantities and sizes, prevents duplicate create, stale edits and foreign access',async()=>{
 const args={title:'Weekly groceries',date:'2030-09-21',weekly:true,items:[{name:'Milk',quantity:'2',size:'1 gallon',notes:'Organic'}]};
 await executeModuleTool(owner,'same','create_shopping_list',args);await executeModuleTool(owner,'same','create_shopping_list',args);
 const lists=await prisma.shoppingList.findMany({where:{userId:owner},include:{items:true}});expect(lists).toHaveLength(1);
 const list=lists[0];expect(list.items[0]).toMatchObject({quantity:'2',size:'1 gallon'});
 const edit={listId:list.id,revision:0,operation:'check',itemIds:[list.items[0].id],items:[]};
 await expect(executeModuleTool(other,'edit','edit_shopping_items',edit)).rejects.toThrow('not found');
 await executeModuleTool(owner,'edit','edit_shopping_items',edit);
 await expect(executeModuleTool(owner,'retry','edit_shopping_items',edit)).rejects.toThrow();
 expect((await executeModuleTool(other,'read','find_shopping_lists',{query:''})).lists).toEqual([]);
});
it('updates a moment while rejecting stale dates',async()=>{
 const moment=await prisma.importantMoment.findFirstOrThrow({where:{userId:owner}});
 const args={momentId:moment.id,updatedAt:moment.updatedAt.toISOString(),title:'Updated occasion',date:'2030-10-20',yearly:false};
 await executeModuleTool(owner,'update','update_moment',args);
 expect((await prisma.importantMoment.findUniqueOrThrow({where:{id:moment.id}})).occurrenceDate).toBe('2030-10-20');
 await expect(executeModuleTool(owner,'stale','update_moment',args)).rejects.toThrow('changed');
});
it('reads bounded nutrition totals without leaking other users or treating missing data as zero',async()=>{
 await prisma.foodLogEntry.createMany({data:[
  {userId:owner,localDate:'2030-10-01',meal:'LUNCH',description:'Lunch',foodName:'Lentils',kcal:400,proteinG:20,source:'MANUAL'},
  {userId:owner,localDate:'2030-10-02',meal:'DINNER',description:'Dinner',foodName:'Soup',kcal:200,source:'MANUAL',status:'NEEDS_REVIEW'},
  {userId:other,localDate:'2030-10-01',meal:'LUNCH',description:'Other',foodName:'Other',kcal:999,source:'MANUAL'},
 ]});
 const result=await executeModuleTool(owner,'read','find_nutrition_summary',{from:'2030-10-01',to:'2030-10-07'});
 expect(result).toMatchObject({success:true,loggedDays:2,calendarDays:7,entryCount:2,needsReview:1,
  totals:{kcal:{total:600},proteinG:{total:20,knownEntries:1,totalEntries:2},fiberG:{total:null,knownEntries:0}}});
 expect((result.daily as {date:string;logged:boolean}[]).find(d=>d.date==='2030-10-03')?.logged).toBe(false);
 await expect(executeModuleTool(owner,'read','find_nutrition_summary',{from:'2030-10-08',to:'2030-10-01'})).rejects.toThrow('31 days');
 await expect(executeModuleTool(owner,'read','find_nutrition_summary',{from:'2030-01-01',to:'2030-10-01'})).rejects.toThrow('31 days');
 expect(moduleSchemas.find_nutrition_summary.safeParse({from:'2030-02-30',to:'2030-03-01'}).success).toBe(false);
 const empty=await executeModuleTool(owner,'read','find_nutrition_summary',{from:'2031-01-01',to:'2031-01-07'});
 expect(empty).toMatchObject({entryCount:0,loggedDays:0,totals:{kcal:{total:null}}});
});
