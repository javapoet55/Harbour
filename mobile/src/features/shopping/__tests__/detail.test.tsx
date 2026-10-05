import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { View } from 'react-native';

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  Stack: {
    Screen: ({ options }: { options?: { headerTitle?: () => React.ReactNode; headerRight?: () => React.ReactNode } }) => {
      const RN = jest.requireActual('react-native');
      const R = jest.requireActual('react');
      return R.createElement(RN.View, null, options?.headerTitle?.() ?? null, options?.headerRight?.() ?? null);
    },
  },
}));

const mockOffers = jest.fn();
const mockHours = jest.fn();
jest.mock('../../../api/shopping', () => ({
  ...jest.requireActual('../../../api/shopping'),
  shoppingApi: { lists: jest.fn(async () => ({ lists: [] })), post: jest.fn(), alternatives: jest.fn(), image: jest.fn(), transcriptionSession: jest.fn() },
  shoppingOffersApi: { offers: (...args: unknown[]) => mockOffers(...args), choose: jest.fn(), storeHours: (...args: unknown[]) => mockHours(...args) },
  shoppingStoresApi: { search: jest.fn(), brand: jest.fn(async () => ({ brand: { displayName: 'Safeway', logoUrl: null } })), recognize: jest.fn(), recommendations: jest.fn() },
}));

import type { GroceryItem, GroceryList, ShoppingOfferMatch } from '../../../api/shopping';
import { useSession } from '../../../store/session';
import Detail from '../../../../app/wellness/shopping/[id]';
import { groceryAsset, supportsFoodAlternatives } from '../model';
import { showsOffersShortcut } from '../offers';
import { shoppingStore } from '../store';

/** `ShoppingDetail` since `8c36d98` (ios/App/ShoppingViews.swift:206-543). */

function item(overrides: Partial<GroceryItem> = {}): GroceryItem {
  return { id: 'milk', name: 'Parity milk', category: 'Dairy & Eggs', quantity: '2', size: '', notes: '', imageData: null, checked: false, ...overrides };
}

function list(overrides: Partial<GroceryList> = {}): GroceryList {
  return { id: 'l1', title: 'Parity Weekly Groceries', date: '2026-10-05', timeZone: 'UTC', weekly: true, revision: 4, completedAt: null, items: [item(), item({ id: 'mouse', name: 'Apple mouse', category: 'Produce' })], ...overrides };
}

function match(overrides: Partial<ShoppingOfferMatch> = {}): ShoppingOfferMatch {
  return {
    itemId: 'milk',
    itemName: 'Parity milk',
    category: 'available',
    reasons: [],
    differences: [],
    selected: false,
    offer: { id: 'o1', product: 'Lucerne Milk', conditions: '', sourceURL: 'https://safeway.com', startsAt: '2026-10-01', expiresAt: '2026-10-07', checkedAt: '2026-10-05', store: 'Safeway' },
    ...overrides,
  };
}

function Wrapped() {
  const [client] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }));
  return (
    <QueryClientProvider client={client}>
      <View>
        <Detail />
      </View>
    </QueryClientProvider>
  );
}

async function open(value: GroceryList) {
  shoppingStore.setState({ lists: [value], busy: false, error: null });
  mockParams = { id: value.id };
  await render(<Wrapped />);
}

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Ada', email: 'a@b.c', timeZone: 'UTC' } });
  mockOffers.mockReturnValue(new Promise(() => undefined));
  mockHours.mockReturnValue(new Promise(() => undefined));
});

