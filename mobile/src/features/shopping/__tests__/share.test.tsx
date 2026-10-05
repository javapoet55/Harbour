import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';

const mockPost = jest.fn();
jest.mock('../../../api/shopping', () => {
  const actual = jest.requireActual('../../../api/shopping');
  return {
    ...actual,
    shoppingApi: { lists: jest.fn(async () => ({ lists: [] })), post: (...args: unknown[]) => mockPost(...args), alternatives: jest.fn(), image: jest.fn(), transcriptionSession: jest.fn() },
    shareUrl: (token: string) => actual.shareUrl(token, { baseUrl: 'https://app.example.com' }),
  };
});

import { shareUrl, type GroceryList } from '../../../api/shopping';
import { ShareListSheet } from '../sheets';
import { shoppingStore } from '../store';

/** `ShoppingShare` (ios/App/ShoppingViews.swift:790-829). */

const client = { baseUrl: 'https://app.example.com' } as Parameters<typeof shareUrl>[1];
const HEX = '0123456789abcdef'.repeat(4);

function list(overrides: Partial<GroceryList> = {}): GroceryList {
  return { id: 'l1', title: 'Parity Weekly Groceries', date: '2026-10-05', timeZone: 'UTC', weekly: true, revision: 2, completedAt: null, shareToken: null, items: [], ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  shoppingStore.setState({ lists: [], busy: false, error: null });
});

describe('shareUrl', () => {
  it('encodes a 64-character hex token as a short base64url link, without padding', () => {
    expect(shareUrl(HEX, client)).toBe('https://app.example.com/s/ASNFZ4mrze8BI0VniavN7wEjRWeJq83vASNFZ4mrze8');
    expect(shareUrl('ff'.repeat(32), client)).toBe(`https://app.example.com/s/${'_'.repeat(42)}8`);
  });

  it('keeps the long link for any other length, and gives none for a 64-character token that is not hex', () => {
    expect(shareUrl('legacy-token', client)).toBe('https://app.example.com/shared/shopping/legacy-token');
    expect(shareUrl('z'.repeat(64), client)).toBeNull();
  });
});

describe('Share List', () => {
  it('offers the weekly email to the store manager under Scheduled sharing', async () => {
    const onWeeklyEmail = jest.fn();
    await render(<ShareListSheet list={list()} onClose={jest.fn()} onUpdate={jest.fn()} onWeeklyEmail={onWeeklyEmail} visible />);
    expect(screen.getByText('Scheduled sharing')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('share-weekly-email'));
    expect(onWeeklyEmail).toHaveBeenCalled();
  });

  it('shares the short link once created', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    mockPost.mockResolvedValue({ list: list({ shareToken: HEX, revision: 3 }) });
    await render(<ShareListSheet list={list()} onClose={jest.fn()} onUpdate={jest.fn()} onWeeklyEmail={jest.fn()} visible />);
    await fireEvent.press(screen.getByTestId('share-create'));
    await waitFor(() => expect(screen.getByTestId('share-link')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('share-link'));
    expect(share).toHaveBeenLastCalledWith({ message: 'https://app.example.com/s/ASNFZ4mrze8BI0VniavN7wEjRWeJq83vASNFZ4mrze8' });
    share.mockRestore();
  });

  it('turns Create Share Link off while the store is busy', async () => {
    shoppingStore.setState({ busy: true });
    await render(<ShareListSheet list={list()} onClose={jest.fn()} onUpdate={jest.fn()} onWeeklyEmail={jest.fn()} visible />);
    expect(screen.getByTestId('share-create').props.accessibilityState.disabled).toBe(true);
  });
});
