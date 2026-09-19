import { getApi, type ApiClient } from './index';

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
};

/** `GroceryList` (ShoppingList.swift:33-47). */
export type GroceryList = {
  id: string;
  title: string;
  date: string;
  timeZone: string;
  weekly: boolean;
  completedAt?: string | null;
  revision: number;
  shareToken?: string | null;
  items: GroceryItem[];
};

/** `ShoppingSnapshot`: newest first, at most 200 (service.ts `shoppingLists`). */
export type ShoppingSnapshot = { lists: GroceryList[] };

/** `ShoppingResult` (ShoppingStore.swift:4): `list` for create/save/complete/share/revoke, `items` for parse, neither for delete. */
export type ShoppingResult = { list?: GroceryList | null; items?: GroceryItem[] | null; ok?: boolean };

/** `ShoppingInput` (ShoppingStore.swift:5-8). */
export type ShoppingInput = { title: string; date: string; timeZone: string; weekly: boolean; items: GroceryItem[] };

export type ShoppingOperation = 'parse' | 'create' | 'save' | 'delete' | 'complete' | 'share' | 'revoke';

/** `ShoppingEnvelope` (ShoppingStore.swift:39). `id` and `revision` are omitted when there is no list. */
export type ShoppingEnvelope = { operation: ShoppingOperation; id?: string; revision?: number; input: unknown };

/** The transcription-session answer: a 60-second client secret (`VoiceTaskSession`). */
export type TranscriptionSession = { value: string; expiresAt: number; model: string };

export const shoppingApi = {
  lists: (client: ApiClient = getApi()) => client.get<ShoppingSnapshot>('/api/shopping'),

  post: (envelope: ShoppingEnvelope, client: ApiClient = getApi()) => client.post<ShoppingResult>('/api/shopping', envelope),

  /** `POST /api/shopping/image` (ShoppingItemEditor.swift:91), 150s like Swift. Six per hour; 503 without a key. */
  image: (input: { name: string; details: string; consent: boolean }, client: ApiClient = getApi()) =>
    client.post<{ data: string }>('/api/shopping/image', input, { timeoutMs: 150_000 }),

  /** `credential()` (ShoppingStore.swift:35-37): transcription only, no tools, 25s. */
  transcriptionSession: (client: ApiClient = getApi()) =>
    client.post<TranscriptionSession>('/api/realtime/transcription-session', { consent: true, scope: 'shopping' }, { timeoutMs: 25_000 }),
};

/** `store.api.baseURL.appendingPathComponent("shared/shopping/" + token)` (ShoppingViews.swift:331). */
export function shareUrl(token: string, client: ApiClient = getApi()): string {
  return `${client.baseUrl}/shared/shopping/${token}`;
}
