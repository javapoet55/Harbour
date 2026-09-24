import * as Notifications from 'expo-notifications';

/**
 * Development-only Metro logs for local reminders (task-action and Important Moments), to see on a
 * device whether a reminder was scheduled, for when, and what the system actually holds afterwards.
 *
 * Nothing personal is logged: no title, body, task, contact or address — only the kind, a short opaque
 * reference (the first 8 characters of a random action id, or a moment reminder's slot), the reason a
 * reminder was skipped, and the fire time. Release builds log nothing (`__DEV__` is false there).
 */
export type ReminderKind = 'action' | 'moment';

const TAG = '[reminders]';
const short = (ref: string) => ref.slice(0, 8);

function minutesFrom(now: number, at: number): string {
  const minutes = Math.round((at - now) / 60_000);
  return minutes >= 0 ? `in ${minutes} min` : `${-minutes} min ago`;
}

export function logReminderScheduled(kind: ReminderKind, ref: string, fireAt: number, now = Date.now()): void {
  if (!__DEV__) return;
  console.log(`${TAG} scheduled ${kind} ${short(ref)} at ${new Date(fireAt).toISOString()} (${minutesFrom(now, fireAt)})`);
}

export function logReminderSkipped(kind: ReminderKind, ref: string | null, reason: string, fireAt?: number | null, now = Date.now()): void {
  if (!__DEV__) return;
  const when = fireAt != null ? ` at ${new Date(fireAt).toISOString()} (${minutesFrom(now, fireAt)})` : '';
  console.log(`${TAG} skipped ${kind}${ref ? ` ${short(ref)}` : ''}: ${reason}${when}`);
}

/** Only the parts of a trigger that say when it fires and on which channel. */
function describeTrigger(trigger: Notifications.NotificationTrigger | null): string {
  if (!trigger || typeof trigger !== 'object') return 'no trigger';
  const record = trigger as Record<string, unknown>;
  const value = record.value ?? record.date ?? (record.dateComponents as Record<string, unknown> | undefined)?.date;
  const at = typeof value === 'number' || typeof value === 'string' ? new Date(value).toISOString() : 'unknown time';
  const channel = typeof record.channelId === 'string' ? ` channel=${record.channelId}` : '';
  return `${String(record.type ?? 'unknown')} ${at}${channel}`;
}

/**
 * `getAllScheduledNotificationsAsync()` after scheduling: what the OS actually holds. Identifiers are
 * Nexdo's own (`nexdo.action.<uuid>`, `nexdo.moment.<n>`), shortened; no content is read.
 */
export async function logPendingReminders(source: string): Promise<void> {
  if (!__DEV__) return;
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    const lines = pending.map((request) => `  ${request.identifier.replace(/^(nexdo\.\w+\.)(.{8}).*$/, '$1$2…')} → ${describeTrigger(request.trigger)}`);
    console.log(`${TAG} after ${source}: ${pending.length} pending${lines.length ? `\n${lines.join('\n')}` : ''}`);
  } catch (error) {
    console.log(`${TAG} after ${source}: could not read pending notifications (${error instanceof Error ? error.name : 'error'})`);
  }
}
