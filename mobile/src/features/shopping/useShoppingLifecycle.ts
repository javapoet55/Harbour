import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { shoppingQueryKey } from '../../query/useQuickAccess';
import { shoppingStore } from './store';

/**
 * Swift keys its `ShoppingStore` to the profile (`ShoppingTodayCard … .id(model.profile?.id)`,
 * ShoppingViews.swift:5), so another account never sees the previous one's lists. The same here.
 *
 * Swift also hands ONE `ShoppingStore` from the Today Quick Access tile to `ShoppingHome`
 * (TodayQuickAccess.swift:16-20, :70-74), so a change made in the lists shows on the tile at once. Run A
 * reads the tile through React Query (`shoppingQueryKey`); every list the Run C store receives is
 * written into that cache, so the two stay one copy.
 */
export function useShoppingLifecycle(profileId: string | null | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    shoppingStore.getState().reset();
  }, [profileId]);

  useEffect(
    () =>
      shoppingStore.subscribe((state, previous) => {
        if (state.lists !== previous.lists) queryClient.setQueryData(shoppingQueryKey, { lists: state.lists });
      }),
    [queryClient],
  );
}
