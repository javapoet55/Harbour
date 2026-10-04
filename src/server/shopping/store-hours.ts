import { z } from 'zod';
import { MomentError } from '@/server/moments/domain';
export const placeID = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/);
const hours = z.object({ weekdayDescriptions: z.array(z.string().max(300)).max(7).optional(), openNow: z.boolean().optional() });
const details = z.object({ currentOpeningHours: hours.optional(), regularOpeningHours: hours.optional() });
export async function shoppingStoreHours(id: string) {
  placeID.parse(id);
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new MomentError('Store hours are unavailable. Check Google Maps for the latest hours.', 503);
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=en`, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'currentOpeningHours,regularOpeningHours' },
      signal: AbortSignal.timeout(8000), cache: 'no-store', redirect: 'error',
    });
    if (!response.ok) throw Error('upstream');
    const data = details.parse(await response.json());
    const current = data.currentOpeningHours?.weekdayDescriptions;
    return { days: current?.length ? current : data.regularOpeningHours?.weekdayDescriptions ?? [],
      openNow: data.currentOpeningHours?.openNow ?? null, current: !!current?.length, checkedAt: new Date().toISOString() };
  } catch { throw new MomentError('Store hours are temporarily unavailable. Check Google Maps or try again.', 503); }
}
