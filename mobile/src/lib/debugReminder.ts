import * as Notifications from 'expo-notifications';

import { ensureReminderChannel, reminderChannel } from './notificationPermission';
import { logPendingReminders, logReminderScheduled } from './reminderLog';

/**
 * DEVELOPMENT ONLY: `nexdo://debug/test-reminder` (or `exp+nexdo://debug/test-reminder`) schedules one
 * local notification on the reminders channel 60 seconds ahead, so a device can prove local
 * notifications fire without creating a task:
 *
 *   adb shell am start -a android.intent.action.VIEW -d "nexdo://debug/test-reminder" com.pinslots.nexdo
 *
 * `app/+native-intent.tsx` handles the link only when `__DEV__` is true; in a release build the path
 * is ignored like any unknown link and nothing is scheduled.
 */
export const TEST_REMINDER_ID = 'nexdo.debug.test-reminder';
export const TEST_REMINDER_DELAY_MS = 60_000;

/** Whether a deep-link path is the test-reminder trigger: `debug/test-reminder`, with or without a scheme or slash. */
export function isTestReminderPath(path: string): boolean {
  return /^(?:[a-z+]+:\/\/)?\/?debug\/test-reminder\/?(?:[?#].*)?$/i.test(path);
}

export async function scheduleTestReminder(now = Date.now()): Promise<string | null> {
  if (!__DEV__) return null;
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') {
    const asked = await Notifications.requestPermissionsAsync();
    if (asked.status !== 'granted') {
      console.log(`[reminders] test reminder not scheduled: notifications are ${asked.status}`);
      return null;
    }
  }
  await ensureReminderChannel();
  const fireAt = now + TEST_REMINDER_DELAY_MS;
  const id = await Notifications.scheduleNotificationAsync({
    identifier: TEST_REMINDER_ID,
    content: { title: 'Nexdo test reminder', body: 'Local notifications are working.', sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(fireAt), ...reminderChannel() },
  });
  logReminderScheduled('test', TEST_REMINDER_ID.replace('nexdo.debug.', ''), fireAt, now);
  await logPendingReminders('test reminder');
  return id;
}
