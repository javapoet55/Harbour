import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { isTestReminderPath, scheduleTestReminder, TEST_REMINDER_ID } from './debugReminder';

const mocked = Notifications as unknown as Record<string, jest.Mock>;

describe('the development test reminder', () => {
  beforeEach(() => {
    for (const value of Object.values(mocked)) if (typeof value?.mockClear === 'function') value.mockClear();
    mocked.getPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted', canAskAgain: true });
    mocked.getAllScheduledNotificationsAsync.mockResolvedValue([]);
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('matches only its own deep-link path', () => {
    for (const path of ['nexdo://debug/test-reminder', 'exp+nexdo://debug/test-reminder', '/debug/test-reminder', 'debug/test-reminder/', 'debug/test-reminder?x=1']) {
      expect(isTestReminderPath(path)).toBe(true);
    }
    for (const path of ['nexdo://calendar-connected', 'debug/test-reminders', 'nexdo://debug', '/task/debug/test-reminder']) {
      expect(isTestReminderPath(path)).toBe(false);
    }
  });

  it('schedules one notification on the reminders channel 60 seconds ahead', async () => {
    const now = Date.parse('2026-09-24T14:00:00Z');
    await scheduleTestReminder(now);
    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith('reminders', expect.objectContaining({ importance: Notifications.AndroidImportance.HIGH }));
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: TEST_REMINDER_ID,
      content: { title: 'Nexdo test reminder', body: 'Local notifications are working.', sound: true },
      trigger: { type: 'date', date: new Date(now + 60_000), channelId: 'reminders' },
    });
  });

  it('does nothing in a release build', async () => {
    const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    try {
      expect(await scheduleTestReminder()).toBeNull();
      expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
    }
  });
});
