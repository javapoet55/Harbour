import { createStore, useStore } from 'zustand';

import { messages } from '../../api/client';
import {
  shoppingApi,
  type GroceryItem,
  type GroceryList,
  type ShoppingAlternativeInput,
  type ShoppingAlternativesResponse,
  type ShoppingEnvelope,
  type ShoppingOperation,
  type ShoppingResult,
  type ShoppingSnapshot,
  type TranscriptionSession,
} from '../../api/shopping';

/**
 * `ShoppingStore` (ios/App/ShoppingStore.swift:9-38).
 *
 * `action` sends the list's `revision` with every write. A write against a stale revision is refused
 * by the server with 409 "This list changed on another device. Refresh before saving.", and — as in
 * Swift — that message is simply shown: the screen keeps the local edits and offers "Retry Save" and
 * "Discard local edits and reload".
 */

export type ShoppingDeps = {
  lists: () => Promise<ShoppingSnapshot>;
  post: (envelope: ShoppingEnvelope) => Promise<ShoppingResult>;
  alternatives: (input: ShoppingAlternativeInput) => Promise<ShoppingAlternativesResponse>;
  transcriptionSession: () => Promise<TranscriptionSession>;
};

export type ShoppingState = {
  lists: GroceryList[];
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Returns the list the server answered with, or `null` on failure, on delete, or while busy. */
  action: (operation: Exclude<ShoppingOperation, 'parse' | 'alternatives'>, list: GroceryList | null, input: unknown, idempotencyKey?: string) => Promise<GroceryList | null>;
  parse: (text: string) => Promise<GroceryItem[]>;
  /**
   * `alternatives(for:refresh:)` (ShoppingStore.swift:39-53). Never touches `busy` or `error`. An answer
   * is reused for five minutes per item (name, category, quantity, size, brand, barcode) unless
   * `refresh`; the cache empties when it reaches 30. Every failure is thrown — there is no local
   * fallback any more, so the screen shows the error.
   */
  alternatives: (item: Pick<GroceryItem, 'name' | 'category' | 'quantity' | 'size' | 'brand' | 'barcode'>, refresh?: boolean) => Promise<ShoppingAlternativesResponse>;
  credential: () => Promise<TranscriptionSession>;
  setError: (error: string | null) => void;
  reset: () => void;
};

function describe(error: unknown): string {
  return error instanceof Error && error.message ? error.message : messages.invalidResponse;
}

/** `alternativeCache` (ShoppingStore.swift:16, :40-47): five minutes, at most 30 entries. */
export const ALTERNATIVES_CACHE_MS = 300_000;
const ALTERNATIVES_CACHE_LIMIT = 30;

export function createShoppingStore(deps: ShoppingDeps, now: () => number = Date.now) {
  const alternativeCache = new Map<string, { at: number; response: ShoppingAlternativesResponse }>();
  return createStore<ShoppingState>()((set, get) => ({
    lists: [],
    busy: false,
    error: null,

    async refresh() {
      try {
        const snapshot = await deps.lists();
        set({ lists: snapshot.lists, error: null });
      } catch (error) {
        set({ error: describe(error) });
      }
    },

    async action(operation, list, input, idempotencyKey) {
      if (get().busy) return null;
      set({ busy: true, error: null });
      try {
        const envelope: ShoppingEnvelope = { operation, input, ...(list ? { id: list.id, revision: list.revision } : {}), ...(idempotencyKey ? { idempotencyKey } : {}) };
        const result = await deps.post(envelope);
        const value = result.list ?? null;
        if (value) set((state) => ({ lists: [value, ...state.lists.filter((item) => item.id !== value.id)] }));
        if (operation === 'delete' && list) set((state) => ({ lists: state.lists.filter((item) => item.id !== list.id) }));
        await get().refresh();
        return value;
      } catch (error) {
        set({ error: describe(error) });
        return null;
      } finally {
        set({ busy: false });
      }
    },

    async parse(text) {
      const result = await deps.post({ operation: 'parse', input: { text } });
      return result.items ?? [];
    },

    async alternatives(item, refresh = false) {
      const key = [item.name, item.category, item.quantity, item.size, item.brand ?? '', item.barcode ?? ''].join('|');
      const cached = alternativeCache.get(key);
      if (!refresh && cached && now() - cached.at < ALTERNATIVES_CACHE_MS) return cached.response;
      // `ShoppingAlternativeInput` (ShoppingStore.swift:11) also carries the brand and barcode when known.
      const response = await deps.alternatives({
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        size: item.size,
        ...(item.brand ? { brand: item.brand } : {}),
        ...(item.barcode ? { barcode: item.barcode } : {}),
      });
      if (alternativeCache.size >= ALTERNATIVES_CACHE_LIMIT) alternativeCache.clear();
      alternativeCache.set(key, { at: now(), response });
      return response;
    },

    credential: () => deps.transcriptionSession(),

    setError: (error) => set({ error }),

    reset: () => {
      alternativeCache.clear();
      set({ lists: [], busy: false, error: null });
    },
  }));
}

export const shoppingStore = createShoppingStore({
  lists: () => shoppingApi.lists(),
  post: (envelope) => shoppingApi.post(envelope),
  alternatives: (input) => shoppingApi.alternatives(input),
  transcriptionSession: () => shoppingApi.transcriptionSession(),
});

export function useShopping<T>(selector: (state: ShoppingState) => T): T {
  return useStore(shoppingStore, selector);
}
