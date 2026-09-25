import { useEffect } from 'react';
import { AppState } from 'react-native';

import { shoppingStore, useShopping } from '../features/shopping/store';

/**
 * The Today Quick Access Shopping tile's data (Phase 11).
 *
 * Swift hands ONE `ShoppingStore` from the tile to `ShoppingHome` (TodayQuickAccess.swift:16-20,
 * :70-74), so the tile reads Run C's `shoppingStore` — the same store My Lists uses — rather than a
 * copy. The store is refreshed in `.task` and on every `scenePhase == .active` (`:60-61`).
 *
 * UI-parity pass 2: the tile used to read a React Query copy that Run C's store wrote into; the
 * store's `reset()` on sign-in wrote an EMPTY list over the fetched one, so the tile read "Your lists"
 * with open lists on the account.
 */
export function useQuickAccessShopping(enabled: boolean): { lists: ReturnType<typeof shoppingStore.getState>['lists']; failed: boolean } {
  const lists = useShopping((state) => state.lists);
  const error = useShopping((state) => state.error);

  useEffect(() => {
    if (!enabled) return;
    void shoppingStore.getState().refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void shoppingStore.getState().refresh();
    });
    return () => subscription.remove();
  }, [enabled]);

  // `guard shopping.error == nil else { return "View lists" }` (`:33`).
  return { lists, failed: error !== null };
}

/**
 * Kept for `useShoppingLifecycle` (src/features/shopping), which still mirrors the store into this
 * cache key. Nothing on Today reads it any more.
 */
export const shoppingQueryKey = ['shopping'] as const;
