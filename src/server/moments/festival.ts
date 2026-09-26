import { z } from 'zod';
import { prisma } from '@/server/db';
import { day, zone, MomentError } from './domain';
import { log } from '@/lib/logger';
import { repointWishText, savedWishMessage } from './wish-message';

export const festivalSettings = z.object({
 prepareHours:z.union([z.literal(0),z.literal(1),z.literal(4),z.literal(8)]).default(0),
 groupID:z.string().min(1).max(200), prepareDays:z.union([z.literal(0),z.literal(1),z.literal(3),z.literal(7),z.literal(14)]).default(1),
 catalogID:z.string().max(80).default(''), catalogManaged:z.boolean().default(false), baseMessage:z.string().max(500).default(''),
 tone:z.enum(['Warm','Personal','Short','Fun']).default('Warm'), personalContext:z.string().max(500).default(''),
 manuallyEdited:z.boolean().default(false), approvedAt:z.string().nullable().default(null),
 includeImage:z.boolean().default(false), imageID:z.string().max(200).default(''), imageStyle:z.string().max(40).default('Traditional'),
 draftSendDate:z.string().datetime().nullable().optional(), draftNotify:z.boolean().nullable().optional(),
 cardSignature:z.string().max(80).nullable().optional(), cardGreeting:z.string().max(500).nullable().optional(),
 imageAspect:z.string().max(40).default('Square'), imagePrompt:z.string().max(1000).default(''),
 overrides:z.record(z.string(),z.string().max(500)).default({}), channels:z.record(z.string(),z.enum(['messages','email','share'])).default({}),
 automatic:z.record(z.string(),z.boolean()).default({}), contactIDs:z.record(z.string(),z.string().max(200)).default({}),
 selected:z.record(z.string(),z.boolean()).default({}), archived:z.boolean().default(false)
});
export function readFestivalSettings(value:string) { try { return JSON.parse(value) as Record<string,unknown>; } catch { return {}; } }
const recipient = z.object({id:z.string().optional(),key:z.string().min(1).max(200),name:z.string().trim().min(1).max(80),phone:z.string().max(40),email:z.union([z.literal(''),z.email()]),selected:z.boolean()});
export const festivalSaveInput = z.object({ids:z.array(z.string()).min(1).max(100),title:z.string().trim().min(1).max(150),date:day,timeZoneID:zone,yearly:z.boolean(),active:z.boolean(),recipients:z.array(recipient).max(100),settings:festivalSettings,cancelSchedules:z.boolean().default(false)});
export async function saveFestival(userId:string,input:unknown) {
 const p=festivalSaveInput.parse(input);
 if(new Set(p.recipients.map(r=>r.key)).size!==p.recipients.length || new Set(p.recipients.flatMap(r=>r.id?[r.id]:[])).size!==p.recipients.filter(r=>r.id).length) throw new MomentError('Remove duplicate recipients.');
 if(p.recipients.length && !p.recipients.some(r=>r.selected)) throw new MomentError('Select at least one recipient.');
 if(p.settings.includeImage) throw new MomentError('Image attachments are not enabled. Exclude the preview image before saving for delivery.');
 const addresses=new Set<string>();
 for(const r of p.recipients.filter(r=>r.selected)) {
  const channel=p.settings.channels[r.key]|| (r.phone?'messages':r.email?'email':'share');
  const address=channel==='email'?r.email.trim().toLowerCase():channel==='messages'?r.phone.replace(/[^+\d]/g,''):r.key;
  if(channel==='email'&&!z.email().safeParse(address).success||channel==='messages'&&!/^\+?\d{7,15}$/.test(address)) throw new MomentError('Choose a valid delivery address for every selected contact.');
  if(addresses.has(channel+':'+address)) throw new MomentError('Remove duplicate delivery addresses.');
  addresses.add(channel+':'+address);
 }
 return prisma.$transaction(async tx=>{
  const moments=await tx.importantMoment.findMany({where:{id:{in:p.ids},userId,type:{in:['festival','birthday','anniversary','getWellSoon']}}});
  if(moments.length!==new Set(p.ids).size) throw new MomentError('Moment not found.',404);
  if(p.recipients.some(r=>r.id&&!p.ids.includes(r.id))) throw new MomentError('Invalid recipient.',400);
  // Archive state belongs to the stored record, not the editable settings payload.
  if(moments.some(m=>readFestivalSettings(m.festivalSettings).archived===true)) throw new MomentError('This moment was removed. Refresh Moments before editing.',409);
  const anchor=moments[0];
  if(moments.some(m=>m.type!==anchor.type)) throw new MomentError('Manage one occasion category at a time.');
  if(anchor.type!=='festival' && p.settings.catalogManaged) throw new MomentError('Catalog dates are only supported for festivals.');
  if(p.settings.catalogManaged && anchor.source!=='festivalCatalog') throw new MomentError('This festival uses manually managed dates.');
  if(p.settings.catalogManaged) {
   const entry=festivalCatalog().find(e=>e.id===p.settings.catalogID);
   if(!entry || !entry.dates.includes(p.date)) throw new MomentError('An official catalog date is not available. Confirm the date manually.');
  }
  const active=await tx.deliveryPlan.count({where:{draft:{momentID:{in:p.ids}},status:{in:['SENDING','SCHEDULED','AWAITING_CONFIRMATION']}}});
  if(await tx.deliveryPlan.count({where:{draft:{momentID:{in:p.ids}},status:'SENDING'}})) throw new MomentError('A delivery is in progress. Refresh before editing.',409);
  // An approved change to the wish text alone keeps the schedules and updates their text below.
  const messageOnly=!!active&&!p.cancelSchedules&&!!p.settings.approvedAt&&onlyMessageChanged(moments,p);
  if(active&&!p.cancelSchedules&&!messageOnly) throw new MomentError('Existing schedules must be cancelled before saving changes. Review and schedule again.',409);
  if(!messageOnly) await tx.deliveryPlan.updateMany({where:{draft:{momentID:{in:p.ids}},status:{in:['SCHEDULED','AWAITING_CONFIRMATION','FAILED']}},data:{status:'CANCELLED'}});
  if(await tx.deliveryPlan.count({where:{draft:{momentID:{in:p.ids}},status:'SENDING'}})) throw new MomentError('A delivery started. Refresh before editing.',409);
  // A moment can be saved before anyone is selected. Keep an empty anchor,
  // without manufacturing a recipient or losing the moment's identity.
  if(!p.recipients.length) {
   await tx.importantMoment.update({where:{id:anchor.id},data:{title:p.title,occurrenceDate:p.date,timeZoneID:p.timeZoneID,yearly:p.settings.catalogManaged?false:p.yearly,enabled:p.active,firstName:'',phone:'',email:'',festivalSettings:JSON.stringify({...p.settings,selected:{},contactIDs:{},archived:false})}});
   await tx.importantMoment.updateMany({where:{id:{in:p.ids.filter(id=>id!==anchor.id)}},data:{enabled:false,festivalSettings:JSON.stringify({...p.settings,archived:true})}});
   return {ok:true};
  }
  const settings=JSON.stringify({...p.settings,archived:false});
  const kept:string[]=[];
  for(const r of p.recipients) {
   const data={title:p.title,occurrenceDate:p.date,timeZoneID:p.timeZoneID,yearly:p.settings.catalogManaged?false:p.yearly,enabled:p.active&&r.selected,firstName:r.name,phone:r.phone,email:r.email,festivalSettings:settings};
   let id=r.id;
   if(id) await tx.importantMoment.update({where:{id},data});
   else id=(await tx.importantMoment.upsert({where:{userId_sourceKey:{userId,sourceKey:anchor.type+':'+p.settings.groupID+':'+r.key}},update:data,create:{...data,userId,type:anchor.type,source:anchor.source,sourceKey:anchor.type+':'+p.settings.groupID+':'+r.key}})).id;
   kept.push(id);
   const text=messageOnly ? savedWishMessage(p.settings,{key:r.key,type:anchor.type,firstName:r.name}) : null;
   if(text) await repointWishText(tx,id,text);
  }
  await tx.importantMoment.updateMany({where:{id:{in:p.ids.filter(id=>!kept.includes(id))}},data:{enabled:false,festivalSettings:JSON.stringify({...p.settings,archived:true})}});
  log('info','festival_details_saved');
  return {ok:true};
 });
}
// Settings that only shape the wish text or the card; everything else changes who, when or how a wish is delivered.
const messageKeys=new Set(['baseMessage','tone','personalContext','manuallyEdited','approvedAt','overrides','cardGreeting','cardSignature','imageID','imageStyle','imageAspect','imagePrompt','draftSendDate','draftNotify']);
function deliverySettings(value:unknown) {
 const parsed=festivalSettings.safeParse(value);
 if(!parsed.success) return null;
 const kept=Object.entries({...parsed.data,archived:false}).filter(([key])=>!messageKeys.has(key));
 return JSON.stringify(kept.sort(([a],[b])=>a<b?-1:1).map(([key,v])=>[key,v&&typeof v==='object'?Object.entries(v).sort(([a],[b])=>a<b?-1:1):v]));
}
/** True when the save keeps every recipient, date and delivery setting and changes only the message or card. */
function onlyMessageChanged(moments:{id:string;title:string;occurrenceDate:string;timeZoneID:string;yearly:boolean;enabled:boolean;firstName:string;phone:string;email:string;festivalSettings:string}[],p:z.infer<typeof festivalSaveInput>) {
 if(!p.recipients.length||p.recipients.length!==moments.length) return false;
 const next=deliverySettings(p.settings);
 return !!next&&p.recipients.every(r=>{
  const m=moments.find(m=>m.id===r.id);
  return !!m&&m.title===p.title&&m.occurrenceDate===p.date&&m.timeZoneID===p.timeZoneID&&m.yearly===(p.settings.catalogManaged?false:p.yearly)&&m.enabled===(p.active&&r.selected)
   &&m.firstName===r.name&&m.phone===r.phone&&m.email===r.email&&deliverySettings(readFestivalSettings(m.festivalSettings))===next;
 });
}
export async function deleteFestival(userId:string,input:unknown) {
 const p=z.object({ids:z.array(z.string()).min(1).max(100)}).parse(input);
 return prisma.$transaction(async tx=>{
  const moments=await tx.importantMoment.findMany({where:{id:{in:p.ids},userId,type:{in:['festival','birthday','anniversary','getWellSoon']}}});
  if(moments.length!==new Set(p.ids).size) throw new MomentError('Moment not found.',404);
  if(await tx.deliveryPlan.count({where:{draft:{momentID:{in:p.ids}},status:'SENDING'}})) throw new MomentError('A send is in progress. Try again after it finishes.',409);
  await tx.deliveryPlan.updateMany({where:{draft:{momentID:{in:p.ids}},status:{in:['SCHEDULED','AWAITING_CONFIRMATION','FAILED']}},data:{status:'CANCELLED'}});
  if(await tx.deliveryPlan.count({where:{draft:{momentID:{in:p.ids}},status:'SENDING'}})) throw new MomentError('A delivery started. Refresh before editing.',409);
  // Keep immutable sent/uncertain history, but remove saved composition and recipient data.
  await tx.wishDraft.deleteMany({where:{momentID:{in:p.ids},plans:{none:{status:{in:['SENT','COPIED','SHARED','UNCERTAIN']}}}}});
  await tx.importantMoment.updateMany({where:{id:{in:p.ids}},data:{enabled:false,firstName:'',phone:'',email:'',festivalSettings:JSON.stringify({archived:true})}});
  log('info','festival_moment_deleted');return {ok:true};
 });
}
const catalogEntry=z.object({id:z.string(),name:z.string(),dates:z.array(day),sourceURL:z.url()});
/** Operator-maintained official dates only; never extrapolate a lunar festival. */
export function festivalCatalog() {
 try {return z.array(catalogEntry).parse(JSON.parse(process.env.FESTIVAL_CATALOG_JSON||'[]'));} catch {return [];}
}

