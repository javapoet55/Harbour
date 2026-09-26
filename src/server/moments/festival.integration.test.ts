import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {prisma} from '@/server/db';
import {saveMoment,generateDraft,approveDraft,schedule,changePlan} from './service';
import {saveFestival,deleteFestival,festivalSettings,refreshFestivalCatalog} from './festival';
let userId='';
beforeAll(async()=>{userId=(await prisma.user.create({data:{email:randomUUID()+'@example.com',name:'Fixture',passwordHash:''}})).id;});
afterAll(async()=>{await prisma.user.delete({where:{id:userId}});vi.unstubAllEnvs();});
async function fixture(){const m=await saveMoment(userId,{type:'festival',title:'Happy Diwali',firstName:'Fixture',phone:'+15555550123',email:randomUUID()+'@example.com',occurrenceDate:'2030-10-20',timeZoneID:'America/Los_Angeles',source:'manual',sourceKey:randomUUID()});const settings=festivalSettings.parse({groupID:randomUUID(),channels:{a:'messages'}});return {m,input:{ids:[m.id],title:m.title,date:m.occurrenceDate,timeZoneID:m.timeZoneID,yearly:false,active:true,recipients:[{id:m.id,key:'a',name:'Fixture',phone:m.phone,email:m.email,selected:true}],settings}};}
async function makePlan(id:string){const {draft}=await generateDraft(userId,{momentID:id,tone:'Warm'});await approveDraft(userId,{id:draft.id,body:draft.body,approved:true});return schedule(userId,{draftID:draft.id,channel:'messages',recipient:'+15555550123',scheduledAtUTC:'2030-10-20T15:00:00Z',timeZoneID:'America/Los_Angeles',automaticDelivery:false,reminderOffset:60,repeatYearly:false,idempotencyKey:randomUUID(),approved:true});}
it('persists festival settings and rejects foreign IDs',async()=>{const {m,input}=await fixture();await saveFestival(userId,input);expect(JSON.parse((await prisma.importantMoment.findUniqueOrThrow({where:{id:m.id}})).festivalSettings).groupID).toBe(input.settings.groupID);await expect(saveFestival('other',input)).rejects.toThrow('not found');});
it('rejects duplicate recipients and unsupported image delivery',async()=>{const {input}=await fixture();await expect(saveFestival(userId,{...input,recipients:[...input.recipients,{...input.recipients[0],id:undefined,key:'b'}]})).rejects.toThrow('duplicate');await expect(saveFestival(userId,{...input,settings:{...input.settings,includeImage:true}})).rejects.toThrow('Image attachments');});
it('disabling cancels plans and preserves the draft',async()=>{const {m,input}=await fixture();const plan=await makePlan(m.id);await expect(saveFestival(userId,{...input,active:false})).rejects.toThrow('schedules');await saveFestival(userId,{...input,active:false,cancelSchedules:true});expect((await prisma.deliveryPlan.findUniqueOrThrow({where:{id:plan.id}})).status).toBe('CANCELLED');expect((await prisma.importantMoment.findUniqueOrThrow({where:{id:m.id}})).enabled).toBe(false);expect(await prisma.wishDraft.count({where:{momentID:m.id}})).toBe(1);});
it('delete removes drafts but keeps sent history',async()=>{const {m}=await fixture();const plan=await makePlan(m.id);await changePlan(userId,{id:plan.id,action:'sent'});await generateDraft(userId,{momentID:m.id,tone:'Fun'});await deleteFestival(userId,{ids:[m.id]});expect((await prisma.deliveryPlan.findUniqueOrThrow({where:{id:plan.id}})).status).toBe('SENT');expect(await prisma.wishDraft.count({where:{momentID:m.id}})).toBe(1);expect(JSON.parse((await prisma.importantMoment.findUniqueOrThrow({where:{id:m.id}})).festivalSettings).archived).toBe(true);});
it('prevents a second active plan through another draft',async()=>{const {m}=await fixture();await makePlan(m.id);await expect(makePlan(m.id)).rejects.toThrow('active wish');});
it('catalog updates cancel affected schedules without fixed annual recurrence',async()=>{const {m,input}=await fixture();await prisma.importantMoment.update({where:{id:m.id},data:{source:'festivalCatalog',festivalSettings:JSON.stringify({...input.settings,catalogID:'fixture',catalogManaged:true})}});const plan=await makePlan(m.id);vi.stubEnv('FESTIVAL_CATALOG_JSON',JSON.stringify([{id:'fixture',name:'Test Festival',dates:['2030-10-25'],sourceURL:'https://example.com/official'}]));await refreshFestivalCatalog(userId,new Date('2030-01-01'));const saved=await prisma.importantMoment.findUniqueOrThrow({where:{id:m.id}});expect(saved.occurrenceDate).toBe('2030-10-25');expect(saved.yearly).toBe(false);expect((await prisma.deliveryPlan.findUniqueOrThrow({where:{id:plan.id}})).status).toBe('CANCELLED');});
it('persists greeting card signature and message',async()=>{const {m,input}=await fixture();await saveFestival(userId,{...input,settings:{...input.settings,cardSignature:'With love, Sri & family',cardGreeting:'Wishing you light and joy.'}});const saved=JSON.parse((await prisma.importantMoment.findUniqueOrThrow({where:{id:m.id}})).festivalSettings);expect(saved.cardSignature).toBe('With love, Sri & family');expect(saved.cardGreeting).toBe('Wishing you light and joy.');});
it('normal saves ignore stale client archive flags and keep the moment editable',async()=>{
 const {m,input}=await fixture();
 await saveFestival(userId,{...input,settings:{...input.settings,archived:true}});
 const saved=await prisma.importantMoment.findUniqueOrThrow({where:{id:m.id}});
 expect(saved.enabled).toBe(true);
 expect(JSON.parse(saved.festivalSettings).archived).toBe(false);
 await saveFestival(userId,{...input,title:'Updated moment'});
 expect((await prisma.importantMoment.findUniqueOrThrow({where:{id:m.id}})).title).toBe('Updated moment');
});
it('stale editors cannot restore a deleted moment',async()=>{
 const {m,input}=await fixture();
 await deleteFestival(userId,{ids:[m.id]});
 await expect(saveFestival(userId,input)).rejects.toThrow('This moment was removed');
 const saved=await prisma.importantMoment.findUniqueOrThrow({where:{id:m.id}});
 expect(saved.enabled).toBe(false);
 expect(JSON.parse(saved.festivalSettings).archived).toBe(true);
});
it('saves an empty recipient list without deleting the moment or inheriting contact data',async()=>{
 const {m,input}=await fixture();
 await saveFestival(userId,{...input,recipients:[]});
 const saved=await prisma.importantMoment.findUniqueOrThrow({where:{id:m.id}});
 expect(saved.enabled).toBe(true);
 expect([saved.firstName,saved.phone,saved.email]).toEqual(['','','']);
 expect(JSON.parse(saved.festivalSettings).archived).toBe(false);
 await saveFestival(userId,{...input,recipients:[],title:'Still empty'});
 expect((await prisma.importantMoment.findUniqueOrThrow({where:{id:m.id}})).title).toBe('Still empty');
});
it('persists hourly preparation reminders and preserves legacy day defaults',async()=>{
 const {m,input}=await fixture();
 expect(input.settings.prepareHours).toBe(0);
 for(const hours of [1,4,8]){
  await saveFestival(userId,{...input,settings:{...input.settings,prepareDays:0,prepareHours:hours}});
  const stored=JSON.parse((await prisma.importantMoment.findUniqueOrThrow({where:{id:m.id}})).festivalSettings);
  expect(stored.prepareHours).toBe(hours);expect(stored.prepareDays).toBe(0);
 }
 expect(festivalSettings.safeParse({...input.settings,prepareHours:2}).success).toBe(false);
});
