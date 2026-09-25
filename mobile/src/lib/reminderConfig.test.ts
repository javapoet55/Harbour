import type { ConfigContext } from 'expo/config';

import appConfig from '../../app.config';

/**
 * expo-notifications fires a DATE trigger exactly only when `AlarmManager.canScheduleExactAlarms()` is
 * true (ExpoSchedulingDelegate.setupAlarm); otherwise Android 12+ gets an inexact alarm that can be
 * deferred well past a 15-minute snooze. The permission has to be in the manifest for that to be true.
 */
it('declares SCHEDULE_EXACT_ALARM so Android 12+ reminders fire on time', () => {
  const config = appConfig({ config: {} } as ConfigContext);
  expect(config.android?.permissions).toContain('android.permission.SCHEDULE_EXACT_ALARM');
  // Play restricts USE_EXACT_ALARM to alarm-clock and calendar apps.
  expect(config.android?.permissions).not.toContain('android.permission.USE_EXACT_ALARM');
  expect(config.android?.blockedPermissions).not.toContain('android.permission.SCHEDULE_EXACT_ALARM');
});
