import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Linking } from 'react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));

const mockOffers = jest.fn();
const mockChoose = jest.fn();
const mockLists = jest.fn();
const mockPost = jest.fn();
jest.mock('../../../api/shopping', () => ({
  ...jest.requireActual('../../../api/shopping'),
  shoppingApi: { lists: (...args: unknown[]) => mockLists(...args), post: (...args: unknown[]) => mockPost(...args), alternatives: jest.fn(), image: jest.fn(), transcriptionSession: jest.fn() },
  shoppingOffersApi: { offers: (...args: unknown[]) => mockOffers(...args), choose: (...args: unknown[]) => mockChoose(...args), storeHours: jest.fn() },
  shoppingStoresApi: { search: jest.fn(), brand: jest.fn(), recognize: jest.fn(), recommendations: jest.fn() },
}));

import type { GroceryList, ShoppingOfferMatch, ShoppingOffersSnapshot } from '../../../api/shopping';
import { useSession } from '../../../store/session';
import { offerEndDate } from '../offers';
import { OfferDetailScreen, OffersScreen } from '../OffersScreens';
import { shoppingStore } from '../store';

/** `ShoppingOffersView` and `ShoppingOfferDetail` (ios/App/ShoppingOffersView.swift). */

function list(overrides: Partial<GroceryList> = {}): GroceryList {
  return {
    id: 'l1',
    title: 'Parity Weekly Groceries',
    date: '2026-10-05',
    timeZone: 'UTC',
    weekly: true,
    revision: 5,
    completedAt: null,
    items: [
      { id: 'chicken', name: 'chicken breast', category: 'Meat & Seafood', quantity: '1', size: '', notes: '', checked: false },
      { id: 'bread', name: 'whole wheat bread', category: 'Bakery', quantity: '1', size: '', notes: '', checked: false },
    ],
    ...overrides,
  };
}

function match(overrides: Partial<ShoppingOfferMatch> & { id?: string } = {}): ShoppingOfferMatch {
  const { id = 'o1', ...rest } = overrides;
  return {
    itemId: 'chicken',
    itemName: 'chicken breast',
    category: 'available',
    reasons: ['Product: chicken'],
    differences: [],
    selected: false,
    offer: {
      id,
      product: 'Chicken Breast Bites',
      packageSize: null,
      price: '$4.99 ea member price',
      savings: null,
      unitPrice: null,
      conditions: 'Safeway Weekly Ad offer near ZIP 94111, valid 2026-09-30 to 2026-10-06. Member prices may require a free loyalty account.',
      imageURL: null,
      sourceURL: 'https://www.safeway.com/weeklyad',
      startsAt: '2026-09-30T07:00:00.000Z',
      expiresAt: '2026-10-07T06:59:59.000Z',
      checkedAt: '2026-10-05T12:00:00.000Z',
      store: 'Safeway',
    },
    ...rest,
  };
}

const SNAPSHOT: ShoppingOffersSnapshot = {
  matches: [
    match(),
    match({ id: 'o2', offer: { ...match().offer, id: 'o2', product: 'Foster Farms Chicken', price: null, savings: 'BUY 1 GET 1 FREE' } }),
    match({ id: 'o3', itemId: 'bread', itemName: 'whole wheat bread', category: 'alternative', reasons: ['Product: bread'], differences: ['Not confirmed by the ad: whole, wheat'], offer: { ...match().offer, id: 'o3', product: 'The Rustik Oven Bread', store: 'Costco' } }),
  ],
  status: 'Weekly Ad offers for Safeway near ZIP 94111. Prices and loyalty terms vary by store.',
  lastCheckedAt: '2026-10-05T12:00:00.000Z',
  sourceURL: 'https://www.safeway.com/weeklyad',
};

let client: QueryClient;
async function show(node: React.ReactElement, value = list()) {
  shoppingStore.setState({ lists: [value], busy: false, error: null });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  await render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Ada', email: 'a@b.c', timeZone: 'UTC' } });
  mockLists.mockImplementation(async () => ({ lists: shoppingStore.getState().lists }));
});

