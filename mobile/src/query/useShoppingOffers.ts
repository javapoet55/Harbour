import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { shoppingOffersApi, type GroceryList } from '../api/shopping';
import { shoppingStore } from '../features/shopping/store';
import { useSession } from '../store/session';
import { queryKeys } from './keys';

/**
 * Store offers and store hours.
 *
 * The list detail screen asks for both every 60 seconds while the app is active and ignores failures
 * (`try?`, ShoppingViews.swift:360-377); the offers and hours screens load once, show errors and
 * offer a retry. `poll` picks between the two. React Query only refetches on an interval while the
 * app is in the foreground, which is Swift's `scenePhase == .active` guard.
 */

const MINUTE = 60_000;

function useOwner(): string {
  return useSession((state) => state.profile?.id) ?? '';
}

export function useShoppingOffers(listId: string | null | undefined, { poll = false }: { poll?: boolean } = {}) {
  const owner = useOwner();
  return useQuery({
    queryKey: queryKeys.shopping.offers(owner, listId ?? ''),
    queryFn: () => shoppingOffersApi.offers(listId!),
    enabled: owner !== '' && !!listId,
    refetchInterval: poll ? MINUTE : false,
    // Neither retries: the poll ignores a failure until the next minute, and the offers screen shows it
    // at once with Retry (ShoppingOffersView.swift:51, :89).
    retry: false,
  });
}

/**
 * `saveOfferChoice` (ShoppingOffersView.swift:130-145): choose an offer for an item, or clear it with
 * `offerId: null`. On success the shopping lists are refreshed (`await store.refresh()`) and the offers
 * reloaded; a missing `list` in the answer is Swift's `badServerResponse`.
 */
export function useChooseOffer() {
  const owner = useOwner();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ list, itemId, offerId }: { list: Pick<GroceryList, 'id' | 'revision'>; itemId: string; offerId: string | null }) => {
      const result = await shoppingOffersApi.choose({ listId: list.id, itemId, offerId, revision: list.revision });
      if (!result.list) throw new Error('The server returned an unexpected response. Please try again later.');
      await shoppingStore.getState().refresh();
      return result.list;
    },
    onSuccess: (list) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.shopping.offers(owner, list.id) });
    },
  });
}

/** The hours screen's text for any failure (ShoppingStoreHoursView.swift:45); the server's message is not shown. */
export const STORE_HOURS_ERROR = 'Unable to load store hours. Try again or open Google Maps.';

export function useStoreHours(placeId: string | null | undefined, { poll = false }: { poll?: boolean } = {}) {
  const owner = useOwner();
  return useQuery({
    queryKey: queryKeys.shopping.storeHours(owner, placeId ?? ''),
    queryFn: () => shoppingOffersApi.storeHours(placeId!),
    enabled: owner !== '' && !!placeId,
    refetchInterval: poll ? MINUTE : false,
    retry: false,
  });
}
