import { getApi, type ApiClient } from './index';

/**
 * Shopping list wire types — the MINIMUM the Today screen reads (Phase 11 Run A).
 *
 * Ported from `GroceryItem` and `GroceryList` (ios/Sources/NexdoCore/ShoppingList.swift:3-47) and
 * `ShoppingSnapshot` (ios/App/ShoppingStore.swift:3). Verified against the server: `GET /api/shopping`
 * returns `{ lists }` from `shoppingLists` (src/server/shopping/service.ts:7) — up to 200 lists, newest
 * `date` first, each with its `items` in `sortOrder`.
 *
 * Runs B and C extend this file with the POST operations; keep additions here additive.
 */

export type GroceryItem = {
  id: string;
  name: string;
  category: string;
  quantity: string;
  size: string;
  notes: string;
  imageData?: string | null;
  checked: boolean;
};

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
  items: GroceryItem[];
};

export type ShoppingSnapshot = { lists: GroceryList[] };

export const shoppingEndpoints = {
  /** `ShoppingStore.refresh()` (ShoppingStore.swift:15-18). Swift uses the client's default timeout. */
  list: (client: ApiClient = getApi()) => client.get<ShoppingSnapshot>('/api/shopping'),
};
