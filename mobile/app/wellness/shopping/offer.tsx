import { useLocalSearchParams } from 'expo-router';

import { OfferDetailScreen } from '../../../src/features/shopping/OffersScreens';

/** `ShoppingOfferDetail` (ios/App/ShoppingOffersView.swift:96), pushed from an offer on the offers screen. */
export default function ShoppingOffer() {
  const { id, itemId, offerId } = useLocalSearchParams<{ id: string; itemId: string; offerId: string }>();
  return <OfferDetailScreen itemId={itemId} listId={id} offerId={offerId} />;
}
