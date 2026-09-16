import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { endpoints, isApiError, type NexdoTask, type TaskCreateInput, type TasksResponse } from '../api';
import { queryKeys } from './keys';
import { bumpRevision, claim, currentRevision, isCurrent, isNewest } from './taskRevision';

/**
 * Task data layer. Ports `AppModel`'s task methods (ios/App/NexdoApp.swift:309-560).
 *
 * Swift fetches the WHOLE list once and filters on the device, so there is one query key for tasks
 * and no per-filter key: `src/lib/taskQuery.ts` does the filtering. That is what makes the date-pill
 * counts consistent with the list, since both come from the same array.
 */

/** The conflict the server raises on a double-booked slot, and the decision the person makes about it. */
export type ScheduleConflict = {
  /** The warnings, already split the way Swift joins them for its alert (NexdoApp.swift:93). */
  warnings: string[];
  /** "Save anyway": retry the identical request with `allowScheduleConflict: true`. */
  confirm: () => void;
  /** "Keep previous schedule": abandon the write. */
  cancel: () => void;
};

/**
 * `AppModel.scheduleRequest` (NexdoApp.swift:73-85).
 *
 * The server answers a double-booking with 409 `SCHEDULE_WARNING`. Swift presents an alert and, only
 * on "Save anyway", repeats the SAME request with `allowScheduleConflict: true` merged into the body.
 * React Native has no synchronous alert that returns a decision, so the promise is parked here and
 * handed to the caller as `ScheduleConflict`; resolving it resumes or abandons the original call.
 */
export function scheduleRequest<T>(
  send: (body: Record<string, unknown>) => Promise<T>,
  body: Record<string, unknown>,
  onConflict: (conflict: ScheduleConflict) => void,
): Promise<T> {
  return send(body).catch((error: unknown) => {
    if (!isApiError(error) || error.code !== 'SCHEDULE_WARNING') throw error;
    return new Promise<T>((resolve, reject) => {
      onConflict({
        warnings: error.warnings ?? [error.message],
        confirm: () => resolve(send({ ...body, allowScheduleConflict: true })),
        // Swift throws `CancellationError`, which `perform` swallows without an alert.
        cancel: () => reject(new ScheduleConflictCancelled()),
      });
    });
  });
}

/** The "Keep previous schedule" outcome. Swift's `CancellationError`: not an error to show. */
export class ScheduleConflictCancelled extends Error {
  constructor() {
    super('Schedule change cancelled.');
    Object.setPrototypeOf(this, ScheduleConflictCancelled.prototype);
    this.name = 'ScheduleConflictCancelled';
  }
}

export function isConflictCancelled(error: unknown): boolean {
  return error instanceof ScheduleConflictCancelled;
}

/**
 * The whole task list. `AppModel.loadTasks` (NexdoApp.swift:315-338).
 *
 * The revision guard lives in `queryFn` rather than in a `select`, because the point is to stop a
 * stale response being WRITTEN to the cache at all: returning the cached value leaves the newer
 * mutation result in place.
 */
export function useTasks() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.tasks.all(),
    queryFn: async () => {
      const captured = currentRevision();
      const response = await endpoints.tasks();
      if (!isCurrent(captured)) {
        // A save landed while this was in flight. Its task is newer than anything in this response.
        const existing = queryClient.getQueryData<TasksResponse>(queryKeys.tasks.all());
        if (existing) return existing;
      }
      return response;
    },
  });
}

/** One task out of the cached list, so opening the editor never issues a second request. */
export function useTask(id: string | undefined): NexdoTask | undefined {
  const { data } = useTasks();
  return id ? data?.tasks.find((task) => task.id === id) : undefined;
}

/**
 * `AppModel.replaceTask` (NexdoApp.swift:537-558).
 *
 * A PATCH response omits the relations the list include carries, so the previous category, subtasks
 * and recurrence are kept until a canonical GET replaces them. Losing them would blank the category
 * badge on every completed task.
 */
export function replaceTask(queryClient: QueryClient, incoming: NexdoTask): void {
  bumpRevision();
  queryClient.setQueryData<TasksResponse>(queryKeys.tasks.all(), (previous) => {
    const tasks = previous?.tasks ?? [];
    const old = tasks.find((task) => task.id === incoming.id);
    const merged: NexdoTask = {
      ...incoming,
      category: incoming.category ?? old?.category ?? null,
      subtasks: incoming.subtasks ?? old?.subtasks ?? null,
      recurrence: incoming.recurrence ?? old?.recurrence ?? null,
    };
    const next = old ? tasks.map((task) => (task.id === merged.id ? merged : task)) : [...tasks, merged];
    return { tasks: next, timeZone: previous?.timeZone ?? null };
  });
}

