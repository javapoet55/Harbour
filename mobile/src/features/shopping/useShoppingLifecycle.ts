import { useEffect } from 'react';

import { shoppingStore } from './store';

/**
 * Swift keys its `ShoppingStore` to the profile (`ShoppingTodayCard … .id(model.profile?.id)`,
 * ShoppingViews.swift:5), so another account never sees the previous one's lists. The same here.
 */
export function useShoppingLifecycle(profileId: string | null | undefined): void {
  useEffect(() => {
    shoppingStore.getState().reset();
  }, [profileId]);
}
