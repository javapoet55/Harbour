import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/server/auth',()=>({requireUser:vi.fn()}));
vi.mock('@/server/signup/abuse',()=>({consumeLimit:vi.fn()}));
vi.mock('@/server/shopping/stores',async(importOriginal)=>({...await importOriginal<typeof import('@/server/shopping/stores')>(),searchShoppingStores:vi.fn()}));
import {requireUser} from '@/server/auth';
import {consumeLimit} from '@/server/signup/abuse';
import {searchShoppingStores} from '@/server/shopping/stores';
import {POST} from './route';
afterEach(()=>vi.resetAllMocks());
const request=(body:unknown)=>new Request('http://localhost/api/shopping/stores',{method:'POST',body:JSON.stringify(body)});
it('authenticates before attempting a provider lookup',async()=>{
  vi.mocked(requireUser).mockRejectedValue(new Error('UNAUTHORIZED'));
  await POST(request({name:'Costco',zip:'94582'}));
  expect(searchShoppingStores).not.toHaveBeenCalled();expect(consumeLimit).not.toHaveBeenCalled();
});
it('rejects an invalid location before spending provider quota',async()=>{
  vi.mocked(requireUser).mockResolvedValue({id:'user-1'} as Awaited<ReturnType<typeof requireUser>>);
  const response=await POST(request({name:'Costco'}));expect(response.status).toBe(400);expect(searchShoppingStores).not.toHaveBeenCalled();
});
it('rate limits each authenticated user and prevents provider calls after the limit',async()=>{
  vi.mocked(requireUser).mockResolvedValue({id:'user-1'} as Awaited<ReturnType<typeof requireUser>>);
  vi.mocked(consumeLimit).mockRejectedValue(new Error('AUTH_RATE_LIMITED'));
  expect((await POST(request({name:'Costco',zip:'94582'}))).status).toBe(429);
  expect(consumeLimit).toHaveBeenCalledWith('shopping-store-search','user-1',30,60000);expect(searchShoppingStores).not.toHaveBeenCalled();
});
