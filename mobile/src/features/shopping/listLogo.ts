import type { GroceryList } from '../../api/shopping';
import type { ImageEncoder } from './image';

/**
 * A list's own store logo (bdb68ce, migration 20261009000000_shopping_list_logo):
 * `GroceryList.storeLogoData` and `ShoppingListLogoEditor` (ios/App/ShoppingListLogoEditor.swift).
 *
 * The wire value is bare base64 of a JPEG (no `data:` prefix) — the server accepts only `/9j/…`, at
 * most 90,000 characters (src/server/shopping/domain.ts:4). Saving sends:
 * - the logo, to set or keep it;
 * - `""`, to clear it (the server stores null) — Swift sends `list.storeLogoData ?? ""` on EVERY save;
 * - nothing, from an older client: the server keeps the logo, unless the store name changed.
 * The weekly next trip copies it. The editor screen waits for captures; these are its rules.
 */

/** Swift's encoder: at most 384 px on the long edge, white behind transparency, JPEG at these qualities in turn. */
export const LOGO_MAX_EDGE = 384;
export const LOGO_QUALITIES = [0.85, 0.65, 0.45, 0.25] as const;
/** The first quality whose JPEG is at most this many bytes wins (ShoppingListLogoEditor.swift:106-110). */
export const LOGO_MAX_BYTES = 67_500;
/** The server's own cap on the base64 string. */
export const LOGO_MAX_BASE64 = 90_000;

export const LOGO_TOO_LARGE = 'This image is too large. Please choose a simpler logo.';
export const LOGO_UNREADABLE = 'This image could not be loaded. Please try another image.';
export const LOGO_UNOPENABLE = 'This image could not be opened.';

const SERVER_LOGO = /^(?:|\/9j\/[A-Za-z0-9+/]*={0,2})$/;

/** Whether the server will take this value as `storeLogoData`. */
export function logoAcceptable(base64: string): boolean {
  return base64.length <= LOGO_MAX_BASE64 && SERVER_LOGO.test(base64);
}

/** The scale the encoder draws at: never up, down to 384 px on the long edge. */
export function logoScale(width: number, height: number): number {
  return Math.min(1, LOGO_MAX_EDGE / Math.max(width, height));
}

/** The value a save sends (`ShoppingInput.init`, ShoppingStore.swift:10). */
export function logoForSave(list: Pick<GroceryList, 'storeLogoData'>): string {
  return list.storeLogoData ?? '';
}

/**
 * A new store — typed or picked — is not the store the logo was for, so it goes with the website and
 * place (ShoppingViews.swift:660, `:671`).
 */
export function withStoreName<T extends Pick<GroceryList, 'storeName' | 'storeWebsite' | 'storePlaceId' | 'storeLogoData'>>(list: T, storeName: string): T {
  return { ...list, storeName, storeWebsite: null, storePlaceId: null, storeLogoData: null };
}

/**
 * `apply(_:)` (ShoppingListLogoEditor.swift:95-112): at most 384 px on the long edge (never enlarged),
 * drawn onto opaque white, then JPEG at 0.85, 0.65, 0.45 and 0.25 until it is at most 67,500 bytes.
 * The same pipeline as an item image (`image.ts`), with the logo's numbers: `flatten` is what keeps a
 * transparent PNG logo on white rather than black on Android. Resolves to bare base64.
 */
export async function encodeLogoImage(uri: string, encoder: ImageEncoder): Promise<string> {
  const source = await encoder.size(uri);
  if (!(source.width > 0) || !(source.height > 0)) throw new Error(LOGO_UNOPENABLE);
  const scale = logoScale(source.width, source.height);
  const size = { width: Math.max(1, Math.round(source.width * scale)), height: Math.max(1, Math.round(source.height * scale)) };
  const opaque = await encoder.flatten(uri, size);
  for (const quality of LOGO_QUALITIES) {
    const data = await encoder.jpeg(opaque, size, quality);
    if (base64Bytes(data) <= LOGO_MAX_BYTES) return data;
  }
  throw new Error(LOGO_TOO_LARGE);
}

/** Decoded size of base64, without decoding it. */
function base64Bytes(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

/** "Paste copied image" with nothing to paste (`:51-54`). */
export const LOGO_NO_CLIPBOARD_IMAGE = 'Copy an image first, or save it to Photos and choose it above.';

/** "Search Google Images" (`searchURL`, :17-21), or `null` without a store name (the button is disabled). */
export function logoSearchUrl(storeName: string): string | null {
  const name = storeName.trim();
  if (name === '') return null;
  return `https://www.google.com/search?${new URLSearchParams({ tbm: 'isch', q: `${name} logo` }).toString()}`;
}
