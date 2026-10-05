import {z} from 'zod';
import {formatInTimeZone,fromZonedTime} from 'date-fns-tz';
export const scheduleInput=z.object({
 recipient:z.string().trim().email().max(254).refine(v=>!/[\r\n]/.test(v)),
 customerPhone:z.string().trim().max(40).transform(v=>v.replace(/[\s().-]/g,'')).pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Enter your phone number with country code, for example +1 415 555 0123')),
 recipientName:z.string().trim().min(1).max(100),
 timeZone:z.string().max(80).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true}catch{return false}},'Choose a valid timezone'),
 weekday:z.number().int().min(0).max(6).default(6),
 hour:z.number().int().min(0).max(23).default(10), minute:z.number().int().min(0).max(59).default(0),
 pickupDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T12:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===v},'Choose a valid pickup date').nullable().optional(),
 pickupStartHour:z.number().int().min(9).max(19).nullable().optional(),
 consent:z.literal(true),
}).refine(v=>(v.pickupDate==null)===(v.pickupStartHour==null),'Choose both a pickup date and a pickup window');
// Calculate by local calendar dates, not a fixed 168-hour duration across DST.
export function nextWeekly(after:Date,s:{timeZone:string;weekday:number;hour:number;minute:number}) {
 const local=formatInTimeZone(after,s.timeZone,'yyyy-MM-dd');
 for(let days=0;days<=8;days++){
  const date=new Date(local+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);
  if(date.getUTCDay()!==s.weekday)continue;
  const wall=date.toISOString().slice(0,10)+`T${String(s.hour).padStart(2,'0')}:${String(s.minute).padStart(2,'0')}:00`;
  const candidate=fromZonedTime(wall,s.timeZone);
  // A nonexistent wall time (spring transition) is skipped; never send at an unintended hour.
  if(formatInTimeZone(candidate,s.timeZone,"yyyy-MM-dd'T'HH:mm:ss")!==wall)continue;
  if(candidate>after)return candidate;
 }
 throw Error('Unable to calculate next weekly run');
}
export function shoppingEmail(name:string,items:{name:string;quantity:string;size:string;notes:string;checked:boolean}[],pickup?:{pickupDate?:string|null;pickupStartHour?:number|null;timeZone:string;runAt:Date},sender?:{name:string;phoneNumber?:string|null}) {
 // Checked items are the user-selected items to send to the store.
 const selected=items.filter(i=>i.checked);
 let pickupText='';
 if(pickup?.pickupDate && pickup.pickupStartHour!=null){
  const date=new Date(pickup.pickupDate+'T12:00:00Z');
  const today=formatInTimeZone(pickup.runAt,pickup.timeZone,'yyyy-MM-dd');
  const days=Math.floor((Date.parse(today+'T12:00:00Z')- +date)/86400000);
  if(days>0)date.setUTCDate(date.getUTCDate()+Math.floor(days/7)*7);
  const wall=()=>date.toISOString().slice(0,10)+`T${String(pickup.pickupStartHour).padStart(2,'0')}:00:00`;
  if(fromZonedTime(wall(),pickup.timeZone)<pickup.runAt)date.setUTCDate(date.getUTCDate()+7);
  const start=fromZonedTime(wall(),pickup.timeZone);
  const zoneLabel=new Intl.DateTimeFormat('en-US',{timeZone:pickup.timeZone,timeZoneName:'short'}).formatToParts(start).find(part=>part.type==='timeZoneName')?.value ?? pickup.timeZone;
  pickupText=`\n\nPreferred pickup: ${formatInTimeZone(start,pickup.timeZone,'EEE, MMM d, yyyy')} · ${formatInTimeZone(start,pickup.timeZone,'h a')}–${formatInTimeZone(new Date(+start+3600000),pickup.timeZone,'h a')} ${zoneLabel}.`;
 }
 const signature=[sender?.name.trim(),sender?.phoneNumber?.trim()].filter(Boolean).join('\n');
 // The subject never contains the user's own list title, which may be a private note.
 return {empty:selected.length===0,subject:'Shopping list',body:`Hi ${name},\n\nHere is my shopping list:\n\n${selected.map(i=>`• ${i.name} — ${i.quantity}${i.size?' '+i.size:''}${i.notes?' ('+i.notes+')':''}`).join('\n')}${pickupText}\n\n${pickupText?'Please confirm this pickup window. ':''}Please let me know about availability and any substitutions.\n\nPlease call and email me once my items are ready to be picked up.\n\nThank you!\n${signature?signature+'\n':''}Sent with NexDo`};
}
