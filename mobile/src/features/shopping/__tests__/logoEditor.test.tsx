import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({}), Stack: { Screen: () => null } }));
const mockBrand = jest.fn();
jest.mock('../../../api/shopping', () => ({
  ...jest.requireActual('../../../api/shopping'),
  shoppingStoresApi: { search: jest.fn(), brand: (...args: unknown[]) => mockBrand(...args), recognize: jest.fn(), recommendations: jest.fn() },
}));

import type { GroceryList } from '../../../api/shopping';
import type { ImageEncoder } from '../image';
import { ListSettingsSheet } from '../ListSettings';
import { encodeLogoImage, LOGO_NO_CLIPBOARD_IMAGE, LOGO_TOO_LARGE, LOGO_UNOPENABLE, logoSearchUrl } from '../listLogo';
import type { LogoEditorDeps } from '../LogoEditor';
import { clearStoreBrandCache } from '../StoreBrandLogo';

/** `ShoppingListLogoEditor` (ios/App/ShoppingListLogoEditor.swift, bdb68ce); captures `shopping-store-logo-editor`, `-list-settings-logo-button`. */

/** A fake encoder: records sizes and qualities, answers base64 of `bytes(quality)` bytes. */
function encoder(source: { width: number; height: number }, bytes: (quality: number) => number) {
  const calls = { flatten: [] as { width: number; height: number }[], qualities: [] as number[] };
  const value: ImageEncoder = {
    size: async () => source,
    flatten: async (uri, size) => (calls.flatten.push(size), `${uri}#white`),
    jpeg: async (_uri, _size, quality) => (calls.qualities.push(quality), '/9j/' + 'A'.repeat(Math.ceil((bytes(quality) * 4) / 3) - 4)),
  };
  return { value, calls };
}

describe('encodeLogoImage (`apply(_:)`, :95-112)', () => {
  it('draws at most 384 px on white, and steps the quality down until it fits 67,500 bytes', async () => {
    const fake = encoder({ width: 1024, height: 512 }, (quality) => (quality > 0.5 ? 80_000 : 40_000));
    const data = await encodeLogoImage('file:///logo.png', fake.value);
    expect(fake.calls.flatten).toEqual([{ width: 384, height: 192 }]);
    expect(fake.calls.qualities).toEqual([0.85, 0.65, 0.45]);
    expect(data.startsWith('/9j/')).toBe(true);
  });

  it('never enlarges a small logo', async () => {
    const fake = encoder({ width: 120, height: 80 }, () => 1_000);
    await encodeLogoImage('file:///small.png', fake.value);
    expect(fake.calls.flatten).toEqual([{ width: 120, height: 80 }]);
    expect(fake.calls.qualities).toEqual([0.85]);
  });

  it('gives up after 0.25 with Swift’s "too large", and refuses an empty image', async () => {
    await expect(encodeLogoImage('file:///busy.png', encoder({ width: 400, height: 400 }, () => 90_000).value)).rejects.toThrow(LOGO_TOO_LARGE);
    await expect(encodeLogoImage('file:///empty.png', encoder({ width: 0, height: 10 }, () => 10).value)).rejects.toThrow(LOGO_UNOPENABLE);
  });

  it('searches Google Images for "<name> logo", and not without a name', () => {
    expect(logoSearchUrl(' Trader Joe’s ')).toBe('https://www.google.com/search?tbm=isch&q=Trader+Joe%E2%80%99s+logo');
    expect(logoSearchUrl('  ')).toBeNull();
  });
});

function list(overrides: Partial<GroceryList> = {}): GroceryList {
  return { id: 'l1', title: 'Weekly Shopping List', date: '2026-10-13', timeZone: 'UTC', weekly: true, revision: 3, completedAt: null, items: [], ...overrides };
}

async function open(initial: GroceryList, deps: Partial<LogoEditorDeps> = {}) {
  const onSave = jest.fn();
  const openUrl = jest.fn();
  const fake = encoder({ width: 512, height: 512 }, () => 20_000);
  const logoDeps: LogoEditorDeps = { choosePhoto: async () => 'file:///photo.jpg', pastedImage: async () => null, encoder: fake.value, openUrl, ...deps };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <ListSettingsSheet list={initial} logoDeps={logoDeps} onClose={jest.fn()} onSave={onSave} visible />
    </QueryClientProvider>,
  );
  return { onSave, openUrl };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearStoreBrandCache();
  mockBrand.mockResolvedValue({ brand: { displayName: 'Safeway', logoUrl: null } });
});

