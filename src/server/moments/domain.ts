import { z } from 'zod';
import { zonedDateTime, tzToday, ymd } from '@/lib/time';
export const zone = z.string().refine(v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } }, 'Choose a valid IANA time zone.');
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v+'T12:00:00Z'); return !isNaN(+d) && d.toISOString().slice(0,10) === v; });
export const momentInput = z.object({ type: z.enum(['birthday','anniversary','festival','custom']), title: z.string().trim().min(1).max(150), firstName: z.string().trim().max(80).default(''), phone: z.string().max(40).default(''), email: z.union([z.literal(''), z.email()]).default(''), occurrenceDate: day, timeZoneID: zone, yearly: z.boolean().default(false), source: z.enum(['manual','contacts','calendar','festivalCatalog']).default('manual'), sourceKey: z.string().min(1).max(200) });
export const toneSchema = z.enum(['Warm','Personal','Short','Fun']);
export function occurrence(date: string, yearly: boolean, timeZone: string, now = new Date()) {
  if (!yearly) return date;
  const today = ymd(tzToday(timeZone, now));
  for (let year = Number(today.slice(0,4)); year < Number(today.slice(0,4)) + 9; year++) {
    // Feb 29 birthdays are observed on Feb 28 in non-leap years. Retain the original date.
    const suffix = date.slice(5) === '02-29' && new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1 ? '02-28' : date.slice(5);
    const candidate = `${year}-${suffix}`;
    if (candidate >= today) return candidate;
  }
  return date;
}
export function nextAnnual(date: Date, timeZone: string, anchor?: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const p = Object.fromEntries(parts.map(v=>[v.type,v.value]));
  const year=Number(p.year)+1;
  if(anchor) { [p.month,p.day]=anchor.split('-'); }
  const d = p.month==='02' && p.day==='29' && new Date(Date.UTC(year,1,29)).getUTCMonth()!==1 ? '28':p.day;
  return zonedDateTime(`${year}-${p.month}-${d}`,`${p.hour}:${p.minute}`,timeZone);
}
export function fallback(firstName: string, type: string, tone: string, version=1) {
  const greeting = type === 'birthday' ? 'Happy Birthday' : type === 'anniversary' ? 'Happy Anniversary' : 'Best wishes';
  const name = firstName ? `, ${firstName}` : '';
  if (tone === 'Short') return `${greeting}${name}! Wishing you a wonderful day.`;
  if (tone === 'Fun') return `${greeting}${name}! Here’s to smiles, good company, and a day worth celebrating! 🎉`;
  if (tone === 'Personal') return `${greeting}${name}! Thinking of you and sending my warmest wishes on this special day.`;
  return `${greeting}${name}! ${version % 2 ? 'Wishing you a wonderful day and a fantastic year ahead!' : 'Hope your day is filled with happiness and lovely moments!'} 🎉`;
}
export const editableStatuses = ['SCHEDULED','AWAITING_CONFIRMATION','FAILED'];
export function mayTransition(from: string, to: string) {
  const transitions: Record<string,string[]> = {SCHEDULED:['SENDING','CANCELLED','FAILED','EXPIRED'], AWAITING_CONFIRMATION:['SENT','CANCELLED','FAILED','COPIED','SHARED','EXPIRED'], SENDING:['SENT','FAILED','SCHEDULED','UNCERTAIN'], FAILED:['CANCELLED','SCHEDULED']};
  return transitions[from]?.includes(to) ?? false;
}
export class MomentError extends Error { constructor(message: string, public status=400) { super(message); } }