/** Refresh only opted-in catalog dates. Old sent plans are never rewritten. */
export async function refreshFestivalCatalog(userId:string,now=new Date()) {
 const catalog=festivalCatalog();if(!catalog.length)return;
 const moments=await prisma.importantMoment.findMany({where:{userId,type:'festival',source:'festivalCatalog',enabled:true}});
 for(const moment of moments){
  const settings=readFestivalSettings(moment.festivalSettings);
  if(!settings.catalogManaged||settings.archived)continue;
  const entry=catalog.find(e=>e.id===settings.catalogID);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:moment.timeZoneID,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const next=entry?.dates.slice().sort().find(d=>d>=today);
  if(!next||next===moment.occurrenceDate)continue;
  await prisma.$transaction(async tx=>{
   if(await tx.deliveryPlan.count({where:{draft:{momentID:moment.id},status:'SENDING'}}))return;
   await tx.deliveryPlan.updateMany({where:{draft:{momentID:moment.id},status:{in:['SCHEDULED','AWAITING_CONFIRMATION','FAILED']}},data:{status:'CANCELLED',lastError:'Festival catalog date changed. Review and schedule again.'}});
   if(await tx.deliveryPlan.count({where:{draft:{momentID:moment.id},status:'SENDING'}}))throw new MomentError('A wish is being sent. Refresh again.',409);
   await tx.importantMoment.update({where:{id:moment.id},data:{occurrenceDate:next,yearly:false,festivalSettings:JSON.stringify({...settings,approvedAt:null,catalogNotice:'Festival date updated. Review and schedule again.'})}});
  });
 }
}
