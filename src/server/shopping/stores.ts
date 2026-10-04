import { z } from 'zod';
import { MomentError } from '@/server/moments/domain';

export const storeSearchInput = z.object({
  name: z.string().trim().max(120),
  area: z.string().trim().min(2).max(160).optional(),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
}).refine(p => !!p.zip || !!p.area || (p.latitude !== undefined && p.longitude !== undefined), 'Enter a ZIP code or use your location.')
  .refine(p => (p.latitude === undefined) === (p.longitude === undefined), 'Latitude and longitude must be sent together.');
// Google omits fields on some components (e.g. plus-code entries have no `types`), so anything we
// don't strictly need stays optional; places missing name/address are dropped instead of failing.
const resultSchema = z.object({ places: z.array(z.object({
  id: z.string(), displayName: z.object({ text: z.string() }).optional(), formattedAddress: z.string().optional(),
  businessStatus: z.string().optional(),
  location: z.object({latitude:z.number(),longitude:z.number()}).optional(),
  addressComponents: z.array(z.object({ longText: z.string().optional(), types: z.array(z.string()).optional() })).optional(),
  attributions: z.array(z.object({ provider: z.string().optional(), providerUri: z.string().optional() })).optional(),
  photos: z.array(z.object({ name: z.string() })).optional(),
})).optional() });

const placesPost = (key: string, fieldMask: string, body: unknown) => fetch('https://places.googleapis.com/v1/places:searchText', {
  method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(12000),
  headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': fieldMask },
  body: JSON.stringify(body),
});

export async function searchShoppingStores(input: z.infer<typeof storeSearchInput>) {
  const p = storeSearchInput.parse(input);
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new MomentError('Store search is not configured yet. You can enter the address manually.', 503);
  let response: Response;
  try {
    response = await placesPost(key, 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.businessStatus,places.attributions,places.location',
      { textQuery: `${p.name ? `${p.name} store` : "grocery stores"}${p.zip || p.area ? ` near ${p.zip || p.area}, USA` : ""}`,
        pageSize: 15, languageCode: 'en', regionCode: 'US',
        ...(!p.zip && !p.area ? { locationBias: { circle: { center: { latitude: p.latitude, longitude: p.longitude }, radius: 25000 } } } : {}),
      });
  } catch { throw new MomentError('Store search is temporarily unavailable. Try again or enter the address manually.', 503); }
  if (!response.ok) throw new MomentError('Store search is temporarily unavailable. Try again or enter the address manually.', 503);
  // A malformed body (non-JSON or an unexpected shape) is an upstream failure, not a client error —
  // without this it would surface as a 400 "invalid input" through the route's ZodError/SyntaxError handling.
  let data: z.infer<typeof resultSchema>;
  try {
    data = resultSchema.parse(await response.json());
  } catch {
    throw new MomentError('Store search is temporarily unavailable. Try again or enter the address manually.', 503);
  }
  return { stores: (data.places ?? [])
    .filter(place => (!place.businessStatus || place.businessStatus === 'OPERATIONAL') && !!place.displayName?.text && !!place.formattedAddress)
    .map(place => ({
      id: place.id, name: place.displayName!.text, address: place.formattedAddress!,
      distanceKm: p.latitude !== undefined && p.longitude !== undefined && !p.zip && !p.area && place.location ? distanceKm(p.latitude,p.longitude,place.location.latitude,place.location.longitude) : null,
      zip: place.addressComponents?.find(c => c.types?.includes('postal_code'))?.longText ?? '',
      attributions: (place.attributions ?? []).map(a => a.provider).filter((a): a is string => !!a),
    })).sort((a,b)=>(a.distanceKm ?? Number.MAX_VALUE)-(b.distanceKm ?? Number.MAX_VALUE)) };
}

export const storeLogoInput = z.object({
  name: z.string().trim().min(1).max(120),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
});

/** The store's first Google Places photo, fetched server-side so the API key never reaches the client. */
export async function storeLogo(input: z.infer<typeof storeLogoInput>): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const p = storeLogoInput.parse(input);
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new MomentError('Store search is not configured yet.', 503);
  let response: Response;
  try {
    response = await placesPost(key, 'places.id,places.photos,places.businessStatus',
      { textQuery: `${p.name} store${p.zip ? ` near ${p.zip}, USA` : ', USA'}`, pageSize: 10, languageCode: 'en', regionCode: 'US' });
  } catch { throw new MomentError('Store images are temporarily unavailable.', 503); }
  if (!response.ok) throw new MomentError('Store images are temporarily unavailable.', 503);
  let data: z.infer<typeof resultSchema>;
  try {
    data = resultSchema.parse(await response.json());
  } catch { throw new MomentError('Store images are temporarily unavailable.', 503); }
  const photo = (data.places ?? []).find(place => (!place.businessStatus || place.businessStatus === 'OPERATIONAL') && place.photos?.length)?.photos?.[0];
  if (!photo) return null;
  try {
    const image = await fetch(`https://places.googleapis.com/v1/${photo.name}/media?key=${key}&maxHeightPx=200&skipHttpRedirect=false`,
      { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!image.ok) return null;
    return { bytes: await image.arrayBuffer(), contentType: image.headers.get('Content-Type') ?? 'image/jpeg' };
  } catch { return null; }
}

function distanceKm(lat:number,lon:number,toLat:number,toLon:number) {
  const rad=Math.PI/180;
  const a=Math.sin((toLat-lat)*rad/2)**2+Math.cos(lat*rad)*Math.cos(toLat*rad)*Math.sin((toLon-lon)*rad/2)**2;
  return Math.round(6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)))*100)/100;
}
