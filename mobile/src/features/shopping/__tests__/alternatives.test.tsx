import { ApiError, createApiClient } from '../../../api/client';
import { shoppingApi, type GroceryItem, type ShoppingAlternativesResponse } from '../../../api/shopping';
import { alternativeId, alternativeItem } from '../model';
import { createShoppingStore } from '../store';

/**
 * Item alternatives: the `alternatives` operation (src/server/shopping/service.ts:12-15), Swift's
 * `ShoppingStore.alternatives(for:)` (ios/App/ShoppingStore.swift:36-42), the model
 * (ios/Sources/NexdoCore/ShoppingList.swift:33-76) and `ShoppingDetail.replace`/`add`
 * (ios/App/ShoppingViews.swift:344-352). Fixtures follow ios/Tests/NexdoCoreTests/ShoppingTests.swift:49-62.
 */

const RESPONSE: ShoppingAlternativesResponse = {
  alternatives: [
    { name: 'Turkey breast', category: 'Meat & Seafood', quantity: '1', size: 'lb', reason: 'Lean protein', detail: 'Mild flavor' },
    { name: 'Salmon', category: 'Meat & Seafood', quantity: '1', size: 'lb', reason: 'Heart healthy', detail: 'Rich in omega-3 fatty acids' },
  ],
  tip: 'Try a lean swap.',
  usedAI: true,
};

function item(overrides: Partial<GroceryItem> = {}): GroceryItem {
  return { id: 'i1', name: 'Chicken breast', category: 'Meat & Seafood', quantity: '1', size: 'lb', notes: '', imageData: null, checked: false, ...overrides };
}


describe('shoppingApi.alternatives', () => {
  it('posts { operation: "alternatives", input } with no id, revision or key, and decodes the answer', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const api = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify(RESPONSE), { status: 200 });
      },
    });
    const answer = await shoppingApi.alternatives({ name: 'Chicken breast', category: 'Meat & Seafood', quantity: '1', size: '' }, api);
    expect(answer).toEqual(RESPONSE);
    expect(calls[0].url).toBe('https://api.example.com/api/shopping');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      operation: 'alternatives',
      input: { name: 'Chicken breast', category: 'Meat & Seafood', quantity: '1', size: '' },
    });
  });
});

describe('ShoppingStore.alternatives', () => {
  function harness(alternatives: jest.Mock) {
    return createShoppingStore({ lists: jest.fn(), post: jest.fn(), alternatives, transcriptionSession: jest.fn() });
  }

  it('sends only the four item fields and returns the server answer without touching busy or error', async () => {
    const alternatives = jest.fn(async () => RESPONSE);
    const store = harness(alternatives);
    await expect(store.getState().alternatives(item({ notes: 'x', checked: true }))).resolves.toEqual(RESPONSE);
    expect(alternatives).toHaveBeenCalledWith({ name: 'Chicken breast', category: 'Meat & Seafood', quantity: '1', size: 'lb' });
    expect(store.getState()).toMatchObject({ busy: false, error: null });
  });

  it('throws every failure: no phone-side fallback any more (ShoppingStore.swift:48-52)', async () => {
    const offline = new ApiError({ status: 0, code: 'NETWORK', message: 'offline' });
    const store = harness(jest.fn(async () => Promise.reject(offline)));
    await expect(store.getState().alternatives(item())).rejects.toBe(offline);
  });

  it('reuses an answer for five minutes per item, unless refreshed, and not after a change', async () => {
    let clock = 1_000;
    const alternatives = jest.fn(async () => RESPONSE);
    const store = createShoppingStore({ lists: jest.fn(), post: jest.fn(), alternatives, transcriptionSession: jest.fn() }, () => clock);
    await store.getState().alternatives(item());
    clock += 299_000;
    await store.getState().alternatives(item());
    expect(alternatives).toHaveBeenCalledTimes(1);
    await store.getState().alternatives(item(), true);
    expect(alternatives).toHaveBeenCalledTimes(2);
    await store.getState().alternatives(item({ size: '2 lb' }));
    expect(alternatives).toHaveBeenCalledTimes(3);
    clock += 300_001;
    await store.getState().alternatives(item());
    expect(alternatives).toHaveBeenCalledTimes(4);
    store.getState().reset();
    await store.getState().alternatives(item());
    expect(alternatives).toHaveBeenCalledTimes(5);
  });

  it('rethrows a lost session', async () => {
    const signedOut = new ApiError({ status: 401, code: 'SIGNED_OUT', message: 'signed out' });
    const store = harness(jest.fn(async () => Promise.reject(signedOut)));
    await expect(store.getState().alternatives(item())).rejects.toBe(signedOut);
  });
});

describe('alternative model', () => {
  it('identifies an alternative by its item fields and becomes an item with the detail as notes', () => {
    const [turkey] = RESPONSE.alternatives;
    expect(alternativeId(turkey)).toBe('Turkey breast|Meat & Seafood|1|lb');
    expect(alternativeItem(turkey, 'NEW')).toEqual({
      id: 'NEW',
      name: 'Turkey breast',
      category: 'Meat & Seafood',
      quantity: '1',
      size: 'lb',
      notes: 'Mild flavor',
      imageData: null,
      checked: false,
    });
  });

  it('carries the source’s brand and barcode into the new item (ShoppingList.swift:74-78)', () => {
    const facts = { source: 'Open Food Facts', brand: 'Acme', barcode: '0123456789012' };
    expect(alternativeItem({ ...RESPONSE.alternatives[0], facts }, 'NEW')).toMatchObject({ brand: 'Acme', barcode: '0123456789012' });
  });
});
