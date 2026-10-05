import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';

import type { Profile } from '../api';
import { useSession } from '../store/session';

const mockApi = { offers: jest.fn(), choose: jest.fn(), storeHours: jest.fn() };
jest.mock('../api/shopping', () => ({
  shoppingOffersApi: {
    offers: (...args: unknown[]) => mockApi.offers(...args),
    choose: (...args: unknown[]) => mockApi.choose(...args),
    storeHours: (...args: unknown[]) => mockApi.storeHours(...args),
  },
}));
const mockRefresh = jest.fn(async () => undefined);
jest.mock('../features/shopping/store', () => ({ shoppingStore: { getState: () => ({ refresh: mockRefresh }) } }));

import { useChooseOffer, useShoppingOffers, useStoreHours } from './useShoppingOffers';

const clients: QueryClient[] = [];

async function renderHook<T>(hook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  clients.push(queryClient);
  const result: { current: T | undefined } = { current: undefined };
  function Probe() {
    result.current = hook();
    return null;
  }
  await render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  return { queryClient, result: result as { current: T } };
}

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

beforeEach(() => {
  Object.values(mockApi).forEach((fn) => fn.mockReset());
  mockRefresh.mockClear();
  useSession.getState().setProfile({ id: 'u1', name: 'Ada', email: 'ada@example.com', timeZone: 'UTC' } as Profile);
});

test('offers and hours load for the list and place asked for', async () => {
  mockApi.offers.mockResolvedValue({ matches: [], status: 'Offers are awaiting their first verified daily check.' });
  mockApi.storeHours.mockResolvedValue({ days: ['Monday: 9 AM – 9 PM'], openNow: true, current: true });
  const { result } = await renderHook(() => ({ offers: useShoppingOffers('l1'), hours: useStoreHours('place_1'), none: useStoreHours(null) }));
  await waitFor(() => expect(result.current.offers.data?.status).toContain('awaiting'));
  await waitFor(() => expect(result.current.hours.data?.openNow).toBe(true));
  expect(mockApi.offers).toHaveBeenCalledWith('l1');
  expect(mockApi.storeHours).toHaveBeenCalledTimes(1);
});

test('choosing sends the list revision, refreshes the lists, and clearing sends null', async () => {
  const list = { id: 'l1', revision: 7 };
  mockApi.choose.mockResolvedValue({ list: { ...list, revision: 8, items: [] } });
  const { result } = await renderHook(() => useChooseOffer());
  await act(async () => {
    await result.current.mutateAsync({ list, itemId: 'milk', offerId: null });
  });
  expect(mockApi.choose).toHaveBeenCalledWith({ listId: 'l1', itemId: 'milk', offerId: null, revision: 7 });
  expect(mockRefresh).toHaveBeenCalled();
});

test('an answer without a list is an error, as Swift\'s badServerResponse', async () => {
  mockApi.choose.mockResolvedValue({});
  const { result } = await renderHook(() => useChooseOffer());
  await act(async () => {
    await expect(result.current.mutateAsync({ list: { id: 'l1', revision: 1 }, itemId: 'milk', offerId: 'o' })).rejects.toThrow('unexpected response');
  });
  expect(mockRefresh).not.toHaveBeenCalled();
});
