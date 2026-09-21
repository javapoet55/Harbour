import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Share } from 'react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: (...args: unknown[]) => mockBack(...args) },
  useLocalSearchParams: () => mockParams,
  Stack: {
    Screen: ({ options }: { options?: { headerLeft?: () => unknown; headerRight?: () => unknown } }) => {
      const { View } = jest.requireActual('react-native');
      const React = jest.requireActual('react');
      return React.createElement(View, null, options?.headerLeft?.() ?? null, options?.headerRight?.() ?? null);
    },
  },
}));

const mockPost = jest.fn();
const mockLists = jest.fn();
jest.mock('../../../api/shopping', () => ({
  ...jest.requireActual('../../../api/shopping'),
  shoppingApi: {
    lists: (...args: unknown[]) => mockLists(...args),
    post: (...args: unknown[]) => mockPost(...args),
    image: jest.fn(),
    transcriptionSession: jest.fn(),
  },
  shareUrl: (token: string) => `https://api.example.com/shared/shopping/${token}`,
}));

import * as Crypto from 'expo-crypto';

import type { GroceryItem, GroceryList } from '../../../api/shopping';
import { ApiError } from '../../../api/client';
import { shoppingStore } from '../store';
import MyLists from '../../../../app/(tabs)/(today)/shopping/index';
import Detail from '../../../../app/(tabs)/(today)/shopping/[id]';

const mockedCrypto = Crypto as unknown as Record<string, jest.Mock>;

function item(overrides: Partial<GroceryItem> = {}): GroceryItem {
  return { id: 'milk', name: 'Parity milk', category: 'Dairy & Eggs', quantity: '2', size: 'bottles', notes: '', imageData: null, checked: false, ...overrides };
}

function list(overrides: Partial<GroceryList> = {}): GroceryList {
  return {
    id: 'l1',
    title: 'Parity Shopping List',
    date: '2026-09-25',
    timeZone: 'UTC',
    weekly: true,
    revision: 7,
    completedAt: null,
    shareToken: null,
    items: [item(), item({ id: 'banana', name: 'bananas', category: 'Produce', quantity: '6', size: '' })],
    ...overrides,
  };
}

