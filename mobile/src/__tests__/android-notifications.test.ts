import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';

import { ensureNotificationPermission, replaceScheduledNotifications } from '../actions/notifications';
import { ANDROID_REMINDER_CHANNEL_ID } from '../lib/notificationPermission';
import { reminderAuthorization, replaceMomentNotifications, requestReminderAuthorization } from '../features/moments/notifications';
import { createMomentsStore, type MomentsDeps } from '../features/moments/store';
import { draft, moment, plan } from '../features/moments/testFixtures';

/**
 * Android 13+ asks for POST_NOTIFICATIONS at runtime, and `getPermissionsAsync` reports a fresh
 * install as `denied` with `canAskAgain: true`. These are the three answers that state can lead to,
 * exercised through the real Moments notification module and the real task-action scheduler.
 */

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const NOW = Date.parse('2030-09-01T12:00:00Z');

const UNDETERMINED = { granted: false, canAskAgain: true, status: 'denied' };
const BLOCKED = { granted: false, canAskAgain: false, status: 'denied' };
const GRANTED = { granted: true, canAskAgain: true, status: 'granted' };

let alerted: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  alerted = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mocked.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  mocked.getPresentedNotificationsAsync.mockResolvedValue([]);
});

/** The store with its real notification dependencies — only the API is faked. */
function momentsStore(overrides: Partial<MomentsDeps> = {}) {
  return createMomentsStore({
    api: {
      snapshot: jest.fn(async () => ({ moments: [], emailAccount: null, emailConfigured: false, automaticEmailEnabled: false })),
      post: jest.fn(async (): Promise<never> => ({ ok: true }) as never),
      deleteAll: jest.fn(async () => ({ ok: true as const })),
    },
    ownerKey: jest.fn(async (id: string) => `hash-${id}`),
    authorization: reminderAuthorization,
    requestAuthorization: requestReminderAuthorization,
    replaceNotifications: jest.fn(async () => null),
    clearNotifications: jest.fn(async () => undefined),
    now: () => NOW,
    ...overrides,
  });
}

describe('scheduling a wish with "Notify me 1 hour before"', () => {
  it('undetermined then granted: shows the system prompt, then goes through', async () => {
    mocked.getPermissionsAsync.mockResolvedValueOnce(UNDETERMINED as never).mockResolvedValue(GRANTED as never);
    mocked.requestPermissionsAsync.mockResolvedValue(GRANTED as never);
    const store = momentsStore();

    await expect(store.getState().authorizeNotifications()).resolves.toBeUndefined();

    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(store.getState().reminderAuthorization).toBe('authorized');
    expect(alerted).not.toHaveBeenCalled();
  });

  it('undetermined then denied: prompts once, then explains where to turn it back on', async () => {
    mocked.getPermissionsAsync.mockResolvedValue(UNDETERMINED as never);
    mocked.requestPermissionsAsync.mockResolvedValue(UNDETERMINED as never);
    const store = momentsStore();

    await expect(store.getState().authorizeNotifications()).rejects.toThrow('Notifications are off.');

    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(alerted).toHaveBeenCalledWith('Scheduled notifications are off', expect.stringContaining('Enable notifications for Nexdo in Settings'), [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: expect.any(Function) },
    ]);
  });

  it('blocked: never prompts, goes straight to the Settings dialog', async () => {
    mocked.getPermissionsAsync.mockResolvedValue(BLOCKED as never);
    const store = momentsStore();

    await expect(store.getState().authorizeNotifications()).rejects.toThrow('Notifications are off.');

    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(alerted).toHaveBeenCalledTimes(1);
    expect(store.getState().reminderAuthorization).toBe('denied');
  });
});

