import { afterEach, expect, it, vi } from 'vitest';
import { searchShoppingStores, storeSearchInput } from './stores';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const sample = {places:[{id:'store-1',displayName:{text:'Costco Wholesale'},formattedAddress:'3150 Fostoria Way, Danville, CA 94526, USA',businessStatus:'OPERATIONAL',addressComponents:[{longText:'94526',types:['postal_code']}]}]};
it('searches the entered ZIP and returns the full address and branch ZIP', async () => {
  vi.stubEnv('GOOGLE_PLACES_API_KEY','test-only');
  const fetcher=vi.fn().mockResolvedValue(Response.json(sample));vi.stubGlobal('fetch',fetcher);
  expect(await searchShoppingStores({name:'Costco',zip:'94582',latitude:1,longitude:2})).toEqual({stores:[{id:'store-1',name:'Costco Wholesale',address:sample.places[0].formattedAddress,zip:'94526',distanceKm:null,attributions:[]}]});
  const args=fetcher.mock.calls[0];expect(args[0]).toBe('https://places.googleapis.com/v1/places:searchText');
  const body=JSON.parse(args[1].body);expect(body.textQuery).toBe('Costco store near 94582, USA');expect(body.locationBias).toBeUndefined();
});
it('uses a location bias when no ZIP is supplied',async()=>{
  vi.stubEnv('GOOGLE_PLACES_API_KEY','test-only');const fetcher=vi.fn().mockResolvedValue(Response.json({places:[]}));vi.stubGlobal('fetch',fetcher);
  await searchShoppingStores({name:'Costco',latitude:37.8,longitude:-122});
  expect(JSON.parse(fetcher.mock.calls[0][1].body).locationBias.circle).toEqual({center:{latitude:37.8,longitude:-122},radius:25000});
});
it('requires a search area and rejects malformed coordinates and ZIPs',()=>{
  for(const p of [{name:'Costco'},{name:'Costco',latitude:91,longitude:0},{name:'Costco',zip:'abc'}])expect(storeSearchInput.safeParse(p).success).toBe(false);
});
it('excludes closed locations and never guesses missing ZIPs',async()=>{
  vi.stubEnv('GOOGLE_PLACES_API_KEY','test-only');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({places:[{...sample.places[0],addressComponents:[]},{...sample.places[0],id:'closed',businessStatus:'CLOSED_PERMANENTLY'}]})));
  expect((await searchShoppingStores({name:'Costco',zip:'94582'})).stores).toHaveLength(1);
});
it('returns a safe failure without exposing provider details or credentials',async()=>{
  vi.stubEnv('GOOGLE_PLACES_API_KEY','test-only');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('private error',{status:403})));
  await expect(searchShoppingStores({name:'Costco',zip:'94582'})).rejects.toMatchObject({status:503,message:expect.stringContaining('temporarily unavailable')});
});
it('does not request Google without a configured key',async()=>{
  vi.stubEnv('GOOGLE_PLACES_API_KEY','');const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  await expect(searchShoppingStores({name:'Costco',zip:'94582'})).rejects.toMatchObject({status:503});expect(fetcher).not.toHaveBeenCalled();
});
it('finds grocery stores by city without requiring a store name',async()=>{
  vi.stubEnv('GOOGLE_PLACES_API_KEY','test-only');const fetcher=vi.fn().mockResolvedValue(Response.json({places:[]}));vi.stubGlobal('fetch',fetcher);
  await searchShoppingStores({name:'',area:'San Ramon, CA'});
  expect(JSON.parse(fetcher.mock.calls[0][1].body).textQuery).toBe('grocery stores near San Ramon, CA, USA');
});
it('returns distance only when searching from the actual coordinate origin',async()=>{
  vi.stubEnv('GOOGLE_PLACES_API_KEY','test-only');vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>Promise.resolve(Response.json({places:[{...sample.places[0],location:{latitude:37.8,longitude:-122}}]}))));
  expect((await searchShoppingStores({name:'',latitude:37.8,longitude:-122})).stores[0].distanceKm).toBe(0);
  expect((await searchShoppingStores({name:'',area:'San Ramon',latitude:37.8,longitude:-122})).stores[0].distanceKm).toBeNull();
});
