import { afterEach, expect, it, vi } from 'vitest';
import { shoppingStoreHours, placeID } from './store-hours';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()});
it('requests exact selected branch hours and prefers current hours',async()=>{
 vi.stubEnv('GOOGLE_PLACES_API_KEY','test-secret');const f=vi.fn().mockResolvedValue(Response.json({currentOpeningHours:{weekdayDescriptions:['Monday: 9 AM–6 PM'],openNow:true},regularOpeningHours:{weekdayDescriptions:['Monday: 10 AM–5 PM']}}));vi.stubGlobal('fetch',f);
 expect(await shoppingStoreHours('place_123')).toMatchObject({days:['Monday: 9 AM–6 PM'],openNow:true,current:true});
 expect(f.mock.calls[0][0]).toBe('https://places.googleapis.com/v1/places/place_123?languageCode=en');expect(f.mock.calls[0][1].headers['X-Goog-Api-Key']).toBe('test-secret');
});
it('falls back to regular hours without inventing open status',async()=>{
 vi.stubEnv('GOOGLE_PLACES_API_KEY','test-secret');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({regularOpeningHours:{weekdayDescriptions:['Monday: Closed']}})));
 expect(await shoppingStoreHours('place')).toMatchObject({days:['Monday: Closed'],openNow:null,current:false});
});
it('handles missing hours',async()=>{
 vi.stubEnv('GOOGLE_PLACES_API_KEY','test-secret');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({})));
 expect(await shoppingStoreHours('place')).toMatchObject({days:[],openNow:null});
});
it.each([403,429,500])('sanitizes provider failure %s',async status=>{
 vi.stubEnv('GOOGLE_PLACES_API_KEY','test-secret');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('private error',{status})));
 await expect(shoppingStoreHours('place')).rejects.toMatchObject({status:503,message:expect.not.stringContaining('test-secret')});
});
it('rejects malformed identifiers before provider access',()=>{
 for(const value of ['../secret','https://evil.test','', 'x?key=y'])expect(placeID.safeParse(value).success).toBe(false);
});