function load(lists: GroceryList[]) {
  mockLists.mockResolvedValue({ lists });
  shoppingStore.setState({ lists, busy: false, error: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe('My Lists', () => {
  it('shows Create New List and the recent lists, and opens one', async () => {
    load([list(), list({ id: 'l2', title: 'Costco Shopping List', completedAt: '2026-09-18T10:00:00Z' })]);
    await render(<MyLists />);
    expect(screen.getByText('Create New List')).toBeTruthy();
    expect(screen.getByText('Recent Lists')).toBeTruthy();
    expect(screen.getByText('2 items')).toBeTruthy();
    expect(screen.getByText('2 items · Completed')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('shopping-list-l2'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/shopping/[id]', params: { id: 'l2' } });
  });

  it('shows the empty state that had no capture', async () => {
    load([]);
    await render(<MyLists />);
    expect(screen.getByText('Your next trip starts here')).toBeTruthy();
    expect(screen.getByText('Create a list, then type or dictate what you need.')).toBeTruthy();
  });

  it('creates a list with Save disabled while the name is empty, then opens it', async () => {
    load([list({ completedAt: '2026-09-18T10:00:00Z', items: [item({ checked: true })] })]);
    const created = list({ id: 'new', title: 'Weekly Shopping List', revision: 0 });
    mockPost.mockResolvedValueOnce({ list: created });
    await render(<MyLists />);
    await fireEvent.press(screen.getByTestId('shopping-create-list'));
    expect(screen.getByText('Copy 1 items from “Parity Shopping List” and edit.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('shopping-list-name'), '  ');
    expect(screen.getByTestId('shopping-create').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('shopping-list-name'), 'Weekly Shopping List');
    await fireEvent.press(screen.getByTestId('shopping-use-last'));
    await fireEvent.press(screen.getByTestId('shopping-create'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ pathname: '/shopping/[id]', params: { id: 'new' } }));
    const envelope = mockPost.mock.calls[0][0];
    expect(envelope.operation).toBe('create');
    expect(envelope.id).toBeUndefined();
    expect(envelope.input.items).toEqual([expect.objectContaining({ name: 'Parity milk', checked: false })]);
  });

  // ShoppingViews.swift:171 — says what completing a trip actually does to next week's list.
  it('explains that completing a trip copies every item, unchecked', async () => {
    load([]);
    await render(<MyLists />);
    await fireEvent.press(screen.getByTestId('shopping-create-list'));
    expect(screen.getByText('Complete a trip to copy all items into next week’s list, with every item unchecked.')).toBeTruthy();
  });

  // `@State private var createKey` (ShoppingViews.swift:152): the server collapses a replayed
  // create by this key, so a retry after a failure must not create a second list.
  it('retries a failed create with the same idempotency key, and mints a new one after success', async () => {
    let nth = 0;
    mockedCrypto.randomUUID.mockImplementation(() => `00000000-0000-4000-8000-${String(++nth).padStart(12, '0')}`);
    const created = list({ id: 'new', title: 'Weekly Shopping List', revision: 0 });
    load([]);
    await render(<MyLists />);
    await fireEvent.press(screen.getByTestId('shopping-create-list'));

    mockPost.mockRejectedValueOnce(new Error('offline'));
    await fireEvent.press(screen.getByTestId('shopping-create'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));

    mockPost.mockResolvedValueOnce({ list: created });
    await fireEvent.press(screen.getByTestId('shopping-create'));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());

    // The replay repeats the failed attempt, so it carries that attempt's key.
    const firstKey = mockPost.mock.calls[0][0].idempotencyKey;
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(mockPost.mock.calls[1][0].idempotencyKey).toBe(firstKey);

    // A completed create must not have its key reused by the next one.
    await fireEvent.press(screen.getByTestId('shopping-create-list'));
    mockPost.mockResolvedValueOnce({ list: created });
    await fireEvent.press(screen.getByTestId('shopping-create'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(3));
    expect(mockPost.mock.calls[2][0].idempotencyKey).not.toBe(firstKey);
  });
});

describe('List detail', () => {
  // ShoppingViews.swift:326 — the link belongs to this trip, not to next week's list.
  it('explains that a share link does not follow next week’s list', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    await render(<Detail />);
    await fireEvent.press(screen.getByTestId('list-share'));
    expect(
      screen.getByText(
        'Anyone with the link can view this list and its edits. The link stays with this trip; next week’s list needs a new link. Revoke it whenever you like.',
      ),
    ).toBeTruthy();
  });

  it('shows the redesigned header, chips, rows with their amount line, and no progress bar or hint', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    await render(<Detail />);
    // "N added · M items" (ShoppingViews.swift:233-234): N is the CHECKED count.
    expect(screen.getByTestId('list-counts').props.children).toBe('0 added · 2 items');
    expect(screen.getByText('All (2)')).toBeTruthy();
    expect(screen.getByText('Produce (1)')).toBeTruthy();
    expect(screen.getByText('Dairy (1)')).toBeTruthy();
    expect(screen.getByTestId('grocery-amount-milk').props.children).toBe('2 bottles');
    expect(screen.getByTestId('grocery-artwork-milk', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('grocery-artwork-banana', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByLabelText('Show alternatives for Parity milk')).toBeTruthy();
    expect(screen.getByTestId('shopping-quick-add').props.placeholder).toBe('Add an item (e.g. eggs, milk, bread)');
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText('Try “2 bottles of milk 1 gallon” or tap the mic.')).toBeNull();
    expect(screen.queryByText('Produce')).toBeNull();
    expect(screen.getByTestId('shopping-complete-trip')).toBeTruthy();
    expect(screen.getByTestId('shopping-ai-recommendations')).toBeTruthy();
  });

  it('starts each row separator under the first Text, as iOS does: the emoji, or else the name', async () => {
    load([list({ items: [item({ id: 'bread', name: 'loaf bread', category: 'Bakery', quantity: '1', size: '' }), item(), item({ id: 'last', name: 'rice', category: 'Pantry' })] })]);
    mockParams = { id: 'l1' };
    await render(<Detail />);
    expect(screen.getByTestId('grocery-separator-bread')).toHaveStyle({ left: 52 });
    expect(screen.getByTestId('grocery-separator-milk')).toHaveStyle({ left: 100 });
    expect(screen.queryByTestId('grocery-separator-last')).toBeNull();
  });

  it('filters by category chip and falls back to All when the chip’s last item is deleted', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    mockPost.mockImplementation(async (envelope) => ({ list: { ...list({ revision: 8 }), items: envelope.input.items } }));
    await render(<Detail />);
    await fireEvent.press(screen.getByTestId('chip-Produce'));
    expect(screen.getByTestId('chip-Produce').props.accessibilityState.selected).toBe(true);
    expect(screen.queryByText('Parity milk')).toBeNull();
    expect(screen.getByText('bananas')).toBeTruthy();
    // The swipe action, as a screen reader reaches it.
    await fireEvent(screen.getByTestId('grocery-row-banana'), 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    await waitFor(() => expect(screen.getByText('Parity milk')).toBeTruthy());
    expect(screen.getByTestId('chip-All').props.accessibilityState.selected).toBe(true);
    expect(mockPost.mock.calls[0][0].input.items.map((value: GroceryItem) => value.id)).toEqual(['milk']);
  });

  it('checking an item saves against the list’s revision and shows the saved list', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    mockPost.mockImplementation(async (envelope) => ({ list: { ...list({ revision: 8 }), items: envelope.input.items } }));
    await render(<Detail />);
    await fireEvent.press(screen.getByTestId('grocery-check-milk'));
    await waitFor(() => expect(screen.getByTestId('list-counts').props.children).toBe('1 added · 2 items'));
    const envelope = mockPost.mock.calls[0][0];
    expect(envelope).toMatchObject({ operation: 'save', id: 'l1', revision: 7 });
    expect(envelope.input.items.find((value: GroceryItem) => value.id === 'milk').checked).toBe(true);
  });

  it('keeps local edits after a 409 and offers Retry Save and Discard', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    mockPost.mockRejectedValueOnce(new ApiError({ status: 409, message: 'This list changed on another device. Refresh before saving.' }));
    await render(<Detail />);
    await fireEvent.press(screen.getByTestId('grocery-check-milk'));
    await waitFor(() => expect(screen.getByTestId('list-error').props.children).toBe('This list changed on another device. Refresh before saving.'));
    expect(screen.getByTestId('list-counts').props.children).toBe('1 added · 2 items');
    expect(screen.getByTestId('list-retry')).toBeTruthy();
    mockLists.mockResolvedValueOnce({ lists: [list({ revision: 9, items: [item()] })] });
    await fireEvent.press(screen.getByTestId('list-reload'));
    await waitFor(() => expect(screen.getByTestId('list-counts').props.children).toBe('0 added · 1 items'));
    expect(screen.queryByTestId('list-error')).toBeNull();
  });

  it('quick-add parses on the server and appends straight to the list — no Review Items', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    mockPost.mockImplementation(async (envelope) =>
      envelope.operation === 'parse'
        ? { items: [{ id: 'p1', name: 'eggs', category: 'Dairy & Eggs', quantity: '1', size: 'dozen', notes: '', checked: false }] }
        : { list: { ...list({ revision: 8 }), items: envelope.input.items } },
    );
    await render(<Detail />);
    await fireEvent.changeText(screen.getByTestId('shopping-quick-add'), 'ch');
    expect(screen.getByText('Cheese')).toBeTruthy();
    expect(screen.getByText('Cherry Tomatoes')).toBeTruthy();
    expect(screen.getByLabelText('Add typed items')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('shopping-quick-add'), '  a dozen eggs ');
    await fireEvent.press(screen.getByTestId('quick-add-plus'));
    await waitFor(() => expect(screen.getByTestId('list-counts').props.children).toBe('0 added · 3 items'));
    expect(mockPost).toHaveBeenCalledWith({ operation: 'parse', input: { text: 'a dozen eggs' } });
    expect(screen.queryByText('Review Items')).toBeNull();
    expect(screen.getByTestId('shopping-quick-add').props.value).toBe('');
    const save = mockPost.mock.calls.find(([envelope]) => envelope.operation === 'save')[0];
    expect(save.input.items.map((value: GroceryItem) => value.name)).toEqual(['Parity milk', 'bananas', 'eggs']);
  });

  it('a suggestion is parsed and added at once', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    mockPost.mockImplementation(async (envelope) =>
      envelope.operation === 'parse'
        ? { items: [{ id: 'c1', name: 'Cheese', category: 'Dairy & Eggs', quantity: '1', size: '', notes: '', checked: false }] }
        : { list: { ...list({ revision: 8 }), items: envelope.input.items } },
    );
    await render(<Detail />);
    await fireEvent.changeText(screen.getByTestId('shopping-quick-add'), 'che');
    await fireEvent.press(screen.getByTestId('suggestion-Cheese'));
    await waitFor(() => expect(screen.getByTestId('list-counts').props.children).toBe('0 added · 3 items'));
    expect(mockPost).toHaveBeenCalledWith({ operation: 'parse', input: { text: 'Cheese' } });
  });

  it('says so when the server finds nothing to add, and drops blank names', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    mockPost.mockResolvedValueOnce({ items: [{ id: 'b', name: '  ', category: 'Other', quantity: '1', size: '', notes: '', checked: false }] });
    await render(<Detail />);
    await fireEvent.changeText(screen.getByTestId('shopping-quick-add'), 'zzz');
    await fireEvent(screen.getByTestId('shopping-quick-add'), 'submitEditing');
    await waitFor(() => expect(screen.getByTestId('list-error').props.children).toBe('No items found. Type an item and try again.'));
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('shopping-quick-add').props.value).toBe('zzz');
  });

  it('"+" focuses the empty field and the mic is a separate target', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    await render(<Detail />);
    expect(screen.getByTestId('quick-add-plus').props.accessibilityLabel).toBe('Focus add item field');
    await fireEvent.press(screen.getByTestId('quick-add-plus'));
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('quick-add-mic'));
    expect(screen.getByText('Tell me what to add')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('hands the voice transcript to parse and adds the reviewed items', async () => {
    load([list({ items: [] })]);
    mockParams = { id: 'l1' };
    mockPost.mockImplementation(async (envelope) =>
      envelope.operation === 'parse'
        ? { items: [{ id: 'v1', name: 'bananas', category: 'Produce', quantity: '6', size: '', notes: '', checked: false }] }
        : { list: { ...list({ revision: 8 }), items: envelope.input.items } },
    );
    await render(<Detail />);
    expect(screen.getByText('Nothing on the list yet')).toBeTruthy();
    expect(screen.getByText('Add items above or dictate a few groceries.')).toBeTruthy();
    expect(screen.queryByTestId('category-chips')).toBeNull();
    await fireEvent.press(screen.getByTestId('quick-add-mic'));
    expect(screen.getByTestId('voice-status').props.children).toBe('Ready when you are');
    expect(screen.getByTestId('voice-review').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('voice-transcript'), 'six bananas');
    await fireEvent.press(screen.getByTestId('voice-review'));
    await waitFor(() => expect(screen.getByText('Review your items')).toBeTruthy());
    expect(mockPost).toHaveBeenCalledWith({ operation: 'parse', input: { text: 'six bananas' } });
    await fireEvent.press(screen.getByTestId('voice-add'));
    await waitFor(() => expect(screen.getByTestId('list-counts').props.children).toBe('0 added · 1 items'));
  });

  it('keeps Uncheck all in the ⋯ menu and has no Edit or reorder', async () => {
    load([list({ items: [item({ checked: true })] })]);
    mockParams = { id: 'l1' };
    mockPost.mockImplementation(async (envelope) => ({ list: { ...list({ revision: 8 }), items: envelope.input.items } }));
    await render(<Detail />);
    await fireEvent.press(screen.getByTestId('list-options'));
    expect(screen.getAllByRole('button').map((node) => node.props.testID).filter((id: string | undefined) => id?.startsWith('list-menu-'))).toEqual([
      'list-menu-settings',
      'list-menu-copy',
      'list-menu-uncheck',
      'list-menu-delete',
    ]);
    expect(screen.queryByText('Edit')).toBeNull();
    await fireEvent.press(screen.getByTestId('list-menu-uncheck'));
    await waitFor(() => expect(screen.getByTestId('list-counts').props.children).toBe('0 added · 1 items'));
  });

  it('completes with items left: asks, then shows the completion screen for next week’s list', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPost.mockResolvedValueOnce({ list: list({ id: 'next', date: '2026-10-02', revision: 0, items: [item({ checked: false })] }) });
    await render(<Detail />);
    await fireEvent.press(screen.getByTestId('shopping-complete-trip'));
    const [title, message, buttons] = alert.mock.calls[0] as [string, string, { text: string; onPress?: () => void }[]];
    expect(title).toBe('Complete with 2 items remaining?');
    expect(message).toBe('The unchecked items will remain in your shopping history.');
    await act(async () => {
      buttons.find((button) => button.text === 'Complete Shopping')?.onPress?.();
    });
    await waitFor(() => expect(screen.getByTestId('shopping-completion')).toBeTruthy());
    expect(mockPost.mock.calls[0][0]).toMatchObject({ operation: 'complete', id: 'l1', revision: 7 });
    expect(screen.getByText('Great job for saving a branch on a tree!')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByTestId('completion-list-name').props.children).toBe('Parity Shopping List');
    expect(screen.getByTestId('metric-purchased')).toHaveTextContent('0Purchased');
    expect(screen.getByTestId('metric-total')).toHaveTextContent('2Total items');
    expect(screen.getByTestId('metric-saved')).toHaveTextContent('2Saved');
    expect(screen.getByText('Your unchecked items are safely kept in this list.')).toBeTruthy();
    expect(screen.getByText('View Next Shopping List')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('shopping-completion-use-again'));
    expect(screen.queryByTestId('shopping-completion')).toBeNull();
    expect(screen.getByTestId('list-counts').props.children).toBe('0 added · 1 items');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('completes an all-checked list without asking; Use This List Again opens Copy list', async () => {
    const done = list({ weekly: false, items: [item({ checked: true })] });
    load([done]);
    mockParams = { id: 'l1' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPost.mockResolvedValue({ list: { ...done, completedAt: '2026-09-21T10:00:00Z', revision: 8 } });
    await render(<Detail />);
    await fireEvent.press(screen.getByTestId('shopping-complete-trip'));
    await waitFor(() => expect(screen.getByTestId('shopping-completion')).toBeTruthy());
    expect(alert).not.toHaveBeenCalled();
    expect(screen.queryByTestId('metric-saved')).toBeNull();
    expect(screen.getByText('Everything on your list is taken care of.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('shopping-completion-use-again'));
    await waitFor(() => expect(screen.getByTestId('new-list-sheet')).toBeTruthy());
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('Done on the completion screen closes the list', async () => {
    const done = list({ weekly: false, items: [item({ checked: true })] });
    load([done]);
    mockParams = { id: 'l1' };
    mockPost.mockResolvedValue({ list: { ...done, completedAt: '2026-09-21T10:00:00Z', revision: 8 } });
    await render(<Detail />);
    await fireEvent.press(screen.getByTestId('shopping-complete-trip'));
    await waitFor(() => expect(screen.getByTestId('shopping-completion-done')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('shopping-completion-done'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('keeps a completed list editable, and saving it creates a new list', async () => {
    load([list({ completedAt: '2026-09-18T10:00:00Z' })]);
    mockParams = { id: 'l1' };
    mockPost.mockImplementation(async (envelope) => ({ list: { ...list({ id: 'NEW-LIST-ID', revision: 1 }), items: envelope.input.items } }));
    await render(<Detail />);
    expect(screen.getByTestId('shopping-quick-add')).toBeTruthy();
    expect(screen.getByTestId('grocery-check-milk').props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(screen.getByTestId('list-options'));
    expect(screen.queryByTestId('list-menu-uncheck')).toBeNull();
    expect(screen.getByTestId('list-menu-settings').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('list-menu-copy'));
    await fireEvent.press(screen.getByTestId('new-list-cancel'));
    await fireEvent.press(screen.getByTestId('grocery-check-milk'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const envelope = mockPost.mock.calls[0][0];
    expect(envelope.operation).toBe('create');
    expect(envelope.id).toBeUndefined();
    // `working.id = UUID().uuidString` — a fresh, uppercase id — doubles as the idempotency key.
    expect(envelope.idempotencyKey).toBe(String(envelope.idempotencyKey).toUpperCase());
    expect(envelope.idempotencyKey).not.toBe('l1');
    expect(envelope.input).not.toHaveProperty('completedAt');
    expect(envelope.input.items.find((value: GroceryItem) => value.id === 'milk').checked).toBe(true);
  });

  it('turning live transcription off disables the mic', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    await render(<Detail />);
    await fireEvent.press(screen.getByTestId('quick-add-mic'));
    await fireEvent(screen.getByTestId('voice-consent'), 'valueChange', false);
    expect(screen.getByTestId('voice-status').props.children).toBe('Enable live transcription below to start');
    expect(screen.getByTestId('voice-mic').props.accessibilityState.disabled).toBe(true);
  });

  it('creates, shares and revokes the view-only link, and shares the list as text', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    mockPost.mockResolvedValueOnce({ list: list({ shareToken: 'tok' }) }).mockResolvedValueOnce({ list: list({ shareToken: null }) });
    await render(<Detail />);
    await fireEvent.press(screen.getByTestId('list-share'));
    await fireEvent.press(screen.getByTestId('share-text'));
    expect(share).toHaveBeenLastCalledWith({ message: 'Parity Shopping List\n2026-09-25\n○ Parity milk — 2 bottles\n○ bananas — 6 ' });
    await fireEvent.press(screen.getByTestId('share-create'));
    await waitFor(() => expect(screen.getByTestId('share-link')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('share-link'));
    expect(share).toHaveBeenLastCalledWith({ message: 'https://api.example.com/shared/shopping/tok' });
    await fireEvent.press(screen.getByTestId('share-revoke'));
    await waitFor(() => expect(screen.getByTestId('share-create')).toBeTruthy());
    expect(mockPost.mock.calls.map(([envelope]) => envelope.operation)).toEqual(['share', 'revoke']);
  });

  it('edits an item: Save is disabled while the name is empty', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    mockPost.mockImplementation(async (envelope) => ({ list: { ...list({ revision: 8 }), items: envelope.input.items } }));
    await render(<Detail />);
    await fireEvent.press(screen.getByTestId('grocery-edit-milk'));
    expect(screen.getByText('Item')).toBeTruthy();
    expect(screen.getByTestId('item-generate').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('item-name'), ' ');
    expect(screen.getByTestId('item-save').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('item-name'), 'Oat milk');
    await fireEvent.press(screen.getByTestId('item-save'));
    await waitFor(() => expect(screen.getByText('Oat milk')).toBeTruthy());
  });

  it('confirms before deleting and leaves the list', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPost.mockResolvedValueOnce({ ok: true });
    await render(<Detail />);
    await fireEvent.press(screen.getByTestId('list-options'));
    await fireEvent.press(screen.getByTestId('list-menu-delete'));
    const [title, , buttons] = alert.mock.calls[0] as [string, undefined, { text: string; onPress?: () => void }[]];
    expect(title).toBe('Delete this list?');
    await act(async () => {
      buttons.find((button) => button.text === 'Delete list')?.onPress?.();
    });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});
