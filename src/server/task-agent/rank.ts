import type {AgentSlots,Candidate} from '@/lib/task-agent/types';
const normalized=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const reviewCount=(r:Candidate)=>Math.max(0,...r.evidence.filter(e=>e.source==='Google').map(e=>e.reviews??0),...(r.googlePlaceId?[]:r.evidence.map(e=>e.reviews??0)));
export const compareReviewCounts=(a:Candidate,b:Candidate)=>reviewCount(b)-reviewCount(a);
export function rankCandidates(rows:Candidate[],slots:AgentSlots):Candidate[]{
 const unique:Candidate[]=[];
 for(const row of rows){
  if(slots.urgency==='urgent'&&row.openNow===false)continue;
  const same=unique.find(r=>(row.phone&&normalized(row.phone).slice(-10)===normalized(r.phone).slice(-10))||(normalized(row.name)===normalized(r.name)&&!!row.address&&normalized(row.address)===normalized(r.address)));
  if(same){same.evidence.push(...row.evidence);same.website??=row.website;same.emergencyAdvertised ||=row.emergencyAdvertised;same.openNow??=row.openNow;}
  else unique.push(structuredClone(row));
 }
 const quality=(r:Candidate)=>Math.max(...r.evidence.map(e=>(e.rating??0)*Math.min(1,Math.log10(1+(e.reviews??0))/2)),0);
 const availability=(r:Candidate)=>(r.emergencyAdvertised?4:0)+(r.openNow===true?2:r.openNow===false?-2:0);
 return unique.sort((a,b)=>compareReviewCounts(a,b)||(slots.urgency==='urgent'?availability(b)-availability(a):0)||quality(b)-quality(a)||a.name.localeCompare(b.name)).slice(0,5).map(r=>({...r,reason:[slots.urgency==='urgent'?(r.emergencyAdvertised?'Advertises emergency/24-hour service. ':r.openNow?'Listed open now. ':'Current availability unknown. '):'',...r.evidence.map(e=>`${e.source}: ${e.rating===null?'rating unavailable':`${e.rating}/5`}${e.reviews===null?'':` from ${e.reviews} reviews`}. `),'License, price, requirements and response time need confirmation.'].join('')}));
}
export function prepareDraft(service:string,slots:AgentSlots){
 const name=service.trim();
 const provider=/^(plumber|electrician|painter|dentist|tutor|handyman|landscaper|roofer|locksmith|veterinarian|insurance broker|moving company|cleaning service)$/i.test(name);
 const servicePhrase=provider?`${/^[aeiou]/i.test(name)?'an':'a'} ${name}`:name;
 const location=slots.location.trim();
 const locationPhrase=/^\d{5}(?:-\d{4})?$/.test(location)?`zip code: ${location}`:location;
 return `Hi, I’m looking for ${servicePhrase} in ${locationPhrase}.\n\nCould you please share your next available appointment, an estimated quote, and any diagnostic or service-call fee?\n\nPlease let me know if you need any additional details from me. Thank you!`;
}
