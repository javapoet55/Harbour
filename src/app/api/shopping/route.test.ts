import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({requireUser:vi.fn(),shoppingAction:vi.fn(),shoppingLists:vi.fn()}));
vi.mock('@/server/auth',()=>({requireUser:mocks.requireUser}));
vi.mock('@/server/shopping/service',()=>mocks);
import {POST} from './route';
beforeEach(()=>{vi.resetAllMocks();mocks.requireUser.mockResolvedValue({id:'owner'});mocks.shoppingAction.mockResolvedValue({list:{id:'list'}})});
const req=(key:unknown)=>new Request('https://example.test/api/shopping',{method:'POST',body:JSON.stringify({operation:'create',input:{title:'Weekly'},idempotencyKey:key})});
it('forwards a validated create idempotency key',async()=>{
 const key='fc9b7df1-99eb-4ce0-844a-4de9c65d707c';expect((await POST(req(key))).status).toBe(200);
 expect(mocks.shoppingAction).toHaveBeenCalledWith('owner',expect.objectContaining({operation:'create'}),key);
});
it('rejects malformed keys before changing a list',async()=>{expect((await POST(req('bad'))).status).toBe(400);expect(mocks.shoppingAction).not.toHaveBeenCalled()});
it('keeps older clients compatible',async()=>{expect((await POST(req(undefined))).status).toBe(200);expect(mocks.shoppingAction).toHaveBeenCalledWith('owner',expect.anything(),undefined)});
