import type { ShoppingProductFacts } from './productFacts';

/**
 * `FoodVoiceContext` and `FoodVoiceLookupResponse` (ios/Sources/NexdoCore/FoodVoiceContext.swift):
 * "Send only the two product queries, never shopping-list notes or account data."
 *
 * Swift passes it from Item Alternatives (ShoppingAlternativesView.swift:325) into Ask by Voice, which
 * sends it with the voice task session (NexdoApp.swift:535) and reads lookups back from
 * `POST /api/realtime/tool` (NexdoApp.swift:591).
 */

export type FoodVoiceItem = { name: string; brand?: string; barcode?: string };
export type FoodVoiceContext = { original: FoodVoiceItem; alternative: FoodVoiceItem };

/** `Array.from` keeps whole code points, the nearest JavaScript has to Swift's `prefix` on characters. */
function prefix(value: string, count: number): string {
  return Array.from(value).slice(0, count).join('');
}

/** `FoodVoiceContext.Item.init`: names and brands at most 200 characters; a barcode only if 8–14 digits. */
export function foodVoiceItem(name: string, brand?: string | null, barcode?: string | null): FoodVoiceItem {
  const item: FoodVoiceItem = { name: prefix(name, 200) };
  if (brand != null) item.brand = prefix(brand, 200);
  if (barcode != null && /^\d{8,14}$/.test(barcode)) item.barcode = barcode;
  return item;
}

export function foodVoiceContext(original: FoodVoiceItem, alternative: FoodVoiceItem): FoodVoiceContext {
  return { original, alternative };
}

/** `FoodVoiceLookupResponse`: the facts keep their source; unknown allergens stay unknown. */
export type FoodVoiceLookupResponse = { success: boolean; facts?: ShoppingProductFacts | null; error?: string | null };
