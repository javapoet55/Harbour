import { getApi, type ApiClient } from './index';
import type { TaskResponse } from './types';
import type { FollowUpEnvelope } from '../features/followUp/model';

/**
 * `GET`/`PUT /api/tasks/{id}/preparation` (src/app/api/tasks/[id]/preparation/route.ts), as
 * `AppModel.loadFollowUp` / `saveFollowUp` (ios/App/NexdoApp.swift:715-720).
 *
 * The PUT is compare-and-set on `revision`: it answers the stored envelope with `revision + 1`. A
 * stale revision is 409 "This preparation changed on another device. Reopen it before saving." —
 * unless the preparation sent is byte-for-byte the stored one, which answers the stored envelope, so
 * a retry of a save that already landed is harmless (follow-up.ts:26-29). A schema failure is 400
 * "Check the preparation fields and try again."; a task that is not the caller's, or deleted, is 404
 * "Not found.". Completing the task keeps the preparation.
 */

function path(taskId: string): string {
  return `/api/tasks/${encodeURIComponent(taskId)}/preparation`;
}

export const followUpApi = {
  load: (taskId: string, client: ApiClient = getApi()) => client.get<FollowUpEnvelope>(path(taskId)),

  /** The envelope is sent whole; `preparation` is never null on a save (the view always has one). */
  save: (taskId: string, envelope: { revision: number; preparation: NonNullable<FollowUpEnvelope['preparation']> }, client: ApiClient = getApi()) =>
    client.put<FollowUpEnvelope>(path(taskId), envelope),

  /**
   * `scheduleFollowUp(_:at:)` (NexdoApp.swift:721-727): a task PATCH of `{ startAt, durationMin }`,
   * keeping the task's own duration. Refused on the device for a time that is not in the future.
   * Goes through the schedule-warning retry like every task write (`scheduleRequest`).
   */
  schedule: (taskId: string, body: Record<string, unknown>, client: ApiClient = getApi()) =>
    client.patch<TaskResponse>(`/api/tasks/${encodeURIComponent(taskId)}`, body),
};

/** Swift's guard message (NexdoApp.swift:722), shown without a request. */
export const FUTURE_FOLLOW_UP_REQUIRED = 'Choose a future follow-up time.';

/** The schedule body: Swift's `ISO8601DateFormatter` instant (UTC, whole seconds) and the task's duration. */
export function followUpScheduleBody(at: number, durationMin: number): { startAt: string; durationMin: number } {
  return { startAt: new Date(Math.floor(at / 1000) * 1000).toISOString().replace('.000Z', 'Z'), durationMin };
}
