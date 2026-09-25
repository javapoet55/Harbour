import * as Notifications from 'expo-notifications';
import { Alert, Linking, Platform } from 'react-native';

/**
 * The one place both reminder paths — Important Moments wishes and task actions — read, request and
 * explain notification permission.
 *
 * Swift has no equivalent file because iOS has one status enum: `UNAuthorizationStatus` tells
 * `.notDetermined` apart from `.denied`, so `ImportantMomentsStore.authorizeNotifications`
 * (ios/App/ImportantMomentsStore.swift:143-152) can ask only when the answer is still unknown.
 *
 * ANDROID HAS NO SUCH STATUS. `NotificationPermissionsModule.getPermissionsAsync` reports
 * `undetermined` only when POST_NOTIFICATIONS is granted while notifications are switched off, and a
 * fresh Android 13+ install — where the runtime permission has never been asked for — comes back as
 * `denied`, because `NotificationManagerCompat.areNotificationsEnabled()` is false until the
 * permission is granted. `canAskAgain` is the only field that separates "never asked" (and "asked
 * once, said no") from "blocked", so on Android it, not `status`, decides whether to prompt.
 */

/** `UNAuthorizationStatus`, as far as this app distinguishes it. */
export type ReminderAuthorization = 'notDetermined' | 'denied' | 'authorized' | 'provisional' | 'ephemeral';

/** The Android channel every local reminder is posted to. Android 8+ drops a notification without one. */
export const ANDROID_REMINDER_CHANNEL_ID = 'reminders';

export function classifyNotificationPermission(settings: Notifications.NotificationPermissionsStatus): ReminderAuthorization {
  const ios = settings.ios?.status;
  if (ios !== undefined && ios === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'provisional';
  if (ios !== undefined && ios === Notifications.IosAuthorizationStatus.EPHEMERAL) return 'ephemeral';
  if (Platform.OS === 'android') {
    // `granted` alone is not enough: POST_NOTIFICATIONS can be granted while the person has turned
    // Nexdo's notifications off in Settings, and only `status` folds that in.
    if (settings.status === 'granted') return 'authorized';
    return settings.canAskAgain ? 'notDetermined' : 'denied';
  }
  if (settings.granted) return 'authorized';
  if (settings.status === 'undetermined' || (settings.status !== 'denied' && settings.canAskAgain)) return 'notDetermined';
  return 'denied';
}

/** Reads the current status. Never prompts, so it is safe at launch and on every refresh. */
export async function notificationPermission(): Promise<ReminderAuthorization> {
  return classifyNotificationPermission(await Notifications.getPermissionsAsync());
}

/**
 * Shows the system prompt: POST_NOTIFICATIONS on Android 13+, `requestAuthorization` on iOS.
 *
 * Only call this from a place the person just asked for a reminder. The channel is created first so
 * that Android's prompt and the reminder that follows it belong to a channel that already exists.
 */
export async function requestNotificationPermission(request: Notifications.NotificationPermissionsRequest): Promise<ReminderAuthorization> {
  await ensureReminderChannel();
  return classifyNotificationPermission(await Notifications.requestPermissionsAsync(request));
}

/**
 * No-op on iOS, which has no channels. Creating the same channel twice only updates the few settings
 * Android still lets an app change; sound is not one of them, so it is fixed at first creation.
 *
 * `sound` is deliberately absent rather than `'default'`. expo-notifications treats a channel's
 * `sound` as the basename of a raw resource, so `'default'` sent it looking for `res/raw/default`,
 * found nothing, and logged "Custom sound 'default' not found in native app" on every call — which is
 * what showed in LogBox at launch. Omitting the key asks for `Settings.System.DEFAULT_NOTIFICATION_URI`
 * outright (AndroidXNotificationsChannelManager.createSoundUriFromArguments), which is the system
 * default sound and the same URI the unresolved name already fell back to. Passing `null` would mean
 * a silent channel, which is not the same thing.
 */
export async function ensureReminderChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_REMINDER_CHANNEL_ID, {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    enableVibrate: true,
  });
}

/** Spread into a `DATE` trigger. Android needs the channel named there; iOS has no such field. */
export function reminderChannel(): { channelId?: string } {
  return Platform.OS === 'android' ? { channelId: ANDROID_REMINDER_CHANNEL_ID } : {};
}

export const NOTIFICATIONS_OFF_TITLE = 'Scheduled notifications are off';

/**
 * The dialog for a denial we cannot lift from inside the app. Shown ONLY once the status is denied
 * or blocked — an undetermined status gets the system prompt instead.
 */
export function alertNotificationsOff(message: string): void {
  Alert.alert(NOTIFICATIONS_OFF_TITLE, message, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Open Settings', onPress: () => void Linking.openSettings() },
  ]);
}
