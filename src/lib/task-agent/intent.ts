export type TaskIntent = {category:'SELF'|'PROCUREMENT'|'RESEARCH'|'LOGISTICS'|'ERRAND'; score:number; reason:string; service:string|null; urgency:'urgent'|'flexible'|'unknown'; eligible:boolean; needsConfirmation:boolean; constraints:string};
export const MIN_AGENT_CONFIDENCE = 0.9;
const services: [RegExp,string][] = [
 [/\b(tutors?|tutoring)\b/i,'tutor'],[/\b(appliance repair)\b/i,'appliance repair'],
 [/\b(handyman|handymen|handyperson)\b/i,'handyman'],[/\b(garage[- ]door repair)\b/i,'garage door repair'],
 [/\b(pet grooming|pet groomers?)\b/i,'pet grooming'],[/\b(car detailing|auto detailing)\b/i,'car detailing'],
 [/\b(sprinklers?|irrigation)\b/i,'sprinkler and irrigation repair'],
 [/\b(plumbers?|plumbing|water leak|burst pipe|sink (?:is )?leaking)\b/i,'plumber'], [/\b(electricians?|electrical repair)\b/i,'electrician'],
 [/\b(painters?|painting contractor)\b/i,'painter'],[/\b(dentists?|dental clinic)\b/i,'dentist'],[/\b(cleaners?|cleaning service|house cleaning)\b/i,'cleaning service'],
 [/\b(mechanics?|auto repair)\b/i,'auto repair'],[/\b(landscapers?|gardeners?)\b/i,'landscaper'],[/\b(roofers?|roof repair)\b/i,'roofer'],
 [/\b(hvac|ac repair|air conditioning repair)\b/i,'HVAC repair'],[/\b(pest control|exterminator)\b/i,'pest control'],[/\b(locksmiths?|locked out)\b/i,'locksmith'],
 [/\b(veterinarian|vet clinic)\b/i,'veterinarian'],[/\b(movers|moving company)\b/i,'moving company'],[/\b(insurance broker|insurance agent)\b/i,'insurance broker']
];
/** Conservative, versioned Phase 1 intent scores, not calibrated probabilities. */
export function classifyTask(title:string, notes=''):TaskIntent {
 const text=`${title} ${notes}`;
 const normalized=title.trim().replace(/^please\s+/i,'');
 const service=services.find(([pattern])=>pattern.test(title))?.[1]??null;
 // Generic provider outreach needs discovery; named/possessive contacts remain personal actions.
 const outreachTarget=title.trim().match(/^(?:please\s+)?(?:contact|call|message|email|text)\s+(.+)$/i)?.[1]
  .replace(/^(?:(?:a|an|some|local|nearby|licensed)\s+)+/i,'');
 const providerOutreach=!!outreachTarget&&services.some(([pattern])=>pattern.exec(outreachTarget)?.index===0);
 const problemOnly=/^(?:my |the )?(?:sink (?:is )?leaking|water leak|burst pipe|locked out)[.!]?$/i.test(normalized);
 const nearby=!!service&&services.some(([pattern])=>pattern.exec(normalized)?.index===0)&&/\b(near me|nearby)\b/i.test(normalized);
 const request=/^(?:find|hire|book|locate|look for|search for|get (?:quotes?|estimates?) for|price out|schedule|arrange|need|compare|research|shortlist|look into|review options for)\b/i.test(normalized)
  || /^locked out[—–,: -]+find\b/i.test(normalized);
 const negated=/\b(don't|do not|no need to|stop|cancel)\b/i.test(title);
 const research=/\b(compare|research|shortlist|look into|review options)\b/i.test(title);
 const procurement=/\b(find|hire|book|locate|look for|search for|need|get quotes?|buy)\b/i.test(title);
 const logistics=/\b(renew|apply for|passport|permit)\b/i.test(title);
 const errand=/\b(pick up|drop off|collect|return)\b/i.test(title);
 const personal=/^(call|message|email|text|pay|meet|visit|ask)\b/i.test(title.trim());
 const category=negated?'SELF':providerOutreach||nearby||problemOnly?'PROCUREMENT':personal?'SELF':errand?'ERRAND':research?'RESEARCH':procurement||request?'PROCUREMENT':logistics?'LOGISTICS':'SELF';
 const explicit=providerOutreach||nearby||problemOnly||request;
 const uncertain=/\b(maybe|might|possibly|not sure|whether|if|or)\b/i.test(title);
 const discovery=['PROCUREMENT','RESEARCH'].includes(category);
 const score=discovery ? (explicit&&!uncertain ? .95 : .5) : .9;
 const eligible=!!service&&discovery&&score>=MIN_AGENT_CONFIDENCE&&!negated&&!/\bbuy\b/i.test(title);
 const urgency=/\b(not urgent|no rush|sometime|can wait|next week)\b/i.test(text)?'flexible':/\b(leak|leaking|locked out|burst|flood|emergency|urgent|asap|today)\b/i.test(text)?'urgent':/\b(weekend|tomorrow|guest room)\b/i.test(text)?'flexible':'unknown';
 const constraints=[...new Set(title.match(/\b(?:weekends?|licensed|pet-safe|Spanish-speaking|highly rated)\b/gi)??[])].join(', ');
 return {category,score,service,urgency,eligible,needsConfirmation:problemOnly,constraints,
 reason:problemOnly&&eligible?'Confirm whether you want help finding a local professional before any search.':eligible?'Explicit request to find, compare, or contact a supported local service.':discovery&&score<MIN_AGENT_CONFIDENCE?'Saved as a normal task. Your request is unclear, so no agent started. Rephrase as a direct request to find or compare a local provider.':discovery?'Saved as a normal task. This service or purchase is not supported by local-provider research yet; no agent started.':category==='SELF'||category==='ERRAND'?'Personal action; no agent run needed.':'Saved as a normal task. Logistics execution is not supported yet; no agent started.'};
}
