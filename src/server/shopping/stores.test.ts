import { afterEach, expect, it, vi } from 'vitest';
import { searchShoppingStores, storeLogo, storeSearchInput } from './stores';
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
it('maps an unexpected provider payload to 503 instead of a client input error',async()=>{
  vi.stubEnv('GOOGLE_PLACES_API_KEY','test-only');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({places:'oops'})));
  await expect(searchShoppingStores({name:'Costco',zip:'94582'})).rejects.toMatchObject({status:503});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<html>error</html>',{status:200})));
  await expect(searchShoppingStores({name:'Costco',zip:'94582'})).rejects.toMatchObject({status:503});
});
it('tolerates address components without a types list, as Google returns for plus codes',async()=>{
  vi.stubEnv('GOOGLE_PLACES_API_KEY','test-only');
  const odd={...sample.places[0],addressComponents:[{longText:'218090021',languageCode:'en'},{longText:'94526',types:['postal_code']}]};
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({places:[odd]})));
  expect((await searchShoppingStores({name:'Costco',latitude:37.8,longitude:-122})).stores[0]).toMatchObject({name:'Costco Wholesale',zip:'94526'});
});
it('returns the store photo bytes from Google Places media',async()=>{
  vi.stubEnv('GOOGLE_PLACES_API_KEY','test-only');
  const fetcher=vi.fn()
    .mockResolvedValueOnce(Response.json({places:[{id:'store-1',photos:[{name:'places/store-1/photos/abc'}]}]}))
    .mockResolvedValueOnce(new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/jpeg'}}));
  vi.stubGlobal('fetch',fetcher);
  expect(await storeLogo({name:'Costco',zip:'94582'})).toEqual({bytes:expect.any(ArrayBuffer),contentType:'image/jpeg'});
  expect(fetcher.mock.calls[1][0]).toContain('places/store-1/photos/abc/media');
});
it('returns null when no store photo exists',async()=>{
  vi.stubEnv('GOOGLE_PLACES_API_KEY','test-only');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({places:[{id:'store-1'}]})));
  expect(await storeLogo({name:'Costco'})).toBeNull();
});
it('requires latitude and longitude as a pair',()=>{
  expect(storeSearchInput.safeParse({name:'Costco',latitude:37.8}).success).toBe(false);
  expect(storeSearchInput.safeParse({name:'Costco',longitude:-122}).success).toBe(false);
});
it('does not request Google without a configured key',async()=>{
  vi.stubEnv('GOOGLE_PLACES_API_KEY','');const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  await expect(searchShoppingStores({name:'Costco',zip:'94582'})).rejects.toMatchObject({status:503});expect(fetcher).not.toHaveBeenCalled();
});
// A typed area is placed first (the request asking for viewports), then searched inside its bounds.
const sanRamon={places:[{types:['locality','political'],location:{latitude:37.78,longitude:-121.98},viewport:{low:{latitude:37.71,longitude:-122.01},high:{latitude:37.80,longitude:-121.90}}}]};
const places=(area:unknown,stores:unknown)=>vi.fn().mockImplementation((_:string,init:{headers:Record<string,string>})=>
  Promise.resolve(Response.json(init.headers['X-Goog-FieldMask'].includes('viewport')?area:stores)));
it('finds grocery stores by city without requiring a store name',async()=>{
  vi.stubEnv('GOOGLE_PLACES_API_KEY','test-only');const fetcher=places(sanRamon,{places:[]});vi.stubGlobal('fetch',fetcher);
  await searchShoppingStores({name:'',area:'San Ramon, CA'});
  expect(JSON.parse(fetcher.mock.calls[0][1].body).textQuery).toBe('San Ramon, CA');
  expect(JSON.parse(fetcher.mock.calls[1][1].body).textQuery).toBe('grocery stores near San Ramon, CA, USA');
});
it('returns no stores for an area that cannot be placed, not stores from somewhere else',async()=>{
  vi.stubEnv('GOOGLE_PLACES_API_KEY','test-only');
  for(const area of [{places:[]},{},{places:[{types:['country','political'],location:{latitude:38,longitude:-97}}]},{places:[{types:['grocery_store','store'],location:{latitude:38,longitude:-97}}]}]){
    const fetcher=places(area,sample);vi.stubGlobal('fetch',fetcher);
    expect(await searchShoppingStores({name:'Safeway',area:'Qzxqv Nowhere'})).toEqual({stores:[]});
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
it('restricts an area search to the area and its surroundings',async()=>{
  vi.stubEnv('GOOGLE_PLACES_API_KEY','test-only');const fetcher=places(sanRamon,sample);vi.stubGlobal('fetch',fetcher);
  expect((await searchShoppingStores({name:'Safeway',area:'San Ramon'})).stores).toHaveLength(1);
  const body=JSON.parse(fetcher.mock.calls[1][1].body);expect(body.locationBias).toBeUndefined();
  const {low,high}=body.locationRestriction.rectangle;
  expect(low.latitude).toBeCloseTo(37.46);expect(high.latitude).toBeCloseTo(38.05);
  expect(low.longitude).toBeLessThan(-122.3);expect(high.longitude).toBeGreaterThan(-121.6);
});
it('reports an area lookup failure as unavailable, not as no stores',async()=>{
  vi.stubEnv('GOOGLE_PLACES_API_KEY','test-only');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('quota',{status:429})));
  await expect(searchShoppingStores({name:'Safeway',area:'San Ramon'})).rejects.toMatchObject({status:503});
});
it('returns distance only when searching from the actual coordinate origin',async()=>{
  vi.stubEnv('GOOGLE_PLACES_API_KEY','test-only');vi.stubGlobal('fetch',places(sanRamon,{places:[{...sample.places[0],location:{latitude:37.8,longitude:-122}}]}));
  expect((await searchShoppingStores({name:'',latitude:37.8,longitude:-122})).stores[0].distanceKm).toBe(0);
  expect((await searchShoppingStores({name:'',area:'San Ramon',latitude:37.8,longitude:-122})).stores[0].distanceKm).toBeNull();
});

it('reuses the website from the same Places request without a details lookup',async()=>{
 vi.stubEnv('GOOGLE_PLACES_API_KEY','test-only');const fetcher=vi.fn().mockResolvedValue(Response.json({places:[{...sample.places[0],websiteUri:'https://www.costco.com/warehouse'}]}));vi.stubGlobal('fetch',fetcher);
 const result=await searchShoppingStores({name:'Costco',zip:'94582'});
 expect(result.stores[0].website).toBe('https://www.costco.com/warehouse');expect(fetcher).toHaveBeenCalledTimes(1);
 expect(fetcher.mock.calls[0][1].headers['X-Goog-FieldMask']).toContain('places.websiteUri');
});
