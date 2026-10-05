import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';

import { ownerKeyFor } from '../../actions/persistence';
import { closePresentedScreens } from '../../lib/sessionNavigation';
import { pomodoroStore } from './device';
import { usePomodoroRoute } from './route';

/**
 * `openPomodoroNotification()` (ios/App/RootView.swift:225-232), run by the tab shell on appear, when a
 * tap is parked, and — Swift's `onDismiss` hooks — whenever the presented screen changes:
 *
 * - an alert for another account is dropped;
 * - Ask open: it is closed first, and the tap waits for that;
 * - the Wellness chooser or a guide open: the tap waits until they close;
 * - Pomodoro already showing: nothing more to open;
 * - otherwise Pomodoro opens as a full-screen cover over the tabs.
 */
export function usePomodoroNotificationRoute(profileId: string | null | undefined): void {
  const pending = usePomodoroRoute((state) => state.owner);
  const pathname = usePathname();
  useEffect(() => {
    if (!pending || !profileId) return;
    let cancelled = false;
    void ownerKeyFor(profileId).then((key) => {
      if (cancelled) return;
      const clear = usePomodoroRoute.getState().clear;
      if (pending !== key) return clear();
      if (pathname.startsWith('/ask')) return void closePresentedScreens();
      if (pathname === '/wellness/pomodoro') return clear();
      if (pathname.startsWith('/wellness')) return;
      clear();
      router.push({ pathname: '/wellness/pomodoro', params: { from: 'notification' } });
    });
    return () => {
      cancelled = true;
    };
  }, [pending, profileId, pathname]);
}

/**
 * Pomodoro belongs to the signed-in account. Signing out (or switching account) resets the store and
 * removes the old account's pending alerts (`PomodoroStore.cancelAlerts(owner:)`); the next account's
 * cache loads when Pomodoro next opens.
 */
export function usePomodoroLifecycle(profileId: string | null | undefined): void {
  useEffect(() => {
    const owner = pomodoroStore.getState().owner;
    if (owner && owner !== profileId) pomodoroStore.getState().reset();
  }, [profileId]);
}
