import { getApi, type ApiClient } from './index';
import type { ShoppingProductFacts } from '../features/shopping/productFacts';

/**
 * Shopping Lists wire types and endpoints.
 *
 * Shapes are the server's (src/server/shopping/{domain,service}.ts, src/app/api/shopping/route.ts,
 * src/app/api/shopping/image/route.ts, src/app/api/realtime/transcription-session/route.ts), read
 * against the Swift decoders in ios/Sources/NexdoCore/ShoppingList.swift:3-47 and
 * ios/App/ShoppingStore.swift:1-39.
 */

/** `GroceryItem` (ShoppingList.swift:3-32). The server also returns `listId`, `sortOrder` etc., unused. */
export type GroceryItem = {
  id: string;
  name: string;
  category: string;
  quantity: string;
  size: string;
  notes: string;
  /** Base64 JPEG (it must start `/9j/`), or `null`. Swift always encodes the key, so `null` removes an image. */
  imageData?: string | null;
  checked: boolean;
  /**
   * Phase 12 (ShoppingList.swift:12-38). Swift sends `brand`, `barcode`, `favorite` and
   * `favoriteAlternatives` only when set, and never sends `chosenOffer`: the server keeps the offer on
   * a save only while the item's name, size, notes and brand are unchanged.
   */
  brand?: string | null;
  barcode?: string | null;
  favorite?: boolean | null;
  favoriteAlternatives?: string[] | null;
  chosenOffer?: ChosenShoppingOffer | null;
};

/** `ChosenShoppingOffer` (ShoppingList.swift:3-11): the offer saved on an item through `POST /api/shopping/offers`. */
export type ChosenShoppingOffer = { id: string; product: string; brand?: string | null; packageSize?: string | null; store: string; sourceURL: string; expiresAt: string };

/** `GroceryList` (ShoppingList.swift:33-47). */
export type GroceryList = {
  id: string;
  title: string;
  /** `yyyy-MM-dd`, in the list's own `timeZone`. */
  date: string;
  timeZone: string;
  weekly: boolean;
  /** ISO 8601 instant, or null while the trip is open. */
  completedAt?: string | null;
  revision: number;
  shareToken?: string | null;
  /** The list's store (ShoppingList.swift:117-121). `storeAddress` is the full address; see `storeAddress.ts`. */
  storePlaceId?: string | null;
  storeWebsite?: string | null;
  storeName?: string | null;
  storeAddress?: string | null;
  storeZip?: string | null;
  items: GroceryItem[];
};

/** `ShoppingSnapshot`: newest first, at most 200 (service.ts `shoppingLists`). */
export type ShoppingSnapshot = { lists: GroceryList[] };

/** `ShoppingResult` (ShoppingStore.swift:4): `list` for create/save/complete/share/revoke, `items` for parse, neither for delete. */
export type ShoppingResult = { list?: GroceryList | null; items?: GroceryItem[] | null; ok?: boolean };

/** `ShoppingInput` (ShoppingStore.swift:5-8). */
export type ShoppingInput = {
  title: string;
  date: string;
  timeZone: string;
  weekly: boolean;
  items: GroceryItem[];
  storePlaceId?: string;
  storeWebsite?: string;
  storeName?: string;
  storeAddress?: string;
  storeZip?: string;
};

export type ShoppingOperation = 'parse' | 'create' | 'save' | 'delete' | 'complete' | 'share' | 'revoke' | 'alternatives';

/** `ShoppingAlternativeInput` (ShoppingStore.swift:9): the item, every field sent even when empty. */
export type ShoppingAlternativeInput = { name: string; category: string; quantity: string; size: string; brand?: string; barcode?: string };

/**
 * `ShoppingAlternative` (ShoppingList.swift:33-47; server `ShoppingAlternative`,
 * src/server/shopping/alternatives.ts:5). `category` is always one of `CATEGORIES`.
 */
export type ShoppingAlternative = {
  name: string;
  category: string;
  quantity: string;
  size: string;
  reason: string;
  detail: string;
  /** Phase 12: facts from a structured product source, never from the model (ShoppingList.swift:66-67). */
  facts?: ShoppingProductFacts | null;
  whyThisSwap?: string | null;
};

/**
 * `ShoppingAlternativesResponse` (ShoppingList.swift:48-52; src/server/shopping/alternatives.ts:6): three
 * to five alternatives, a tip, and whether the model wrote them (`false` for the curated fallback).
 */
export type ShoppingAlternativesResponse = { alternatives: ShoppingAlternative[]; tip: string; usedAI: boolean; originalFacts?: ShoppingProductFacts | null };

/**
 * `ShoppingEnvelope` (ShoppingStore.swift:39). `id` and `revision` are omitted when there is no list.
 *
 * `idempotencyKey` is a UUID the server validates and uses to collapse a replayed write, so a
 * retried create cannot produce a second list.
 */
