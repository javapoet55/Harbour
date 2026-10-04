import {afterAll,afterEach,beforeAll,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {prisma} from '@/server/db';
import {connectURL, gmail} from '@/server/moments/email';

const mocks=vi.hoisted(()=>({requireUser:vi.fn()}));
vi.mock('@/server/auth',()=>({requireUser:mocks.requireUser}));
import {POST as moments, DELETE as deleteMoments} from '@/app/api/moments/route';
import {GET as schedule} from '@/app/api/shopping/email-schedule/route';
import {GET as callback} from '@/app/api/moments/email/callback/route';

// No worker runs in this file; far-future times keep these rows away from other files' worker ticks.
const future=new Date('2099-01-03T18:00:00Z');
let userId='';
async function account(){await prisma.momentEmailAccount.upsert({where:{userId},create:{userId,email:'sender@example.com',refreshToken:'test-only'},update:{status:'connected'}})}
async function activeSchedule(){
 const list=await prisma.shoppingList.create({data:{userId,title:'Weekly groceries',date:'2099-01-03',timeZone:'UTC',weekly:true}});
 return prisma.shoppingEmailSchedule.create({data:{listId:list.id,recipient:'manager@example.com',recipientName:'Alex',timeZone:'UTC',consentAt:future,nextRunAt:future}});
}
const disconnect=()=>moments(new Request('https://nexdo.test/api/moments',{method:'POST',body:JSON.stringify({operation:'disconnectEmail'})}));
beforeAll(async()=>{userId=(await prisma.user.create({data:{email:randomUUID()+'@example.com',name:'Shopper',passwordHash:''}})).id;mocks.requireUser.mockResolvedValue({id:userId})});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()});
afterAll(async()=>{await prisma.user.delete({where:{id:userId}})});

it('retries when Google is down or unreachable instead of asking to reconnect',async()=>{
 await account();
 for(const outcome of [()=>Promise.resolve(new Response('',{status:503})),()=>Promise.resolve(new Response('',{status:429})),()=>Promise.reject(new TypeError('fetch failed'))]){
  const fetch=vi.fn(outcome);vi.stubGlobal('fetch',fetch);
  expect((await gmail.send(userId,'manager@example.com','Subject','Body','key')).kind).toBe('retry');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect((await prisma.momentEmailAccount.findUniqueOrThrow({where:{userId}})).status).toBe('connected');
 }
});
it('asks to reconnect when Google rejects the saved access',async()=>{
 await account();vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'invalid_grant'},{status:400})));
 expect((await gmail.send(userId,'manager@example.com','Subject','Body','key')).kind).toBe('reconnect');
 expect((await prisma.momentEmailAccount.findUniqueOrThrow({where:{userId}})).status).toBe('reconnect');
});
it('pauses shopping schedules and cancels queued emails when Gmail is disconnected',async()=>{
 await account();const s=await activeSchedule();
 const run=await prisma.shoppingEmailRun.create({data:{scheduleId:s.id,dueAt:future,retryAt:future,recipient:s.recipient,subject:'List',body:'Milk'}});
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:200})));
 expect((await disconnect()).status).toBe(200);
 expect((await prisma.shoppingEmailSchedule.findUniqueOrThrow({where:{id:s.id}})).enabled).toBe(false);
 expect(await prisma.shoppingEmailRun.findUniqueOrThrow({where:{id:run.id}})).toMatchObject({status:'cancelled',detail:'Gmail disconnected'});
 expect(await prisma.momentEmailAccount.findUnique({where:{userId}})).toBeNull();
});
it('refuses to disconnect while a shopping email is being sent',async()=>{
 await account();const s=await activeSchedule();
 await prisma.shoppingEmailRun.create({data:{scheduleId:s.id,dueAt:future,retryAt:future,recipient:s.recipient,subject:'List',body:'Milk',status:'sending'}});
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 expect((await disconnect()).status).toBe(409);expect(fetch).not.toHaveBeenCalled();
 expect((await prisma.shoppingEmailSchedule.findUniqueOrThrow({where:{id:s.id}})).enabled).toBe(true);
 expect(await prisma.momentEmailAccount.findUnique({where:{userId}})).not.toBeNull();
 await prisma.shoppingEmailRun.updateMany({where:{scheduleId:s.id},data:{status:'uncertain'}});
});
it('disconnects Gmail and deletes Moments data even when the saved token cannot be decrypted',async()=>{
 const unreadable='v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA.AAAA';
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 await account();await prisma.momentEmailAccount.update({where:{userId},data:{refreshToken:unreadable}});
 expect((await disconnect()).status).toBe(200);
 expect(await prisma.momentEmailAccount.findUnique({where:{userId}})).toBeNull();
 await account();await prisma.momentEmailAccount.update({where:{userId},data:{refreshToken:unreadable}});
 expect((await deleteMoments()).status).toBe(200);
 expect(await prisma.momentEmailAccount.findUnique({where:{userId}})).toBeNull();
 expect(fetch).not.toHaveBeenCalled();
});
it('explains a missing list ID',async()=>{
 const res=await schedule(new Request('https://nexdo.test/api/shopping/email-schedule'));
 expect(res.status).toBe(400);expect((await res.json()).error).toBe('A shopping list ID is required.');
});

