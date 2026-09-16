import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '../api/client';
import type { NexdoTask, TasksResponse } from '../api/types';
import { queryKeys } from './keys';
import { claim, isCurrent, isNewest, resetRevisions, currentRevision } from './taskRevision';
import { replaceTask, scheduleRequest, ScheduleConflictCancelled, type ScheduleConflict } from './useTasks';

function task(overrides: Partial<NexdoTask> & { id: string }): NexdoTask {
  return { title: 'A task', status: 'PLANNED', priority: 'MEDIUM', durationMin: 30, ...overrides };
}

function client(tasks: NexdoTask[] = []): QueryClient {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData<TasksResponse>(queryKeys.tasks.all(), { tasks, timeZone: 'Asia/Kolkata' });
  return queryClient;
}

beforeEach(() => resetRevisions());

/**
 * `AppModel.taskRevision` (ios/App/NexdoApp.swift:135, 330) and the per-task sequencing that Swift
 * gets from serialising writes behind `busy`.
 */
describe('stale-response guard', () => {
  it('a slow response A must not overwrite a fast later response B', async () => {
    const queryClient = client([task({ id: 't1', title: 'Original' })]);

    // Two writes to the same task are started; A is claimed first but will resolve last.
    const tokenA = claim('t1');
    const tokenB = claim('t1');

    // B resolves first and is the newest claim, so it writes.
    expect(isNewest('t1', tokenB)).toBe(true);
    replaceTask(queryClient, task({ id: 't1', title: 'B — the newer save' }));

    // A now resolves. It is no longer the newest claim, so the caller discards it.
    expect(isNewest('t1', tokenA)).toBe(false);

    const state = queryClient.getQueryData<TasksResponse>(queryKeys.tasks.all());
    expect(state?.tasks.find((item) => item.id === 't1')?.title).toBe('B — the newer save');
  });

  it('a list response captured before a save is refused', () => {
    const queryClient = client([task({ id: 't1', title: 'Original' })]);

    // A GET /api/tasks goes out and captures the revision.
    const captured = currentRevision();
    // While it is in flight, a save lands.
    replaceTask(queryClient, task({ id: 't1', title: 'Saved while loading' }));
    // The list response arrives carrying the pre-save snapshot.
    expect(isCurrent(captured)).toBe(false);

    const state = queryClient.getQueryData<TasksResponse>(queryKeys.tasks.all());
    expect(state?.tasks.find((item) => item.id === 't1')?.title).toBe('Saved while loading');
  });

  it('a list response with no save in flight is accepted', async () => {
    const captured = currentRevision();
    expect(isCurrent(captured)).toBe(true);
  });

  it('sequences writes per task, so a write to another task does not invalidate this one', () => {
    const tokenA = claim('t1');
    claim('t2');
    expect(isNewest('t1', tokenA)).toBe(true);
  });
});

/** `AppModel.replaceTask` (NexdoApp.swift:537-558). */
describe('replaceTask', () => {
  it('keeps relations a PATCH response omits', () => {
    const queryClient = client([
      task({
        id: 't1',
        category: { name: 'Admin' },
        subtasks: [{ id: 's1', title: 'Step', sortOrder: 0 }],
        recurrence: { frequency: 'WEEKLY', interval: 1 },
      }),
    ]);

    // A PATCH response carries the task without its included relations.
    replaceTask(queryClient, task({ id: 't1', title: 'Renamed' }));

    const updated = queryClient.getQueryData<TasksResponse>(queryKeys.tasks.all())?.tasks[0];
    expect(updated).toMatchObject({ title: 'Renamed' });
    expect(updated?.category).toEqual({ name: 'Admin' });
    expect(updated?.subtasks).toEqual([{ id: 's1', title: 'Step', sortOrder: 0 }]);
    expect(updated?.recurrence).toEqual({ frequency: 'WEEKLY', interval: 1 });
  });

  it('appends a task the list has not seen yet', () => {
    const queryClient = client([]);
    replaceTask(queryClient, task({ id: 'new' }));
    expect(queryClient.getQueryData<TasksResponse>(queryKeys.tasks.all())?.tasks.map((item) => item.id)).toEqual(['new']);
  });

  it('bumps the revision, so an in-flight list load is refused', () => {
    const queryClient = client([]);
    const captured = currentRevision();
    replaceTask(queryClient, task({ id: 'new' }));
    expect(isCurrent(captured)).toBe(false);
  });
});

/** `AppModel.scheduleRequest` (NexdoApp.swift:73-85). */
describe('SCHEDULE_WARNING confirm and retry', () => {
  const warning = new ApiError({
    status: 409,
    code: 'SCHEDULE_WARNING',
    message: 'That slot is taken.',
    warnings: ['That slot overlaps "Standup".'],
  });

  it('retries the identical body with allowScheduleConflict on confirm', async () => {
    const send = jest.fn().mockRejectedValueOnce(warning).mockResolvedValueOnce({ task: task({ id: 't1' }) });
    let raised: ScheduleConflict | undefined;

    const promise = scheduleRequest(send, { status: 'COMPLETED' }, (conflict) => {
      raised = conflict;
    });

    await Promise.resolve();
    expect(raised?.warnings).toEqual(['That slot overlaps "Standup".']);

    raised?.confirm();
    await expect(promise).resolves.toMatchObject({ task: { id: 't1' } });

    expect(send).toHaveBeenNthCalledWith(1, { status: 'COMPLETED' });
    // The SAME body, plus the override — not a reconstructed one.
    expect(send).toHaveBeenNthCalledWith(2, { status: 'COMPLETED', allowScheduleConflict: true });
  });

  it('abandons the write on cancel, without a second request', async () => {
    const send = jest.fn().mockRejectedValueOnce(warning);
    let raised: ScheduleConflict | undefined;

    const promise = scheduleRequest(send, { status: 'COMPLETED' }, (conflict) => {
      raised = conflict;
    });

    await Promise.resolve();
    raised?.cancel();

    await expect(promise).rejects.toBeInstanceOf(ScheduleConflictCancelled);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('passes any other error straight through, with no prompt', async () => {
    const send = jest.fn().mockRejectedValue(new ApiError({ status: 500, message: 'Server error.' }));
    const onConflict = jest.fn();

    await expect(scheduleRequest(send, {}, onConflict)).rejects.toMatchObject({ status: 500 });
    expect(onConflict).not.toHaveBeenCalled();
  });

  it('falls back to the error message when the server sends no warnings array', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(new ApiError({ status: 409, code: 'SCHEDULE_WARNING', message: 'Double booked.' }));
    let raised: ScheduleConflict | undefined;

    const promise = scheduleRequest(send, {}, (conflict) => {
      raised = conflict;
    });
    await Promise.resolve();
    raised?.cancel();
    await expect(promise).rejects.toBeInstanceOf(ScheduleConflictCancelled);

    expect(raised?.warnings).toEqual(['Double booked.']);
  });
});
