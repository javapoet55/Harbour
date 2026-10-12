import { randomUUID } from 'expo-crypto';
import { router, usePathname } from 'expo-router';
import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { AppState, Dimensions, type View } from 'react-native';

import { useSession } from '../../store/session';
import { configureBugReports, isSignInPath, loadShakeSetting, openBugReport, trackBugReportRoute, useBugReport } from './coordinator';
import { bugDeviceInfo, captureAppRoot } from './device';
import { acceptShake, SHAKE_NEVER } from './model';

/**
 * Everything `BugReportCoordinator` needs from the app (ios/App/BugReportCoordinator.swift; RootView.swift:97-120
 * calls `configure(model:active:)`), mounted once by the root layout. Returns the ref of the view the
 * screenshot is taken from: the whole app, under the report.
 */
export function useBugReportHost(ownerId: string | null | undefined) {
  const root = useRef<View>(null);
  const pathname = usePathname();

  useEffect(() => {
    configureBugReports({
      capture: async () => {
        if (!root.current) throw new Error('No app root to capture');
        return captureAppRoot(root.current, Dimensions.get('window'));
      },
      device: bugDeviceInfo,
      present: () => router.push('/bug-report'),
      dismiss: () => {
        if (router.canGoBack()) router.back();
      },
      newId: randomUUID,
      now: Date.now,
    });
    return () => configureBugReports(null);
  }, []);

  // `.bugReportScreen(_:)`: the tag follows the route.
  useEffect(() => trackBugReportRoute(pathname), [pathname]);

  // The shake setting is the signed-in account's (`bug.shake.<owner>`), re-read when it changes.
  useEffect(() => {
    void loadShakeSetting(ownerId ?? null);
  }, [ownerId]);

  useBugShake(pathname);
  return root;
}

/**
 * The shake (BugReportCoordinator.swift:29-39, `BugShakeGate`): the accelerometer at 10 Hz while the
 * setting is on, the app is active, a profile is signed in, no report is open and this is not a sign-in
 * screen; a jolt over 2.7 g opens the report, at most once every 8 seconds.
 */
export function useBugShake(pathname: string) {
  const enabled = useBugReport((state) => state.shakeEnabled);
  const presenting = useBugReport((state) => state.presenting);
  const signedIn = useSession((state) => state.status === 'signedIn');
  const [active, setActive] = useState(AppState.currentState === 'active');
  const last = useRef(SHAKE_NEVER);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  const listening = enabled && signedIn && active && !presenting && !isSignInPath(pathname);
  useEffect(() => {
    if (!listening) return;
    let cancelled = false;
    let subscription: { remove: () => void } | null = null;
    void Accelerometer.isAvailableAsync()
      .then((available) => {
        if (!available || cancelled) return;
        Accelerometer.setUpdateInterval(100);
        subscription = Accelerometer.addListener(({ x, y, z }) => {
          const result = acceptShake(last.current, {
            enabled: useBugReport.getState().shakeEnabled,
            active: AppState.currentState === 'active',
            presenting: useBugReport.getState().presenting,
            acceleration: Math.sqrt(x * x + y * y + z * z),
            now: Date.now() / 1000,
          });
          last.current = result.last;
          if (result.accepted) void openBugReport();
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [listening]);
}
