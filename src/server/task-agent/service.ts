import {prisma} from '@/server/db';
import type {Prisma,TaskAgentRun} from '@/generated/prisma';
import {classifyTask} from '@/lib/task-agent/intent';
import {nextQuestion,type AgentSlots,type AgentStep,type Candidate,type RunView} from '@/lib/task-agent/types';
import {searchBusinesses,searchConfigured,placeDetails} from './search';
import {rankCandidates,prepareDraft} from './rank';
export const plan=():AgentStep[]=>[
 {id:'google',title:'Search Google Places for local providers',status:'pending',detail:''},
 {id:'yelp',title:'Compare Yelp listings and ratings',status:'pending',detail:''},
 {id:'rank',title:'Rank candidates and flag unverified requirements',status:'pending',detail:''},
 {id:'draft',title:'Prepare quote-request drafts for you',status:'pending',detail:''},
];
export async function classifyNewTask(tx:Prisma.TransactionClient,task:{id:string;userId:string;title:string;notes:string;status:string},preserveExisting=false){
 const intent=classifyTask(task.title,task.notes);
 await tx.task.update({where:{id:task.id},data:{intentCategory:intent.category,intentScore:intent.score,intentReason:intent.reason,...(intent.eligible&&intent.urgency==='urgent'?{priority:'HIGH'}:{})}});
 if(!intent.eligible||['COMPLETED','CANCELLED'].includes(task.status)){await tx.taskAgentRun.updateMany({where:{taskId:task.id},data:{status:'CANCELLED',version:{increment:1},leaseUntil:null}});return;}
 const memory=await tx.userMemory.findMany({where:{userId:task.userId,key:{in:['profile:city','profile:country']}},select:{key:true,value:true}});
 const city=memory.find(r=>r.key==='profile:city')?.value.trim();
 const country=memory.find(r=>r.key==='profile:country')?.value.trim();
 const slots:AgentSlots={locationConfirmed:false,location:city?[city,country].filter(Boolean).join(', ').slice(0,120):'',urgency:intent.urgency,budget:'',constraints:'',preferencesConfirmed:false};
 const data={service:intent.service!,urgency:intent.urgency,slotsJson:JSON.stringify(slots),stepsJson:JSON.stringify(plan()),targetAt:new Date(Date.now()+(intent.urgency==='urgent'?5*60_000:48*3600_000))};
 await tx.taskAgentRun.upsert({where:{taskId:task.id},create:{taskId:task.id,...data},update:preserveExisting?{}:{...data,status:'NEEDS_INPUT',version:{increment:1},attempts:0,leaseUntil:null,resultsJson:'[]',warningsJson:'[]',error:null}});
}
export async function prepareExistingTask(userId:string,taskId:string){
 return prisma.$transaction(async tx=>{
  const task=await tx.task.findFirst({where:{id:taskId,userId,deletedAt:null},include:{agentRun:true}});
  if(!task)throw Error('NOT_FOUND');
  if(task.agentRun)return runView(task.agentRun);
  if(!classifyTask(task.title,task.notes).eligible||['COMPLETED','CANCELLED'].includes(task.status))throw Error('INVALID_AGENT_TRANSITION');
  await classifyNewTask(tx,task,true);
  return runView(await tx.taskAgentRun.findUniqueOrThrow({where:{taskId}}));
 });
}
export function runView(run:TaskAgentRun):RunView{
 const slots=JSON.parse(run.slotsJson) as AgentSlots;
 return {id:run.id,status:run.status,version:run.version,service:run.service,urgency:run.urgency,targetAt:run.targetAt.toISOString(),slots,steps:JSON.parse(run.stepsJson),candidates:JSON.parse(run.resultsJson),warnings:JSON.parse(run.warningsJson),question:run.status==='NEEDS_INPUT'?nextQuestion(slots):null,error:run.error};
}
export async function ownedRun(userId:string,taskId:string){
 const task=await prisma.task.findFirst({where:{id:taskId,userId,deletedAt:null},include:{agentRun:true}});
 if(!task)throw new Error('NOT_FOUND');return task;
}
export async function controlRun(userId:string,taskId:string,input:{action:string;version:number;key?:string;answer?:string;budget?:string;constraints?:string;candidateId?:string}){
 const task=await ownedRun(userId,taskId);const run=task.agentRun;if(!run)throw new Error('NOT_FOUND');
 if(run.version!==input.version)throw new Error('STALE_AGENT_RUN');
 const slots=JSON.parse(run.slotsJson) as AgentSlots;
 let data:Prisma.TaskAgentRunUpdateManyMutationInput={version:{increment:1},leaseUntil:null,error:null};
 if(input.action==='cancel')data={...data,status:'CANCELLED'};
 else if(input.action==='pause'&&['QUEUED','RUNNING'].includes(run.status))data={...data,status:'PAUSED'};
 else if(['resume','retry'].includes(input.action)&&['PAUSED','FAILED','BLOCKED'].includes(run.status)){
  if(run.attempts>=3)throw new Error('AGENT_RETRY_LIMIT');
  data={...data,status:nextQuestion(slots)?'NEEDS_INPUT':'QUEUED',stepsJson:JSON.stringify(plan()),resultsJson:'[]',warningsJson:'[]'};
 }else if(input.action==='answer'&&run.status==='NEEDS_INPUT'){
  const question=nextQuestion(slots);if(question?.key!==input.key)throw new Error('STALE_AGENT_RUN');
  if(input.key==='location'){slots.location=(input.answer??'').trim();if(!slots.location||slots.location.length>120)throw new Error('INVALID_INPUT');slots.locationConfirmed=true;}
  if(input.key==='urgency'){if(!['urgent','flexible'].includes(input.answer??''))throw new Error('INVALID_INPUT');slots.urgency=input.answer as 'urgent'|'flexible';}
  if(input.key==='preferences'){slots.budget=input.budget?.trim()??'';slots.constraints=input.constraints?.trim()??'';slots.preferencesConfirmed=true;}
  data={...data,slotsJson:JSON.stringify(slots),urgency:slots.urgency,status:nextQuestion(slots)?'NEEDS_INPUT':'QUEUED',targetAt:new Date(Date.now()+(slots.urgency==='urgent'?5*60_000:48*3600_000))};
 }else if(input.action==='saveDraft'&&run.status==='READY_FOR_REVIEW'){
  const rows=JSON.parse(run.resultsJson) as Candidate[];const candidate=rows.find(r=>r.id===input.candidateId);if(!candidate)throw new Error('NOT_FOUND');candidate.draft=input.answer??'';data={...data,resultsJson:JSON.stringify(rows)};
 }else throw new Error('INVALID_AGENT_TRANSITION');
 if(['COMPLETED','CANCELLED'].includes(task.status)&&input.action!=='cancel')throw new Error('INVALID_AGENT_TRANSITION');
 const changed=await prisma.taskAgentRun.updateMany({where:{id:run.id,version:input.version},data});if(!changed.count)throw new Error('STALE_AGENT_RUN');
 return runView(await prisma.taskAgentRun.findUniqueOrThrow({where:{id:run.id}}));
}
/** Durable lease + compare-and-set writes prevent duplicate workers and late writes after stop. */
export async function processRun(id:string,search=searchBusinesses){
 const now=new Date();let run=await prisma.taskAgentRun.findUnique({where:{id},include:{task:true}});
 if(!run||!['QUEUED','RUNNING'].includes(run.status))return;
 if(run.task.deletedAt||['COMPLETED','CANCELLED'].includes(run.task.status)){await prisma.taskAgentRun.update({where:{id},data:{status:'CANCELLED',version:{increment:1},leaseUntil:null}});return;}
 if(process.env.NEXDO_AGENT_ENABLED!=='true'||!searchConfigured().google){await prisma.taskAgentRun.updateMany({where:{id,version:run.version,status:{in:['QUEUED','RUNNING']}},data:{status:'BLOCKED',leaseUntil:null,error:'Local search needs a Google Places connection. Your task is saved; no outreach has been sent.'}});return;}
 if(run.attempts>=3){await prisma.taskAgentRun.updateMany({where:{id,version:run.version},data:{status:'FAILED',error:'Search retry limit reached. Please review this task.',version:{increment:1},leaseUntil:null}});return;}
 const claimed=await prisma.taskAgentRun.updateMany({where:{id,version:run.version,status:{in:['QUEUED','RUNNING']},OR:[{leaseUntil:null},{leaseUntil:{lt:now}}]},data:{status:'RUNNING',leaseUntil:new Date(+now+90_000),version:{increment:1},attempts:{increment:1}}});
 if(!claimed.count)return;
 run=await prisma.taskAgentRun.findUniqueOrThrow({where:{id},include:{task:true}});const version=run.version;
 const slots=JSON.parse(run.slotsJson) as AgentSlots;const steps=plan();let candidates:Candidate[]=[];const warnings:string[]=[];
 const save=async(data:Prisma.TaskAgentRunUpdateManyMutationInput)=>{
  const task=await prisma.task.findUnique({where:{id:run!.taskId},select:{status:true,deletedAt:true}});
  if(!task||task.deletedAt||['COMPLETED','CANCELLED'].includes(task.status)) {await prisma.taskAgentRun.updateMany({where:{id,version,status:'RUNNING'},data:{status:'CANCELLED',leaseUntil:null,version:{increment:1}}});return false;}
  return (await prisma.taskAgentRun.updateMany({where:{id,version,status:'RUNNING'},data})).count===1;
 };
 try{
  if(nextQuestion(slots)){await save({status:'NEEDS_INPUT',leaseUntil:null});return;}
  if(process.env.NEXDO_AGENT_ENABLED!=='true'||!searchConfigured().google){await save({status:'BLOCKED',leaseUntil:null,error:'Local search needs a Google Places connection. Your task is saved; no outreach has been sent.'});return;}
  for(const [index,source] of (['Google','Yelp'] as const).entries()){
   if(source==='Yelp'&&!searchConfigured().yelp){steps[index].status='skipped';steps[index].detail='Yelp is not connected; using Google Places.';warnings.push('Yelp is not connected. Results are from Google Places only.');continue;}
   steps[index].status='running';if(!await save({stepsJson:JSON.stringify(steps)}))return;
   try{const found=await search(source,run.service,slots);candidates.push(...found);steps[index].status='done';steps[index].detail=`${found.length} listings returned.`;}
   catch{steps[index].status='failed';steps[index].detail=`${source} search unavailable.`;warnings.push(`${source} search was unavailable. Results may be incomplete.`);}
   if(!await save({stepsJson:JSON.stringify(steps)}))return;
  }
  if(steps.slice(0,2).every(s=>s.status==='failed'||s.status==='skipped')){await save({status:'FAILED',error:'Search providers are unavailable. Please retry later.',warningsJson:JSON.stringify(warnings),leaseUntil:null});return;}
  steps[2].status='running';if(!await save({stepsJson:JSON.stringify(steps)}))return;
  candidates=rankCandidates(candidates,slots);steps[2].status='done';steps[2].detail=`${candidates.length} candidates. Licenses, requirements and response times are unverified.`;
  if(candidates.length<5)warnings.push(`Only ${candidates.length} candidates found; no extra listings were invented.`);
  warnings.push('Listings are not a license check or a guarantee of availability. Confirm service area, budget and requirements before choosing.');
  steps[3].status='running';if(!await save({stepsJson:JSON.stringify(steps)}))return;
  candidates=candidates.map(c=>({...c,draft:prepareDraft(c.googlePlaceId?{...c,name:'there'}:c,run!.service,slots,run!.task.title)}));steps[3].status='done';steps[3].detail='Drafts only. You choose who to contact and send them yourself.';
  await save({status:candidates.length?'READY_FOR_REVIEW':'NO_RESULTS',stepsJson:JSON.stringify(steps),resultsJson:JSON.stringify(candidates.map(persistCandidate)),warningsJson:JSON.stringify(warnings),leaseUntil:null});
 }catch{await save({status:'FAILED',error:'Research paused after an unexpected error. Your task is saved.',leaseUntil:null});}
}
export async function drainAgentQueue(){
 if(process.env.NEXDO_AGENT_ENABLED!=='true')return {processed:0};
 const rows=await prisma.taskAgentRun.findMany({where:{status:{in:['QUEUED','RUNNING']},OR:[{leaseUntil:null},{leaseUntil:{lt:new Date()}}]},orderBy:{targetAt:'asc'},take:3,select:{id:true}});
 for(const row of rows)await processRun(row.id);return {processed:rows.length};
}

/** Persist identifiers and user-owned drafts, not Google Places content. */
export function persistCandidate(c:Candidate):Candidate{
 if(!c.googlePlaceId)return c;
 return {id:c.id,googlePlaceId:c.googlePlaceId,name:'Business details unavailable',address:'',phone:'',website:null,evidence:[],openNow:null,emergencyAdvertised:false,reason:'Open the shortlist to load current Google Places details.',draft:c.draft};
}
export async function hydrateRun(view:RunView):Promise<RunView>{
 const candidates=await Promise.all(view.candidates.map(async c=>{
  if(!c.googlePlaceId)return c;
  try{const fresh=await placeDetails(c.googlePlaceId);const ranked=rankCandidates([fresh],{...view.slots,urgency:'flexible'})[0];return {...ranked,id:c.id,draft:c.draft};}
  catch{return {...c,reason:'Google Places details could not be loaded. Reopen this task to retry.'};}
 }));return {...view,candidates};
}
