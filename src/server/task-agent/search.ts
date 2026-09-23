import {z} from 'zod';
import {createHash} from 'node:crypto';
import type {AgentSlots,Candidate} from '@/lib/task-agent/types';
const safeUrl=(s:unknown)=>{try{const u=new URL(String(s));return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
const id=(source:string,value:string)=>createHash('sha256').update(`${source}:${value}`).digest('hex').slice(0,24);
const num=z.number().nullable().optional();
const placeSchema=z.object({id:z.string(),displayName:z.object({text:z.string()}).optional(),formattedAddress:z.string().optional(),nationalPhoneNumber:z.string().optional(),websiteUri:z.string().optional(),googleMapsUri:z.string().optional(),rating:num,userRatingCount:num,businessStatus:z.string().optional(),currentOpeningHours:z.object({openNow:z.boolean().optional()}).optional(),location:z.object({latitude:z.number(),longitude:z.number()}).optional(),attributions:z.array(z.object({provider:z.string().optional(),providerUri:z.string().optional()})).optional(),reviews:z.array(z.object({rating:num,text:z.object({text:z.string()}).optional(),authorAttribution:z.object({displayName:z.string(),uri:z.string().optional(),photoUri:z.string().optional()}),googleMapsUri:z.string().optional(),relativePublishTimeDescription:z.string().optional()})).optional()});
const placeFields='id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,googleMapsUri,rating,userRatingCount,businessStatus,currentOpeningHours,location,attributions';
async function placesRequest(path:string,fields:string,body?:unknown){
 const key=process.env.GOOGLE_PLACES_API_KEY;if(!key)throw Error('Google Places is not configured.');
 const response=await fetch(`https://places.googleapis.com/v1/${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':fields},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!response.ok)throw Error('Google Places is temporarily unavailable.');return response.json();
}
function googleCandidate(r:z.infer<typeof placeSchema>):Candidate{
 const name=r.displayName?.text??'Business';
 return {id:id('Google',r.id),googlePlaceId:r.id,name,address:r.formattedAddress??'',phone:r.nationalPhoneNumber??'',website:safeUrl(r.websiteUri),coordinates:r.location,
 evidence:[{source:'Google',url:safeUrl(r.googleMapsUri)??`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(r.id)}`,rating:r.rating??null,reviews:r.userRatingCount??null,observedAt:new Date().toISOString()}],openNow:r.businessStatus&&r.businessStatus!=='OPERATIONAL'?false:r.currentOpeningHours?.openNow??null,emergencyAdvertised:/\b(emergency|24\/7|24.hour)\b/i.test(name),reason:'',draft:'',
 feedback:(r.reviews??[]).filter(v=>safeUrl(v.googleMapsUri)).map(v=>({author:v.authorAttribution.displayName,authorUrl:safeUrl(v.authorAttribution.uri),photoUrl:safeUrl(v.authorAttribution.photoUri),url:safeUrl(v.googleMapsUri)!,rating:v.rating??null,text:v.text?.text??'',published:v.relativePublishTimeDescription??''})),
 attributions:(r.attributions??[]).map(v=>({provider:v.provider??'',url:safeUrl(v.providerUri)}))};
}
export async function placeDetails(placeId:string){return googleCandidate(placeSchema.parse(await placesRequest(`places/${encodeURIComponent(placeId)}`,placeFields+',reviews')));}
const yelpSchema=z.object({businesses:z.array(z.object({id:z.string(),name:z.string(),url:z.string(),rating:num,review_count:num,phone:z.string().optional(),is_closed:z.boolean().optional(),location:z.object({display_address:z.array(z.string()).optional()}).optional()}))});
export function searchConfigured(){return {google:!!process.env.GOOGLE_PLACES_API_KEY,yelp:!!process.env.YELP_API_KEY};}
export async function searchBusinesses(source:'Google'|'Yelp',service:string,slots:AgentSlots):Promise<Candidate[]> {
 const now=new Date().toISOString();
 // Send only service + coarse location. Never send task notes, contacts, or home address.
 if(source==='Google'){
  const data=z.object({places:z.array(placeSchema).optional()}).parse(await placesRequest('places:searchText',placeFields.split(',').map(f=>`places.${f}`).join(','),{textQuery:`${slots.urgency==='urgent'?'emergency ':''}${service} in ${slots.location}`,languageCode:'en',pageSize:20,...(slots.urgency==='urgent'?{openNow:true}:{})}));
  return (data.places??[]).filter(p=>!p.businessStatus||p.businessStatus==='OPERATIONAL').map(googleCandidate);
 }

 if(!process.env.YELP_API_KEY)throw new Error('Yelp Search is not configured.');
 const url=new URL('https://api.yelp.com/v3/businesses/search');url.search=new URLSearchParams({term:service,location:slots.location,limit:'20',sort_by:'best_match',...(slots.urgency==='urgent'?{open_now:'true'}:{})}).toString();
 const response=await fetch(url,{headers:{Authorization:`Bearer ${process.env.YELP_API_KEY}`},signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!response.ok)throw new Error('Yelp Search is temporarily unavailable.');
 const data=yelpSchema.parse(await response.json());
 return data.businesses.filter(r=>!r.is_closed&&safeUrl(r.url)).map(r=>({id:id(source,r.id),name:r.name.slice(0,180),address:r.location?.display_address?.join(', ').slice(0,300)??'',phone:r.phone??'',website:null,
 evidence:[{source,url:safeUrl(r.url)!,rating:r.rating??null,reviews:r.review_count??null,observedAt:now}],openNow:slots.urgency==='urgent'?true:null,emergencyAdvertised:false,reason:'',draft:''}));
}
