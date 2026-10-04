import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/server/auth',()=>({requireUser:vi.fn(async()=>({id:'owner'}))}));
vi.mock('@/server/db',()=>({prisma:{shoppingList:{findFirst:vi.fn()}}}));
vi.mock('@/server/signup/abuse',()=>({consumeLimit:vi.fn(async()=>{})}));
vi.mock('@/server/shopping/brands/service',()=>({storeBrandService:{resolve:vi.fn(async()=>({displayName:'Costco',logoUrl:null,source:'fallback'}))}}));
import { prisma } from '@/server/db';
import { storeBrandService } from '@/server/shopping/brands/service';
import { GET } from './route';
afterEach(()=>vi.clearAllMocks());
it('only resolves a list owned by the authenticated user and uses saved website',async()=>{
 vi.mocked(prisma.shoppingList.findFirst).mockResolvedValue({storeName:'Costco',storeWebsite:'https://costco.com'} as never);
 const response=await GET(new Request('https://example.test/api/shopping/store-brand?listId=list-1&name=attacker'));
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');
 expect(prisma.shoppingList.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:'list-1',userId:'owner'}}));
 expect(storeBrandService.resolve).toHaveBeenCalledWith('Costco','https://costco.com');
});
it('does not resolve inaccessible lists',async()=>{
 vi.mocked(prisma.shoppingList.findFirst).mockResolvedValue(null);
 expect((await GET(new Request('https://example.test/api/shopping/store-brand?listId=other'))).status).toBe(404);
 expect(storeBrandService.resolve).not.toHaveBeenCalled();
});
it('requires a bounded list identifier',async()=>{
 expect((await GET(new Request('https://example.test/api/shopping/store-brand'))).status).toBe(400);
 expect(prisma.shoppingList.findFirst).not.toHaveBeenCalled();
});