describe('"Enable wish reminders" in Moment settings', () => {
  it('prompts from an undetermined status and rebuilds the reminders', async () => {
    // The status only changes once the person has answered the prompt.
    mocked.getPermissionsAsync.mockImplementation(async () => (mocked.requestPermissionsAsync.mock.calls.length > 0 ? GRANTED : UNDETERMINED) as never);
    mocked.requestPermissionsAsync.mockResolvedValue(GRANTED as never);
    const replaceNotifications = jest.fn(async () => null);
    const store = momentsStore({ replaceNotifications });
    await store.getState().activate('u');
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    replaceNotifications.mockClear();

    await store.getState().enableWishReminders();

    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(replaceNotifications).toHaveBeenCalledTimes(1);
    expect(store.getState().error).toBeNull();
  });
});

describe('opening the Moments list', () => {
  it('reads the status but never prompts, so the one POST_NOTIFICATIONS prompt is left for a reminder', async () => {
    mocked.getPermissionsAsync.mockResolvedValue(UNDETERMINED as never);
    const store = momentsStore();

    await store.getState().prepareDefaultReminders();

    expect(store.getState().reminderAuthorization).toBe('notDetermined');
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(alerted).not.toHaveBeenCalled();
  });
});

describe('the wish reminders themselves', () => {
  const moments = [moment({ drafts: [draft({ plans: [plan({ id: 'p1', scheduledAtUTC: '2030-09-20T08:00:00Z', reminderOffset: 60 })] })] })];

  it('are posted to a channel that is created first', async () => {
    mocked.getPermissionsAsync.mockResolvedValue(GRANTED as never);

    await replaceMomentNotifications({ moments, owner: 'o', isCurrent: () => true, now: NOW });

    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith(ANDROID_REMINDER_CHANNEL_ID, expect.objectContaining({ importance: 4 }));
    expect(mocked.setNotificationChannelAsync.mock.invocationCallOrder[0]).toBeLessThan(mocked.scheduleNotificationAsync.mock.invocationCallOrder[0]);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: { type: 'date', date: new Date('2030-09-20T07:00:00Z'), channelId: ANDROID_REMINDER_CHANNEL_ID } }),
    );
  });

  it('are not rebuilt, and nothing is asked, while the status is still undetermined', async () => {
    mocked.getPermissionsAsync.mockResolvedValue(UNDETERMINED as never);

    await expect(replaceMomentNotifications({ moments, owner: 'o', isCurrent: () => true, now: NOW })).resolves.toBeNull();

    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('the task reminder path', () => {
  const notifications = [{ id: 'nexdo.action.a1', actionId: 'a1', taskId: 't1', fireAt: Date.parse('2030-09-02T09:00:00Z') }];
  const actions = [{ id: 'a1', contactName: 'Asha', status: 'pending' as const }];

  it('undetermined then granted: prompts, creates the channel, and schedules onto it', async () => {
    mocked.getPermissionsAsync.mockResolvedValue(UNDETERMINED as never);
    mocked.requestPermissionsAsync.mockResolvedValue(GRANTED as never);

    await replaceScheduledNotifications({ notifications, actions: actions as never, owner: 'o' });

    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mocked.setNotificationChannelAsync).toHaveBeenCalled();
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: { type: 'date', date: new Date('2030-09-02T09:00:00Z'), channelId: ANDROID_REMINDER_CHANNEL_ID } }),
    );
  });

  it('undetermined then denied: prompts once, then the Settings dialog, and schedules nothing', async () => {
    mocked.getPermissionsAsync.mockResolvedValue(UNDETERMINED as never);
    mocked.requestPermissionsAsync.mockResolvedValue(UNDETERMINED as never);

    await expect(replaceScheduledNotifications({ notifications, actions: actions as never, owner: 'o' })).rejects.toThrow('Notifications are off.');

    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(alerted).toHaveBeenCalledTimes(1);
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('blocked: no prompt, the Settings dialog only', async () => {
    mocked.getPermissionsAsync.mockResolvedValue(BLOCKED as never);

    await expect(ensureNotificationPermission()).rejects.toThrow('Notifications are off.');

    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(alerted).toHaveBeenCalledTimes(1);
  });
});
