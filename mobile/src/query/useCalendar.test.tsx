import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';

import { ApiError } from '../api/client';
import { queryKeys } from './keys';

const mockEndpoints = { calendarConnections: jest.fn() };
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: { calendarConnections: (...args: unknown[]) => mockEndpoints.calendarConnections(...args) },
}));
jest.mock('./useProfile', () => ({ reloadProfile: jest.fn(async () => undefined), refreshSupplementaryData: jest.fn() }));

import { completeGoogleConnect, connectionsState, CONNECTIONS_REFRESH_FAILED, useCalendarConnections } from './useCalendar';

const GOOGLE = { id: 'c1', provider: 'google', status: 'ACTIVE', accountEmail: 'ada@example.com', calendarName: 'Ada', writeEnabled: true };
const clients: QueryClient[] = [];

async function renderHook<T>(hook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
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
beforeEach(() => mockEndpoints.calendarConnections.mockReset());

/** `loadCalendarConnections()` (ios/App/NexdoApp.swift:328-349). */
test('a failed refresh keeps the connected accounts and reports the failure', async () => {
  mockEndpoints.calendarConnections.mockResolvedValueOnce({ connections: [GOOGLE] });
  const { result } = await renderHook(() => useCalendarConnections());
  await waitFor(() => expect(result.current.data).toEqual([GOOGLE]));
  expect(connectionsState(result.current)).toEqual({ connections: [GOOGLE], loaded: true, error: null });

  mockEndpoints.calendarConnections.mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK', message: 'offline' }));
  await act(async () => {
    await result.current.refetch();
  });
  await waitFor(() => expect(connectionsState(result.current)).toEqual({ connections: [GOOGLE], loaded: true, error: CONNECTIONS_REFRESH_FAILED }));
  expect(mockEndpoints.calendarConnections).toHaveBeenCalledTimes(2);
});

test('a first load that fails is not "loaded", so the card does not say nothing is connected', async () => {
  mockEndpoints.calendarConnections.mockRejectedValueOnce(new ApiError({ status: 500, message: 'Request failed.' }));
  const { result } = await renderHook(() => useCalendarConnections());
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(connectionsState(result.current)).toEqual({ connections: [], loaded: false, error: CONNECTIONS_REFRESH_FAILED });
  // One attempt, as Swift: no automatic retry.
  expect(mockEndpoints.calendarConnections).toHaveBeenCalledTimes(1);
});

test('a connection that worked still reports it when the list cannot be reloaded', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(queryClient);
  queryClient.setQueryData(queryKeys.calendar.connections(), [GOOGLE]);
  mockEndpoints.calendarConnections.mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK', message: 'offline' }));
  const outcome = await completeGoogleConnect(queryClient, 'nexdo://calendar-connected?calendar=google-connected', null);
  expect(outcome.kind).toBe('connected');
  expect(queryClient.getQueryData(queryKeys.calendar.connections())).toEqual([GOOGLE]);
});