export type ShoppingEnvelope = { operation: ShoppingOperation; id?: string; revision?: number; input: unknown; idempotencyKey?: string };

/** The transcription-session answer: a 60-second client secret (`VoiceTaskSession`). */
export type TranscriptionSession = { value: string; expiresAt: number; model: string };

export const shoppingApi = {
  lists: (client: ApiClient = getApi()) => client.get<ShoppingSnapshot>('/api/shopping'),

  post: (envelope: ShoppingEnvelope, client: ApiClient = getApi()) => client.post<ShoppingResult>('/api/shopping', envelope),

  /**
   * `ShoppingStore.alternatives(for:)` (ShoppingStore.swift:36-42): the `alternatives` operation
   * (src/server/shopping/service.ts:12-15). Like `parse` it names no list, so there is no `id`,
   * `revision` or idempotency key. Swift's default timeout.
   */
  alternatives: (input: ShoppingAlternativeInput, client: ApiClient = getApi()) =>
    client.post<ShoppingAlternativesResponse>('/api/shopping', { operation: 'alternatives', input }),

  /** `POST /api/shopping/image` (ShoppingItemEditor.swift:91), 150s like Swift. Six per hour; 503 without a key. */
  image: (input: { name: string; details: string; consent: boolean }, client: ApiClient = getApi()) =>
    client.post<{ data: string }>('/api/shopping/image', input, { timeoutMs: 150_000 }),

  /** `credential()` (ShoppingStore.swift:35-37): transcription only, no tools, 25s. */
  transcriptionSession: (client: ApiClient = getApi()) =>
    client.post<TranscriptionSession>('/api/realtime/transcription-session', { consent: true, scope: 'shopping' }, { timeoutMs: 25_000 }),
};

/**
 * Run A's read for the Today Quick Access tile (`useShoppingLists`, src/query/useQuickAccess.ts), kept
 * under its original name. It is the same `GET /api/shopping` as `shoppingApi.lists`.
 */
export const shoppingEndpoints = {
  /** `ShoppingStore.refresh()` (ShoppingStore.swift:15-18). Swift uses the client's default timeout. */
  list: (client: ApiClient = getApi()) => shoppingApi.lists(client),
};

/** `store.api.baseURL.appendingPathComponent("shared/shopping/" + token)` (ShoppingViews.swift:331). */
export function shareUrl(token: string, client: ApiClient = getApi()): string {
  return `${client.baseUrl}/shared/shopping/${token}`;
}

/**
 * The `save` input (src/server/shopping/email-domain.ts:3-13). `weekday` 0 = Sunday. Phase 12 adds the
 * optional pickup (`pickupDate` yyyy-MM-dd with `pickupStartHour` 9…19, both or neither) that Swift
 * always sends (ShoppingEmailView.swift:333-340); the existing screen does not set them yet (§22 gaps).
 */
export type ShoppingEmailSettings = {
  customerPhone: string;
  recipient: string;
  recipientName: string;
  timeZone: string;
  weekday: number;
  hour: number;
  minute: number;
  consent: true;
  pickupDate?: string;
  pickupStartHour?: number;
};
export type ShoppingEmailSnapshot = {
  available: boolean;
  account: { email: string; status: string } | null;
  schedule:
    | (Omit<ShoppingEmailSettings, 'consent' | 'customerPhone' | 'pickupDate' | 'pickupStartHour'> & {
        customerPhone: string | null;
        pickupDate?: string | null;
        pickupStartHour?: number | null;
        enabled: boolean;
        nextRunAt: string;
        runs: { id: string; dueAt: string; status: string; detail: string | null }[];
      })
    | null;
};
export const shoppingEmailApi = {
  get: (listId: string) => getApi().get<ShoppingEmailSnapshot>(`/api/shopping/email-schedule?listId=${encodeURIComponent(listId)}`),
  save: (listId: string, input: ShoppingEmailSettings) => getApi().post<ShoppingEmailSnapshot>('/api/shopping/email-schedule', { listId, operation: 'save', input }),
  pause: (listId: string) => getApi().post<ShoppingEmailSnapshot>('/api/shopping/email-schedule', { listId, operation: 'pause' }),
  connect: (listId: string) => getApi().post<{ url: string }>('/api/shopping/email-schedule', { listId, operation: 'connect' }),
  /** Gmail is saved only once the signed-in app confirms the callback's ticket (Moments' `connectEmailConfirm`). */
  confirmGmail: (ticket: string) => getApi().post<{ ok: true }>('/api/moments', { operation: 'connectEmailConfirm', input: { ticket } }),
};

// ---------------------------------------------------------------------------------------------
// Phase 12: offers and store hours

