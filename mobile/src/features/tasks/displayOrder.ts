import AsyncStorage from '@react-native-async-storage/async-storage';

import type { NexdoTask } from '../../api/types';
import { isMomentEntry } from '../calendar/momentSchedule';

/**
 * Manual task order (d568989): `TaskDisplayOrder` (ios/Sources/NexdoCore/TaskDisplayOrder.swift) and
 * Tasks' drag-to-reorder (ios/App/RootView.swift, `orderedTasks` / `reorderTask` / `moveTask`).
 *
 * DISPLAY ORDER ONLY: a task's date, deadline and reminder never change, and nothing is sent to the
 * server. The order lives on the device, per account, and applies within one date group.
 */

/** `sorted(_:saved:)` (:5-10): the saved order for the ids still present, then any new ids in their given order. */
export function sortedIds(ids: string[], saved: string[]): string[] {
  const present = new Set(ids);
  const ordered = saved.filter((id) => present.has(id));
  const known = new Set(ordered);
  return [...ordered, ...ids.filter((id) => !known.has(id))];
}

/** `moving(_:to:in:)` (:11-17): `source` takes `target`'s place. `null` for a no-op or an id not in the list. */
export function movingId(source: string, target: string, ids: string[]): string[] | null {
  if (source === target) return null;
  const from = ids.indexOf(source);
  const to = ids.indexOf(target);
  if (from < 0 || to < 0) return null;
  const result = [...ids];
  result.splice(from, 1);
  result.splice(to, 0, source);
  return result;
}

/** Every account's saved order on this device: `@AppStorage("nexdo.taskDisplayOrders")`, `[owner: [taskID]]`. */
export type TaskDisplayOrders = Record<string, string[]>;

export const TASK_DISPLAY_ORDERS_KEY = 'nexdo.taskDisplayOrders';

/** `orderedTasks(_:)`: a date group in the account's saved order. */
export function orderedTasks<T extends Pick<NexdoTask, 'id'>>(tasks: T[], orders: TaskDisplayOrders, ownerId: string | null | undefined): T[] {
  const saved = ownerId ? orders[ownerId] ?? [] : [];
  const byId = new Map<string, T>();
  for (const task of tasks) if (!byId.has(task.id)) byId.set(task.id, task);
  return sortedIds(tasks.map((task) => task.id), saved).flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

/**
 * `reorderTask(_:to:tasks:)`: drop `source` on `target` within one group. Moment entries never move and
 * are never a target. The group's new order replaces those ids in the saved list and goes to its END,
 * so the other groups' orders survive. Returns the new orders, or `null` when nothing changes.
 */
export function reorderTasks(orders: TaskDisplayOrders, ownerId: string | null | undefined, source: string, target: string, group: Pick<NexdoTask, 'id'>[]): TaskDisplayOrders | null {
  if (!ownerId || isMomentEntry(source) || isMomentEntry(target)) return null;
  const reordered = movingId(source, target, orderedTasks(group, orders, ownerId).map((task) => task.id));
  if (!reordered) return null;
  const visible = new Set(reordered);
  return { ...orders, [ownerId]: [...(orders[ownerId] ?? []).filter((id) => !visible.has(id)), ...reordered] };
}

/** `moveTask(_:offset:tasks:)`: the "Move up" / "Move down" accessibility actions, skipping Moments. */
export function moveTask(orders: TaskDisplayOrders, ownerId: string | null | undefined, id: string, offset: number, group: Pick<NexdoTask, 'id'>[]): TaskDisplayOrders | null {
  const ids = orderedTasks(group, orders, ownerId).filter((task) => !isMomentEntry(task.id)).map((task) => task.id);
  const index = ids.indexOf(id);
  if (index < 0 || index + offset < 0 || index + offset >= ids.length) return null;
  return reorderTasks(orders, ownerId, id, ids[index + offset], group);
}

/** Read the saved orders. Anything unreadable is "no saved order", as Swift's `try?` decode. */
export async function loadTaskDisplayOrders(): Promise<TaskDisplayOrders> {
  try {
    const raw = await AsyncStorage.getItem(TASK_DISPLAY_ORDERS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((id) => typeof id === 'string')));
  } catch {
    return {};
  }
}

export async function saveTaskDisplayOrders(orders: TaskDisplayOrders): Promise<void> {
  await AsyncStorage.setItem(TASK_DISPLAY_ORDERS_KEY, JSON.stringify(orders));
}
