/**
 * Port of `AppModel.taskRevision` (ios/App/NexdoApp.swift:135, 319, 330, 539).
 *
 * Swift guards every asynchronous write into `tasks` with a monotonically increasing counter. A list
 * load captures the counter before the request goes out and refuses to publish its response if the
 * counter moved while it was in flight (NexdoApp.swift:330, "A response captured before a save must
 * not erase the returned task"). `replaceTask` bumps the counter on every mutation result.
 *
 * The same problem exists here and TanStack Query does not solve it for us: `useQuery` will happily
 * write a `/api/tasks` response that was captured before a mutation landed, and two mutations racing
 * on the same task can resolve out of order. So the counter is kept explicitly, module-level, exactly
 * as Swift keeps it on the model.
 *
 * `perTask` additionally sequences writes to a single task, which Swift gets for free from its
 * `busy` flag serialising one write at a time. Without it, a slow PATCH A resolving after a fast
 * PATCH B would overwrite B's newer task with A's older one.
 */

let revision = 0;
const perTask = new Map<string, number>();

/** The current global revision, to capture before starting a request. */
export function currentRevision(): number {
  return revision;
}

/** `taskRevision += 1`: called whenever a mutation result is written into the cache. */
export function bumpRevision(): number {
  revision += 1;
  return revision;
}

/** True when nothing has written to the task cache since `captured` was taken. */
export function isCurrent(captured: number): boolean {
  return captured === revision;
}

/**
 * Claim the next write slot for one task. The returned token is only still valid later if no other
 * write to the same task has been claimed since.
 */
export function claim(taskId: string): number {
  const next = (perTask.get(taskId) ?? 0) + 1;
  perTask.set(taskId, next);
  return next;
}

/** True when `token` is still the newest claim for that task. */
export function isNewest(taskId: string, token: number): boolean {
  return perTask.get(taskId) === token;
}

/** Test seam, and the sign-out path: `reset()` clears the counters with the rest of the session. */
export function resetRevisions(): void {
  revision = 0;
  perTask.clear();
}
