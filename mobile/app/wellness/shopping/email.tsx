import { useLocalSearchParams } from 'expo-router';

import { EmailScreen } from '../../../src/features/shopping/EmailScreen';
import { useShopping } from '../../../src/features/shopping/store';

/**
 * `ShoppingEmailView(store:list:)` (ios/App/ShoppingEmailView.swift:32), pushed from Shopping Detail's
 * Schedule Email or Share List's "Weekly email to store manager".
 */
export default function ShoppingEmail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = useShopping((state) => state.lists.find((value) => value.id === id));
  return list ? <EmailScreen list={list} /> : null;
}
