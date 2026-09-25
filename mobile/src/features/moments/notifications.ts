import * as Notifications from 'expo-notifications';

import { logPendingReminders, logReminderScheduled, logReminderSkipped } from '../../lib/reminderLog';
import type { ImportantMoment } from '../../api/moments';
import {
  ensureReminderChannel,
  notificationPermission,
  reminderChannel,
  requestNotificationPermission,
  type ReminderAuthorization,
} from '../../lib/notificationPermission';
import { addDays, momentDate, momentDay, zonedInstant } from './dates';
import { planDate, planEditable, readFestivalSettings, sortedPlans } from './domain';

/**
 * The Moments half of `ImportantMomentsStore` that talks to UserNotifications
 * (ios/App/ImportantMomentsStore.swift:31-58, :139-175).
 *
 * LOCAL ONLY, like every reminder in the app: the server has no push path (see "Backend gaps" in
 * docs/IOS_TO_REACT_NATIVE.md). The whole `nexdo.moment.` set is torn down and rebuilt on EVERY
 * refresh, so a cancelled, rescheduled or deleted wish never leaves a stale reminder behind.
 */

export const MOMENT_NOTIFICATION_PREFIX = 'nexdo.moment.';

/** iOS keeps 64 pending requests; Swift reserves 4 for task reminders (`:146`). */
export const MOMENT_NOTIFICATION_CAP = 60;

export type MomentNotificationPayload = { momentID: string; momentOwner: string };

export type MomentReminder = { id: string; at: number; body: string };

/** `UNAuthorizationStatus`, as far as the Moments settings screen distinguishes it. */
export type { ReminderAuthorization };

/**
 * Every reminder the current snapshot wants, soonest first (`:147-163`):
 *
 * - a festival "prepare" reminder at 08:00 in the festival's zone, `prepareDays` before the day, once
 *   per festival group;
 * - a "ready" alert at the send time of every wish YOU deliver — automatic email sends itself, so it
 *   gets none;
 * - a one-hour warning when the plan asked for one (`reminderOffset == 60`).
 *
 * Only enabled moments count, and only editable plans. Nothing in the past is scheduled.
 */
export function buildMomentReminders(moments: ImportantMoment[], now: number = Date.now()): MomentReminder[] {
  const requests: MomentReminder[] = [];
  const enabledDrafts = new Set(moments.filter((moment) => moment.enabled).flatMap((moment) => moment.drafts.map((draft) => draft.id)));
  const preparedGroups = new Set<string>();

  for (const moment of moments) {
    if (!moment.enabled || moment.type !== 'festival') continue;
    const settings = readFestivalSettings(moment.festivalSettings);
    if (!settings || settings.prepareDays <= 0 || preparedGroups.has(settings.groupID)) continue;
    preparedGroups.add(settings.groupID);
    if (zonedInstant(moment.nextOccurrence, 8, 0, moment.timeZoneID) === null) continue;
    const prepareDay = momentDay(addDays(momentDate(moment.nextOccurrence, moment.timeZoneID, now), -settings.prepareDays, moment.timeZoneID), moment.timeZoneID);
    const when = zonedInstant(prepareDay, 8, 0, moment.timeZoneID);
    if (when !== null && when > now) requests.push({ id: moment.id, at: when, body: 'Review your festival wish.' });
  }

  for (const plan of sortedPlans(moments)) {
    if (!planEditable(plan) || !enabledDrafts.has(plan.draftID)) continue;
    const at = planDate(plan);
    if (!plan.automaticDelivery && at > now) {
      requests.push({
        id: plan.id,
        at,
        body: plan.channel === 'messages' ? 'Your wish is ready. Open Nexdo, then tap Send in Messages.' : 'Your wish is ready. Open Nexdo to send it.',
      });
    }
    if (plan.reminderOffset === 60 && at - 3_600_000 > now) {
      requests.push({ id: plan.id, at: at - 3_600_000, body: 'Your scheduled wish is due in one hour.' });
    }
  }

  // Swift's `sorted(by:)` is not stable; ties keep insertion order here, which is the same set.
  return requests.sort((a, b) => a.at - b.at);
}

