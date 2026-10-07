import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { Linking } from 'react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));

const mockLists = jest.fn();
const mockSearch = jest.fn();
const mockBrand = jest.fn();
const mockHours = jest.fn();
jest.mock('../../../api/shopping', () => ({
  ...jest.requireActual('../../../api/shopping'),
  shoppingApi: { lists: (...args: unknown[]) => mockLists(...args), post: jest.fn(), alternatives: jest.fn(), image: jest.fn(), transcriptionSession: jest.fn() },
  shoppingStoresApi: {
    search: (...args: unknown[]) => mockSearch(...args),
    brand: (...args: unknown[]) => mockBrand(...args),
    recognize: jest.fn(),
    recommendations: jest.fn(),
  },
  shoppingOffersApi: { offers: jest.fn(), choose: jest.fn(), storeHours: (...args: unknown[]) => mockHours(...args) },
}));

import type { GroceryList } from '../../../api/shopping';
import { useSession } from '../../../store/session';
import MyLists from '../../../../app/wellness/shopping/index';
import { ListSettingsSheet, settingsSavable, withAddress, withStore } from '../ListSettings';
import { shoppingStore } from '../store';
import { clearStoreBrandCache, safeLogoUrl, StoreBrandLogo } from '../StoreBrandLogo';
import { distanceLabel, storeSearchBody } from '../StorePages';

/**
 * My Lists with store logos, New List, List Settings with a store, Stores Near You and Store Hours
 * (ios/App/ShoppingViews.swift:78-205, :633-790; StoreBrandLogo.swift; ShoppingStoreHoursView.swift).
 */

function list(overrides: Partial<GroceryList> = {}): GroceryList {
  return { id: 'l1', title: 'Parity Weekly Groceries', date: '2026-10-05', timeZone: 'UTC', weekly: true, revision: 3, completedAt: null, items: [], ...overrides };
}

const SAFEWAY = { id: 'place-1', name: 'Safeway', address: '145 Jackson St, San Francisco, CA 94111', zip: '94111', website: 'https://www.safeway.com', attributions: [], distanceKm: 1.234 };

let client: QueryClient;
function wrap(node: React.ReactElement) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  clearStoreBrandCache();
  useSession.setState({ status: 'signedIn', profile: { id: 'u1', name: 'Ada', email: 'a@b.c', timeZone: 'UTC' } });
});

