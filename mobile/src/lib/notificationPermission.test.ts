import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as Notifications from 'expo-notifications';
import { Alert, Linking, Platform } from 'react-native';

import {
  ANDROID_REMINDER_CHANNEL_ID,
  alertNotificationsOff,
  classifyNotificationPermission,
  ensureReminderChannel,
  notificationPermission,
  reminderChannel,
  requestNotificationPermission,
} from './notificationPermission';

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const onPlatform = (os: 'ios' | 'android') => jest.replaceProperty(Platform, 'OS', os);

/** What `NotificationPermissionsModule` actually resolves to in each state. */
const ANDROID = {
  /** Fresh install on Android 13+: POST_NOTIFICATIONS never asked, so notifications are not enabled. */
  undetermined: { granted: false, canAskAgain: true, status: 'denied' },
  /** Said no once — Android still shows the prompt a second time. */
  refusedOnce: { granted: false, canAskAgain: true, status: 'denied' },
  /** Said no twice, or turned Nexdo's notifications off in Settings. */
  blocked: { granted: false, canAskAgain: false, status: 'denied' },
  granted: { granted: true, canAskAgain: true, status: 'granted' },
} as const;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('classifyNotificationPermission', () => {
  it('reads Android’s "denied" as undetermined while the system will still prompt', () => {
    onPlatform('android');
    expect(classifyNotificationPermission(ANDROID.undetermined as never)).toBe('notDetermined');
    expect(classifyNotificationPermission(ANDROID.refusedOnce as never)).toBe('notDetermined');
    expect(classifyNotificationPermission(ANDROID.blocked as never)).toBe('denied');
    expect(classifyNotificationPermission(ANDROID.granted as never)).toBe('authorized');
  });

  it('never calls Android authorized on `granted` alone, which ignores notifications switched off in Settings', () => {
    onPlatform('android');
    // POST_NOTIFICATIONS is granted, but `areNotificationsEnabled()` is false.
    expect(classifyNotificationPermission({ granted: true, canAskAgain: false, status: 'denied' } as never)).toBe('denied');
  });

  it('keeps iOS on UNAuthorizationStatus', () => {
    onPlatform('ios');
    expect(classifyNotificationPermission({ granted: false, canAskAgain: true, status: 'undetermined' } as never)).toBe('notDetermined');
    expect(classifyNotificationPermission({ granted: false, canAskAgain: false, status: 'denied' } as never)).toBe('denied');
    expect(classifyNotificationPermission({ granted: true, canAskAgain: false, status: 'granted' } as never)).toBe('authorized');
    expect(classifyNotificationPermission({ granted: false, canAskAgain: true, status: 'granted', ios: { status: 3 } } as never)).toBe('provisional');
  });
});

describe('the reminder channel', () => {
  it('is created on Android, at high importance, and named on the trigger', async () => {
    onPlatform('android');
    await ensureReminderChannel();
    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith(ANDROID_REMINDER_CHANNEL_ID, {
      name: 'Reminders',
      importance: 4,
      enableVibrate: true,
    });
    expect(reminderChannel()).toEqual({ channelId: ANDROID_REMINDER_CHANNEL_ID });
  });

  /**
   * expo-notifications resolves a channel's `sound` as a raw-resource basename, so `'default'` made
   * it log "Custom sound 'default' not found in native app" on every call — the LogBox error at
   * launch, from `replaceMomentNotifications` → `ensureReminderChannel`. Omitting the key asks for
   * the system default outright; `null` would mean silent, which is not what is wanted.
   */
  it('asks for the system default sound by omitting the key, never the name "default"', async () => {
    onPlatform('android');
    await ensureReminderChannel();
    const [, options] = mocked.setNotificationChannelAsync.mock.calls[0];
    expect(options).not.toHaveProperty('sound');
    expect(Object.values(options as Record<string, unknown>)).not.toContain('default');
  });

  it('does not exist on iOS', async () => {
    onPlatform('ios');
    await ensureReminderChannel();
    expect(mocked.setNotificationChannelAsync).not.toHaveBeenCalled();
    expect(reminderChannel()).toEqual({});
  });

  it('is in place before the system prompt, so a reminder cannot land without one', async () => {
    onPlatform('android');
    const order: string[] = [];
    mocked.setNotificationChannelAsync.mockImplementationOnce(async () => {
      order.push('channel');
      return null as never;
    });
    mocked.requestPermissionsAsync.mockImplementationOnce(async () => {
      order.push('request');
      return ANDROID.granted as never;
    });
    await expect(requestNotificationPermission({ ios: { allowAlert: true, allowSound: true } })).resolves.toBe('authorized');
    expect(order).toEqual(['channel', 'request']);
  });
});

/**
 * The failure this guards against is a runtime log, not a type error: `sound` accepts any string, so
 * `'default'` type-checks everywhere and only Android says anything, once, at launch.
 */
describe('no notification asks for a sound file named "default"', () => {
  const sources = ['lib/notificationPermission.ts', 'actions/notifications.ts', 'features/moments/notifications.ts'];

  it.each(sources)('src/%s uses the system default rather than the name', (file) => {
    const source = readFileSync(join(__dirname, '..', file), 'utf8');
    // Comments explain the history, so only real code is checked.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/sound:\s*'default'/);
  });
});

describe('notificationPermission', () => {
  it('reads the live status without ever prompting', async () => {
    onPlatform('android');
    mocked.getPermissionsAsync.mockResolvedValue(ANDROID.undetermined as never);
    await expect(notificationPermission()).resolves.toBe('notDetermined');
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('alertNotificationsOff', () => {
  it('offers Settings, and opens them', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    alertNotificationsOff('Notifications are off.');
    expect(alert).toHaveBeenCalledWith('Scheduled notifications are off', 'Notifications are off.', [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: expect.any(Function) },
    ]);
    alert.mock.calls[0][2]?.[1].onPress?.();
    expect(settings).toHaveBeenCalled();
  });
});
