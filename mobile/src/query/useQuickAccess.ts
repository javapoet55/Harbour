/**
 * Kept for `useShoppingLifecycle` (src/features/shopping), which still mirrors the store into this
 * cache key. Nothing on Today reads it any more: the Quick Access Shopping tile and its
 * `useQuickAccessShopping` went in Phase 12 (TodayQuickAccess.swift:3-18).
 */
export const shoppingQueryKey = ['shopping'] as const;