describe('Store logos', () => {
  it('accepts only https logos on cdn.brandfetch.io with no query but `c`', () => {
    expect(safeLogoUrl('https://cdn.brandfetch.io/idx/w/400/h/400/logo.png?c=abc')).toBe('https://cdn.brandfetch.io/idx/w/400/h/400/logo.png?c=abc');
    expect(safeLogoUrl('https://cdn.brandfetch.io/idx/logo.png')).not.toBeNull();
    expect(safeLogoUrl('http://cdn.brandfetch.io/idx/logo.png')).toBeNull();
    expect(safeLogoUrl('https://evil.example/logo.png')).toBeNull();
    expect(safeLogoUrl('https://user@cdn.brandfetch.io/logo.png')).toBeNull();
    expect(safeLogoUrl('https://cdn.brandfetch.io:8443/logo.png')).toBeNull();
    expect(safeLogoUrl('https://cdn.brandfetch.io/logo.png?c=1&track=2')).toBeNull();
    expect(safeLogoUrl(null)).toBeNull();
  });

  it('asks the server for the brand and shows the logo once it loads; tapping expands it', async () => {
    mockBrand.mockResolvedValue({ brand: { displayName: 'Safeway', logoUrl: 'https://cdn.brandfetch.io/safeway/logo.png?c=1' } });
    await render(<StoreBrandLogo expandsOnTap identity="Safeway|https://www.safeway.com" listId="l1" />);
    await waitFor(() => expect(screen.getByTestId('store-brand-image')).toBeTruthy());
    expect(mockBrand).toHaveBeenCalledWith('l1');
    expect(screen.getByLabelText('Shopping list')).toBeTruthy();
    await fireEvent(screen.getByTestId('store-brand-image'), 'load');
    await fireEvent.press(screen.getByLabelText('Expand Safeway logo'));
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('reuses a logo for a minute without asking again', async () => {
    mockBrand.mockResolvedValue({ brand: { displayName: 'Safeway', logoUrl: 'https://cdn.brandfetch.io/safeway/logo.png' } });
    await render(
      <>
        <StoreBrandLogo identity="Safeway|" listId="l9" />
      </>,
    );
    await waitFor(() => expect(mockBrand).toHaveBeenCalledTimes(1));
    await screen.rerender(
      <>
        <StoreBrandLogo identity="Safeway|" listId="l9" />
        <StoreBrandLogo identity="Safeway|" listId="l9" />
      </>,
    );
    expect(screen.getAllByTestId('store-brand-image')).toHaveLength(2);
    expect(mockBrand).toHaveBeenCalledTimes(1);
  });

  it('keeps the cart for a list with no store', async () => {
    await render(<StoreBrandLogo identity="|" listId="l1" />);
    expect(mockBrand).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Shopping list')).toBeTruthy();
  });

  it('keeps the cart for an unsafe logo', async () => {
    mockBrand.mockResolvedValue({ brand: { displayName: 'Shop', logoUrl: 'https://tracker.example/x.png' } });
    await render(<StoreBrandLogo identity="Shop|" listId="l2" />);
    await waitFor(() => expect(mockBrand).toHaveBeenCalled());
    expect(screen.queryByTestId('store-brand-image')).toBeNull();
  });

  it('keeps the cart when the brand request fails', async () => {
    mockBrand.mockRejectedValue(new Error('offline'));
    await render(<StoreBrandLogo identity="Other|" listId="l3" />);
    await waitFor(() => expect(mockBrand).toHaveBeenCalled());
    expect(screen.getByLabelText('Shopping list')).toBeTruthy();
  });
});

describe('My Lists', () => {
  it('shows each list’s store logo and no toolbar "+"', async () => {
    mockBrand.mockResolvedValue({ brand: { displayName: 'Safeway', logoUrl: null } });
    const lists = [list({ storeName: 'Safeway', storeWebsite: 'https://www.safeway.com' })];
    mockLists.mockResolvedValue({ lists });
    shoppingStore.setState({ lists, busy: false, error: null });
    await wrap(<MyLists />);
    await waitFor(() => expect(mockBrand).toHaveBeenCalledWith('l1'));
    expect(screen.queryByTestId('shopping-plus')).toBeNull();
    expect(screen.getByLabelText('Shopping list')).toBeTruthy();
  });

  it('New List starts as "Shopping List" and says "Create List & Add Store"', async () => {
    mockLists.mockResolvedValue({ lists: [] });
    shoppingStore.setState({ lists: [], busy: false, error: null });
    await wrap(<MyLists />);
    await fireEvent.press(screen.getByTestId('shopping-create-list'));
    expect(screen.getByTestId('shopping-list-name').props.value).toBe('Shopping List');
    expect(screen.getByText('Create List & Add Store')).toBeTruthy();
  });
});

describe('List Settings', () => {
  async function open(initial = list()) {
    const onSave = jest.fn();
    const onClose = jest.fn();
    await wrap(<ListSettingsSheet list={initial} onClose={onClose} onSave={onSave} visible />);
    return { onSave, onClose };
  }

  it('saves only with a name and, when given, a US ZIP', () => {
    expect(settingsSavable({ title: 'A', storeZip: '' })).toBe(true);
    expect(settingsSavable({ title: 'A', storeZip: '94111' })).toBe(true);
    expect(settingsSavable({ title: 'A', storeZip: '94111-1234' })).toBe(true);
    expect(settingsSavable({ title: 'A', storeZip: '9411' })).toBe(false);
    expect(settingsSavable({ title: ' ', storeZip: '' })).toBe(false);
  });

  it('shows the store details with Swift’s footer, Directions and Store Hours', async () => {
    await open(list({ storeName: 'Safeway', storeAddress: '145 Jackson St, San Francisco, CA 94111, USA', storeZip: '94111', storePlaceId: 'place-1' }));
    expect(screen.getByText('List Settings')).toBeTruthy();
    expect(screen.getByText('Store details')).toBeTruthy();
    expect(screen.getByText('Used to find offers for your store location. Verified sources are required; some stores are not available yet.')).toBeTruthy();
    expect(screen.getByTestId('list-settings-store-name').props.value).toBe('Safeway');
    expect(screen.getByTestId('list-settings-street').props.value).toBe('145 Jackson St');
    expect(screen.getByTestId('list-settings-locality').props.value).toBe('San Francisco, CA 94111');
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await fireEvent.press(screen.getByTestId('list-settings-directions'));
    expect(openURL.mock.calls[0][0]).toContain('https://www.google.com/maps/dir/?api=1&destination=Safeway');
    expect(openURL.mock.calls[0][0]).toContain('destination_place_id=place-1');
    openURL.mockRestore();
  });

  it('typing an address forgets the chosen place and reads the ZIP from it', async () => {
    const { onSave } = await open(list({ storeName: 'Safeway', storePlaceId: 'place-1', storeWebsite: 'https://www.safeway.com' }));
    await fireEvent.changeText(screen.getByTestId('list-settings-locality'), 'Oakland, CA 9461');
    // `zip` only reads a trailing five-digit ZIP, so a partial one is no ZIP and Save stays on.
    expect(screen.getByTestId('list-settings-save').props.accessibilityState.disabled).toBe(false);
    await fireEvent.changeText(screen.getByTestId('list-settings-locality'), 'Oakland, CA 94612');
    await fireEvent.press(screen.getByTestId('list-settings-save'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ storeZip: '94612', storePlaceId: null, storeWebsite: null, storeAddress: 'Oakland, CA 94612' }));
    expect(withAddress(list(), { street: '1 Main St', locality: 'Austin, TX 73301' })).toMatchObject({ storeAddress: '1 Main St, Austin, TX 73301', storeZip: '73301' });
  });

  it('Add New Store searches by area after a pause, and Add fills the store', async () => {
    jest.useFakeTimers();
    mockSearch.mockResolvedValue({ stores: [SAFEWAY] });
    const { onSave } = await open(list({ storeZip: '94109' }));
    await fireEvent.press(screen.getByTestId('shopping-add-store'));
    expect(screen.getByText('Stores Near You')).toBeTruthy();
    expect(screen.getByTestId('stores-area').props.value).toBe('94109');
    await fireEvent.changeText(screen.getByTestId('stores-name'), 'Safeway');
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    await waitFor(() => expect(screen.getByTestId('store-place-1')).toBeTruthy());
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith({ name: 'Safeway', area: '94109' });
    expect(screen.getByText('1.23 km')).toBeTruthy();
    expect(screen.getByText('Google Maps')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Add Safeway, 145 Jackson St, San Francisco, CA 94111'));
    expect(screen.getByText('List Settings')).toBeTruthy();
    expect(screen.getByTestId('list-settings-store-name').props.value).toBe('Safeway');
    await fireEvent.press(screen.getByTestId('list-settings-save'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ storePlaceId: 'place-1', storeWebsite: 'https://www.safeway.com', storeName: 'Safeway', storeZip: '94111' }));
    jest.useRealTimers();
  });

  it('Stores Near You explains an empty search, a failure with Try again, and an unavailable location', async () => {
    jest.useFakeTimers();
    await open(list());
    await fireEvent.press(screen.getByTestId('shopping-add-store'));
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(screen.getByText('Enter a city or ZIP code, or use your location to find grocery stores.')).toBeTruthy();
    // Asked for, the location is refused: Swift's message.
    await fireEvent.press(screen.getByTestId('stores-use-location'));
    await waitFor(() => expect(screen.getByTestId('stores-error')).toHaveTextContent('Location is unavailable. Enter a city or ZIP code, or allow location access in your phone’s Settings.'));
    mockSearch.mockRejectedValueOnce(new Error('Please wait a minute before searching again.')).mockResolvedValueOnce({ stores: [] });
    await fireEvent.changeText(screen.getByTestId('stores-area'), 'Oakland');
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    await waitFor(() => expect(screen.getByTestId('stores-error')).toHaveTextContent('Please wait a minute before searching again.'));
    await fireEvent.press(screen.getByTestId('stores-retry'));
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    await waitFor(() => expect(screen.getByText('No stores found. Try another location or store name.')).toBeTruthy());
    jest.useRealTimers();
  });

  it('uses the device location when allowed, rounded to two places', async () => {
    jest.useFakeTimers();
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: true, canAskAgain: true });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValueOnce({ coords: { latitude: 37.7951, longitude: -122.4023 } });
    mockSearch.mockResolvedValue({ stores: [] });
    await open(list());
    await fireEvent.press(screen.getByTestId('shopping-add-store'));
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    await waitFor(() => expect(screen.getByText('Near your current location · Distances are straight-line estimates')).toBeTruthy());
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith({ name: '', latitude: 37.8, longitude: -122.4 }));
    jest.useRealTimers();
  });

  it('Store Hours shows open now, the days and the note, or Swift’s error with Try again', async () => {
    mockHours.mockResolvedValueOnce({ days: ['Monday: 6:00 AM – 11:00 PM'], openNow: true, current: true });
    await open(list({ storeName: 'Safeway', storePlaceId: 'place-1', storeAddress: '145 Jackson St' }));
    await fireEvent.press(screen.getByTestId('list-settings-hours'));
    await waitFor(() => expect(screen.getByTestId('store-hours-open')).toHaveTextContent('Open now'));
    expect(screen.getByText('Monday: 6:00 AM – 11:00 PM')).toBeTruthy();
    expect(screen.getByText('Hours for the next seven days · Store local time')).toBeTruthy();
    expect(screen.getByText('View store on Google Maps')).toBeTruthy();
    expect(mockHours).toHaveBeenCalledWith('place-1');
    // The system back: a chevron on glass, labelled "Back", not a "Back" text capsule.
    expect(screen.getByTestId('list-settings-back').props.accessibilityLabel).toBe('Back');
    expect(screen.queryByText('Back')).toBeNull();
    await fireEvent.press(screen.getByTestId('list-settings-back'));
    expect(screen.getByText('List Settings')).toBeTruthy();
  });

  it('Store Hours without a chosen place says how to choose one', async () => {
    await open(list({ storeName: 'Corner shop' }));
    await fireEvent.press(screen.getByTestId('list-settings-hours'));
    expect(screen.getByText('Choose this location using Add New Store to load its hours.')).toBeTruthy();
    expect(mockHours).not.toHaveBeenCalled();
  });

  it('builds the search body and distance as Swift', () => {
    expect(storeSearchBody(' Safeway ', ' 94109 ', null)).toEqual({ name: 'Safeway', area: '94109' });
    expect(storeSearchBody('', 'O', null)).toBeNull();
    expect(storeSearchBody('', '', { latitude: 1, longitude: 2 })).toEqual({ name: '', latitude: 1, longitude: 2 });
    expect(storeSearchBody('', '', null)).toBeNull();
    expect(distanceLabel(0.5)).toBe('0.50 km');
    expect(withStore(list(), SAFEWAY)).toMatchObject({ storePlaceId: 'place-1', storeAddress: SAFEWAY.address });
  });
});
