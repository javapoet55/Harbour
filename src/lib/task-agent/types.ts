export type AgentSlots={discoveryConfirmed?:boolean;location:string;locationConfirmed?:boolean;urgency:'urgent'|'flexible'|'unknown';budget:string;constraints:string;preferencesConfirmed:boolean};
export type Evidence={source:'Google'|'Yelp';url:string;rating:number|null;reviews:number|null;observedAt:string};
export type Feedback={author:string;authorUrl:string|null;photoUrl:string|null;url:string;rating:number|null;text:string;published:string};
export type Candidate={googlePlaceId?:string;coordinates?:{latitude:number;longitude:number};feedback?:Feedback[];attributions?:{provider:string;url:string|null}[];id:string;name:string;address:string;phone:string;website:string|null;evidence:Evidence[];openNow:boolean|null;emergencyAdvertised:boolean;reason:string;draft:string};
export type AgentStep={id:string;title:string;status:'pending'|'running'|'done'|'failed'|'skipped';detail:string};
export type RunView={id:string;status:string;version:number;service:string;urgency:string;targetAt:string;slots:AgentSlots;steps:AgentStep[];candidates:Candidate[];warnings:string[];question:{key:string;text:string}|null;error:string|null};
export function nextQuestion(slots:AgentSlots):RunView['question'] {
 if(slots.discoveryConfirmed===false)return {key:'discovery',text:'Would you like me to find a local professional for this?'};
 if(!slots.location.trim()||!slots.locationConfirmed)return {key:'location',text:slots.location.trim()?`Confirm the search area: ${slots.location}. Use this city or enter another city or ZIP code.`:'Which city or ZIP code should I search?'};
 if(!slots.preferencesConfirmed)return {key:'preferences',text:'Any budget or requirements, such as licensed only, pet-safe, or weekends? You can skip this.'};
 return null;
}