it('saves a connected Gmail only when the same signed-in user confirms the ticket',async()=>{
 vi.stubEnv('MOMENTS_GOOGLE_CLIENT_ID','id');vi.stubEnv('MOMENTS_GOOGLE_CLIENT_SECRET','secret');vi.stubEnv('MOMENTS_GOOGLE_REDIRECT_URI','https://nexdo.test/api/moments/email/callback');
 vi.stubGlobal('fetch',vi.fn(async(url:string|URL)=>String(url).includes('/token')?Response.json({access_token:'access',refresh_token:'victim-refresh'}):Response.json({email:'victim@example.com',email_verified:true})));
 await prisma.momentEmailAccount.deleteMany({where:{userId}});
 const attacker=(await prisma.user.create({data:{email:randomUUID()+'@example.com',name:'Attacker',passwordHash:''}})).id;
 const complete=async(owner:string)=>new URL((await callback(new Request(`https://nexdo.test/api/moments/email/callback?code=c&state=${new URL(await connectURL(owner)).searchParams.get('state')}`))).headers.get('Location')!);
 const confirm=(ticket:unknown)=>moments(new Request('https://nexdo.test/api/moments',{method:'POST',body:JSON.stringify({operation:'connectEmailConfirm',input:{ticket}})}));
 try {
  // The attacker's link, completed by the signed-in victim: nothing is saved, and the victim's app can't attach it either.
  const location=await complete(attacker);
  expect(location.searchParams.get('status')).toBe('confirm');
  const ticket=location.searchParams.get('ticket')!;
  expect(ticket).not.toContain('victim-refresh');
  expect(await prisma.momentEmailAccount.findUnique({where:{userId:attacker}})).toBeNull();
  expect((await confirm(ticket)).status).toBe(403);
  expect(await prisma.momentEmailAccount.findUnique({where:{userId}})).toBeNull();
  expect((await confirm(JSON.stringify({purpose:'moments-email-ticket',sub:userId,email:'x@example.com',refreshToken:'forged',exp:Date.now()+60000}))).status).toBe(400);
  // The user's own link, confirmed by their own app.
  expect((await confirm((await complete(userId)).searchParams.get('ticket'))).status).toBe(200);
  const saved=await prisma.momentEmailAccount.findUniqueOrThrow({where:{userId}});
  expect(saved.email).toBe('victim@example.com');expect(saved.refreshToken).not.toBe('victim-refresh');
 } finally { await prisma.user.delete({where:{id:attacker}}); }
});
