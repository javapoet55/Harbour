import { z } from 'zod';
import { MomentError } from '@/server/moments/domain';

export const storeSearchInput = z.object({
  name: z.string().trim().max(120),
  area: z.string().trim().min(2).max(160).optional(),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
}).refine(p => !!p.zip || !!p.area || (p.latitude !== undefined && p.longitude !== undefined), 'Enter a ZIP code or use your location.');
const resultSchema = z.object({ places: z.array(z.object({
  id: z.string(), displayName: z.object({ text: z.string() }), formattedAddress: z.string(),
  businessStatus: z.string().optional(),
  location: z.object({latitude:z.number(),longitude:z.number()}).optional(),
  addressComponents: z.array(z.object({ longText: z.string(), types: z.array(z.string()) })).optional(),
  attributions: z.array(z.object({ provider: z.string().optional(), providerUri: z.string().optional() })).optional(),
})).optional() });

export async function searchShoppingStores(input: z.infer<typeof storeSearchInput>) {
  const p = storeSearchInput.parse(input);
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new MomentError('Store search is not configured yet. You can enter the address manually.', 503);
  let response: Response;
  try {
    response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.businessStatus,places.attributions,places.location' },
      body: JSON.stringify({ textQuery: `${p.name ? `${p.name} store` : "grocery stores"}${p.zip || p.area ? ` near ${p.zip || p.area}, USA` : ""}`,
        pageSize: 15, languageCode: 'en', regionCode: 'US',
        ...(!p.zip && !p.area ? { locationBias: { circle: { center: { latitude: p.latitude, longitude: p.longitude }, radius: 25000 } } } : {}),
      }),
    });
  } catch { throw new MomentError('Store search is temporarily unavailable. Try again or enter the address manually.', 503); }
  if (!response.ok) throw new MomentError('Store search is temporarily unavailable. Try again or enter the address manually.', 503);
  const data = resultSchema.parse(await response.json());
  return { stores: (data.places ?? []).filter(p => !p.businessStatus || p.businessStatus === 'OPERATIONAL').map(p => ({
    id: p.id, name: p.displayName.text, address: p.formattedAddress,
    distanceKm: input.latitude !== undefined && input.longitude !== undefined && !input.zip && !input.area && p.location ? distanceKm(input.latitude,input.longitude,p.location.latitude,p.location.longitude) : null,
    zip: p.addressComponents?.find(c => c.types.includes('postal_code'))?.longText ?? '',
    attributions: (p.attributions ?? []).map(a => a.provider).filter((a): a is string => !!a),
  })).sort((a,b)=>(a.distanceKm ?? Infinity)-(b.distanceKm ?? Infinity)) };
}

function distanceKm(lat:number,lon:number,toLat:number,toLon:number) {
  const rad=Math.PI/180;
  const a=Math.sin((toLat-lat)*rad/2)**2+Math.cos(lat*rad)*Math.cos(toLat*rad)*Math.sin((toLon-lon)*rad/2)**2;
  return Math.round(6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)))*100)/100;
}
