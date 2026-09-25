import type { NexdoTask } from '../api/types';
import { addDays, isDone, startOfDay } from './taskQuery';

/**
 * Port of `TodayActionQueue` (ios/Sources/NexdoCore/TodayActionQueue.swift).
 *
 * This is a PURE function of the actions and the tasks, so it is ported and tested now even though
 * nothing supplies `actions` yet. `TaskActionCoordinator`, the only source, keeps its state in a local
 * JSON file and schedules local notifications through `UNUserNotificationCenter`, resolving people
 * through `Contacts` — all of which is Phase 8. Until then every list here is empty and
 * `hasImmediateActions` is false, which is exactly what the Today dashboard renders today.
 */

/** `TaskActionStatus` (ios/Sources/NexdoCore/TaskAction.swift:7-9). */
export type TaskActionStatus =
  | 'pending'
  | 'scheduled'
  | 'awaitingApproval'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** `TaskActionChannel` (TaskAction.swift:6). */
export type TaskActionChannel = 'call' | 'message' | 'email';

/** `TaskAction` (TaskAction.swift:21-34), with the fields the queue reads. */
export type TaskAction = {
  id: string;
  taskId: string;
  contactName: string;
  preferredAction?: TaskActionChannel | null;
  status: TaskActionStatus;
  /** `scheduledAt`, epoch ms. */
  scheduledAt?: number | null;
  /** `snoozedUntil`, epoch ms. */
  snoozedUntil?: number | null;
  sourceTitle: string;
};

/** `notificationDate` (TaskAction.swift:34): a snooze wins over the original schedule. */
export function notificationDate(action: TaskAction): number | null {
  return action.snoozedUntil ?? action.scheduledAt ?? null;
}

export type TodayActionQueue = {
  primaryAction: TaskAction | null;
  nextActions: TaskAction[];
  laterActions: TaskAction[];
  overdueCount: number;
  deferredTaskIds: Set<string>;
  immediateTaskIds: Set<string>;
  reservedTaskIds: Set<string>;
  hasImmediateActions: boolean;
  /** `recommendation` (TodayActionQueue.swift:13-15). */
  recommendation: string | null;
};

/** `windowMinutes` (TodayActionQueue.swift:4). */
export const ACTION_WINDOW_MINUTES = 15;

/** `priority(_:)` (TodayActionQueue.swift:45-47). */
function priorityRank(value: string): number {
  switch (value) {
    case 'CRITICAL':
      return 3;
    case 'HIGH':
      return 2;
    case 'LOW':
      return 0;
    default:
      return 1;
  }
}

/** `TodayActionQueue.init` (TodayActionQueue.swift:17-44). */
export function buildActionQueue({
  actions,
  tasks,
  now,
  timeZone,
  windowMinutes = ACTION_WINDOW_MINUTES,
}: {
  actions: TaskAction[];
  tasks: NexdoTask[];
  now: number;
  timeZone: string;
  windowMinutes?: number;
}): TodayActionQueue {
  // `end` is the start of TOMORROW: the queue only ever covers the rest of today.
  const end = addDays(startOfDay(now, timeZone), 1, timeZone);
  const window = now + Math.max(0, windowMinutes) * 60_000;

  const active = tasks.filter((task) => !isDone(task) && task.status !== 'CANCELLED');
  // `uniquingKeysWith: max` — a duplicate id keeps the HIGHEST priority.
  const priorities = new Map<string, number>();
  for (const task of active) {
    const rank = priorityRank(task.priority);
    priorities.set(task.id, Math.max(priorities.get(task.id) ?? rank, rank));
  }

  const live = (action: TaskAction) =>
    priorities.has(action.taskId) && action.status !== 'completed' && action.status !== 'cancelled';

  const deferredTaskIds = new Set(
    actions.filter((action) => live(action) && (notificationDate(action) ?? Number.NEGATIVE_INFINITY) >= end).map((action) => action.taskId),
  );

  const seen = new Set<string>();
  const ordered = actions
    .filter((action) => {
      const at = notificationDate(action);
      return live(action) && at !== null && at < end;
    })
    .sort((left, right) => {
      const leftAt = notificationDate(left) as number;
      const rightAt = notificationDate(right) as number;
      if (leftAt !== rightAt) return leftAt - rightAt;
      const leftRank = priorities.get(left.taskId) ?? 0;
      const rightRank = priorities.get(right.taskId) ?? 0;
      if (leftRank !== rightRank) return rightRank - leftRank;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    })
    // One action per task: the first in the sorted order wins.
    .filter((action) => {
      if (seen.has(action.taskId)) return false;
      seen.add(action.taskId);
      return true;
    });

  const due = ordered.filter((action) => (notificationDate(action) as number) <= now);
  const primaryAction = due[0] ?? null;
  const nextActions = ordered.filter(
    (action) => action.id !== primaryAction?.id && (notificationDate(action) as number) <= window,
  );
  const laterActions = ordered.filter((action) => (notificationDate(action) as number) > window);
  const overdueCount = due.filter((action) => (notificationDate(action) as number) < now).length;

  const immediateTaskIds = new Set([...(primaryAction ? [primaryAction] : []), ...nextActions].map((action) => action.taskId));
  const reservedTaskIds = new Set([
    ...immediateTaskIds,
    ...laterActions.map((action) => action.taskId),
    ...deferredTaskIds,
  ]);

  return {
    primaryAction,
    nextActions,
    laterActions,
    overdueCount,
    deferredTaskIds,
    immediateTaskIds,
    reservedTaskIds,
    hasImmediateActions: primaryAction !== null || nextActions.length > 0,
    recommendation: primaryAction
      ? `You have a follow-up with ${primaryAction.contactName} due now. Contact them before starting your next task.`
      : null,
  };
}
