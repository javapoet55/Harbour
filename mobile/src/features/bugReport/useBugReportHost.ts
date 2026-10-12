import { randomUUID } from 'expo-crypto';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Dimensions, type View } from 'react-native';

import { configureBugReports, loadShakeSetting, trackBugReportRoute } from './coordinator';
import { bugDeviceInfo, captureAppRoot } from './device';

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

  return root;
}
