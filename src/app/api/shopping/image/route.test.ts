import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {POST} from './route';
const auth=vi.hoisted(()=>({requireUser:vi.fn()}));vi.mock('@/server/auth',()=>auth);
const upstream=vi.fn();
const request=(consent=true)=>new Request('https://test/api/shopping/image',{method:'POST',body:JSON.stringify({name:'Butter',details:'Gold wrapper',consent})});
beforeEach(()=>{auth.requireUser.mockResolvedValue({id:crypto.randomUUID()});upstream.mockReset();vi.stubGlobal('fetch',upstream);vi.stubEnv('OPENAI_API_KEY','secret')});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()});
it('requires authentication and explicit consent before generation',async()=>{
 expect((await POST(request(false))).status).toBe(400);expect(upstream).not.toHaveBeenCalled();
 auth.requireUser.mockRejectedValue(new Error('UNAUTHENTICATED'));expect((await POST(request())).status).toBe(401);
});
it('returns artwork for client preview without attaching it automatically',async()=>{
 upstream.mockResolvedValue(Response.json({data:[{b64_json:'/9j/AA=='}]}));
 const response=await POST(request());expect(response.status).toBe(200);expect(await response.json()).toEqual({data:'/9j/AA=='});
 expect(JSON.parse(upstream.mock.calls[0][1].body).prompt).toContain('Butter');
});
it('keeps provider diagnostics and credentials out of errors',async()=>{
 upstream.mockResolvedValue(new Response('secret',{status:500}));const response=await POST(request());expect(response.status).toBe(502);expect(await response.text()).not.toContain('secret');
});
