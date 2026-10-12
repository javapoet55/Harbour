import type { NexdoTask } from '../../api/types';
import { isDone, parseServerDate } from '../../lib/taskQuery';

/**
 * `TaskCreationSpacing` (d568989, ios/Sources/NexdoCore/TaskCreationSpacing.swift): a NEW task's
 * default start moves to the first opening at or after it, leaving 15 minutes on either side of every
 * open, scheduled task. Swift applies it in the task editor's `resolvedCreationDate` (RootView.swift)
 * only when creating and only to the date pills' default — a time read from the title ("Call Ana at
 * 4 PM") is used as written, and editing an existing task never moves it.
 */

const GAP_MS = 15 * 60_000;

/** `start(at:durationMin:tasks:)` (:6-21). A duration under one minute counts as one. */
export function spacedCreationStart(proposed: number, durationMin: number, tasks: NexdoTask[]): number {
  const duration = Math.max(1, durationMin) * 60_000;
  const intervals = tasks
    .flatMap((task) => {
      if (isDone(task) || task.status === 'CANCELLED') return [];
      const start = parseServerDate(task.startAt ?? null);
      return start === null ? [] : [{ start, end: start + Math.max(1, task.durationMin) * 60_000 }];
    })
    .sort((left, right) => left.start - right.start);
  let candidate = proposed;
  for (const { start, end } of intervals) {
    if (candidate < end + GAP_MS && candidate + duration + GAP_MS > start) candidate = end + GAP_MS;
  }
  return candidate;
}

/**
 * `resolvedCreationDate` (RootView.swift:2297-2302): the title's own time wins unless a date was
 * picked; otherwise the pill's date, spaced when creating. Used by New Task (app/task/new.tsx).
 */
export function resolvedCreationDate({
  detectedAt,
  dateExplicitlyChosen,
  proposed,
  creating,
  durationMin,
  tasks,
}: {
  detectedAt: number | null;
  dateExplicitlyChosen: boolean;
  proposed: number;
  creating: boolean;
  durationMin: number;
  tasks: NexdoTask[];
}): number {
  if (!dateExplicitlyChosen && detectedAt !== null) return detectedAt;
  return creating ? spacedCreationStart(proposed, durationMin, tasks) : proposed;
}
