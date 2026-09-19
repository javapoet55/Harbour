import type { NexdoTask } from '../api/types';
import { detailsBody, draftFrom, scheduleBody } from './taskDraft';

/**
 * `TodayAttentionSheet.rescheduleAll()` (ios/App/TodayAttentionSheet.swift:102-125).
 *
 * Overdue tasks are placed one after another from `start`, each taking `max(1, durationMin)` minutes.
 * Every write goes through the existing task-save path, including its conflict prompt. The loop STOPS
 * at the first failure: earlier writes stay saved and are not retried, and the failure names the task.
 */

export type RescheduleWrite = { id: string; details: Record<string, unknown>; schedule: Record<string, unknown> | null };

/** `TaskEditError.schedule` (ios/App/FocusSessionStrip.swift:18): any failure of the schedule PATCH. */
export const SCHEDULE_SAVE_FAILED =
  'Your details were saved, but the schedule could not be updated. Your edits are still here. Please retry.';

/** The write for one task: `var draft = TaskDraft(task:); draft.schedule = next`. */
export function rescheduleWrite(task: NexdoTask, startAt: number): RescheduleWrite {
  const original = draftFrom(task);
  const draft = { ...original, schedule: startAt };
  return { id: task.id, details: detailsBody(draft, original), schedule: scheduleBody(draft, original) };
}

/** `next = next.addingTimeInterval(Double(max(1, task.durationMin)) * 60)` (`:115`). */
export function nextStart(startAt: number, task: NexdoTask): number {
  return startAt + Math.max(1, task.durationMin) * 60_000;
}

/** `"Couldn’t reschedule \(task.title): \(error.localizedDescription). Earlier changes were saved."` (`:117`). */
export function rescheduleFailure(title: string, message: string): string {
  return `Couldn’t reschedule ${title}: ${message}. Earlier changes were saved.`;
}

/** `Button(saving ? "Rescheduling…" : "Reschedule \(tasks.count) tasks")` (`:93`) — never singular. */
export function rescheduleButtonTitle(saving: boolean, count: number): string {
  return saving ? 'Rescheduling…' : `Reschedule ${count} tasks`;
}

/** `.disabled(saving || model.busy || tasks.isEmpty || start <= Date())` (`:94`). */
export function canReschedule({ saving, busy, count, start, now }: { saving: boolean; busy: boolean; count: number; start: number; now: number }): boolean {
  return !saving && !busy && count > 0 && start > now;
}

/**
 * Runs the loop. `save` performs one write and throws on failure; the result is null on success or the
 * failure text. Swift maps every error from the schedule PATCH to `TaskEditError.schedule` (NexdoApp.swift:633),
 * except a cancelled conflict prompt, which it rethrows as-is.
 */
export async function rescheduleAll(
  tasks: NexdoTask[],
  start: number,
  save: (write: RescheduleWrite) => Promise<void>,
  describe: (error: unknown) => string = () => SCHEDULE_SAVE_FAILED,
): Promise<string | null> {
  let next = start;
  for (const task of tasks) {
    try {
      await save(rescheduleWrite(task, next));
      next = nextStart(next, task);
    } catch (error) {
      return rescheduleFailure(task.title, describe(error));
    }
  }
  return null;
}
