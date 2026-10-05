import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, AppState, Platform, Share } from 'react-native';

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
const mockAlternatives = jest.fn();
jest.mock('../../../api/shopping', () => ({
  ...jest.requireActual('../../../api/shopping'),
  shoppingApi: {
    lists: (...args: unknown[]) => mockLists(...args),
    post: (...args: unknown[]) => mockPost(...args),
    alternatives: (...args: unknown[]) => mockAlternatives(...args),
    image: jest.fn(),
    transcriptionSession: jest.fn(),
  },
  shareUrl: (token: string) => `https://api.example.com/shared/shopping/${token}`,
  shoppingOffersApi: { offers: (...args: unknown[]) => mockOffers(...args), choose: jest.fn(), storeHours: (...args: unknown[]) => mockHours(...args) },
  shoppingStoresApi: { search: jest.fn(), brand: jest.fn(async () => ({ brand: { displayName: '', logoUrl: null } })), recognize: jest.fn(), recommendations: jest.fn() },
}));
const mockOffers = jest.fn();
const mockHours = jest.fn();

function DetailWithQueries() {
  const [client] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }));
  return (
    <QueryClientProvider client={client}>
      <Detail />
    </QueryClientProvider>
  );
}

import * as Crypto from 'expo-crypto';

import type { GroceryItem, GroceryList } from '../../../api/shopping';
import { ApiError } from '../../../api/client';
import { shoppingStore } from '../store';
import { shoppingApi } from '../../../api/shopping';
import { VOICE_MESSAGES } from '../voice';
import { CONSENT_KEY, useTranscriptionConsent } from '../device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MyLists from '../../../../app/wellness/shopping/index';
import Detail from '../../../../app/wellness/shopping/[id]';

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
    load([list(), list({ id: 'l2', title: 'Costco Shopping List', completedAt: '2026-09-18T10:00:00Z', items: [item()] })]);
    await render(<MyLists />);
    // `.navigationTitle("My Lists")` is a large title, drawn as content (`shopping-lists-v2`).
    expect(screen.getByRole('header', { name: 'My Lists' })).toBeTruthy();
    expect(screen.getByText('Create New List')).toBeTruthy();
    expect(screen.getByText('Recent Lists')).toBeTruthy();
    expect(screen.getByText('2 items')).toBeTruthy();
    expect(screen.getByText('1 item · Completed')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('shopping-list-l2'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/wellness/shopping/[id]', params: { id: 'l2' } });
  });

  it('shows the empty state that had no capture', async () => {
    load([]);
    await render(<MyLists />);
    expect(screen.getByText('Your next trip starts here')).toBeTruthy();
    expect(screen.getByText('Create a list, then type or dictate what you need.')).toBeTruthy();
  });

  it('creates a list with Save disabled while the name is empty, then opens it on List Settings', async () => {
    load([list({ completedAt: '2026-09-18T10:00:00Z', items: [item({ checked: true })] })]);
    const created = list({ id: 'new', title: 'Weekly Shopping List', revision: 0 });
    mockPost.mockResolvedValueOnce({ list: created });
    await render(<MyLists />);
    await fireEvent.press(screen.getByTestId('shopping-create-list'));
    expect(screen.getByText('Copy 1 item from “Parity Shopping List” and edit.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('shopping-list-name'), '  ');
    expect(screen.getByTestId('shopping-create').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('shopping-list-name'), 'Weekly Shopping List');
    await fireEvent.press(screen.getByTestId('shopping-use-last'));
    await fireEvent.press(screen.getByTestId('shopping-create'));
    // `ShoppingDetail(…, openSettings: true)` (ShoppingViews.swift:132).
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ pathname: '/wellness/shopping/[id]', params: { id: 'new', settings: '1' } }));
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
    await render(<DetailWithQueries />);
    await fireEvent.press(screen.getByTestId('list-options'));
    await fireEvent.press(screen.getByTestId('list-menu-share'));
    expect(screen.getByText('2 items')).toBeTruthy();
    expect(
      screen.getByText(
        'Anyone with the link can view this list and its edits. The link stays with this trip; next week’s list needs a new link. Revoke it whenever you like.',
      ),
    ).toBeTruthy();
  });

  it('shows the redesigned header, chips, rows with their amount line, and no progress bar or hint', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    await render(<DetailWithQueries />);
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
    await render(<DetailWithQueries />);
    expect(screen.getByTestId('grocery-separator-bread')).toHaveStyle({ left: 52 });
    expect(screen.getByTestId('grocery-separator-milk')).toHaveStyle({ left: 100 });
    expect(screen.queryByTestId('grocery-separator-last')).toBeNull();
  });

  it('filters by category chip and falls back to All when the chip’s last item is deleted', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    mockPost.mockImplementation(async (envelope) => ({ list: { ...list({ revision: 8 }), items: envelope.input.items } }));
    await render(<DetailWithQueries />);
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
    await render(<DetailWithQueries />);
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
    await render(<DetailWithQueries />);
    await fireEvent.press(screen.getByTestId('grocery-check-milk'));
    await waitFor(() => expect(screen.getByTestId('list-error').props.children).toBe('This list changed on another device. Refresh before saving.'));
    expect(screen.getByTestId('list-counts').props.children).toBe('1 added · 2 items');
    expect(screen.getByTestId('list-retry')).toBeTruthy();
    mockLists.mockResolvedValueOnce({ lists: [list({ revision: 9, items: [item()] })] });
    await fireEvent.press(screen.getByTestId('list-reload'));
    await waitFor(() => expect(screen.getByTestId('list-counts').props.children).toBe('0 added · 1 item'));
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
    await render(<DetailWithQueries />);
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
    await render(<DetailWithQueries />);
    await fireEvent.changeText(screen.getByTestId('shopping-quick-add'), 'che');
    await fireEvent.press(screen.getByTestId('suggestion-Cheese'));
    await waitFor(() => expect(screen.getByTestId('list-counts').props.children).toBe('0 added · 3 items'));
    expect(mockPost).toHaveBeenCalledWith({ operation: 'parse', input: { text: 'Cheese' } });
  });

  it('says so when the server finds nothing to add, and drops blank names', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    mockPost.mockResolvedValueOnce({ items: [{ id: 'b', name: '  ', category: 'Other', quantity: '1', size: '', notes: '', checked: false }] });
    await render(<DetailWithQueries />);
    await fireEvent.changeText(screen.getByTestId('shopping-quick-add'), 'zzz');
    await fireEvent(screen.getByTestId('shopping-quick-add'), 'submitEditing');
    await waitFor(() => expect(screen.getByTestId('list-error').props.children).toBe('No items found. Type an item and try again.'));
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('shopping-quick-add').props.value).toBe('zzz');
  });

  it('"+" focuses the empty field and the mic is a separate target', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    await render(<DetailWithQueries />);
    expect(screen.getByTestId('quick-add-plus').props.accessibilityLabel).toBe('Focus add item field');
    await fireEvent.press(screen.getByTestId('quick-add-plus'));
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('quick-add-mic'));
    expect(screen.getByText('Tell me what to add')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('voice adds the parsed items straight to the list and closes — no review step (ShoppingVoice.swift:112-120)', async () => {
    load([list({ items: [] })]);
    mockParams = { id: 'l1' };
    mockPost.mockImplementation(async (envelope) =>
      envelope.operation === 'parse'
        ? {
            items: [
              { id: 'v1', name: 'bananas', category: 'Produce', quantity: '6', size: '', notes: '', checked: false },
              { id: 'v2', name: '  ', category: 'Other', quantity: '1', size: '', notes: '', checked: false },
            ],
          }
        : { list: { ...list({ revision: 8 }), items: envelope.input.items } },
    );
    await render(<DetailWithQueries />);
    expect(screen.getByText('Nothing on the list yet')).toBeTruthy();
    expect(screen.getByText('Add items above or dictate a few groceries.')).toBeTruthy();
    expect(screen.queryByTestId('category-chips')).toBeNull();
    await fireEvent.press(screen.getByTestId('quick-add-mic'));
    expect(screen.getByTestId('voice-status').props.children).toBe('Tap Mic and Talk');
    expect(screen.getByText('Tap the mic to transcribe in English. Audio is sent only while listening. Nexdo organizes your words into grocery items before adding them.')).toBeTruthy();
    expect(screen.getByText('Add to List')).toBeTruthy();
    expect(screen.getByTestId('voice-add').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('voice-transcript'), 'six bananas');
    await fireEvent.press(screen.getByTestId('voice-add'));
    await waitFor(() => expect(screen.getByTestId('list-counts').props.children).toBe('0 added · 1 item'));
    expect(mockPost).toHaveBeenCalledWith({ operation: 'parse', input: { text: 'six bananas' } });
    expect(screen.queryByText('Review your items')).toBeNull();
    expect(screen.queryByTestId('shopping-voice')).toBeNull();
    // The same save quick add makes: appended to the list against its revision, blank names dropped.
    const save = mockPost.mock.calls.find(([envelope]) => envelope.operation === 'save')[0];
    expect(save).toMatchObject({ operation: 'save', id: 'l1', revision: 7 });
    expect(save.input.items.map((value: GroceryItem) => value.name)).toEqual(['bananas']);
  });

  it('voice keeps the sheet open with Swift’s message when nothing is found, and on a failed parse', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    mockPost
      .mockResolvedValueOnce({ items: [{ id: 'b', name: ' ', category: 'Other', quantity: '1', size: '', notes: '', checked: false }] })
      .mockRejectedValueOnce(new ApiError({ status: 500, message: 'The server is busy.' }));
    await render(<DetailWithQueries />);
    await fireEvent.press(screen.getByTestId('quick-add-mic'));
    await fireEvent.changeText(screen.getByTestId('voice-transcript'), 'hmm');
    await fireEvent.press(screen.getByTestId('voice-add'));
    await waitFor(() => expect(screen.getByTestId('voice-error').props.children).toBe('No items found. Type or dictate an item.'));
    expect(screen.getByTestId('voice-add').props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(screen.getByTestId('voice-add'));
    await waitFor(() => expect(screen.getByTestId('voice-error').props.children).toBe('The server is busy.'));
    expect(screen.getByTestId('shopping-voice')).toBeTruthy();
    expect(mockPost.mock.calls.every(([envelope]) => envelope.operation === 'parse')).toBe(true);
    expect(screen.getByTestId('list-counts').props.children).toBe('0 added · 2 items');
  });

  it('AI Powered Recommendations opens Ask with this list as its context', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    // The app's root provides React Query to every screen; Ask needs it for its request.
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <Detail />
      </QueryClientProvider>,
    );
    expect(screen.queryByText('Shopping Recommendations')).toBeNull();
    await fireEvent.press(screen.getByTestId('shopping-ai-recommendations'));
    expect(screen.getByText('Shopping Recommendations')).toBeTruthy();
    expect(screen.getByTestId('shopping-recommendations-list').props.children).toBe('Parity Shopping List');
    await fireEvent.press(screen.getByTestId('ask-close'));
    expect(screen.queryByText('Shopping Recommendations')).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
  });

  /** The ⋯ menu (ShoppingViews.swift:342-352): Share first, then Select All / Unselect All for an open list. */
  it('has Share, Select All and Unselect All in the ⋯ menu, each off when it would change nothing', async () => {
    load([list({ items: [item({ checked: true })] })]);
    mockParams = { id: 'l1' };
    mockPost.mockImplementation(async (envelope) => ({ list: { ...list({ revision: 8 }), items: envelope.input.items } }));
    await render(<DetailWithQueries />);
    expect(screen.queryByTestId('list-share')).toBeNull();
    await fireEvent.press(screen.getByTestId('list-options'));
    expect(screen.getAllByRole('button').map((node) => node.props.testID).filter((id: string | undefined) => id?.startsWith('list-menu-'))).toEqual([
      'list-menu-share',
      'list-menu-settings',
      'list-menu-copy',
      'list-menu-select-all',
      'list-menu-unselect-all',
      'list-menu-delete',
    ]);
    expect(screen.getByTestId('list-menu-select-all').props.accessibilityState.disabled).toBe(true);
    // `Label("Share list", systemImage: "square.and.arrow.up")`: the only item with a glyph.
    const glyphs = (node: { props: { name?: string }; children: unknown[] }): string[] => [
      ...(node.props.name ? [node.props.name] : []),
      ...node.children.flatMap((child) => (typeof child === 'object' && child ? glyphs(child as typeof node) : [])),
    ];
    expect(glyphs(screen.getByTestId('list-menu-share') as never)).toEqual(['share-outline']);
    expect(glyphs(screen.getByTestId('list-menu-copy') as never)).toEqual([]);
    expect(screen.queryByText('Edit')).toBeNull();
    await fireEvent.press(screen.getByTestId('list-menu-unselect-all'));
    await waitFor(() => expect(screen.getByTestId('list-counts').props.children).toBe('0 added · 1 item'));
    await fireEvent.press(screen.getByTestId('list-options'));
    expect(screen.getByTestId('list-menu-unselect-all').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('list-menu-select-all'));
    await waitFor(() => expect(screen.getByTestId('list-counts').props.children).toBe('1 added · 1 item'));
  });

  it('asks with the singular when one item is left', async () => {
    load([list({ items: [item(), item({ id: 'banana', name: 'bananas', checked: true })] })]);
    mockParams = { id: 'l1' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<DetailWithQueries />);
    expect(screen.getByTestId('list-counts').props.children).toBe('1 added · 2 items');
    await fireEvent.press(screen.getByTestId('shopping-complete-trip'));
    expect(alert.mock.calls[0][0]).toBe('Complete with 1 item remaining?');
    alert.mockRestore();
  });

  it('completes with items left: asks, then shows the completion screen for next week’s list', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPost.mockResolvedValueOnce({ list: list({ id: 'next', date: '2026-10-02', revision: 0, items: [item({ checked: false })] }) });
    await render(<DetailWithQueries />);
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
    expect(screen.getByTestId('list-counts').props.children).toBe('0 added · 1 item');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('completes an all-checked list without asking; Use This List Again opens Copy list', async () => {
    const done = list({ weekly: false, items: [item({ checked: true })] });
    load([done]);
    mockParams = { id: 'l1' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPost.mockResolvedValue({ list: { ...done, completedAt: '2026-09-21T10:00:00Z', revision: 8 } });
    await render(<DetailWithQueries />);
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
    await render(<DetailWithQueries />);
    await fireEvent.press(screen.getByTestId('shopping-complete-trip'));
    await waitFor(() => expect(screen.getByTestId('shopping-completion-done')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('shopping-completion-done'));
    expect(mockBack).toHaveBeenCalled();
  });

  /** `readOnly` (ShoppingViews.swift:233): a completed list's rows, settings and shortcuts are off. */
  it('keeps a completed list read-only, and a typed item still saves as a new list', async () => {
    load([list({ completedAt: '2026-09-18T10:00:00Z' })]);
    mockParams = { id: 'l1' };
    mockPost.mockImplementation(async (envelope) => ({ list: { ...list({ id: 'NEW-LIST-ID', revision: 1 }), items: envelope.input.items } }));
    mockPost.mockImplementationOnce(async () => ({ items: [item({ id: 'eggs', name: 'Eggs', category: 'Dairy & Eggs', quantity: '12' })] }));
    await render(<DetailWithQueries />);
    expect(screen.getByTestId('grocery-check-milk').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('grocery-edit-milk').props.accessibilityState?.disabled ?? screen.getByTestId('grocery-edit-milk').props.disabled).toBeTruthy();
    expect(screen.queryByTestId('shopping-header-settings')).toBeNull();
    expect(screen.getByTestId('shopping-shortcut-email').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('list-options'));
    expect(screen.queryByTestId('list-menu-select-all')).toBeNull();
    expect(screen.getByTestId('list-menu-settings').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('list-menu-copy'));
    await fireEvent.press(screen.getByTestId('new-list-cancel'));
    await fireEvent.changeText(screen.getByTestId('shopping-quick-add'), 'eggs');
    await fireEvent(screen.getByTestId('shopping-quick-add'), 'submitEditing');
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    mockPost.mock.calls.shift();
    const envelope = mockPost.mock.calls[0][0];
    expect(envelope.operation).toBe('create');
    expect(envelope.id).toBeUndefined();
    // `working.id = UUID().uuidString` — a fresh, uppercase id — doubles as the idempotency key.
    expect(envelope.idempotencyKey).toBe(String(envelope.idempotencyKey).toUpperCase());
    expect(envelope.idempotencyKey).not.toBe('l1');
    expect(envelope.input).not.toHaveProperty('completedAt');
    expect(envelope.input.items.map((value: GroceryItem) => value.id)).toEqual(['milk', 'banana', 'eggs']);
  });

  it('turning live transcription off disables the mic', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    await render(<DetailWithQueries />);
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
    await render(<DetailWithQueries />);
    await fireEvent.press(screen.getByTestId('list-options'));
    await fireEvent.press(screen.getByTestId('list-menu-share'));
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
    await render(<DetailWithQueries />);
    await fireEvent.press(screen.getByTestId('grocery-edit-milk'));
    expect(screen.getByText('Edit Item')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('item-image-toggle'));
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
    await render(<DetailWithQueries />);
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

/**
 * Item Alternatives (ShoppingViews.swift:511-609), opened from a row's star (:300-303, :638-639).
 * The answer is the `rice` request from Run D's test data, which the capture replaced with Brown rice.
 */
describe('Item Alternatives', () => {
  const MILK = item({ id: 'milk2', name: '2% milk', category: 'Dairy & Eggs', quantity: '1', size: '', notes: 'organic only', checked: true });
  const PER100 = { servingSize: '100 g', servingAmount: 100, servingUnit: 'g' };
  const ANSWER = {
    originalFacts: { source: 'USDA', matchQuality: 'representative_generic', nutrition: { ...PER100, calories: 50, protein: 3, totalFat: 2, saturatedFat: 1, carbohydrates: 5, sugar: 5 } },
    alternatives: [
      { name: '2% milk', category: 'Dairy & Eggs', quantity: '1', size: '', reason: 'Same', detail: 'Same item', facts: { source: 'USDA', nutrition: { ...PER100, calories: 50, protein: 3, totalFat: 2, carbohydrates: 5 } } },
      {
        name: 'Lactose-free milk',
        category: 'Dairy & Eggs',
        quantity: '1',
        size: '',
        reason: 'Lactose-free',
        detail: 'Dairy milk without lactose',
        facts: { source: 'Open Food Facts', brand: 'Stater Bros', barcode: '0123456789012', nutrition: { ...PER100, calories: 67, protein: 3, totalFat: 4, saturatedFat: 2, carbohydrates: 5, sugar: 3 }, dietary: ['Lactose-free'], bestFor: ['Coffee'] },
      },
      { name: 'Unsweetened oat milk', category: 'Dairy & Eggs', quantity: '1', size: 'carton', reason: 'Plant-based', detail: 'Creamy', facts: null },
    ],
    tip: 'Choose unsweetened.',
    usedAI: true,
  };

  async function open(answer: () => Promise<unknown> = async () => ANSWER) {
    shoppingStore.getState().reset();
    load([list({ items: [item(), MILK] })]);
    mockParams = { id: 'l1' };
    mockAlternatives.mockImplementation(answer);
    mockPost.mockImplementation(async (envelope) => ({ list: { ...list({ revision: 8 }), items: envelope.input.items } }));
    await render(<DetailWithQueries />);
    await fireEvent.press(screen.getByLabelText('Show alternatives for 2% milk'));
  }

  it('shows the original, the goal chips, each alternative with its supported goals and nutrition line', async () => {
    let answer: (value: unknown) => void = () => undefined;
    await open(() => new Promise((resolve) => (answer = resolve)));
    expect(screen.getByText('Item Alternatives')).toBeTruthy();
    expect(screen.getByText('Finding useful alternatives…')).toBeTruthy();
    await waitFor(() => expect(mockAlternatives).toHaveBeenCalledWith({ name: '2% milk', category: 'Dairy & Eggs', quantity: '1', size: '' }));
    await act(async () => answer(ANSWER));
    expect(screen.getByTestId('alternatives-original')).toHaveTextContent(/2% milk1Original Item/);
    expect(screen.getByText('AI Recommended Alternatives')).toBeTruthy();
    expect(screen.getAllByText('Suggested alternative')).toHaveLength(2);
    expect(screen.getByText('Lower sugar · Lactose-free')).toBeTruthy();
    expect(screen.getByText('67 cal · 3g protein · 4g fat · 5g carbs · per 100 g')).toBeTruthy();
    expect(screen.getByText('Nutrition details unavailable')).toBeTruthy();
    expect(screen.getByText('Always check the product label for the most current nutrition and allergen information.')).toBeTruthy();
    expect(screen.getByLabelText('View in Cart (2)')).toBeTruthy();
  });

  it('filters by a goal chip, says how many match, and Show all clears it', async () => {
    await open();
    await waitFor(() => expect(screen.getByTestId('alternatives.goal.Lower sugar')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('alternatives.goal.Lower sugar'));
    expect(screen.getByTestId('alternatives.goalStatus')).toHaveTextContent('1 matches · Lower sugar');
    expect(screen.queryByText('Unsweetened oat milk')).toBeNull();
    await fireEvent.press(screen.getByTestId('alternatives.goal.Lower fat'));
    expect(screen.getByTestId('alternatives.goalStatus')).toHaveTextContent('No verified matches for lower fat.');
    expect(screen.getByText('No matching alternatives yet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('alternatives.showAll'));
    expect(screen.getByText('Unsweetened oat milk')).toBeTruthy();
  });

  it('More opens the goal picker; Apply sets the goal', async () => {
    await open();
    await waitFor(() => expect(screen.getByTestId('alternatives.moreGoals')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('alternatives.moreGoals'));
    expect(screen.getByText('I’m looking for:')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('alternatives.moreOptions'));
    await fireEvent.press(screen.getAllByTestId('alternatives.goal.Lactose-free').slice(-1)[0]);
    await fireEvent.press(screen.getByTestId('alternatives.applyGoal'));
    expect(screen.getByTestId('alternatives.goalStatus')).toHaveTextContent('1 matches · Lactose-free');
  });

  it('Why these? explains the suggestions', async () => {
    await open();
    await waitFor(() => expect(screen.getByTestId('alternatives.whyThese')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('alternatives.whyThese'));
    expect(screen.getByText('Why these alternatives?')).toBeTruthy();
    expect(screen.getByText('Comparable nutrition')).toBeTruthy();
  });

  it('Replace asks first, keeps the item’s own quantity, notes and checked state, and ends on Item replaced!', async () => {
    await open();
    await waitFor(() => expect(screen.getByTestId('alternatives.select.Lactose-free milk')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('alternatives.select.Lactose-free milk'));
    expect(screen.getByText('Replace item?')).toBeTruthy();
    expect(screen.getByText('Replace “2% milk” with “Lactose-free milk”? ')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('alternatives.confirm'));
    await waitFor(() => expect(screen.getByTestId('alternatives.success')).toBeTruthy());
    const envelope = mockPost.mock.calls[0][0];
    expect(envelope).toMatchObject({ operation: 'save', id: 'l1', revision: 7 });
    expect(envelope.input.items[1]).toMatchObject({ id: 'milk2', name: 'Lactose-free milk', quantity: '1', size: '', notes: 'organic only', checked: true, brand: 'Stater Bros', barcode: '0123456789012', imageData: null });
    expect(screen.getByText('2% milk has been replaced with Lactose-free milk.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('alternatives-success-done'));
    await waitFor(() => expect(screen.queryByTestId('alternatives-original')).toBeNull());
  });

  it('stars the original and an alternative', async () => {
    await open();
    await waitFor(() => expect(screen.getByTestId('alternatives.favorite.original')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('alternatives.favorite.original'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0].input.items[1]).toMatchObject({ favorite: true });
    await fireEvent.press(screen.getByTestId('alternatives.favorite.Lactose-free milk|Dairy & Eggs|1|'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost.mock.calls[1][0].input.items[1].favoriteAlternatives).toEqual(['Lactose-free milk|Dairy & Eggs|1|']);
  });

  it('opens Item Details: the comparison, the nutrition table, and Add to Cart Instead appends', async () => {
    await open();
    await waitFor(() => expect(screen.getByTestId('alternatives.details.Lactose-free milk')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('alternatives.details.Lactose-free milk'));
    expect(screen.getByText('Item Details')).toBeTruthy();
    expect(screen.getByTestId('alternative.originalName')).toHaveTextContent('2% milk');
    expect(screen.getByTestId('alternative.targetName')).toHaveTextContent('Lactose-free milk');
    expect(screen.getByText('67 cal')).toBeTruthy();
    expect(screen.getByText('Representative food — not an exact product.')).toBeTruthy();
    expect(screen.getByTestId('alternative-row-Calories')).toHaveTextContent('Calories5067↑ 17');
    expect(screen.getByTestId('alternative-row-Protein')).toHaveTextContent('Protein3 g3 g= Same');
    await fireEvent.press(screen.getByTestId('alternative.sort.Alternative'));
    expect(screen.getByText('Alternative: high to low')).toBeTruthy();
    expect(screen.getByTestId('alternative.tab.Allergens')).toBeTruthy();
    expect(screen.getByTestId('alternative.tab.Best For')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('alternative.detail.add'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0][0].input.items.map((value: GroceryItem) => value.name)).toEqual(['Parity milk', '2% milk', 'Lactose-free milk']);
  });

  it('refuses to add an alternative already in the cart', async () => {
    await open();
    await waitFor(() => expect(screen.getByTestId('alternatives.details.2% milk')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('alternatives.details.2% milk'));
    await fireEvent.press(screen.getByTestId('alternative.detail.add'));
    await waitFor(() => expect(screen.getByTestId('alternative.saveError')).toHaveTextContent('This alternative is already in your cart.'));
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('shows a failed load with Try again — no phone-side fallback — and the retry skips the cache', async () => {
    await open(async () => {
      throw new ApiError({ status: 0, code: 'NETWORK', message: 'The network connection was lost.' });
    });
    await waitFor(() => expect(screen.getByTestId('alternatives.error')).toHaveTextContent('The network connection was lost.'));
    expect(screen.queryByText('Organic 2% milk')).toBeNull();
    mockAlternatives.mockResolvedValueOnce(ANSWER);
    await fireEvent.press(screen.getByTestId('alternatives-retry'));
    await waitFor(() => expect(screen.getByText('Lactose-free milk')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Close alternatives'));
    expect(screen.queryByText('Item Alternatives')).toBeNull();
  });
});

/** docs/android-polish.md §6: the quick-add placeholder stays on one line on Android, ending in "…". */
describe('Shopping Detail quick-add on Android', () => {
  afterEach(() => jest.restoreAllMocks());

  it('holds the field to one line and draws the placeholder as a one-line, ellipsised overlay', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    load([list()]);
    mockParams = { id: 'l1' };
    await render(<DetailWithQueries />);

    const field = screen.getByTestId('shopping-quick-add');
    expect(field.props.numberOfLines).toBe(1);
    expect(field.props.placeholder).toBeUndefined();
    const placeholder = screen.getByTestId('shopping-quick-add-placeholder');
    expect(placeholder.props.children).toBe('Add an item (e.g. eggs, milk, bread)');
    expect(placeholder.props.numberOfLines).toBe(1);
    expect(placeholder.props.ellipsizeMode).toBe('tail');
    // The field is still labelled with the same text for a screen reader.
    expect(field.props.accessibilityLabel).toBe('Add an item (e.g. eggs, milk, bread)');

    // Typing hides the overlay, as a placeholder hides.
    await fireEvent.changeText(field, 'eggs');
    expect(screen.queryByTestId('shopping-quick-add-placeholder')).toBeNull();
  });

  it('keeps the native placeholder on iOS', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    await render(<DetailWithQueries />);
    expect(screen.getByTestId('shopping-quick-add').props.placeholder).toBe('Add an item (e.g. eggs, milk, bread)');
    expect(screen.getByTestId('shopping-quick-add').props.numberOfLines).toBeUndefined();
    expect(screen.queryByTestId('shopping-quick-add-placeholder')).toBeNull();
  });
});

/**
 * The Android mic bug, end to end through the real sheet: the permission prompt pauses the app, and
 * the AppState change it causes must not cancel the tap that opened it.
 */
describe('Add by Voice: the microphone permission', () => {
  const audio = jest.requireMock('expo-audio') as Record<string, unknown>;
  let appStateHandlers: ((state: string) => void)[] = [];

  beforeEach(async () => {
    // An earlier test turns live transcription off; the sheet re-hydrates it from storage on mount.
    await AsyncStorage.removeItem(CONSENT_KEY);
    useTranscriptionConsent.setState({ enabled: true });
    appStateHandlers = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      appStateHandlers.push(handler as (state: string) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    (shoppingApi.transcriptionSession as jest.Mock).mockReset().mockRejectedValue(new Error('offline'));
  });

  afterEach(() => {
    delete audio.requestRecordingPermissionsAsync;
    jest.restoreAllMocks();
  });

  async function openVoice() {
    load([list()]);
    mockParams = { id: 'l1' };
    await render(<DetailWithQueries />);
    await fireEvent.press(screen.getByTestId('quick-add-mic'));
  }

  it('carries on after the prompt, even though the prompt sent the app to the background', async () => {
    let answer: (value: { granted: boolean }) => void = () => undefined;
    audio.requestRecordingPermissionsAsync = jest.fn(() => new Promise((resolve) => (answer = resolve)));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await openVoice();

    await fireEvent.press(screen.getByTestId('voice-mic'));
    expect(audio.requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('voice-status').props.children).toBe('Connecting…');

    // Android opens the permission dialog as its own activity: AppState reports `background`.
    await act(async () => appStateHandlers.forEach((handler) => handler('background')));
    expect(screen.getByTestId('voice-status').props.children).toBe('Connecting…');

    await act(async () => answer({ granted: true }));
    // It went on to open the transcription session rather than returning silently.
    await waitFor(() => expect(shoppingApi.transcriptionSession).toHaveBeenCalled());
    // Here the session fails (offline), and that failure is shown, not swallowed.
    await waitFor(() => expect(screen.getByTestId('voice-error').props.children).toBe(VOICE_MESSAGES.connect('offline')));
  });

  it('says so when the microphone is refused', async () => {
    audio.requestRecordingPermissionsAsync = jest.fn(async () => ({ granted: false }));
    await openVoice();
    await fireEvent.press(screen.getByTestId('voice-mic'));
    await waitFor(() => expect(screen.getByTestId('voice-error').props.children).toBe(VOICE_MESSAGES.microphone));
    expect(screen.getByTestId('voice-status').props.children).toBe('Tap Mic and Talk');
    expect(shoppingApi.transcriptionSession).not.toHaveBeenCalled();
  });

  it('shows the error when the permission request itself fails', async () => {
    audio.requestRecordingPermissionsAsync = jest.fn(async () => Promise.reject(new Error('No activity')));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await openVoice();
    await fireEvent.press(screen.getByTestId('voice-mic'));
    await waitFor(() => expect(screen.getByTestId('voice-error').props.children).toBe(VOICE_MESSAGES.connect('No activity')));
    expect(screen.getByTestId('voice-status').props.children).toBe('Tap Mic and Talk');
  });
});

