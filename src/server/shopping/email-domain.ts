import {z} from 'zod';
import {formatInTimeZone,fromZonedTime} from 'date-fns-tz';
export const scheduleInput=z.object({
 recipient:z.string().trim().email().max(254).refine(v=>!/[\r\n]/.test(v)),
 recipientName:z.string().trim().min(1).max(100),
 timeZone:z.string().max(80).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true}catch{return false}},'Choose a valid timezone'),
 weekday:z.number().int().min(0).max(6).default(6),
 hour:z.number().int().min(0).max(23).default(10), minute:z.number().int().min(0).max(59).default(0),
 consent:z.literal(true),
});
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
export function shoppingEmail(title:string,name:string,items:{name:string;quantity:string;size:string;notes:string;checked:boolean}[]) {
 const remaining=items.filter(i=>!i.checked);
 return {empty:remaining.length===0,subject:`Shopping list: ${title}`,body:`Hi ${name},\n\nHere is my shopping list:\n\n${remaining.map(i=>`• ${i.name} — ${i.quantity}${i.size?' · '+i.size:''}${i.notes?' ('+i.notes+')':''}`).join('\n')}\n\nPlease let me know about availability and any substitutions.\n\nThank you!\nSent with NexDo`};
}
