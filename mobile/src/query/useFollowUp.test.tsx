import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';

import type { NexdoTask, Profile, TasksResponse } from '../api';
import { ApiError } from '../api/client';
import { useSession } from '../store/session';
import { queryKeys } from './keys';

const mockApi = { load: jest.fn(), save: jest.fn(), schedule: jest.fn(), updateTask: jest.fn() };
jest.mock('../api/followUp', () => ({
  ...jest.requireActual('../api/followUp'),
  followUpApi: {
    load: (...args: unknown[]) => mockApi.load(...args),
    save: (...args: unknown[]) => mockApi.save(...args),
    schedule: (...args: unknown[]) => mockApi.schedule(...args),
  },
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: { updateTask: (...args: unknown[]) => mockApi.updateTask(...args) },
}));

import { useFollowUpPreparation, useSaveFollowUp } from './useFollowUp';

const NOW = Date.parse('2026-10-09T16:00:00Z');
const TASK: NexdoTask = { id: 't1', title: 'Follow up with my insurance company', status: 'PLANNED', priority: 'NORMAL', durationMin: 15 };
const PREPARATION = { company: 'Acme', purpose: 'Claim', phone: '', email: '', notes: '', draft: 'd', checklist: [], outcomes: [] };
const clients: QueryClient[] = [];

async function renderHook<T>(hook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  queryClient.setQueryData<TasksResponse>(queryKeys.tasks.all(), { tasks: [TASK], timeZone: 'UTC' });
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

const onConflict = jest.fn();
const save = (overrides: Partial<Parameters<ReturnType<typeof useSaveFollowUp>['mutateAsync']>[0]> = {}) => ({
  task: TASK,
  revision: 0,
  preparation: PREPARATION,
  then: null,
  reschedule: false,
  nextAt: NOW + 3_600_000,
  ...overrides,
});

test('loads the envelope per account', async () => {
  mockApi.load.mockResolvedValue({ revision: 2, preparation: PREPARATION });
  const { result, queryClient } = await renderHook(() => useFollowUpPreparation('t1'));
  await waitFor(() => expect(result.current.data?.revision).toBe(2));
  expect(queryClient.getQueryData(queryKeys.followUp('u1', 't1'))).toEqual({ revision: 2, preparation: PREPARATION });
});

test('a plain save caches the new revision and touches nothing else', async () => {
  mockApi.save.mockResolvedValue({ revision: 1, preparation: PREPARATION });
  const { result, queryClient } = await renderHook(() => useSaveFollowUp({ onConflict, now: () => NOW }));
  await act(async () => {
    await result.current.mutateAsync(save());
  });
  expect(mockApi.save).toHaveBeenCalledWith('t1', { revision: 0, preparation: PREPARATION });
  expect(queryClient.getQueryData(queryKeys.followUp('u1', 't1'))).toEqual({ revision: 1, preparation: PREPARATION });
  expect(mockApi.schedule).not.toHaveBeenCalled();
  expect(mockApi.updateTask).not.toHaveBeenCalled();
});

test('"Record and complete task" saves first, then completes', async () => {
  const order: string[] = [];
  mockApi.save.mockImplementation(async () => (order.push('save'), { revision: 1, preparation: PREPARATION }));
  mockApi.updateTask.mockImplementation(async (_id: string, body: unknown) => (order.push(JSON.stringify(body)), { task: { ...TASK, status: 'COMPLETED' } }));
  const { result, queryClient } = await renderHook(() => useSaveFollowUp({ onConflict, now: () => NOW }));
  await act(async () => {
    await result.current.mutateAsync(save({ then: 'complete' }));
  });
  expect(order).toEqual(['save', '{"status":"COMPLETED"}']);
  expect(queryClient.getQueryData<TasksResponse>(queryKeys.tasks.all())?.tasks[0].status).toBe('COMPLETED');
});

test('"Record and schedule next follow-up" moves the task, keeping its duration', async () => {
  mockApi.save.mockResolvedValue({ revision: 1, preparation: PREPARATION });
  mockApi.schedule.mockResolvedValue({ task: { ...TASK, startAt: '2026-10-09T17:00:00Z' } });
  const { result } = await renderHook(() => useSaveFollowUp({ onConflict, now: () => NOW }));
  await act(async () => {
    await result.current.mutateAsync(save({ then: 'schedule' }));
  });
  expect(mockApi.schedule).toHaveBeenCalledWith('t1', { startAt: '2026-10-09T17:00:00Z', durationMin: 15 });
});

test('a past follow-up time is refused after the save, without a schedule request', async () => {
  mockApi.save.mockResolvedValue({ revision: 1, preparation: PREPARATION });
  const { result, queryClient } = await renderHook(() => useSaveFollowUp({ onConflict, now: () => NOW }));
  let caught: unknown;
  await act(async () => {
    caught = await result.current.mutateAsync(save({ reschedule: true, nextAt: NOW })).catch((error: unknown) => error);
  });
  expect((caught as Error).message).toBe('Choose a future follow-up time.');
  expect(mockApi.schedule).not.toHaveBeenCalled();
  // The save itself landed, so the retry sends revision 1.
  expect(queryClient.getQueryData<{ revision: number }>(queryKeys.followUp('u1', 't1'))?.revision).toBe(1);
});

test('a stale save never completes the task', async () => {
  mockApi.save.mockRejectedValue(new ApiError({ status: 409, message: 'This preparation changed on another device. Reopen it before saving.' }));
  const { result } = await renderHook(() => useSaveFollowUp({ onConflict, now: () => NOW }));
  await act(async () => {
    await result.current.mutateAsync(save({ then: 'complete' })).catch(() => undefined);
  });
  expect(mockApi.updateTask).not.toHaveBeenCalled();
});
