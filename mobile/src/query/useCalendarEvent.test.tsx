import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';

import type { Profile } from '../api';
import { useSession } from '../store/session';
import { queryKeys } from './keys';

const mockApi = { get: jest.fn(), setCompleted: jest.fn(), addTask: jest.fn() };
jest.mock('../api/calendarEvent', () => ({
  calendarEventApi: {
    get: (...args: unknown[]) => mockApi.get(...args),
    setCompleted: (...args: unknown[]) => mockApi.setCompleted(...args),
    addTask: (...args: unknown[]) => mockApi.addTask(...args),
  },
}));

import { useAddEventTask, useCalendarEvent, useSetEventCompletion } from './useCalendarEvent';

const EVENT = { id: 'e1', title: 'Dentist', startAt: '2026-09-14T17:00:00Z', endAt: '2026-09-14T18:00:00Z', source: 'google', connectionId: 'c1', completedAt: null };
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

afterEach(() => clients.splice(0).forEach((client) => client.clear()));
beforeEach(() => {
  Object.values(mockApi).forEach((fn) => fn.mockReset());
  useSession.getState().setProfile({ id: 'u1', name: 'Ada', email: 'ada@example.com', timeZone: 'UTC' } as Profile);
});

test('marking an imported event complete keeps the answer and reloads the agenda', async () => {
  mockApi.get.mockResolvedValue({ event: EVENT });
  mockApi.setCompleted.mockResolvedValue({ success: true, event: { ...EVENT, completedAt: '2026-09-14T19:00:00Z' } });
  const { result, queryClient } = await renderHook(() => ({ event: useCalendarEvent('e1'), complete: useSetEventCompletion() }));
  await waitFor(() => expect(result.current.event.data?.event.id).toBe('e1'));
  queryClient.setQueryData(queryKeys.agenda.range('2026-09-14', '7'), { stale: true });
  await act(async () => {
    await result.current.complete.mutateAsync({ id: 'e1', completed: true });
  });
  expect(mockApi.setCompleted).toHaveBeenCalledWith('e1', true);
  await waitFor(() => expect(result.current.event.data?.event.completedAt).toBe('2026-09-14T19:00:00Z'));
  expect(queryClient.getQueryState(queryKeys.agenda.range('2026-09-14', '7'))?.isInvalidated).toBe(true);
});

test('add to tasks reloads the tasks', async () => {
  mockApi.addTask.mockResolvedValue({ success: true, taskId: 't1' });
  const { result, queryClient } = await renderHook(() => useAddEventTask());
  queryClient.setQueryData(queryKeys.tasks.list(), { tasks: [] });
  await act(async () => {
    await result.current.mutateAsync('e1');
  });
  expect(mockApi.addTask).toHaveBeenCalledWith('e1');
  expect(queryClient.getQueryState(queryKeys.tasks.list())?.isInvalidated).toBe(true);
});
