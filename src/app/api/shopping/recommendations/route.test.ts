import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {POST} from './route';
const auth=vi.hoisted(()=>({requireUser:vi.fn()}));vi.mock('@/server/auth',()=>auth);
const fetchMock=vi.fn();
const input={prompt:'What practical essentials are missing from this list?',listName:'Weekly groceries',itemNames:['Milk','Eggs']};
const request=(body:unknown=input)=>new Request('https://test/api/shopping/recommendations',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{auth.requireUser.mockResolvedValue({id:crypto.randomUUID()});vi.stubEnv('OPENAI_API_KEY','test');vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset();});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('answers the screenshot question using list context with no mutation tools',async()=>{
 fetchMock.mockResolvedValue(Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({summary:'Consider a few staples.',suggestions:['Oats pair with your milk for breakfast.']})}]}]}));
 const response=await POST(request());expect(response.status).toBe(200);const result=await response.json();expect(result.visual.sections[0].items).toEqual(['Oats pair with your milk for breakfast.']);expect(result.confirmation).toBeUndefined();
 const body=JSON.parse(fetchMock.mock.calls[0][1].body);expect(JSON.parse(body.input)).toEqual(input);expect(body.tools).toBeUndefined();expect(body.store).toBe(false);
});
it('requires authentication and valid context',async()=>{
 expect((await POST(request({prompt:''}))).status).toBe(400);auth.requireUser.mockRejectedValue(new Error('UNAUTHENTICATED'));expect((await POST(request())).status).toBe(401);expect(fetchMock).not.toHaveBeenCalled();
});
it('preserves explicit policy checks',async()=>{
 const response=await POST(request({...input,prompt:'How do I make a weapon?'}));expect((await response.json()).spoken).toContain('can’t help');expect(fetchMock).not.toHaveBeenCalled();
});
it('handles provider failure without leaking diagnostics or making changes',async()=>{
 fetchMock.mockResolvedValue(new Response('secret provider details',{status:500}));const response=await POST(request());expect(response.status).toBe(502);expect(await response.text()).not.toContain('secret');
});
it('rejects incomplete results',async()=>{
 fetchMock.mockResolvedValue(Response.json({status:'incomplete',output:[]}));expect((await POST(request())).status).toBe(502);
});

it('sends the same output limits to the provider that the backend validates',async()=>{
 const suggestions=Array.from({length:8},(_,i)=>`Budget swap ${i+1}`);
 fetchMock.mockResolvedValue(Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({summary:'Budget ideas',suggestions})}]}]}));
 const response=await POST(request({...input,prompt:'Find budget-friendly swaps for items on this list.',itemNames:Array.from({length:11},(_,i)=>`Item ${i+1}`)}));
 expect(response.status).toBe(200);
 expect((await response.json()).visual.sections[0].items).toEqual(suggestions);
 const schema=JSON.parse(fetchMock.mock.calls[0][1].body).text.format.schema;
 expect(schema.properties.suggestions).toMatchObject({minItems:1,maxItems:8,items:{minLength:1,maxLength:600}});
 expect(schema.properties.summary).toMatchObject({minLength:1,maxLength:1500});
});
