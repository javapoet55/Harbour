import type { NexdoTask } from '../api/types';
import { parseServerDate } from './taskQuery';
import { detectTaskAction, type TaskActionIntent } from './taskActionDetector';
import { notificationDate, type TaskAction, type TaskActionStatus } from './todayActionQueue';

/**
 * `TaskAction`'s state machine, `TaskActionReconciler` and `TaskActionNotificationPlan`
 * (ios/Sources/NexdoCore/TaskAction.swift:21-115).
 *
 * The shape itself is already in `todayActionQueue.ts`, which Phase 4B ported; this adds the parts
 * that need the detector and the clock. All of it is pure, so all of it is tested without a device.
 */

export type { TaskAction, TaskActionStatus, TaskActionChannel } from './todayActionQueue';
export { notificationDate } from './todayActionQueue';

/** The extra fields the coordinator persists, beyond what the queue reads. */
export type StoredTaskAction = TaskAction & {
  type: TaskActionIntent;
  contactIdentifier?: string | null;
  context?: string | null;
  /** Epoch ms, set the moment an action enters `executing`. */
  executedAt?: number | null;
};

/**
 * `transition(to:now:)` (TaskAction.swift:41-63) —
 * "No communication can enter executing without an explicit approval event."
 *
 * Returns the new action and whether the move was allowed. Swift mutates in place and returns the
 * flag; this returns both so callers stay immutable.
 */
const ALLOWED: [TaskActionStatus, TaskActionStatus][] = [
  ['pending', 'scheduled'],
  ['scheduled', 'pending'],
  ['pending', 'awaitingApproval'],
  ['scheduled', 'awaitingApproval'],
  ['failed', 'awaitingApproval'],
  ['cancelled', 'awaitingApproval'],
  ['completed', 'awaitingApproval'],
  ['awaitingApproval', 'approved'],
  ['approved', 'executing'],
  ['executing', 'completed'],
  ['executing', 'failed'],
  ['approved', 'failed'],
  ['executing', 'awaitingApproval'],
  ['approved', 'awaitingApproval'],
  ['awaitingApproval', 'scheduled'],
  ['failed', 'scheduled'],
  ['cancelled', 'scheduled'],
  ['completed', 'scheduled'],
  ['executing', 'scheduled'],
];

export function transition(
  action: StoredTaskAction,
  next: TaskActionStatus,
  now: number,
): { action: StoredTaskAction; changed: boolean } {
  const listed = ALLOWED.some(([from, to]) => from === action.status && to === next);
  // "default: allowed = next == .cancelled || status == next" — anything may be cancelled, and a
  // no-op move to the current status always succeeds.
  const allowed = listed || next === 'cancelled' || action.status === next;
  if (!allowed) return { action, changed: false };

  return {
    action: { ...action, status: next, ...(next === 'executing' ? { executedAt: now } : {}) },
    changed: true,
  };
}

/** `requiresApproval` (TaskAction.swift:30) is a constant `true`; no channel is ever automatic. */
export const REQUIRES_APPROVAL = true;

/** A fresh action from a detection. `TaskAction.init` (TaskAction.swift:36-41). */
export function makeTaskAction({
  id,
  taskId,
  title,
  detection,
  scheduledAt,
}: {
  id: string;
  taskId: string;
  title: string;
  detection: NonNullable<ReturnType<typeof detectTaskAction>>;
  scheduledAt: number | null;
}): StoredTaskAction {
  return {
    id,
    taskId,
    sourceTitle: title,
    type: detection.intent,
    contactName: detection.contactName,
    preferredAction: detection.preferredAction,
    context: detection.context,
    scheduledAt,
    snoozedUntil: null,
    contactIdentifier: null,
    status: 'pending',
    executedAt: null,
  };
}

/**
 * `TaskActionReconciler.reconcile` (TaskAction.swift:67-88) —
 * "The saved task date wins over wording in an old title after rescheduling."
 *
 * One action per task at most, which is where the queue's one-action-per-task rule comes from: the
 * output is built by mapping over TASKS, so a second action for the same task cannot exist.
 */
export function reconcileActions({
  previous,
  tasks,
  now,
  timeZone,
  newId,
}: {
  previous: StoredTaskAction[];
  tasks: NexdoTask[];
  now: number;
  timeZone: string;
  /** Injected so tests are deterministic; the app passes `randomUUID`. */
  newId: () => string;
}): StoredTaskAction[] {
  const result: StoredTaskAction[] = [];

  for (const task of tasks) {
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') continue;
    const detected = detectTaskAction(task.title, now, timeZone);
    if (!detected) continue;

    const schedule = parseServerDate(task.startAt ?? task.dueAt ?? null);
    const old = previous.find((action) => action.taskId === task.id);

    // A different person or a different intent is a different action entirely.
    if (!old || old.contactName !== detected.contactName || old.type !== detected.intent) {
      result.push(makeTaskAction({ id: newId(), taskId: task.id, title: task.title, detection: detected, scheduledAt: schedule }));
      continue;
    }

    // Same person and intent, but the task moved or was retitled: rebuild, keeping the chosen contact.
    if ((old.scheduledAt ?? null) !== schedule || old.sourceTitle !== task.title) {
      const rebuilt = makeTaskAction({ id: newId(), taskId: task.id, title: task.title, detection: detected, scheduledAt: schedule });
      result.push({ ...rebuilt, contactIdentifier: old.contactIdentifier ?? null });
      continue;
    }

    result.push(old);
  }

  return result;
}

/** `TaskActionNotification` (TaskAction.swift:90-99). */
export type TaskActionNotification = {
  /** `"nexdo.action." + action.id` — the prefix the scheduler owns and replaces wholesale. */
  id: string;
  actionId: string;
  taskId: string;
  fireAt: number;
};

export const NOTIFICATION_ID_PREFIX = 'nexdo.action.';

/** The 48 Swift schedules at a time (TaskAction.swift:101-108). */
export const NOTIFICATION_LIMIT = 48;

/** `TaskActionNotificationPlan.desired` (TaskAction.swift:102-107). */
export function desiredNotifications(actions: StoredTaskAction[], now: number, limit = NOTIFICATION_LIMIT): TaskActionNotification[] {
  return actions
    .filter((action) => {
      if (action.status !== 'pending' && action.status !== 'scheduled') return false;
      const at = notificationDate(action);
      return at !== null && at > now;
    })
    .sort((left, right) => (notificationDate(left) as number) - (notificationDate(right) as number))
    .slice(0, Math.max(0, limit))
    .map((action) => ({
      id: NOTIFICATION_ID_PREFIX + action.id,
      actionId: action.id,
      taskId: action.taskId,
      fireAt: notificationDate(action) as number,
    }));
}

/** `TaskActionCoordinator.ownerKey(_:)` (TaskActionCoordinator.swift:43-45): SHA-256, lowercase hex. */
export async function ownerKey(userId: string, digest: (value: string) => Promise<string>): Promise<string> {
  return digest(userId);
}
