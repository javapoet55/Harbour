import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { momentsEndpoints } from '../api/moments';
import { shoppingEndpoints } from '../api/shopping';

/**
 * The two reads Today needs from Important Moments and Shopping (Phase 11 Run A). Runs B and C build
 * the full stores; these hooks own the cache keys so their screens and Today share one copy.
 *
 * The keys live here rather than in `keys.ts` so the three Phase 11 runs do not all edit one file.
 */
export const momentsQueryKey = ['moments'] as const;
export const shoppingQueryKey = ['shopping'] as const;

/**
 * `ImportantMomentsStore.refresh()` (ios/App/ImportantMomentsStore.swift:73-83). Swift activates the
 * store on the signed-in profile (RootView.swift:59) and refreshes it on every `scenePhase == .active`
 * (`:68`, `:81`). A failure keeps the previous snapshot, as React Query does.
 */
export function useMoments(enabled = true) {
  const query = useQuery({ queryKey: momentsQueryKey, queryFn: () => momentsEndpoints.list(), enabled });
  useRefetchOnActive(query.refetch, enabled);
  return query;
}

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
