import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { useStore } from 'zustand';

import { ownerKeyFor } from '../../actions/persistence';
import { pomodoroApi } from '../../api/pomodoro';
import { ensureReminderChannel, reminderChannel, requestNotificationPermission } from '../../lib/notificationPermission';
import { CHIME_MARKER } from './route';
import { cacheKey, createPomodoroStore, type PomodoroAlert, type PomodoroCache, type PomodoroDeps, type PomodoroState } from './store';

/**
 * The live half of `PomodoroStore`: `UserDefaults` → AsyncStorage under the same key, and
 * `UNUserNotificationCenter` → expo-notifications (PomodoroStore.swift:115-145).
 */

export type PomodoroNotificationPayload = { pomodoroOwner: string };

async function load(owner: string): Promise<PomodoroCache | null> {
  const text = await AsyncStorage.getItem(cacheKey(owner));
  if (!text) return null;
  const value = JSON.parse(text) as PomodoroCache;
  return Array.isArray(value?.sessions) ? { sessions: value.sessions, currentID: value.currentID ?? null, synced: value.synced ?? {} } : null;
}

/**
 * `replaceAlerts()` (PomodoroStore.swift:121-139): remove every pending `pomodoro.<owner>.` request,
 * then — only if there is something to schedule — ask for permission and add the new ones. The
 * payload carries the hashed owner, as Swift's `TaskActionCoordinator.ownerKey(owner)`, so a tap after
 * an account switch is ignored.
 */
async function replaceAlerts(owner: string, alerts: PomodoroAlert[]): Promise<void> {
  const prefix = `pomodoro.${owner}.`;
  for (const request of await Notifications.getAllScheduledNotificationsAsync()) {
    if (request.identifier.startsWith(prefix)) await Notifications.cancelScheduledNotificationAsync(request.identifier);
  }
  if (alerts.length === 0) return;
  const permission = await requestNotificationPermission({ ios: { allowAlert: true, allowSound: true } });
  if (permission !== 'authorized' && permission !== 'provisional') return;
  await ensureReminderChannel();
  const pomodoroOwner = await ownerKeyFor(owner);
  const now = Date.now();
  for (const alert of alerts) {
    if (alert.at <= now) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: alert.id,
      content: { title: alert.title, body: alert.body, sound: alert.sound, data: { pomodoroOwner } satisfies PomodoroNotificationPayload },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Math.max(now + 1000, alert.at)), ...reminderChannel() },
    });
  }
}

/**
 * The in-app chime when a phase ends on screen. Swift plays iOS system sound 1005
 * (`AudioServicesPlaySystemSound`, PomodoroStore.swift:70), which has no file to ship. This plays the
 * phone's DEFAULT NOTIFICATION SOUND instead — the same sound the alert uses — by posting an immediate
 * notification that the foreground handler presents with sound only (`presentationFor`), then removing
 * it. Without notification permission it is silent, as an alert would be (android-polish.md §21).
 */
export async function playChime(): Promise<void> {
  try {
    await ensureReminderChannel();
    const channel = reminderChannel();
    const identifier = await Notifications.scheduleNotificationAsync({
      content: { title: 'Pomodoro', body: '', sound: true, data: { [CHIME_MARKER]: true } },
      trigger: channel.channelId ? { channelId: channel.channelId } : null,
    });
    setTimeout(() => void Notifications.dismissNotificationAsync(identifier).catch(() => undefined), 4000);
  } catch {
    // A chime that cannot play is skipped, as Swift's system sound would be on a muted phone.
  }
}

export function livePomodoroDeps(overrides: Partial<PomodoroDeps> = {}): PomodoroDeps {
  return {
    page: (owner, cursor) => pomodoroApi.page(owner, cursor),
    save: (owner, session) => pomodoroApi.save(owner, session),
    load,
    persist: (owner, cache) => AsyncStorage.setItem(cacheKey(owner), JSON.stringify(cache)),
    replaceAlerts,
    chime: () => void playChime(),
    uuid: () => Crypto.randomUUID().toUpperCase(),
    now: () => Date.now(),
    ...overrides,
  };
}

export const pomodoroStore = createPomodoroStore(livePomodoroDeps());

export function usePomodoro<T>(selector: (state: PomodoroState) => T): T {
  return useStore(pomodoroStore, selector);
}