describe('Offers for your list', () => {
  it('opens on a tab that has offers, counts each tab, and lists the offers with their item and reason', async () => {
    mockOffers.mockResolvedValue(SNAPSHOT);
    await show(<OffersScreen listId="l1" />);
    await waitFor(() => expect(screen.getByTestId('offers-tab-available').props.accessibilityState).toEqual({ selected: true }));
    expect(screen.getByText('Matching (0)')).toBeTruthy();
    expect(screen.getByText('Available (2)')).toBeTruthy();
    expect(screen.getByText('Alternatives (1)')).toBeTruthy();
    expect(screen.getByText('Parity Weekly Groceries')).toBeTruthy();
    expect(screen.getByText('$4.99 ea member price')).toBeTruthy();
    expect(screen.getByText('Price not published')).toBeTruthy();
    expect(screen.getByText('BUY 1 GET 1 FREE')).toBeTruthy();
    expect(screen.getAllByText('Product: chicken')).toHaveLength(2);
    await fireEvent.press(screen.getByTestId('offer-chicken-o1'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/wellness/shopping/offer', params: { id: 'l1', itemId: 'chicken', offerId: 'o1' } });
  });

  it('says why a tab is empty, and explains the labels with the status, last check and source', async () => {
    mockOffers.mockResolvedValue(SNAPSHOT);
    await show(<OffersScreen listId="l1" />);
    await waitFor(() => expect(screen.getByText('Available (2)')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('offers-tab-matching'));
    expect(within(screen.getByTestId('offers-empty')).getByText('No matching offers')).toBeTruthy();
    expect(screen.getByText('Try another category, or check your store settings. New offers appear after the daily source check.')).toBeTruthy();
    expect(screen.getByText('How offers are labeled')).toBeTruthy();
    expect(screen.getAllByText(SNAPSHOT.status).length).toBeGreaterThan(0);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await fireEvent.press(screen.getByTestId('offers-source'));
    expect(open).toHaveBeenCalledWith('https://www.safeway.com/weeklyad');
    open.mockRestore();
  });

  it('for one item shows only its offers, and with none, the server’s status', async () => {
    mockOffers.mockResolvedValue({ ...SNAPSHOT, matches: [] , status: 'Offers are awaiting their first verified daily check.' });
    await show(<OffersScreen itemId="bread" listId="l1" />);
    await waitFor(() => expect(screen.getByText('No offers for this item yet')).toBeTruthy());
    expect(screen.getByText('whole wheat bread')).toBeTruthy();
    expect(screen.getAllByText('Offers are awaiting their first verified daily check.').length).toBeGreaterThan(0);
  });

  it('filters by store', async () => {
    mockOffers.mockResolvedValue({ ...SNAPSHOT, matches: SNAPSHOT.matches.map((value) => ({ ...value, category: 'available' })) });
    await show(<OffersScreen listId="l1" />);
    await waitFor(() => expect(screen.getByText('Available (3)')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('offers-store'));
    await fireEvent.press(screen.getByTestId('offers-store-Costco'));
    expect(screen.queryByTestId('offer-chicken-o1')).toBeNull();
    expect(screen.getByTestId('offer-bread-o3')).toBeTruthy();
  });

  it('shows a chosen offer, flags one no longer current, and removes it', async () => {
    mockOffers.mockResolvedValue(SNAPSHOT);
    const chosen = list({ items: [{ ...list().items[0], chosenOffer: { id: 'gone', product: 'Old deal', store: 'Safeway', sourceURL: 'x', expiresAt: '2026-10-01' } }] });
    mockChoose.mockResolvedValue({ list: { ...chosen, revision: 6, items: [list().items[0]] } });
    await show(<OffersScreen listId="l1" />, chosen);
    await waitFor(() => expect(screen.getByText('Chosen for chicken breast')).toBeTruthy());
    expect(screen.getByText('Old deal · Size not specified · Safeway')).toBeTruthy();
    expect(screen.getByText('This selection is no longer a current verified offer. Choose a new offer or remove it.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('chosen-remove-chicken'));
    await waitFor(() => expect(mockChoose).toHaveBeenCalledWith({ listId: 'l1', itemId: 'chicken', offerId: null, revision: 5 }));
    await waitFor(() => expect(screen.queryByText('Chosen for chicken breast')).toBeNull());
  });

  it('shows a load failure with Retry', async () => {
    mockOffers.mockRejectedValueOnce(new Error('Shopping list not found.')).mockResolvedValueOnce(SNAPSHOT);
    await show(<OffersScreen listId="l1" />);
    await waitFor(() => expect(screen.getByTestId('offers-error')).toHaveTextContent('Shopping list not found.'));
    await fireEvent.press(screen.getByTestId('offers-retry'));
    await waitFor(() => expect(screen.getByText('Available (2)')).toBeTruthy());
  });

  it('Manage stores opens List Settings', async () => {
    mockOffers.mockResolvedValue(SNAPSHOT);
    await show(<OffersScreen listId="l1" />);
    await fireEvent.press(screen.getByTestId('offers-manage-stores'));
    expect(screen.getByText('List Settings')).toBeTruthy();
  });
});

describe('Offer details', () => {
  it('explains the match, the store’s own last day, the conditions and source, and chooses the offer', async () => {
    mockOffers.mockResolvedValue(SNAPSHOT);
    mockChoose.mockResolvedValue({ list: { ...list(), revision: 6, items: [{ ...list().items[0], chosenOffer: { id: 'o3', product: 'The Rustik Oven Bread', store: 'Costco', sourceURL: 'x', expiresAt: 'y' } }, { ...list().items[1], chosenOffer: { id: 'o3', product: 'The Rustik Oven Bread', store: 'Costco', sourceURL: 'x', expiresAt: 'y' } }] } });
    await show(<OfferDetailScreen itemId="bread" listId="l1" offerId="o3" />);
    await waitFor(() => expect(screen.getByText('Why this is an alternative')).toBeTruthy());
    expect(screen.getByText('Not confirmed by the ad: whole, wheat')).toBeTruthy();
    // The ad ran to 6 Oct; Swift shows "7 Oct" east of California. RN shows the store's day.
    expect(screen.getByTestId('offer-valid')).toHaveTextContent(`Valid through ${offerEndDate('2026-10-07T06:59:59.000Z')}`);
    expect(screen.getByTestId('offer-valid').props.children).toMatch(/6/);
    expect(screen.getByText('Your original item preferences are preserved. The chosen product, package and store are saved with this item.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Choose this offer'));
    await waitFor(() => expect(mockChoose).toHaveBeenCalledWith({ listId: 'l1', itemId: 'bread', offerId: 'o3', revision: 5 }));
    await waitFor(() => expect(screen.getByLabelText('Remove selection')).toBeTruthy());
  });

  it('cannot choose on a completed trip, and shows a refused choice', async () => {
    mockOffers.mockResolvedValue(SNAPSHOT);
    await show(<OfferDetailScreen itemId="chicken" listId="l1" offerId="o1" />, list({ completedAt: '2026-10-04T00:00:00Z' }));
    await waitFor(() => expect(screen.getByLabelText('Choose this offer')).toBeTruthy());
    expect(screen.getByLabelText('Choose this offer').props.accessibilityState.disabled).toBe(true);
  });
});

describe('offerEndDate', () => {
  it('is the store’s last day, wherever the phone is', () => {
    // Costco: 23:59:59 in Los Angeles; Safeway ads in Eastern and Hawaii time; an exclusive midnight end.
    expect(offerEndDate('2026-10-07T06:59:59.000Z', 'en-US')).toBe('Oct 6, 2026');
    expect(offerEndDate('2026-10-07T03:59:59.000Z', 'en-US')).toBe('Oct 6, 2026');
    expect(offerEndDate('2026-10-07T09:59:59.000Z', 'en-US')).toBe('Oct 6, 2026');
    expect(offerEndDate('2026-10-07T04:00:00.000Z', 'en-US')).toBe('Oct 6, 2026');
    expect(offerEndDate('soon')).toBe('soon');
  });
});
