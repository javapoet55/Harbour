import {beforeEach,afterAll,afterEach,describe,it,expect,vi} from 'vitest';
import {prisma} from '@/server/db';
import {createTask,updateTask} from '@/server/tasks';
import {ownedRun,controlRun,processRun,runView,prepareExistingTask} from './service';
import type {Candidate} from '@/lib/task-agent/types';
const ids:string[]=[];
beforeEach(()=>{vi.stubEnv('NEXDO_AGENT_ENABLED','true');vi.stubEnv('GOOGLE_PLACES_API_KEY','test');vi.stubEnv('YELP_API_KEY','test');});
afterEach(()=>vi.unstubAllEnvs());
afterAll(async()=>{await prisma.user.deleteMany({where:{id:{in:ids}}});});
async function setup(title='Find a plumber for water leak'){
 const user=await prisma.user.create({data:{email:`agent-${crypto.randomUUID()}@test.invalid`,name:'Test',passwordHash:'unused'}});ids.push(user.id);
 await prisma.userMemory.create({data:{userId:user.id,key:'profile:city',value:'San Jose',kind:'profile'}});
 const task=await createTask({userId:user.id,title});return {user,task};
}
const business=(n:number):Candidate=>({id:String(n),name:`Plumber ${n}`,address:`${n} Main Street`,phone:`55500000${n}`,website:null,evidence:[{source:'Yelp',url:'https://www.yelp.com/biz/test',rating:4+n/10,reviews:50,observedAt:new Date().toISOString()}],openNow:true,emergencyAdvertised:n===1,reason:'',draft:''});
async function ready(userId:string,taskId:string){let r=(await ownedRun(userId,taskId)).agentRun!;if(runView(r).question?.key==='location'){await controlRun(userId,taskId,{action:'answer',version:r.version,key:'location',answer:'San Jose'});r=(await ownedRun(userId,taskId)).agentRun!;}if(runView(r).question?.key==='urgency'){await controlRun(userId,taskId,{action:'answer',version:r.version,key:'urgency',answer:'flexible'});r=(await ownedRun(userId,taskId)).agentRun!;}return controlRun(userId,taskId,{action:'answer',version:r.version,key:'preferences',constraints:'pet-safe',budget:'$100–300'});}
describe('durable task agent',()=>{
 it('leaves self-tasks plain and classifies urgent local requests',async()=>{
  const {user,task}=await setup('Call mom');expect((await ownedRun(user.id,task.id)).agentRun).toBeNull();
  const urgent=await createTask({userId:user.id,title:'Find plumber for water leak'});const saved=await ownedRun(user.id,urgent.id);
  expect(saved.priority).toBe('HIGH');expect(saved.intentCategory).toBe('PROCUREMENT');expect(runView(saved.agentRun!).question?.key).toBe('location');expect(runView(saved.agentRun!).slots.location).toBe('San Jose');
 });
 it('produces at most five real deduplicated candidates and drafts without completing task',async()=>{
  const {user,task}=await setup();const r=await ready(user.id,task.id);const search=vi.fn(async()=>Array.from({length:7},(_,i)=>business(i)));
  await processRun(r.id,search);await processRun(r.id,search);
  const saved=await ownedRun(user.id,task.id);const result=runView(saved.agentRun!);
  expect(search).toHaveBeenCalledTimes(2);expect(result.status).toBe('READY_FOR_REVIEW');expect(result.candidates).toHaveLength(5);expect(result.candidates[0].emergencyAdvertised).toBe(true);expect(result.candidates[0].draft).toContain('pet-safe');expect(result.candidates[0].reason).toContain('need confirmation');expect(saved.status).toBe('PLANNED');
 });
 it('does not publish a late search after cancel and refuses another user',async()=>{
  const {user,task}=await setup();const r=await ready(user.id,task.id);
  const search=vi.fn(async()=>{const current=(await ownedRun(user.id,task.id)).agentRun!;await controlRun(user.id,task.id,{action:'cancel',version:current.version});return [business(1)];});
  await processRun(r.id,search);expect(search).toHaveBeenCalledTimes(1);
  const current=runView((await ownedRun(user.id,task.id)).agentRun!);expect(current.status).toBe('CANCELLED');expect(current.candidates).toEqual([]);
  await expect(ownedRun('other-user',task.id)).rejects.toThrow('NOT_FOUND');
 });
 it('blocks missing configuration without consuming retries and invalidates changed task',async()=>{
  const {user,task}=await setup();const r=await ready(user.id,task.id);vi.stubEnv('GOOGLE_PLACES_API_KEY','');const search=vi.fn();await processRun(r.id,search);
  let saved=(await ownedRun(user.id,task.id)).agentRun!;expect(saved.status).toBe('BLOCKED');expect(saved.attempts).toBe(0);expect(search).not.toHaveBeenCalled();
  await updateTask(user.id,task.id,{title:'Call mom'});saved=(await ownedRun(user.id,task.id)).agentRun!;expect(saved.status).toBe('CANCELLED');
  await expect(controlRun(user.id,task.id,{action:'answer',version:r.version,key:'preferences'})).rejects.toThrow('STALE_AGENT_RUN');
 });
 it('surfaces partial provider failure instead of claiming two-source verification',async()=>{
  const {user,task}=await setup();const r=await ready(user.id,task.id);await processRun(r.id,async(source)=>{if(source==='Google')throw Error('offline');return [business(1)];});
  const result=runView((await ownedRun(user.id,task.id)).agentRun!);expect(result.candidates).toHaveLength(1);expect(result.warnings.join(' ')).toContain('Google search was unavailable');
 });
});
it('claims a run once and resumes after an expired worker lease',async()=>{
 const {user,task}=await setup();const r=await ready(user.id,task.id);
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let first=true;
 const search=vi.fn(async()=>{if(first){first=false;await gate;}return [business(1)];});
 const worker=processRun(r.id,search);
 for(let n=0;n<50&&!search.mock.calls.length;n++)await new Promise(resolve=>setTimeout(resolve,5));
 await processRun(r.id,search);expect(search).toHaveBeenCalledTimes(1);release();await worker;
 expect((await ownedRun(user.id,task.id)).agentRun?.status).toBe('READY_FOR_REVIEW');
 const second=await createTask({userId:user.id,title:'Find plumber today'});const queued=await ready(user.id,second.id);
 await prisma.taskAgentRun.update({where:{id:queued.id},data:{status:'RUNNING',leaseUntil:new Date(Date.now()-1000)}});
 await processRun(queued.id,async()=>[business(2)]);expect((await ownedRun(user.id,second.id)).agentRun?.status).toBe('READY_FOR_REVIEW');
});