describe('Store Logo from List Settings', () => {
  it('opens from the pencil-badged logo beside Store name, as captured', async () => {
    await open(list());
    await fireEvent.press(screen.getByTestId('shopping-edit-store-logo'));
    expect(screen.getByText('Store Logo')).toBeTruthy();
    expect(screen.getByTestId('store-logo-name')).toHaveTextContent('Store logo');
    expect(screen.getByText('Search for your store’s logo. Copy the image or save it to Photos, then return here to select it.')).toBeTruthy();
    expect(screen.getByText('This logo applies to this shopping list. Tap Save in List Settings to keep your changes.')).toBeTruthy();
    // Without a store name there is nothing to search for, and no custom logo to remove.
    expect(screen.getByTestId('store-logo-search').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.queryByTestId('store-logo-automatic')).toBeNull();
  });

  it('chooses a photo, shows it, and saves it with the list', async () => {
    const { onSave } = await open(list({ storeName: 'Safeway' }));
    await fireEvent.press(screen.getByTestId('shopping-edit-store-logo'));
    expect(screen.getByTestId('store-logo-name')).toHaveTextContent('Safeway');
    await fireEvent.press(screen.getByTestId('store-logo-photos'));
    await waitFor(() => expect(screen.getByTestId('store-logo-automatic')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('store-logo-done'));
    await fireEvent.press(screen.getByTestId('list-settings-save'));
    expect(onSave.mock.calls[0][0].storeLogoData).toMatch(/^\/9j\//);
  });

  it('says so when there is no image to paste', async () => {
    await open(list({ storeName: 'Safeway' }));
    await fireEvent.press(screen.getByTestId('shopping-edit-store-logo'));
    await fireEvent.press(screen.getByTestId('store-logo-paste'));
    await waitFor(() => expect(screen.getByTestId('store-logo-failure')).toHaveTextContent(LOGO_NO_CLIPBOARD_IMAGE));
  });

  it('pastes a copied image', async () => {
    const { onSave } = await open(list({ storeName: 'Safeway' }), { pastedImage: async () => 'file:///pasted.png' });
    await fireEvent.press(screen.getByTestId('shopping-edit-store-logo'));
    await fireEvent.press(screen.getByTestId('store-logo-paste'));
    await waitFor(() => expect(screen.getByTestId('store-logo-automatic')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('store-logo-done'));
    await fireEvent.press(screen.getByTestId('list-settings-save'));
    expect(onSave.mock.calls[0][0].storeLogoData).toMatch(/^\/9j\//);
  });

  it('"Use automatic store logo" removes the custom one, and Search opens Google Images', async () => {
    const { onSave, openUrl } = await open(list({ storeName: 'Safeway', storeLogoData: '/9j/AA==' }));
    await fireEvent.press(screen.getByTestId('shopping-edit-store-logo'));
    await fireEvent.press(screen.getByTestId('store-logo-search'));
    expect(openUrl).toHaveBeenCalledWith('https://www.google.com/search?tbm=isch&q=Safeway+logo');
    await fireEvent.press(screen.getByTestId('store-logo-automatic'));
    expect(screen.queryByTestId('store-logo-automatic')).toBeNull();
    await fireEvent.press(screen.getByTestId('store-logo-done'));
    await fireEvent.press(screen.getByTestId('list-settings-save'));
    expect(onSave.mock.calls[0][0].storeLogoData).toBeNull();
  });

  it('a picture the encoder cannot open says so, and keeps the old logo', async () => {
    const broken: ImageEncoder = { size: async () => ({ width: 0, height: 0 }), flatten: jest.fn(), jpeg: jest.fn() };
    await open(list({ storeName: 'Safeway', storeLogoData: '/9j/AA==' }), { encoder: broken });
    await fireEvent.press(screen.getByTestId('shopping-edit-store-logo'));
    await fireEvent.press(screen.getByTestId('store-logo-photos'));
    await waitFor(() => expect(screen.getByTestId('store-logo-failure')).toHaveTextContent(LOGO_UNOPENABLE));
    expect(screen.getByTestId('store-logo-automatic')).toBeTruthy();
  });

  it('typing a new store name drops the custom logo, as part 1 does', async () => {
    const { onSave } = await open(list({ storeName: 'Safeway', storeLogoData: '/9j/AA==' }));
    await fireEvent.changeText(screen.getByTestId('list-settings-store-name'), 'Lucky');
    await fireEvent.press(screen.getByTestId('list-settings-save'));
    expect(onSave.mock.calls[0][0].storeLogoData).toBeNull();
  });
});
