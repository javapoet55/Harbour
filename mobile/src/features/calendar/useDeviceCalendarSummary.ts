import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useSession } from '../../store/session';
import { calendarShown, deviceCalendarSelection } from './deviceCalendarSelection';
import { listDeviceCalendars } from './deviceCalendars';
import { useDeviceCalendarAccess } from './useDeviceCalendarAccess';

/**
 * `refreshAppleCalendarStatus()` (ios/App/ProfileView.swift:478-485) for Settings' phone-calendar card:
 * whether calendar access is allowed and how many of the phone's calendars this account shows. Swift
 * re-reads it on appear, on scene active, on the selection notification and on `EKEventStoreChanged`;
 * here on focus, on foreground and on the selection store's revision (there is no change listener, §32).
 */
export function useDeviceCalendarSummary(): { allowed: boolean; denied: boolean; count: number } {
  const access = useDeviceCalendarAccess();
  const owner = useSession((state) => state.profile?.id ?? null);
  const selection = deviceCalendarSelection((state) => state.selection);
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    void deviceCalendarSelection.getState().load(owner);
  }, [owner]);

  const reload = useCallback(async () => {
    if (!access.allowed) return;
    const current = owner;
    try {
      const calendars = await listDeviceCalendars();
      if (useSession.getState().profile?.id !== current) return;
      setIds(calendars.map((calendar) => calendar.id));
    } catch {
      setIds([]);
    }
  }, [access.allowed, owner]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  // A save on the phone-calendar list bumps the store's revision.
  useEffect(
    () =>
      deviceCalendarSelection.subscribe((state, previous) => {
        if (state.revision !== previous.revision) void reload();
      }),
    [reload],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload();
    });
    return () => subscription.remove();
  }, [reload]);

  const count = access.allowed ? ids.filter((id) => calendarShown(selection, id)).length : 0;
  return { allowed: access.allowed, denied: access.denied, count };
}
