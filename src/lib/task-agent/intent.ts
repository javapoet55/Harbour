export type TaskIntent = {category:'SELF'|'PROCUREMENT'|'RESEARCH'|'LOGISTICS'|'ERRAND'; score:number; reason:string; service:string|null; urgency:'urgent'|'flexible'|'unknown'; eligible:boolean};
export const MIN_AGENT_CONFIDENCE = 0.9;
const services: [RegExp,string][] = [
 [/\b(sprinklers?|irrigation)\b/i,'sprinkler and irrigation repair'],
 [/\b(plumbers?|plumbing|water leak|burst pipe)\b/i,'plumber'], [/\b(electricians?|electrical repair)\b/i,'electrician'],
 [/\b(painters?|painting contractor)\b/i,'painter'],[/\b(dentists?|dental clinic)\b/i,'dentist'],[/\b(cleaner|cleaning service)\b/i,'cleaning service'],
 [/\b(mechanic|auto repair)\b/i,'auto repair'],[/\b(landscaper|gardener)\b/i,'landscaper'],[/\b(roofer|roof repair)\b/i,'roofer'],
 [/\b(hvac|air conditioning repair)\b/i,'HVAC repair'],[/\b(pest control|exterminator)\b/i,'pest control'],[/\b(locksmith)\b/i,'locksmith'],
 [/\b(veterinarian|vet clinic)\b/i,'veterinarian'],[/\b(movers|moving company)\b/i,'moving company'],[/\b(insurance broker|insurance agent)\b/i,'insurance broker']
];
/** Conservative, versioned Phase 1 intent scores, not calibrated probabilities. */
export function classifyTask(title:string, notes=''):TaskIntent {
 const text=`${title} ${notes}`;
 const service=services.find(([pattern])=>pattern.test(title))?.[1]??null;
 const negated=/\b(don't|do not|no need to|stop|cancel)\b/i.test(title);
 const research=/\b(compare|research|shortlist|look into|review options)\b/i.test(title);
 const procurement=/\b(find|hire|book|locate|look for|search for|need|get quotes?|buy)\b/i.test(title);
 const logistics=/\b(renew|apply for|passport|permit)\b/i.test(title);
 const errand=/\b(pick up|drop off|collect|return)\b/i.test(title);
 const personal=/^(call|message|email|text|pay|meet|visit|ask)\b/i.test(title.trim());
 const category=negated||personal?'SELF':errand?'ERRAND':research?'RESEARCH':procurement?'PROCUREMENT':logistics?'LOGISTICS':'SELF';
 const explicit=/^(please\s+)?(find|hire|book|locate|look for|search for|get quotes? for|compare|research|shortlist|look into|review options for)\b/i.test(title.trim());
 const uncertain=/\b(maybe|might|possibly|not sure|whether|if|or)\b/i.test(title);
 const discovery=['PROCUREMENT','RESEARCH'].includes(category);
 const score=discovery ? (explicit&&!uncertain ? .95 : .5) : .9;
 const eligible=!!service&&discovery&&score>=MIN_AGENT_CONFIDENCE&&!negated&&!/\bbuy\b/i.test(title);
 const urgency=/\b(not urgent|no rush|sometime|can wait|next week)\b/i.test(text)?'flexible':/\b(leak|burst|flood|emergency|urgent|asap|today)\b/i.test(text)?'urgent':/\b(weekend|tomorrow|guest room)\b/i.test(text)?'flexible':'unknown';
 return {category,score,service,urgency,eligible,
 reason:eligible?'Explicit request to find or compare a supported local service.':discovery&&score<MIN_AGENT_CONFIDENCE?'Saved as a normal task. Your request is unclear, so no agent started. Rephrase as a direct request to find or compare a local provider.':discovery?'Saved as a normal task. This service or purchase is not supported by local-provider research yet; no agent started.':category==='SELF'||category==='ERRAND'?'Personal action; no agent run needed.':'Saved as a normal task. Logistics execution is not supported yet; no agent started.'};
}