type ConflictHandler = { onConflict: (conflict: ScheduleConflict) => void };

/**
 * `AppModel.complete` (NexdoApp.swift:518-527): a toggle between COMPLETED and PLANNED.
 *
 * DIVERGENCE FROM THE BRIEF, FOLLOWING SWIFT: this is NOT optimistic. Swift awaits the server and
 * then calls `replaceTask` with the returned task; the circle button is disabled by `model.busy`
 * while the write is in flight rather than flipping ahead of the response. Completing a recurring
 * task creates the next occurrence server-side (`completeTask`, src/server/tasks.ts:89-97), and the
 * new row only exists in the refetch, so an optimistic flip would show a list that is missing it.
 */
export function useCompleteTask({ onConflict }: ConflictHandler) {
  const queryClient = useQueryClient();
  return useMutation<NexdoTask, Error, NexdoTask>({
    mutationFn: async (task) => {
      const token = claim(task.id);
      const status = task.status === 'COMPLETED' ? 'PLANNED' : 'COMPLETED';
      const response = await scheduleRequest(
        (body) => endpoints.updateTask(task.id, body),
        { status },
        onConflict,
      );
      if (!isNewest(task.id, token)) {
        // A newer write to this task already landed; this older response must not overwrite it.
        throw new StaleWriteDiscarded();
      }
      return response.task;
    },
    onSuccess: (task) => {
      replaceTask(queryClient, task);
      // Completion can create the next occurrence of a recurring task, which only the list knows about.
      if (task.recurrence) void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all() });
    },
    onError: (error) => {
      if (isStaleWrite(error) || isConflictCancelled(error)) return;
    },
  });
}

/** A response that lost the race for its task. Never surfaced: the newer write is the correct state. */
export class StaleWriteDiscarded extends Error {
  constructor() {
    super('A newer change to this task already applied.');
    Object.setPrototypeOf(this, StaleWriteDiscarded.prototype);
    this.name = 'StaleWriteDiscarded';
  }
}

export function isStaleWrite(error: unknown): boolean {
  return error instanceof StaleWriteDiscarded;
}

/** `AppModel.saveTask` for the create path (NexdoApp.swift:495-506). */
export function useCreateTask({ onConflict }: ConflictHandler) {
  const queryClient = useQueryClient();
  return useMutation<NexdoTask, Error, TaskCreateInput>({
    mutationFn: async (input) => {
      const response = await scheduleRequest(
        (body) => endpoints.createTask(body as unknown as TaskCreateInput),
        input as unknown as Record<string, unknown>,
        onConflict,
      );
      return response.task;
    },
    onSuccess: (task) => {
      replaceTask(queryClient, task);
      void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
    },
  });
}

/**
 * An edit from the details screen. `AppModel.saveTaskDetails` (NexdoApp.swift:558-586).
 *
 * The server refuses a body mixing `projectId` with a status or schedule change
 * (src/app/api/tasks/[id]/route.ts:26-28), so `TaskDraft` splits an edit into a details body and a
 * schedule body and this sends them in that order.
 */
export function useUpdateTask({ onConflict }: ConflictHandler) {
  const queryClient = useQueryClient();
  return useMutation<NexdoTask | null, Error, { id: string; details: Record<string, unknown>; schedule: Record<string, unknown> | null }>({
    mutationFn: async ({ id, details, schedule }) => {
      const token = claim(id);
      let latest: NexdoTask | null = null;
      if (Object.keys(details).length > 0) {
        const response = await scheduleRequest((body) => endpoints.updateTask(id, body), details, onConflict);
        latest = response.task;
      }
      if (schedule) {
        const response = await scheduleRequest((body) => endpoints.updateTask(id, body), schedule, onConflict);
        latest = response.task;
      }
      if (latest && !isNewest(id, token)) throw new StaleWriteDiscarded();
      return latest;
    },
    onSuccess: (task) => {
      if (task) replaceTask(queryClient, task);
      // Swift refetches the canonical list after an edit: some deployments return a pre-update
      // snapshot for PATCH, including priority changes (NexdoApp.swift:568-571).
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all() });
    },
  });
}

/** Deletion is a CANCELLED status; the server soft-deletes and the filter drops it. */
export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation<string, Error, string>({
    mutationFn: async (id) => {
      claim(id);
      await endpoints.deleteTask(id);
      return id;
    },
    onSuccess: (id) => {
      bumpRevision();
      queryClient.setQueryData<TasksResponse>(queryKeys.tasks.all(), (previous) =>
        previous ? { ...previous, tasks: previous.tasks.filter((task) => task.id !== id) } : previous,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
    },
  });
}
