import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { shoppingEndpoints } from '../api/shopping';

/**
 * The read Today needs from Shopping (Phase 11 Run A). Run C builds the full store; this hook owns the
 * cache key so its screens and Today can share one copy. Moments come from Run B's `momentsStore`.
 *
 * The key lives here rather than in `keys.ts` so the Phase 11 runs do not all edit one file.
 */
export const shoppingQueryKey = ['shopping'] as const;

/**
 * `ShoppingStore.refresh()` (ios/App/ShoppingStore.swift:15-18), which Quick Access runs in `.task` and
 * again on every `scenePhase == .active` (TodayQuickAccess.swift:60-61). Swift keeps the previous lists
 * on failure and sets `error`, which turns the tile's status into "View lists".
 */
export function useShoppingLists(enabled = true) {
  const query = useQuery({ queryKey: shoppingQueryKey, queryFn: () => shoppingEndpoints.list(), enabled });
  useRefetchOnActive(query.refetch, enabled);
  return query;
}

/**
 * Swift refreshes on EVERY activation. React Query's focus refetch only fires for data older than the
 * client's 30s `staleTime`, so the activation is observed directly.
 */
function useRefetchOnActive(refetch: () => unknown, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch();
    });
    return () => subscription.remove();
  }, [refetch, enabled]);
}
