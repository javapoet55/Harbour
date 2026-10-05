import { useLocalSearchParams } from 'expo-router';

import { OffersScreen } from '../../../src/features/shopping/OffersScreens';

/**
 * `ShoppingOffersView(store:list:itemId:onUpdate:)` (ios/App/ShoppingOffersView.swift:27), pushed from
 * Shopping Detail's View Offers (the list) or an item's offer badge (`itemId`).
 */
export default function ShoppingOffers() {
  const { id, itemId } = useLocalSearchParams<{ id: string; itemId?: string }>();
  return <OffersScreen itemId={itemId ?? null} listId={id} />;
}