export async function reminderAuthorization(): Promise<ReminderAuthorization> {
  return notificationPermission();
}

/** `requestAuthorization(options: [.alert, .sound])` (`:131`); POST_NOTIFICATIONS on Android 13+. */
export async function requestReminderAuthorization(): Promise<void> {
  await requestNotificationPermission({ ios: { allowAlert: true, allowSound: true } });
}

/** `clearNotifications()` (`:138-142`): pending AND delivered, prefix only. */
export async function clearMomentNotifications(): Promise<void> {
  for (const request of await Notifications.getAllScheduledNotificationsAsync()) {
    if (request.identifier.startsWith(MOMENT_NOTIFICATION_PREFIX)) await Notifications.cancelScheduledNotificationAsync(request.identifier);
  }
  for (const item of await Notifications.getPresentedNotificationsAsync()) {
    if (item.request.identifier.startsWith(MOMENT_NOTIFICATION_PREFIX)) await Notifications.dismissNotificationAsync(item.request.identifier);
  }
}

export const MOMENT_NOTIFICATION_ERRORS = {
  failed: 'A wish reminder could not be scheduled. Enable notifications and refresh.',
  limited: (available: number) => `Only the next ${available} wish reminders fit on this device. Reopen Nexdo to refresh later reminders.`,
};

/**
 * `replaceNotifications()` (`:143-175`). Resolves to the error the store should show, or `null`.
 *
 * `isCurrent` is the store's generation check: a sign-out mid-rebuild stops scheduling for the old
 * account (`guard token == generation`).
 */
export async function replaceMomentNotifications({
  moments,
  owner,
  isCurrent,
  now = Date.now(),
}: {
  moments: ImportantMoment[];
  owner: string;
  isCurrent: () => boolean;
  now?: number;
}): Promise<string | null> {
  await clearMomentNotifications();
  const authorization = await reminderAuthorization();
  if (authorization !== 'authorized' && authorization !== 'provisional') {
    logReminderSkipped('moment', null, `every wish reminder: notifications are ${authorization}`);
    return null;
  }
  await ensureReminderChannel();
  const pending = (await Notifications.getAllScheduledNotificationsAsync()).length;
  const available = Math.max(0, MOMENT_NOTIFICATION_CAP - pending);
  const requests = buildMomentReminders(moments, now);
  let error: string | null = null;
  for (const [index, item] of requests.slice(0, available).entries()) {
    if (!isCurrent()) return error;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `${MOMENT_NOTIFICATION_PREFIX}${index}`,
        content: {
          title: 'Important Moment',
          body: item.body,
          // The system default sound; on iOS identical to the old `'default'`. See actions/notifications.ts.
          sound: true,
          data: { momentID: item.id, momentOwner: owner } satisfies MomentNotificationPayload,
        },
        // `UNTimeIntervalNotificationTrigger(timeInterval: max(1, …))`.
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Math.max(now + 1000, item.at)), ...reminderChannel() },
      });
      logReminderScheduled('moment', String(index), Math.max(now + 1000, item.at), now);
    } catch (failure) {
      logReminderSkipped('moment', String(index), `scheduling failed (${failure instanceof Error ? failure.name : 'error'})`, item.at, now);
      error = MOMENT_NOTIFICATION_ERRORS.failed;
    }
  }
  if (requests.length > available) {
    logReminderSkipped('moment', null, `${requests.length - available} wish reminders over the device limit`);
    error = MOMENT_NOTIFICATION_ERRORS.limited(available);
  }
  await logPendingReminders('wish reminder scheduling');
  return error;
}

/** Reads `userInfo` (TaskActionNotifications.swift:68). */
export function readMomentPayload(data: unknown): MomentNotificationPayload | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (typeof record.momentID !== 'string' || typeof record.momentOwner !== 'string') return null;
  return { momentID: record.momentID, momentOwner: record.momentOwner };
}
