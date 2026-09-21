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
  it('shows counts, sections, artwork and the hint', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    await render(<Detail />);
    expect(screen.getByTestId('list-counts').props.children).toBe('2 remaining · 2 items');
    expect(screen.getByText('Produce')).toBeTruthy();
    expect(screen.getByText('Dairy & Eggs')).toBeTruthy();
    expect(screen.getByText('2 bottles')).toBeTruthy();
    expect(screen.getByTestId('grocery-artwork-milk', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('grocery-artwork-banana', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Try “2 bottles of milk 1 gallon” or tap the mic.')).toBeTruthy();
  });

  it('checking an item saves against the list’s revision and shows the saved list', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    mockPost.mockImplementation(async (envelope) => ({ list: { ...list({ revision: 8 }), items: envelope.input.items } }));
    await render(<Detail />);
    await fireEvent.press(screen.getByTestId('grocery-check-milk'));
    await waitFor(() => expect(screen.getByTestId('list-counts').props.children).toBe('1 remaining · 2 items'));
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
    expect(screen.getByTestId('list-counts').props.children).toBe('1 remaining · 2 items');
    mockLists.mockResolvedValueOnce({ lists: [list({ revision: 9, items: [item()] })] });
    await fireEvent.press(screen.getByTestId('list-reload'));
    await waitFor(() => expect(screen.getByTestId('list-counts').props.children).toBe('1 remaining · 1 items'));
    expect(screen.queryByTestId('list-error')).toBeNull();
  });

  it('quick-add parses on the server, opens Review Items, and "Add N Items" appends and saves', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    mockPost.mockImplementation(async (envelope) =>
      envelope.operation === 'parse'
        ? { items: [{ id: 'p1', name: 'eggs', category: 'Dairy & Eggs', quantity: '1', size: 'dozen', notes: '', checked: false }] }
        : { list: { ...list({ revision: 8 }), items: envelope.input.items } },
    );
    await render(<Detail />);
    await fireEvent.changeText(screen.getByTestId('quick-add'), 'ch');
    expect(screen.getByText('Cheese')).toBeTruthy();
    expect(screen.getByText('Cherry Tomatoes')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('quick-add'), 'a dozen eggs');
    await fireEvent.press(screen.getByTestId('quick-add-plus'));
    await waitFor(() => expect(screen.getByText('Review Items')).toBeTruthy());
    expect(mockPost).toHaveBeenCalledWith({ operation: 'parse', input: { text: 'a dozen eggs' } });
    await fireEvent.changeText(screen.getByTestId('review-name-p1'), '');
    expect(screen.getByTestId('review-items-add').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('review-name-p1'), 'eggs');
    await fireEvent.press(screen.getByTestId('review-items-add'));
    await waitFor(() => expect(screen.getByTestId('list-counts').props.children).toBe('3 remaining · 3 items'));
    const save = mockPost.mock.calls.find(([envelope]) => envelope.operation === 'save')[0];
    expect(save.input.items.map((value: GroceryItem) => value.name)).toEqual(['Parity milk', 'bananas', 'eggs']);
  });

  it('gives "+" and the mic separate targets (the Swift row fires both)', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    await render(<Detail />);
    expect(screen.getByTestId('quick-add-plus').props.accessibilityState.disabled).toBe(true);
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
    await fireEvent.press(screen.getByTestId('quick-add-mic'));
    expect(screen.getByTestId('voice-status').props.children).toBe('Ready when you are');
    expect(screen.getByTestId('voice-review').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('voice-transcript'), 'six bananas');
    await fireEvent.press(screen.getByTestId('voice-review'));
    await waitFor(() => expect(screen.getByText('Review your items')).toBeTruthy());
    expect(mockPost).toHaveBeenCalledWith({ operation: 'parse', input: { text: 'six bananas' } });
    await fireEvent.press(screen.getByTestId('voice-add'));
    await waitFor(() => expect(screen.getByTestId('list-counts').props.children).toBe('1 remaining · 1 items'));
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

  it('asks before completing a weekly trip and switches to next week’s list', async () => {
    load([list()]);
    mockParams = { id: 'l1' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPost.mockResolvedValueOnce({ list: list({ id: 'next', date: '2026-10-02', revision: 0, items: [item({ checked: false })] }) });
    await render(<Detail />);
    await fireEvent.press(screen.getByTestId('list-complete'));
    const [title, message, buttons] = alert.mock.calls[0] as [string, string, { text: string; onPress?: () => void }[]];
    expect(title).toBe('Complete this trip and create next week’s list?');
    expect(message).toBe('2 items are unchecked. Your shopping history will be kept.');
    await act(async () => {
      buttons.find((button) => button.text === 'Complete trip')?.onPress?.();
    });
    await waitFor(() => expect(screen.getByTestId('list-counts').props.children).toBe('1 remaining · 1 items'));
    expect(mockPost.mock.calls[0][0]).toMatchObject({ operation: 'complete', id: 'l1', revision: 7 });
  });

  it('makes a completed list read-only, with Use This List Again', async () => {
    load([list({ completedAt: '2026-09-18T10:00:00Z' })]);
    mockParams = { id: 'l1' };
    await render(<Detail />);
    expect(screen.queryByTestId('quick-add')).toBeNull();
    expect(screen.getByText('Use This List Again')).toBeTruthy();
    expect(screen.queryByText('Add item')).toBeNull();
    expect(screen.getByTestId('grocery-check-milk').props.accessibilityState.disabled).toBe(true);
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
