import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../food/cache', () => ({ databaseStorage: {}, providerPermit: vi.fn(async()=>true), providerBackoff: vi.fn(async()=>{}) }));
import type { CacheStorage } from '../food/cache';
import { BrandfetchClient } from './client';
import { StoreBrandService } from './service';
import { normalizeDomain, retailerIdentity, safeLogo } from './identity';
function memory() {
 const rows=new Map<string,NonNullable<Awaited<ReturnType<CacheStorage['read']>>>>();
 const storage:CacheStorage={read:async k=>rows.get(k)??null,claim:async(k,n)=>{const r=rows.get(k);if(r && +r.leaseUntil>+n)return false;rows.set(k,{...(r??{payload:null,schemaVersion:1,expiresAt:new Date(0),staleUntil:new Date(0)}),leaseUntil:new Date(+n+60000)});return true},write:async(k,p,e,s)=>{rows.set(k,{payload:p,schemaVersion:1,expiresAt:e,staleUntil:s,leaseUntil:new Date(0)})},release:async k=>{const r=rows.get(k);if(r)r.leaseUntil=new Date(0)}};
 return {rows,storage};
}
const sample=(name='Costco',domain='costco.com')=>({id:'brand-1',name,domain,logos:[{type:'icon',formats:[{src:'https://cdn.brandfetch.io/brand-1/logo.png',format:'png',width:128,height:128}]}]});
function mockClient(name='Costco',domain='costco.com') {
 const client=new BrandfetchClient('fake-secret','public-client');
 vi.spyOn(client,'searchBrand').mockResolvedValue([{name,domain,brandId:'brand-1'}]);
 vi.spyOn(client,'getBrand').mockResolvedValue(sample(name,domain));
 return client;
}
afterEach(()=>vi.restoreAllMocks());
it.each(['https://www.COSTCO.com/abc?q=1#x','http://www.costco.com','costco.com/'])('normalizes %s',v=>expect(normalizeDomain(v)).toBe('costco.com'));
it('preserves meaningful subdomains and rejects unsafe domains/assets',()=>{
 expect(normalizeDomain('https://shop.localmarket.com/a')).toBe('shop.localmarket.com');
 for(const v of ['javascript:alert(1)','https://user:pass@costco.com','127.0.0.1','https://localhost','https://a.local'])expect(normalizeDomain(v)).toBeNull();
 for(const v of ['http://cdn.brandfetch.io/a','https://evil.com/logo','https://cdn.brandfetch.io/a?key=secret'])expect(safeLogo(v)).toBeNull();
});
it.each([['Whole Foods','Whole Foods Market'],['Trader Joes',"Trader Joe's"],['Costco Wholesale Corporation','Costco']])('normalizes alias %s',(input,expected)=>expect(retailerIdentity(input).displayName).toBe(expected));
it.each([['Costco','costco.com'],['Target','target.com']])('resolves %s and reuses both name and domain caches',async(name,domain)=>{
 const client=mockClient(name,domain), {storage}=memory(), service=new StoreBrandService(client,storage);
 expect(await service.resolve(name)).toMatchObject({domain,source:'brandfetch',logoUrl:expect.stringContaining('https://cdn.brandfetch.io')});
 await service.resolve(name);await service.resolve(name,`https://${domain}`);
 expect(client.searchBrand).toHaveBeenCalledTimes(1);expect(client.getBrand).toHaveBeenCalledTimes(1);
});
it('domain skips search; expiry refreshes',async()=>{
 let now=1000;const client=mockClient(),{storage}=memory(),service=new StoreBrandService(client,storage,()=>now);
 await service.resolve('Costco','https://www.costco.com/warehouse');expect(client.searchBrand).not.toHaveBeenCalled();
 now+=30*86400000;await service.resolve('Costco','costco.com');expect(client.getBrand).toHaveBeenCalledTimes(2);
});
it('unknown stores are negative cached even with deceptively similar provider names',async()=>{
 const client=mockClient("Joe's Market",'traderjoes.com'),{storage}=memory(),service=new StoreBrandService(client,storage);
 const first=await service.resolve("Joe's Market");expect(first.logoUrl).toBeNull();expect(first.source).toBe('fallback');
 await service.resolve("Joe's Market");expect(client.searchBrand).toHaveBeenCalledTimes(1);expect(client.getBrand).not.toHaveBeenCalled();
 expect(Date.parse(first.expiresAt!)-Date.parse(first.fetchedAt!)).toBe(86400000);
});
it('does not accept unrelated search domains',async()=>{
 const client=mockClient('Target','unrelated.com');expect((await new StoreBrandService(client,memory().storage).resolve('Target')).logoUrl).toBeNull();
});
it('cache outage does not call provider',async()=>{
 const client=mockClient(),{storage}=memory();storage.read=async()=>{throw Error('offline')};
 expect((await new StoreBrandService(client,storage).resolve('Costco')).logoUrl).toBeNull();expect(client.searchBrand).not.toHaveBeenCalled();
});
it.each([401,403,404,429,500])('handles %s safely, without credentials in response/logs',async status=>{
 const log=vi.spyOn(console,'error');const fetcher=vi.fn(async()=>new Response('fake-secret private provider error',{status}));
 const client=new BrandfetchClient('fake-secret','public-client',fetcher);
 const result=await new StoreBrandService(client,memory().storage).resolve('Costco','costco.com');
 expect(result.logoUrl).toBeNull();expect(JSON.stringify(result)).not.toContain('fake-secret');expect(log).not.toHaveBeenCalled();
 expect(fetcher).toHaveBeenCalledTimes(status===500?2:1);
 if(status===429){await client.getBrand('target.com');expect(fetcher).toHaveBeenCalledTimes(1)}
});
it('handles timeout and malformed data',async()=>{
 for(const request of [vi.fn(async()=>{throw new DOMException('timeout','TimeoutError')}),vi.fn(async()=>Response.json({bad:true}))]) {
 const client=new BrandfetchClient('fake-secret','public-client',request);
 expect(await client.getBrand('costco.com')).toBeNull();
 }
});
it('requires exact domain confirmation and keeps the secret only in the Brand API header',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>Response.json(sample('Wrong','wrong.com'))),client=new BrandfetchClient('fake-secret','public-client',fetcher);
 expect(await client.getBrand('costco.com')).toBeNull();
 expect(fetcher.mock.calls[0][0]).not.toContain('fake-secret');
 expect(fetcher.mock.calls[0][1]?.headers).toEqual({Authorization:'Bearer fake-secret'});
});
it('does not return unsupported or oversized logo formats',()=>{
 const client=mockClient();const value=sample();value.logos[0].formats[0].width=9000;expect(client.resolveLogo(value)).toBeNull();
});
it('rejects social website brands for a local store and verifies location-suffixed chains',async()=>{
 const client=mockClient('Facebook','facebook.com');
 expect((await new StoreBrandService(client,memory().storage).resolve("Joe's Market",'facebook.com')).logoUrl).toBeNull();
 const target=mockClient('Target','target.com');
 expect((await new StoreBrandService(target,memory().storage).resolve('Target Pharmacy San Ramon','target.com')).logoUrl).not.toBeNull();
});
it('a distributed lease prevents concurrent duplicate lookups',async()=>{
 const client=mockClient(),{storage}=memory(),a=new StoreBrandService(client,storage),b=new StoreBrandService(client,storage);
 await Promise.all([a.resolve('Costco','costco.com'),b.resolve('Costco','costco.com')]);expect(client.getBrand).toHaveBeenCalledTimes(1);
});

it('accepts the provider CDN client parameter but never a secret in an asset URL',()=>{
 const client=mockClient(),value=sample();
 value.logos[0].formats[0].src='https://cdn.brandfetch.io/brand/logo.png?c=public-client';
 expect(client.resolveLogo(value)).toContain('?c=public-client');
 value.logos[0].formats[0].src='https://cdn.brandfetch.io/brand/logo.png?c=fake-secret';
 expect(client.resolveLogo(value)).toBeNull();
});
