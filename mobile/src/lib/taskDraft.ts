import type { NexdoTask, TaskStep } from '../api/types';
import { parseServerDate } from './taskQuery';

/**
 * Port of `TaskDraft` (ios/Sources/NexdoCore/TaskDraft.swift).
 *
 * An edit buffer over the existing task contract. Only CHANGED fields are sent, and the edit is split
 * into two bodies because the server refuses a PATCH that mixes `projectId` with a status or schedule
 * change (src/app/api/tasks/[id]/route.ts:26-28).
 */
export type TaskDraft = {
  projectId: string | null;
  title: string;
  notes: string;
  priority: string;
  duration: number;
  energy: string;
  splittable: boolean;
  critical: boolean;
  /** Epoch ms, or null when the task has never been scheduled. */
  schedule: number | null;
  /** The recurrence FREQUENCY only, or 'NONE'. Swift's draft carries no interval. */
  recurrence: string;
  steps: TaskStep[];
};

/** `TaskDraft.init(task:)` (TaskDraft.swift:17-27). */
export function draftFrom(task: NexdoTask): TaskDraft {
  return {
    projectId: task.projectId ?? null,
    title: task.title,
    notes: task.notes ?? '',
    priority: task.priority,
    duration: task.durationMin,
    energy: task.energyLevel ?? 'MEDIUM',
    splittable: task.splittable ?? false,
    critical: task.critical ?? false,
    schedule: parseServerDate(task.startAt),
    recurrence: task.recurrence?.frequency ?? 'NONE',
    steps: [...(task.subtasks ?? [])].sort((left, right) => left.sortOrder - right.sortOrder),
  };
}

/** `TaskDraft.isValid` (TaskDraft.swift:29-33). */
export function isDraftValid(draft: TaskDraft): boolean {
  return (
    draft.title.trim().length > 0 &&
    draft.duration >= 1 &&
    draft.duration <= 1440 &&
    draft.steps.length <= 50 &&
    draft.steps.every((step) => step.title.trim().length > 0)
  );
}

function sameSteps(left: TaskStep[], right: TaskStep[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((step, index) => {
    const other = right[index];
    return step.id === other.id && step.title === other.title && step.completedAt === other.completedAt && step.sortOrder === other.sortOrder;
  });
}

/** `TaskDraft ==` for the dirty check: every field, with steps compared element-wise. */
export function draftsEqual(left: TaskDraft, right: TaskDraft): boolean {
  return (
    left.projectId === right.projectId &&
    left.title === right.title &&
    left.notes === right.notes &&
    left.priority === right.priority &&
    left.duration === right.duration &&
    left.energy === right.energy &&
    left.splittable === right.splittable &&
    left.critical === right.critical &&
    left.schedule === right.schedule &&
    left.recurrence === right.recurrence &&
    sameSteps(left.steps, right.steps)
  );
}

/**
 * `TaskDraft.detailsBody(comparedTo:)` (TaskDraft.swift:35-51).
 *
 * Only changed fields appear. `projectId` is sent as an explicit null to clear it, and `subtasks` is
 * sent as an array of TITLES, because the server replaces every step row when the key is present.
 * `recurrence: null` clears the rule.
 */
export function detailsBody(draft: TaskDraft, original: TaskDraft): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (draft.projectId !== original.projectId) fields.projectId = draft.projectId;
  if (draft.title !== original.title) fields.title = draft.title.trim();
  if (draft.notes !== original.notes) fields.notes = draft.notes;
  if (draft.priority !== original.priority) fields.priority = draft.priority;
  if (draft.duration !== original.duration) fields.durationMin = draft.duration;
  if (draft.energy !== original.energy) fields.energyLevel = draft.energy;
  if (draft.splittable !== original.splittable) fields.splittable = draft.splittable;
  if (draft.critical !== original.critical) fields.critical = draft.critical;
  if (!sameSteps(draft.steps, original.steps)) fields.subtasks = draft.steps.map((step) => step.title.trim());
  if (draft.recurrence !== original.recurrence) {
    fields.recurrence = draft.recurrence === 'NONE' ? null : { frequency: draft.recurrence, interval: 1 };
  }
  return fields;
}

/**
 * `TaskDraft.scheduleBody(comparedTo:)` (TaskDraft.swift:53-56).
 *
 * Null unless there IS a schedule and something about it moved. Note that a duration or `critical`
 * change re-sends the schedule as well, because the server revalidates availability against both.
 */
export function scheduleBody(draft: TaskDraft, original: TaskDraft): Record<string, unknown> | null {
  if (draft.schedule === null) return null;
  const moved = draft.schedule !== original.schedule || draft.duration !== original.duration || draft.critical !== original.critical;
  if (!moved) return null;
  return { startAt: new Date(draft.schedule).toISOString(), durationMin: draft.duration };
}
