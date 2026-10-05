import type * as Notifications from 'expo-notifications';
import { create } from 'zustand';

/**
 * `PomodoroNotificationRoute` (ios/App/PomodoroStore.swift:5-8): a tapped Pomodoro alert parks its
 * hashed owner here, and the tab shell opens Pomodoro once it can (`openPomodoroNotification`,
 * RootView.swift:225-232) — see `usePomodoroNotificationRoute`.
 */
export const usePomodoroRoute = create<{ owner: string | null; receive: (owner: string) => void; clear: () => void }>()((set) => ({
  owner: null,
  receive: (owner) => set({ owner }),
  clear: () => set({ owner: null }),
}));

/** The payload a Pomodoro alert carries (`content.userInfo = ["pomodoroOwner": ownerKey(owner)]`). */
export function readPomodoroOwner(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const owner = (data as Record<string, unknown>).pomodoroOwner;
  return typeof owner === 'string' && owner !== '' ? owner : null;
}

/** `didReceive response` (TaskActionNotifications.swift:67, :76): a dismissal is ignored. */
export function handlePomodoroNotification(data: unknown, actionIdentifier: string, dismissIdentifier: string): boolean {
  const owner = readPomodoroOwner(data);
  if (!owner || actionIdentifier === dismissIdentifier) return false;
  usePomodoroRoute.getState().receive(owner);
  return true;
}

/** The marker on the in-app chime, which plays the default sound and shows nothing. */
export const CHIME_MARKER = 'pomodoroChime';

/**
 * The in-app chime is a notification only so that it can play the phone's default notification sound:
 * no banner, no list entry. Every other notification keeps `fallback` (`[.banner, .list, .sound]`).
 */
export function presentationFor(notification: Pick<Notifications.Notification, 'request'>, fallback: Notifications.NotificationBehavior): Notifications.NotificationBehavior {
  const data = notification.request.content.data as Record<string, unknown> | null | undefined;
  if (data && data[CHIME_MARKER] === true) return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: true, shouldSetBadge: false };
  return fallback;
}
