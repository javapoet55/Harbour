import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { useCoordinator } from './coordinator';
import { DEFAULT_ACTION_IDENTIFIER, FOREGROUND_PRESENTATION, registerActionCategory, readActionPayload } from './notifications';

/**
 * `TaskActionAppDelegate` (ios/App/TaskActionNotifications.swift:42-73) and the `.sheet(item:
 * $taskActions.route)` it drives (ios/App/RootView.swift:60-62).
 *
 * Three jobs, in Swift's order:
 * 1. register the `CONTACT_TASK` category and its four buttons at launch;
 * 2. answer `willPresent` with banner + list + sound, so a reminder shows while Nexdo is open;
 * 3. hand every response to `TaskActionCoordinator.receive`, which decides what to open.
 *
 * COLD START, BACKGROUND AND FOREGROUND all go through the same path.
 * `getLastNotificationResponseAsync` returns the response that launched the app, which is the cold
 * start case; the listener covers the other two. A response that arrives before the account's
 * actions have loaded is held by the coordinator as `pending` and replayed by `synchronize`, so a
 * cold start never drops a tap.
 */

// The delegate is set at launch in Swift, before any view exists; this is the module-scope
// equivalent, so a notification delivered during startup is still presented correctly.
Notifications.setNotificationHandler({
  handleNotification: async () => FOREGROUND_PRESENTATION,
});

/** `didReceive response` (TaskActionNotifications.swift:65-72). */
export function handleNotificationResponse(response: Notifications.NotificationResponse): void {
  const payload = readActionPayload(response.notification.request.content.data);
  if (!payload) return;
  useCoordinator.getState().receive({
    actionID: payload.actionID,
    owner: payload.owner,
    // Tapping the body is the default identifier; Swift passes it through unchanged, and
    // `TaskActionChannel(rawValue:)` simply fails to match it, so the screen opens with no channel.
    choice: response.actionIdentifier,
  });
}

/** Whether a response came from the notification body rather than one of the four buttons. */
export function isBodyTap(response: Notifications.NotificationResponse): boolean {
  return response.actionIdentifier === DEFAULT_ACTION_IDENTIFIER;
}

export function useActionNotifications(): void {
  useEffect(() => {
    void registerActionCategory();

    // The response that launched the app from a cold start.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleNotificationResponse(response);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => subscription.remove();
  }, []);

  /**
   * `.sheet(item: $taskActions.route) { TaskActionView(actionID:preferred:) }`
   * (ios/App/RootView.swift:60-62): the coordinator asks for a screen, the router opens it.
   *
   * `startSelectedAction` is NOT passed here. A notification button pre-SELECTS its channel and
   * stops; only the Today card's channel buttons start the lookup immediately
   * (TodayActionsView.swift:41-42).
   */
  const route = useCoordinator((state) => state.route);
  useEffect(() => {
    if (!route) return;
    router.push({
      pathname: '/action/[id]',
      params: { id: route.id, ...(route.preferred ? { preferred: route.preferred } : {}) },
    });
  }, [route]);
}