/** `StoreOffer` (ShoppingOffersView.swift:3-6). Prices are display strings; Swift ignores `sourceId`. */
export type StoreOffer = {
  id: string;
  sourceId?: string | null;
  product: string;
  brand?: string | null;
  packageSize?: string | null;
  price?: string | null;
  savings?: string | null;
  unitPrice?: string | null;
  conditions: string;
  imageURL?: string | null;
  sourceURL: string;
  startsAt: string;
  expiresAt: string;
  checkedAt: string;
  store: string;
};

export type ShoppingOfferCategory = 'matching' | 'available' | 'alternative';

/** `ShoppingOfferMatch` (ShoppingOffersView.swift:7-13). Swift's id is `itemId + offer.id`. */
export type ShoppingOfferMatch = {
  itemId: string;
  itemName: string;
  category: ShoppingOfferCategory | string;
  reasons: string[];
  differences: string[];
  offer: StoreOffer;
  selected: boolean;
};

/**
 * `ShoppingOffersSnapshot` (ShoppingOffersView.swift:14-26; src/server/shopping/offers/service.ts:15-27).
 * An unsupported store or ZIP has no matches and says why in `status`.
 */
export type ShoppingOffersSnapshot = { matches: ShoppingOfferMatch[]; status: string; lastCheckedAt?: string | null; sourceURL?: string | null };

/** `ShoppingStoreHours` (ShoppingStoreHoursView.swift:3-7). `current` false means regular hours. */
export type ShoppingStoreHours = { days: string[]; openNow?: boolean | null; current: boolean; checkedAt?: string };

export const shoppingOffersApi = {
  /** `GET /api/shopping/offers?listId=`. */
  offers: (listId: string, client: ApiClient = getApi()) => client.get<ShoppingOffersSnapshot>(`/api/shopping/offers?listId=${encodeURIComponent(listId)}`),

  /**
   * `saveOfferChoice` (ShoppingOffersView.swift:130-145): `offerId: null` clears the choice and is sent
   * explicitly. Carries the list's revision; 409 when the list, the trip or the offer changed.
   */
  choose: (input: { listId: string; itemId: string; offerId: string | null; revision: number }, client: ApiClient = getApi()) =>
    client.post<ShoppingResult>('/api/shopping/offers', input),

  /** `GET /api/shopping/stores/hours?placeId=` (ShoppingStoreHoursView.swift:38-45). 20 a minute; 503 without a Places key. */
  storeHours: (placeId: string, client: ApiClient = getApi()) =>
    client.get<ShoppingStoreHours>(`/api/shopping/stores/hours?placeId=${encodeURIComponent(placeId)}`),
};

// ---------------------------------------------------------------------------------------------
// Phase 12 Run F: stores, store brand, photo identification, recommendations

/** `ShoppingStoreSuggestion` (ShoppingViews.swift:633-641; src/server/shopping/stores.ts:52). */
export type ShoppingStoreSuggestion = { id: string; name: string; address: string; zip: string; website?: string | null; attributions: string[]; distanceKm?: number | null };

/** `StoreBrandMetadata` (StoreBrandLogo.swift:4-7). */
export type StoreBrandMetadata = { displayName: string; logoUrl?: string | null };

/** The photo identification answer (src/app/api/shopping/recognize/route.ts:11-14). 422 when unsure. */
export type ShoppingRecognition = { name: string; brand: string; category: string; confidence: 'high' | 'medium' | 'low' };

/** `ShoppingRecommendationRequest` (AskNexdoView.swift `askShopping`; recommendations/route.ts:8). */
export type ShoppingRecommendationInput = { prompt: string; listName: string; itemNames: string[] };

export const shoppingStoresApi = {
  /** `findStores()` (ShoppingViews.swift:770-788): `name` always, then `area`, or the coordinates. 30 a minute. */
  search: (input: { name: string; area?: string; latitude?: number; longitude?: number }, client: ApiClient = getApi()) =>
    client.post<{ stores: ShoppingStoreSuggestion[] }>('/api/shopping/stores', input),

  /** `StoreBrandLogo.load()` (StoreBrandLogo.swift:68-72), 20 s. */
  brand: (listId: string, client: ApiClient = getApi()) =>
    client.get<{ brand: StoreBrandMetadata }>(`/api/shopping/store-brand?listId=${encodeURIComponent(listId)}`, { timeoutMs: 20_000 }),

  /** `POST /api/shopping/recognize` (ShoppingItemEditor.swift:170): a base64 JPEG, consent `true`, 40 s. */
  recognize: (imageData: string, client: ApiClient = getApi()) =>
    client.post<ShoppingRecognition>('/api/shopping/recognize', { imageData, consent: true }, { timeoutMs: 40_000 }),

  /** `POST /api/shopping/recommendations`: answers in the assistant's turn shape, 40 s (NexdoApp.swift:810). */
  recommendations: (input: ShoppingRecommendationInput, client: ApiClient = getApi()) =>
    client.post<import('./types').AssistantTurn>('/api/shopping/recommendations', input, { timeoutMs: 40_000 }),
};
