import { afterEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(()=>vi.fn());
vi.mock('@/server/admin-auth',()=>({requireAdmin:auth}));
import { GET } from './route';
afterEach(()=>auth.mockReset());
it('protects cost reporting from unauthenticated access',async()=>{
 auth.mockRejectedValue(new Error('UNAUTHENTICATED'));
 expect((await GET(new Request('https://example.test/api/admin/api-costs'))).status).toBe(401);
});
it('validates the requested date range',async()=>{
 auth.mockResolvedValue({id:'admin'});
 expect((await GET(new Request('https://example.test/api/admin/api-costs?from=invalid&to=invalid'))).status).toBe(400);
});
