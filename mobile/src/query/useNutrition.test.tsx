import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';

import type { Profile } from '../api';
import type { NutritionInsight } from '../api/nutrition';
import { useSession } from '../store/session';
import { queryKeys } from './keys';

const mockApi = {
  insight: jest.fn(),
  actOnInsight: jest.fn(),
  addEntry: jest.fn(),
  saveSettings: jest.fn(),
};
jest.mock('../api/nutrition', () => ({
  nutritionApi: {
    insight: (...args: unknown[]) => mockApi.insight(...args),
    actOnInsight: (...args: unknown[]) => mockApi.actOnInsight(...args),
    addEntry: (...args: unknown[]) => mockApi.addEntry(...args),
    saveSettings: (...args: unknown[]) => mockApi.saveSettings(...args),
  },
}));
const mockRefresh = jest.fn(async () => undefined);
jest.mock('../features/shopping/store', () => ({ shoppingStore: { getState: () => ({ refresh: mockRefresh }) } }));

import { useAddNutritionEntry, useNutritionInsight, useNutritionInsightAction, useSaveNutritionSettings } from './useNutrition';

const INSIGHT: NutritionInsight = { key: 'k1', kind: 'GAP', title: 'Fiber', text: 'Low fiber', items: ['Oats'], listTitle: 'Groceries', state: 'open' };

function signIn(id: string) {
  useSession.getState().setProfile({ id, name: 'Ada', email: 'ada@example.com', timeZone: 'UTC' } as Profile);
}

const clients: QueryClient[] = [];

async function renderHook<T>(hook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  clients.push(queryClient);
  const result: { current: T | undefined } = { current: undefined };
  function Probe() {
    result.current = hook();
    return null;
  }
  const view = await render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  return { queryClient, result: result as { current: T }, view };
}

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

beforeEach(() => {
  Object.values(mockApi).forEach((fn) => fn.mockReset());
  mockRefresh.mockClear();
  useSession.getState().clear();
  signIn('u1');
});

test('a failed insight answers null instead of an error ("never block the dashboard on it")', async () => {
  mockApi.insight.mockRejectedValue(new Error('offline'));
  const { result } = await renderHook(() => useNutritionInsight('2026-09-28'));
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toBeNull();
});

test('adding the insight marks it added and refreshes the shopping lists the server just changed', async () => {
  mockApi.insight.mockResolvedValue({ insight: INSIGHT });
  mockApi.actOnInsight.mockResolvedValue({ ok: true, added: ['Oats'], listTitle: 'Groceries' });
  const { result, queryClient } = await renderHook(() => ({ insight: useNutritionInsight('2026-09-28'), act: useNutritionInsightAction('2026-09-28') }));
  await waitFor(() => expect(result.current.insight.data).toEqual(INSIGHT));
  await act(async () => {
    await result.current.act.mutateAsync({ insight: INSIGHT, add: true });
  });
  expect(mockApi.actOnInsight).toHaveBeenCalledWith({ date: '2026-09-28', key: 'k1', action: 'add' });
  expect(queryClient.getQueryData<NutritionInsight>(queryKeys.nutrition.insight('u1', '2026-09-28'))?.state).toBe('added');
  expect(mockRefresh).toHaveBeenCalled();
});

test('adding an entry sends the day with it and reloads that day', async () => {
  mockApi.addEntry.mockResolvedValue({ entry: { id: 'e1' } });
  const { result, queryClient } = await renderHook(() => useAddNutritionEntry('2026-09-28'));
  queryClient.setQueryData(queryKeys.nutrition.day('u1', '2026-09-28'), { stale: true });
  await act(async () => {
    await result.current.mutateAsync({ meal: 'LUNCH', description: 'Dal', kcal: 300 });
  });
  expect(mockApi.addEntry).toHaveBeenCalledWith({ date: '2026-09-28', meal: 'LUNCH', description: 'Dal', kcal: 300 });
  expect(queryClient.getQueryState(queryKeys.nutrition.day('u1', '2026-09-28'))?.isInvalidated).toBe(true);
});

test('saved settings replace the cached ones under the same account', async () => {
  const settings = { enabled: true, phoneVerified: true, localTime: '20:00', timeZone: 'UTC', repeatDaily: true, noAnswer: 'NOTIFY', voice: 'marin', calorieGoal: 1800, voices: ['marin'] };
  mockApi.saveSettings.mockResolvedValue(settings);
  const { result, queryClient } = await renderHook(() => useSaveNutritionSettings());
  await act(async () => {
    await result.current.mutateAsync({ calorieGoal: 1800 });
  });
  expect(queryClient.getQueryData(queryKeys.nutrition.settings('u1'))).toEqual(settings);
});
