import { createStore, useStore } from 'zustand';

import { isApiError, messages } from '../../api/client';
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
import { localAlternatives } from './model';

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
   * `alternatives(for:)` (ShoppingStore.swift:36-42). Never touches `busy` or `error`. A lost session
   * is rethrown; ANY other failure answers with the phone's own `localAlternatives(item)`.
   */
  alternatives: (item: Pick<GroceryItem, 'name' | 'category' | 'quantity' | 'size'>) => Promise<ShoppingAlternativesResponse>;
  credential: () => Promise<TranscriptionSession>;
  setError: (error: string | null) => void;
  reset: () => void;
};

function describe(error: unknown): string {
  return error instanceof Error && error.message ? error.message : messages.invalidResponse;
}

export function createShoppingStore(deps: ShoppingDeps) {
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

    async alternatives(item) {
      try {
        return await deps.alternatives({ name: item.name, category: item.category, quantity: item.quantity, size: item.size });
      } catch (error) {
        if (isApiError(error) && error.code === 'SIGNED_OUT') throw error;
        return localAlternatives(item);
      }
    },

    credential: () => deps.transcriptionSession(),

    setError: (error) => set({ error }),

    reset: () => set({ lists: [], busy: false, error: null }),
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
