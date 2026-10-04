import {beforeAll,afterAll,afterEach,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {prisma} from './db';
import {moduleConversation} from './module-conversation';
import {nexdoPersonality} from './assistant-personality';
let user='';
beforeAll(async()=>{user=(await prisma.user.create({data:{email:randomUUID()+'@example.com',name:'Test',passwordHash:''}})).id;});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
afterAll(async()=>{await prisma.user.delete({where:{id:user}});});
it('typed proposal saves only after confirmation and cannot execute twice',async()=>{
 vi.stubEnv('OPENAI_API_KEY','test');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({output:[{type:'function_call',name:'create_moment',call_id:'one',arguments:JSON.stringify({title:'Sam birthday',type:'birthday',date:'2030-10-12',yearly:true,firstName:'Sam'})}]}))));
 const proposal=await moduleConversation(user,'Add Sam birthday on October 12 2030');
 const request=JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
 expect(request.instructions).toContain(nexdoPersonality);
 expect(request.instructions).toContain('Changes are proposals until the user confirms in the UI');
 expect(proposal?.confirmation?.actionId).toBeTruthy();
 expect(await prisma.importantMoment.count({where:{userId:user}})).toBe(0);
 const id=proposal!.confirmation!.actionId;
 const result=await moduleConversation(user,'yes',id);expect(result?.spoken).toContain('Saved');
 await moduleConversation(user,'yes',id);
 expect(await prisma.importantMoment.count({where:{userId:user}})).toBe(1);
});
it('unrelated requests retain the existing planner',async()=>{expect(await moduleConversation(user,'Find time for a walk')).toBeNull();});
it('routes calorie questions through a read-only tool without mutation confirmation',async()=>{
 vi.stubEnv('OPENAI_API_KEY','test');
 const fetcher=vi.fn()
  .mockResolvedValueOnce(new Response(JSON.stringify({output:[{type:'function_call',name:'find_nutrition_summary',call_id:'nutrition',arguments:JSON.stringify({from:'2030-10-01',to:'2030-10-07'})}]})))
  .mockResolvedValueOnce(new Response(JSON.stringify({output:[{content:[{text:'No food was logged for that date range.'}]}]})));
 vi.stubGlobal('fetch',fetcher);
 const result=await moduleConversation(user,'How many calories did I eat this week?');
 expect(result?.spoken).toContain('No food was logged');
 expect(result?.confirmation).toBeNull();
 const second=JSON.parse(fetcher.mock.calls[1][1].body);
 expect(second.input.find((v:{type:string})=>v.type==='function_call_output').output).toContain('loggedDays');
});