it('does not search an unconfirmed profile city, including legacy slots',async()=>{
 const {user,task}=await setup();const run=(await ownedRun(user.id,task.id)).agentRun!;
 await expect(controlRun(user.id,task.id,{action:'answer',version:run.version,key:'preferences'})).rejects.toThrow('STALE_AGENT_RUN');
 await prisma.taskAgentRun.update({where:{id:run.id},data:{status:'QUEUED'}});
 const search=vi.fn();await processRun(run.id,search);
 expect(search).not.toHaveBeenCalled();expect((await ownedRun(user.id,task.id)).agentRun?.status).toBe('NEEDS_INPUT');
});
it('keeps unsupported and uncertain requests as normal tasks with explanations',async()=>{
 for(const title of ['Find a caterer','Maybe find a plumber']){
  const {user,task}=await setup(title);const saved=await ownedRun(user.id,task.id);
  expect(saved.agentRun).toBeNull();expect(saved.intentReason).toContain('no agent started');
 }
});

it('allows Google-only runs and stores place references without provider content',async()=>{
 const {user,task}=await setup();const run=await ready(user.id,task.id);vi.stubEnv('YELP_API_KEY','');
 const search=vi.fn(async()=>[{...business(1),googlePlaceId:'place-123',name:'Private provider content',feedback:[{author:'Reviewer',text:'Review text',url:'https://example.com',photoUrl:null,authorUrl:null,rating:5,published:'today'}]}]);
 await processRun(run.id,search);expect(search).toHaveBeenCalledTimes(1);
 const saved=(await ownedRun(user.id,task.id)).agentRun!;expect(saved.status).toBe('READY_FOR_REVIEW');expect(saved.resultsJson).toContain('place-123');expect(saved.resultsJson).not.toContain('Private provider content');expect(saved.resultsJson).not.toContain('Review text');expect(saved.resultsJson).not.toContain('Reviewer');
});

it('enrolls an existing sprinkler task once without resetting research or bypassing location',async()=>{
 const {user}=await setup('Call mom');
 const task=await prisma.task.create({data:{userId:user.id,title:'Find sprinkler repair person',notes:'',status:'PLANNED'}});
 const run=await prepareExistingTask(user.id,task.id);expect(run.service).toBe('sprinkler and irrigation repair');expect(run.question?.key).toBe('location');
 const answered=await controlRun(user.id,task.id,{action:'answer',version:run.version,key:'location',answer:'San Jose'});
 const again=await prepareExistingTask(user.id,task.id);expect(again.id).toBe(run.id);expect(again.version).toBe(answered.version);expect(again.slots.locationConfirmed).toBe(true);
 await expect(prepareExistingTask('another-user',task.id)).rejects.toThrow('NOT_FOUND');
});

it('requires explicit discovery confirmation for problem descriptions before collecting search slots',async()=>{
 const {user,task}=await setup('My sink is leaking');
 let run=(await ownedRun(user.id,task.id)).agentRun!;
 expect(runView(run)).toMatchObject({service:'plumber',question:{key:'discovery'}});
 await expect(controlRun(user.id,task.id,{action:'answer',version:run.version,key:'location',answer:'San Jose'})).rejects.toThrow('STALE_AGENT_RUN');
 await controlRun(user.id,task.id,{action:'answer',version:run.version,key:'discovery',answer:'yes'});
 run=(await ownedRun(user.id,task.id)).agentRun!;
 expect(runView(run).question?.key).toBe('location');
 const other=await createTask({userId:user.id,title:'Locked out'});
 const pending=(await ownedRun(user.id,other.id)).agentRun!;
 await controlRun(user.id,other.id,{action:'cancel',version:pending.version});
 const search=vi.fn();await processRun(pending.id,search);expect(search).not.toHaveBeenCalled();
 expect((await ownedRun(user.id,other.id)).status).toBe('PLANNED');
});