describe('Shopping Detail', () => {
  it('titles the screen with the store, and "Open Now" while Google says so', async () => {
    mockHours.mockResolvedValue({ days: [], openNow: true, current: true });
    await open(list({ storeName: 'Safeway', storePlaceId: 'place-1' }));
    expect(screen.getByText('Safeway')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('list-open-now')).toHaveTextContent('Open Now'));
    expect(mockHours).toHaveBeenCalledWith('place-1');
  });

  it('says "Shopping List" without a store, and never asks for hours', async () => {
    await open(list());
    expect(screen.getByText('Shopping List')).toBeTruthy();
    expect(screen.queryByTestId('list-open-now')).toBeNull();
    expect(mockHours).not.toHaveBeenCalled();
  });

  it('shows the store logo and the settings chevron in the header', async () => {
    await open(list({ storeName: 'Safeway' }));
    expect(screen.getAllByLabelText('Shopping list').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId('shopping-header-settings'));
    expect(screen.getByText('List Settings')).toBeTruthy();
  });

  it('Schedule Email opens the weekly email; View Offers shows for Costco or Safeway before offers load', async () => {
    await open(list({ storeName: 'Safeway Store #123' }));
    await fireEvent.press(screen.getByTestId('shopping-shortcut-email'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/wellness/shopping/email', params: { id: 'l1' } });
    expect(screen.getByLabelText('View Offers')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('shopping-shortcut-offers'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/wellness/shopping/offers', params: { id: 'l1' } });
  });

  it('shows View Offers with the count for any store once the offers load, and badges each offered item', async () => {
    mockOffers.mockResolvedValue({ matches: [match(), match({ offer: { ...match().offer, id: 'o2' } })], status: 'ok' });
    await open(list({ storeName: 'Corner Shop', items: [item({ chosenOffer: { id: 'o2', product: 'Store Milk', store: 'Safeway', sourceURL: 'x', expiresAt: '2026-10-07' } })] }));
    await waitFor(() => expect(screen.getByLabelText('View Offers (2)')).toBeTruthy());
    expect(screen.getByTestId('offer-badge-milk')).toHaveTextContent('Chosen: Store Milk');
    await fireEvent.press(screen.getByLabelText('Offers for Parity milk'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/wellness/shopping/offers', params: { id: 'l1', itemId: 'milk' } });
  });

  it('hides View Offers for other stores until the offers load, and shows no badge without offers', async () => {
    await open(list({ storeName: 'Corner Shop' }));
    expect(screen.queryByTestId('shopping-shortcut-offers')).toBeNull();
    expect(screen.queryByTestId('offer-badge-milk')).toBeNull();
  });

  it('offers alternatives only for food', async () => {
    await open(list());
    expect(screen.getByTestId('grocery-star-milk')).toBeTruthy();
    expect(screen.queryByTestId('grocery-star-mouse')).toBeNull();
  });
});

describe('the pure parts', () => {
  it('supportsFoodAlternatives: the name first, then the food categories, then common foods under Other', () => {
    expect(supportsFoodAlternatives({ name: 'Apple mouse', category: 'Produce' })).toBe(false);
    expect(supportsFoodAlternatives({ name: 'Paper towels', category: 'Household' })).toBe(false);
    expect(supportsFoodAlternatives({ name: 'Bananas', category: 'Produce' })).toBe(true);
    expect(supportsFoodAlternatives({ name: 'Mangoes', category: 'Other' })).toBe(true);
    expect(supportsFoodAlternatives({ name: 'Birthday card', category: 'Other' })).toBe(false);
    expect(supportsFoodAlternatives({ name: 'Dish soap', category: 'Pantry' })).toBe(false);
  });

  it('draws mangoes with their own artwork', () => {
    expect(groceryAsset('Alphonso mangoes')).toBe('mango');
    expect(groceryAsset('mango milk')).toBe('milk');
  });

  it('showsOffersShortcut matches Costco or Safeway as whole words', () => {
    expect(showsOffersShortcut(undefined, 'Costco Wholesale')).toBe(true);
    expect(showsOffersShortcut(undefined, 'safeway-123')).toBe(true);
    expect(showsOffersShortcut(undefined, 'Safewayish')).toBe(false);
    expect(showsOffersShortcut({ matches: [], status: 'unsupported' }, 'Corner Shop')).toBe(true);
  });
});
