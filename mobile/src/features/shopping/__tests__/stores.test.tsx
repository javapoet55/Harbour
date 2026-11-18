import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { Linking, Platform, StyleSheet } from 'react-native';

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

import type { GroceryList, ShoppingStoreSuggestion } from '../../../api/shopping';
import { useAppearance } from '../../../store/appearance';
import { useSession } from '../../../store/session';
import MyLists from '../../../../app/wellness/shopping/index';
import { ListSettingsSheet, logoLookupAllowed, settingsSavable, storeChanged, withAddress, withStore } from '../ListSettings';
import { shoppingStore } from '../store';
import { clearStoreBrandCache, lookUp, safeLogoUrl, StoreBrandLogo, suppliedLogo } from '../StoreBrandLogo';
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

  /** bdb68ce (StoreBrandLogo.swift `load()`): the list's own logo first, labelled with the store name. */
  it('shows the list’s own logo without asking for the brand, and it expands', async () => {
    await render(<StoreBrandLogo customImageData="/9j/AA==" expandsOnTap identity="Safeway|https://www.safeway.com" listId="l4" />);
    const image = screen.getByTestId('store-brand-image');
    expect(image.props.source.uri).toBe('data:image/jpeg;base64,/9j/AA==');
    expect(mockBrand).not.toHaveBeenCalled();
    await fireEvent(image, 'load');
    await fireEvent.press(screen.getByLabelText('Expand Safeway logo'));
    expect(screen.getByLabelText('Safeway logo')).toBeTruthy();
  });

  it('falls back to the brand when the list’s logo cannot be drawn', async () => {
    mockBrand.mockResolvedValue({ brand: { displayName: 'Safeway', logoUrl: 'https://cdn.brandfetch.io/safeway/logo.png?c=1' } });
    await render(<StoreBrandLogo customImageData="/9j/broken" identity="Safeway|" listId="l5" />);
    await fireEvent(screen.getByTestId('store-brand-image'), 'error');
    await waitFor(() => expect(mockBrand).toHaveBeenCalledWith('l5'));
    await waitFor(() => expect(screen.getByTestId('store-brand-image').props.source.uri).toBe('https://cdn.brandfetch.io/safeway/logo.png?c=1'));
  });

  it('a null or empty logo is no logo', async () => {
    mockBrand.mockResolvedValue({ brand: { displayName: 'Safeway', logoUrl: null } });
    await render(<StoreBrandLogo customImageData={null} identity="Safeway|" listId="l6" />);
    await waitFor(() => expect(mockBrand).toHaveBeenCalledWith('l6'));
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

  /** StoreBrandLogo.swift:63-65 with ShoppingViews.swift:109 (bdb68ce): the list's own logo first, at 48. */
  it('shows a list’s own logo in its row, without asking for the brand, even with no store', async () => {
    const lists = [list({ storeName: 'Safeway', storeLogoData: '/9j/AA==' }), list({ id: 'l2', storeLogoData: '/9j/BB==' })];
    mockLists.mockResolvedValue({ lists });
    shoppingStore.setState({ lists, busy: false, error: null });
    await wrap(<MyLists />);
    const images = screen.getAllByTestId('store-brand-image');
    expect(images.map((image) => image.props.source.uri)).toEqual(['data:image/jpeg;base64,/9j/AA==', 'data:image/jpeg;base64,/9j/BB==']);
    expect(images.map((image) => image.props.style)).toEqual(expect.arrayContaining([expect.arrayContaining([expect.objectContaining({ width: 48 * 0.94 })])]));
    await fireEvent(images[1], 'load');
    expect(screen.getByLabelText('Store logo')).toBeTruthy();
    expect(mockBrand).not.toHaveBeenCalled();
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
    // A search that came back empty: iOS 118ede8's card (Android ahead of iOS).
    await waitFor(() => expect(screen.getByTestId('stores-none-found')).toBeTruthy());
    expect(screen.getByText('No stores found near Oakland')).toBeTruthy();
    expect(screen.getByText('Check the city or ZIP code, or try a nearby one.')).toBeTruthy();
    jest.useRealTimers();
  });

  it('says nothing about "no stores" while a search is waiting to start or running', async () => {
    jest.useFakeTimers();
    let answer: (value: unknown) => void = () => undefined;
    mockSearch.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    await open(list());
    await fireEvent.press(screen.getByTestId('shopping-add-store'));
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    await fireEvent.changeText(screen.getByTestId('stores-area'), 'Qzxqv Nowhere');
    // Typed, inside the 600 ms wait: no empty state at all.
    expect(screen.queryByTestId('stores-empty')).toBeNull();
    expect(screen.queryByTestId('stores-none-found')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(screen.queryByTestId('stores-none-found')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('stores-name'), 'Safeway');
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    await act(async () => answer({ stores: [] }));
    await waitFor(() => expect(screen.getByText('No stores found near Qzxqv Nowhere')).toBeTruthy());
    expect(screen.getByText('Check the city or ZIP code and the store name, or try a nearby area.')).toBeTruthy();
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

  /** bb57e09 (ShoppingStoreHoursView.swift:27-34): today's row at the store is bold, "Today, …" to a screen reader. */
  it('Store Hours bolds the store’s today, by its UTC offset across midnight', async () => {
    // 01:00 UTC on Saturday 10 October is still Friday at a store seven hours behind.
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-10T01:00:00Z'));
    mockHours.mockResolvedValueOnce({ days: ['Thursday: 10 AM–8:30 PM', 'Friday: 10 AM–8:30 PM', 'Saturday: 9:30 AM–7 PM'], openNow: true, current: true, utcOffsetMinutes: -420 });
    await open(list({ storeName: 'Safeway', storePlaceId: 'place-1' }));
    await fireEvent.press(screen.getByTestId('list-settings-hours'));
    await waitFor(() => expect(screen.getByTestId('store-hours-today')).toHaveTextContent('Friday: 10 AM–8:30 PM'));
    expect(screen.getByTestId('store-hours-today').props.accessibilityLabel).toBe('Today, Friday: 10 AM–8:30 PM');
    expect(StyleSheet.flatten(screen.getByTestId('store-hours-today').props.style)).toMatchObject({ fontWeight: '700' });
    expect(StyleSheet.flatten(screen.getByTestId('store-hours-day-2').props.style).fontWeight).not.toBe('700');
    now.mockRestore();
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

/**
 * ce6d20a: `POST /api/shopping/stores` gives each store a `brand`, which the finder hands to the logo as
 * `suppliedBrand` with `automaticLookup: false` (ShoppingViews.swift:754-756). No lookup either way; a
 * missing brand or logo keeps the cart.
 */
describe('Store search brand logos', () => {
  const BRAND = { displayName: 'Safeway', logoUrl: 'https://cdn.brandfetch.io/safeway/logo.png?c=1' };

  it('reads the brand from the search row, or nothing', () => {
    expect(suppliedLogo(BRAND)).toEqual({ uri: BRAND.logoUrl, label: 'Safeway' });
    expect(suppliedLogo({ displayName: 'Safeway', logoUrl: null })).toBeNull();
    expect(suppliedLogo({ displayName: 'Shop', logoUrl: 'https://tracker.example/x.png' })).toBeNull();
    expect(suppliedLogo(null)).toBeNull();
    expect(suppliedLogo(undefined)).toBeNull();
  });

  it('accepts a search row with or without brand', () => {
    const withBrand: ShoppingStoreSuggestion = { ...SAFEWAY, brand: BRAND };
    const without: ShoppingStoreSuggestion = SAFEWAY;
    expect(withBrand.brand?.displayName).toBe('Safeway');
    expect(without.brand).toBeUndefined();
  });

  it('draws the supplied logo without calling store-brand', async () => {
    await render(<StoreBrandLogo automaticLookup={false} identity="Safeway|https://www.safeway.com" listId="search-place-1" suppliedBrand={BRAND} />);
    const image = screen.getByTestId('store-brand-image');
    expect(image.props.source.uri).toBe(BRAND.logoUrl);
    await fireEvent(image, 'load');
    expect(screen.getByLabelText('Safeway logo')).toBeTruthy();
    expect(mockBrand).not.toHaveBeenCalled();
  });

  it.each([
    ['no brand', undefined],
    ['a brand with no logo', { displayName: 'Safeway', logoUrl: null }],
  ])('keeps the cart for %s, with no lookup', async (_, suppliedBrand) => {
    await render(<StoreBrandLogo automaticLookup={false} identity="Safeway|" listId="search-place-2" suppliedBrand={suppliedBrand} />);
    expect(screen.queryByTestId('store-brand-image')).toBeNull();
    expect(screen.getByLabelText('Shopping list')).toBeTruthy();
    expect(mockBrand).not.toHaveBeenCalled();
  });
});

/** Phase 14 Run B (android-polish.md §60): the rest of the §24 "Shopping: store logos" row, and List Settings. */
describe('Phase 14: store logos and List Settings', () => {
  const LOGO = { displayName: 'Safeway', logoUrl: 'https://cdn.brandfetch.io/safeway/logo.png?c=1' };
  const os = Platform.OS;
  afterEach(() => {
    useAppearance.setState({ appearance: 'system' });
    Platform.OS = os;
    jest.useRealTimers();
  });
  async function openSettings(initial = list()) {
    const onSave = jest.fn();
    const onClose = jest.fn();
    await wrap(<ListSettingsSheet list={initial} onClose={onClose} onSave={onSave} visible />);
    return { onSave, onClose };
  }

  it('Stores Near You rows draw the server’s brand logo with no lookup, and the cart without one', async () => {
    jest.useFakeTimers();
    mockSearch.mockResolvedValue({ stores: [{ ...SAFEWAY, brand: LOGO }, { ...SAFEWAY, id: 'place-2', name: 'Corner Shop', brand: null }] });
    await openSettings(list({ storeZip: '94109' }));
    await fireEvent.press(screen.getByTestId('shopping-add-store'));
    await fireEvent.changeText(screen.getByTestId('stores-name'), 'Safeway');
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    await waitFor(() => expect(screen.getByTestId('store-place-1')).toBeTruthy());
    expect(within(screen.getByTestId('store-place-1')).getByTestId('store-brand-image').props.source.uri).toBe(LOGO.logoUrl);
    expect(within(screen.getByTestId('store-place-2')).queryByTestId('store-brand-image')).toBeNull();
    expect(mockBrand).not.toHaveBeenCalled();
  });

  it('looks the List Settings logo up only while the draft store is the saved one', () => {
    const saved = list({ storeName: 'Safeway', storeWebsite: 'https://www.safeway.com', storePlaceId: 'place-1' });
    expect(logoLookupAllowed(saved, saved)).toBe(true);
    expect(logoLookupAllowed(saved, { ...saved, title: 'Renamed', storeLogoData: 'abc' })).toBe(true);
    expect(logoLookupAllowed(saved, withStore(saved, { ...SAFEWAY, id: 'place-9', name: 'Trader Joe’s' }))).toBe(false);
    expect(logoLookupAllowed(saved, { ...saved, storeName: 'Safeway Market', storePlaceId: null, storeWebsite: null })).toBe(false);
    // The detail screen holds a store change back until the server has it.
    expect(storeChanged(saved, { ...saved, title: 'Renamed' })).toBe(false);
    expect(storeChanged(saved, { ...saved, storeLogoData: 'abc' })).toBe(true);
    expect(storeChanged(saved, { ...saved, storePlaceId: 'place-2' })).toBe(true);
  });

  it('a newly typed store keeps the cart in List Settings: no store-brand call for an unsaved store', async () => {
    mockBrand.mockResolvedValue({ brand: LOGO });
    await openSettings(list({ storeName: 'Safeway', storeWebsite: 'https://www.safeway.com', storePlaceId: 'place-1' }));
    await waitFor(() => expect(mockBrand).toHaveBeenCalledTimes(1));
    await fireEvent.changeText(screen.getByTestId('list-settings-store-name'), 'Trader Joe’s');
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockBrand).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('store-brand-image')).toBeNull();
  });

  it('retries an empty store-brand answer after 1 s and 2 s, then stops', async () => {
    mockBrand.mockResolvedValueOnce({ brand: { displayName: 'Safeway', logoUrl: null } }).mockResolvedValueOnce({ brand: { displayName: 'Safeway', logoUrl: null } }).mockResolvedValueOnce({ brand: LOGO });
    const waits: number[] = [];
    const brand = await lookUp('l1', () => false, async (ms) => void waits.push(ms));
    expect(waits).toEqual([1000, 2000]);
    expect(brand).toEqual(LOGO);
    expect(mockBrand).toHaveBeenCalledTimes(3);

    mockBrand.mockReset().mockResolvedValue({ brand: { displayName: 'Safeway', logoUrl: null } });
    expect(await lookUp('l1', () => false, async () => undefined)).toEqual({ displayName: 'Safeway', logoUrl: null });
    expect(mockBrand).toHaveBeenCalledTimes(3);
    // A logo on the first answer is never retried, and a view that is gone stops waiting.
    mockBrand.mockReset().mockResolvedValue({ brand: LOGO });
    await lookUp('l1', () => false, async () => undefined);
    expect(mockBrand).toHaveBeenCalledTimes(1);
    mockBrand.mockReset().mockResolvedValue({ brand: { displayName: 'Safeway', logoUrl: null } });
    expect(await lookUp('l1', () => true, async () => undefined)).toBeNull();
    expect(mockBrand).toHaveBeenCalledTimes(1);
  });

  it('Cancel closes List Settings and discards the changes (Android ahead of iOS, §24 bug 2)', async () => {
    const initial = list();
    const { onSave, onClose } = await openSettings(initial);
    await fireEvent.changeText(screen.getByTestId('list-settings-name'), 'Changed');
    await fireEvent.press(screen.getByTestId('list-settings-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Android, Night: Save, Directions and the Repeat weekly switch use Android’s dark colours, not the dark indigo', async () => {
    Platform.OS = 'android';
    useAppearance.setState({ appearance: 'night' });
    await openSettings(list({ storeName: 'Safeway', storeAddress: SAFEWAY.address, storeZip: '94111', storePlaceId: 'place-1' }));
    expect(StyleSheet.flatten(within(screen.getByTestId('list-settings-save')).getByText('Save').props.style).color).toBe('#6BB8FF');
    expect(StyleSheet.flatten(within(screen.getByTestId('list-settings-directions')).getByText('Directions').props.style).color).toBe('#6BB8FF');
    // `switchOn` in dark: the brand indigo at 85% (§6), not Swift's full-strength dark indigo.
    expect(StyleSheet.flatten(screen.getByTestId('list-settings-weekly-track').props.style).backgroundColor).toMatch(/^rgba\(61, 41, 240, 0\.85/);
  });
});
