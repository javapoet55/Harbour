import * as Notifications from 'expo-notifications';

import type { StoredTaskAction, TaskActionNotification } from '../lib/taskAction';
import {
  alertNotificationsOff,
  ensureReminderChannel,
  notificationPermission,
  reminderChannel,
  requestNotificationPermission,
} from '../lib/notificationPermission';
import { NOTIFICATION_ID_PREFIX } from '../lib/taskAction';
import { TaskActionError } from './errors';

/**
 * `LocalTaskActionScheduler` and `TaskActionAppDelegate`
 * (ios/App/TaskActionNotifications.swift:5-40 and `:42-73`).
 *
 * EVERYTHING HERE IS LOCAL. The Swift app never calls `registerForRemoteNotifications`, has no device
 * token, and posts to no registration endpoint — see the backend-gap note in
 * `docs/IOS_TO_REACT_NATIVE.md`. Reminders are `UNCalendarNotificationTrigger`s the app schedules on
 * the device, so nothing here needs a server or a push credential.
 */

/** `LocalTaskActionScheduler.category` (TaskActionNotifications.swift:7). */
export const ACTION_CATEGORY = 'CONTACT_TASK';

/**
 * The four buttons, with Swift's identifiers and titles in Swift's order
 * (TaskActionNotifications.swift:47-52).
 *
 * All four are `[.foreground, .authenticationRequired]`: every one opens the app, and none of them
 * acts from the lock screen. `opensAppToForeground: true` is the same contract.
 */
export const ACTION_BUTTONS = [
  { identifier: 'CALL', title: 'Call' },
  { identifier: 'MESSAGE', title: 'Message' },
  { identifier: 'EMAIL', title: 'Email' },
  { identifier: 'REMIND_LATER', title: 'Remind me later' },
] as const;

/**
 * `UNNotificationDismissActionIdentifier`, matched in `receive(actionID:owner:choice:)`
 * (TaskActionCoordinator.swift:83), where a dismissal cancels the action.
 *
 * expo-notifications passes the platform identifier straight through, and this is UserNotifications'
 * own constant. ANDROID NEVER DELIVERS IT — a swipe-away raises no response there — so the cancel
 * branch is iOS-only in practice; see Visual gaps.
 */
export const DISMISS_ACTION_IDENTIFIER = 'com.apple.UNNotificationDismissActionIdentifier';

/** `UNNotificationDefaultActionIdentifier`: tapping the body rather than a button. */
export const DEFAULT_ACTION_IDENTIFIER = Notifications.DEFAULT_ACTION_IDENTIFIER;

export type ActionNotificationPayload = { actionID: string; owner: string };

/**
 * `willPresent` (TaskActionNotifications.swift:61-64): `[.banner, .list, .sound]`.
 *
 * A reminder that fires while Nexdo is open is still shown, with sound, and still lands in the
 * notification list. It does NOT set a badge, because Swift does not ask for one here.
 */
export const FOREGROUND_PRESENTATION: Notifications.NotificationBehavior = {
  shouldShowBanner: true,
  shouldShowList: true,
  shouldPlaySound: true,
  shouldSetBadge: false,
};

/** `center.getNotificationCategories { … setNotificationCategories }` (TaskActionNotifications.swift:45-57). */
export async function registerActionCategory(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(
    ACTION_CATEGORY,
    ACTION_BUTTONS.map((button) => ({
      identifier: button.identifier,
      buttonTitle: button.title,
      options: { opensAppToForeground: true },
    })),
    // `options: [.customDismissAction]` (TaskActionNotifications.swift:56).
    { customDismissAction: true },
  );
}

/**
 * The authorization check Swift runs INSIDE `replace(with:actions:owner:)`
 * (TaskActionNotifications.swift:20-25), not at launch.
 *
 * Swift asks for permission only when there is at least one reminder to schedule, and only if the
 * status is still `notDetermined`. An already-denied app is never re-prompted; it shows the Settings
 * dialog and throws instead. On Android 13+ the prompt this raises is POST_NOTIFICATIONS.
 */
export async function ensureNotificationPermission(): Promise<void> {
  let status = await notificationPermission();
  if (status === 'notDetermined') {
    status = await requestNotificationPermission({ ios: { allowAlert: true, allowSound: true, allowBadge: true } });
  }
  if (status === 'authorized' || status === 'provisional' || status === 'ephemeral') return;
  const denial = new TaskActionError('notificationsDenied');
  alertNotificationsOff(denial.message);
  throw denial;
}

/**
 * `replace(with:actions:owner:)` (TaskActionNotifications.swift:9-38).
 *
 * The scheduler OWNS every identifier starting `nexdo.action.` and replaces the whole set each time:
 * pending requests are cleared first, then delivered notifications whose action no longer exists are
 * removed, then the new plan is scheduled. That is what makes a completed or deleted task's reminder
 * disappear from the shade.
 */
export async function replaceScheduledNotifications({
  notifications,
  actions,
  owner,
}: {
  notifications: TaskActionNotification[];
  actions: StoredTaskAction[];
  owner: string;
}): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of scheduled) {
    if (request.identifier.startsWith(NOTIFICATION_ID_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
    }
  }

  const valid = new Set(
    actions.filter((action) => action.status === 'pending' || action.status === 'scheduled').map((action) => NOTIFICATION_ID_PREFIX + action.id),
  );
  const delivered = await Notifications.getPresentedNotificationsAsync();
  for (const item of delivered) {
    const id = item.request.identifier;
    if (id.startsWith(NOTIFICATION_ID_PREFIX) && !valid.has(id)) await Notifications.dismissNotificationAsync(id);
  }

  // `guard !notifications.isEmpty else { return }` — an empty plan never asks for permission.
  if (notifications.length === 0) return;
  await ensureNotificationPermission();
  await ensureReminderChannel();

  for (const notification of notifications) {
    const action = actions.find((item) => item.id === notification.actionId);
    if (!action) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: notification.id,
      content: {
        title: `Time to contact ${action.contactName}`,
        body: 'Choose Call, Message, Email, or remind me later.',
        categoryIdentifier: ACTION_CATEGORY,
        // `true` is the system default sound on both platforms, and on iOS is exactly what the old
        // `'default'` mapped to (`UNNotificationSound.default`). Android takes its sound from the
        // channel; this only matters there for pre-Oreo devices.
        sound: true,
        data: { actionID: action.id, owner } satisfies ActionNotificationPayload,
      },
      // `UNCalendarNotificationTrigger(dateMatching:repeats: false)` on the DEVICE calendar.
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(notification.fireAt), ...reminderChannel() },
    });
  }
}

/** Reads the payload Swift puts in `content.userInfo` (TaskActionNotifications.swift:32). */
export function readActionPayload(data: unknown): ActionNotificationPayload | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  const actionID = record.actionID;
  const owner = record.owner;
  if (typeof actionID !== 'string' || typeof owner !== 'string') return null;
  return { actionID, owner };
}
