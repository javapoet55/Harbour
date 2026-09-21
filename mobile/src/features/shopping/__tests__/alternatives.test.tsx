import { act, render, waitFor } from '@testing-library/react-native';

import { ApiError, createApiClient } from '../../../api/client';
import { shoppingApi, type GroceryItem, type GroceryList, type ShoppingAlternativesResponse } from '../../../api/shopping';
import { addedAlternative, alternativeId, alternativeItem, localAlternatives, replacedWithAlternative } from '../model';
import { createShoppingStore } from '../store';
import { useShoppingAlternatives, type UseShoppingAlternatives } from '../useAlternatives';

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

function list(items: GroceryItem[]): GroceryList {
  return { id: 'l1', title: 'Weekly', date: '2026-09-25', timeZone: 'UTC', weekly: true, revision: 4, completedAt: null, shareToken: null, items };
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

  it('falls back to the phone’s own list on any failure but a lost session', async () => {
    const store = harness(jest.fn(async () => Promise.reject(new ApiError({ status: 0, code: 'NETWORK', message: 'offline' }))));
    const answer = await store.getState().alternatives(item());
    expect(answer).toEqual(localAlternatives(item()));
    expect(answer.usedAI).toBe(false);
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

  it('has Swift’s offline fallback for chicken', () => {
    const answer = localAlternatives(item({ size: '' }));
    expect(answer.alternatives).toHaveLength(5);
    expect(answer.alternatives.map((alternative) => alternative.name)).toContain('Turkey breast');
    expect(answer.alternatives[0]).toEqual({
      name: 'Chicken breast (skinless)',
      category: 'Meat & Seafood',
      quantity: '1',
      size: 'lb',
      reason: 'Lower calorie option',
      detail: 'Lean cut with less saturated fat',
    });
    expect(answer.usedAI).toBe(false);
  });

  it('has Swift’s offline fallback for milk, keeping the item’s quantity and size', () => {
    const answer = localAlternatives(item({ name: 'Whole Milk', category: 'Dairy & Eggs', quantity: '2', size: 'gallon' }));
    expect(answer.alternatives.map((alternative) => alternative.name)).toEqual(['Low-fat milk', 'Lactose-free milk', 'Unsweetened oat milk', 'Unsweetened soy milk']);
    expect(answer.alternatives[0]).toMatchObject({ quantity: '2', size: 'gallon' });
    expect(answer.tip).toBe('Choose an unsweetened alternative when you want to avoid added sugar.');
  });

  it('otherwise offers organic, store-brand and family-size versions of the base name', () => {
    const answer = localAlternatives(item({ name: 'Organic Bread', category: 'Bakery', size: '' }));
    expect(answer.alternatives.map((alternative) => alternative.name)).toEqual(['Organic Bread', 'Store-brand Bread', 'Family-size Bread']);
    expect(answer.alternatives[2].size).toBe('large pack');
    expect(answer.tip).toBe('Compare unit prices and package sizes before replacing Bread.');
  });

  it('replaces in place, keeping the original’s id and checked state', () => {
    const before = list([item({ id: 'a', name: 'Eggs' }), item({ id: 'i1', checked: true }), item({ id: 'c', name: 'Rice' })]);
    const next = replacedWithAlternative(before, 'i1', RESPONSE.alternatives[0]);
    expect(next?.items.map((row) => row.id)).toEqual(['a', 'i1', 'c']);
    expect(next?.items[1]).toMatchObject({ id: 'i1', name: 'Turkey breast', notes: 'Mild flavor', checked: true });
    expect(before.items[1].name).toBe('Chicken breast');
  });

  it('does nothing when the original is gone', () => {
    expect(replacedWithAlternative(list([item({ id: 'a' })]), 'i1', RESPONSE.alternatives[0])).toBeNull();
  });

  it('adds to the cart as a new, unchecked item at the end', () => {
    const next = addedAlternative(list([item({ checked: true })]), RESPONSE.alternatives[1], 'NEW');
    expect(next.items.map((row) => row.id)).toEqual(['i1', 'NEW']);
    expect(next.items[1]).toMatchObject({ name: 'Salmon', checked: false, notes: 'Rich in omega-3 fatty acids' });
  });
});

describe('useShoppingAlternatives', () => {
  async function mount(options: { fetchAlternatives: jest.Mock; items?: GroceryItem[] }) {
    const save = jest.fn();
    const result: { current: UseShoppingAlternatives } = { current: null as unknown as UseShoppingAlternatives };
    const current = list(options.items ?? [item({ checked: true })]);
    function Probe() {
      result.current = useShoppingAlternatives({ list: current, original: current.items[0], save, fetchAlternatives: options.fetchAlternatives, uuid: () => 'NEW' });
      return null;
    }
    await render(<Probe />);
    await waitFor(() => expect(result.current).toBeTruthy());
    return { result, save };
  }

  it('loads once on appear and preselects the first alternative', async () => {
    const fetchAlternatives = jest.fn(async () => RESPONSE);
    const { result } = await mount({ fetchAlternatives });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchAlternatives).toHaveBeenCalledTimes(1);
    expect(result.current.result).toEqual(RESPONSE);
    expect(result.current.selectedId).toBe('Turkey breast|Meat & Seafood|1|lb');
    expect(result.current.selected?.name).toBe('Turkey breast');
  });

  it('replaces the original with the selection through save', async () => {
    const { result, save } = await mount({ fetchAlternatives: jest.fn(async () => RESPONSE) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.select(alternativeId(RESPONSE.alternatives[1])));
    let applied = false;
    await act(async () => {
      applied = result.current.replace();
    });
    expect(applied).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].items).toEqual([{ ...alternativeItem(RESPONSE.alternatives[1], 'i1'), checked: true }]);
  });

  it('adds the selection instead, as a new item', async () => {
    const { result, save } = await mount({ fetchAlternatives: jest.fn(async () => RESPONSE) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      result.current.addInstead();
    });
    expect(save.mock.calls[0][0].items.map((row: GroceryItem) => row.id)).toEqual(['i1', 'NEW']);
  });

  it('shows the error and applies nothing when loading fails, and can try again', async () => {
    const fetchAlternatives = jest.fn().mockRejectedValueOnce(new Error('Your session has expired.')).mockResolvedValueOnce(RESPONSE);
    const { result, save } = await mount({ fetchAlternatives });
    await waitFor(() => expect(result.current.error).toBe('Your session has expired.'));
    expect(result.current.replace()).toBe(false);
    expect(result.current.addInstead()).toBe(false);
    expect(save).not.toHaveBeenCalled();
    await act(async () => result.current.load());
    expect(result.current.error).toBeNull();
    expect(result.current.selected?.name).toBe('Turkey breast');
  });
});
