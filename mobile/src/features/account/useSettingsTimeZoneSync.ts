import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { deviceTimeZone } from '../../lib/profileSettings';
import { synchronizeDeviceTimeZone } from '../../query/useProfile';

/** How often Settings looks for a device time-zone change while it is open. */
export const ZONE_CHECK_MS = 60_000;

/**
 * Settings' device time-zone sync (5def56e / d05a379; ProfileView.swift:310-315, :645-647).
 *
 * - **On open**, `load()` runs `synchronizeDeviceTimeZone()` first. ANDROID AHEAD (docs/android-polish.md §65; §24
 *   Swift bug 12): Swift runs it in the same `do` as the profile load, so a failed PATCH leaves Settings on
 *   "Retry loading settings" and every retry repeats it. Here the sync runs beside the load and never blocks or
 *   fails it; Settings shows the profile it already has. The root layout reports a failed sync each time the
 *   app comes back to the foreground, and Save sends the device zone anyway.
 * - **On a zone change while Settings is open** (`NSSystemTimeZoneDidChange`): sync again, and say so if it
 *   fails, as Swift does (`failure = error.localizedDescription`). React Native has no zone-change event, so
 *   the device zone is compared once a minute. A change made while the app was in the background is already
 *   synced by the root layout on return.
 */
export function useSettingsTimeZoneSync(ownerId: string | null, onFailure: (message: string) => void): void {
  const queryClient = useQueryClient();
  const failure = useRef(onFailure);
  useEffect(() => {
    failure.current = onFailure;
  });

  useEffect(() => {
    if (!ownerId) return;
    synchronizeDeviceTimeZone(queryClient).catch(() => undefined);
  }, [ownerId, queryClient]);

  useEffect(() => {
    if (!ownerId) return undefined;
    let last = deviceTimeZone();
    const timer = setInterval(() => {
      const zone = deviceTimeZone();
      if (zone === last) return;
      last = zone;
      synchronizeDeviceTimeZone(queryClient).catch((cause: unknown) => failure.current(cause instanceof Error ? cause.message : String(cause)));
    }, ZONE_CHECK_MS);
    return () => clearInterval(timer);
  }, [ownerId, queryClient]);
}
