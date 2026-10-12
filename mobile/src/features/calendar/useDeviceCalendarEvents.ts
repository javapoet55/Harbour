import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { CalendarEvent } from '../../api/types';
import { addDays } from '../../lib/taskQuery';
import { useSession } from '../../store/session';
import { deviceCalendarEvents, hasDeviceCalendarAccess } from './deviceCalendars';
import { deviceCalendarSelection, selectedCalendarIds } from './deviceCalendarSelection';

/**
 * The Calendar tab's phone events for its visible days (`CalendarView.load()`, CalendarView.swift:633-646,
 * bb57e09 / bdb68ce): read before the server is asked, from the account's chosen calendars, padded one
 * day before and two after so a floating all-day date still lands when the phone and profile zones differ.
 *
 * expo-calendar has no `EKEventStoreChanged` (android-polish.md §32), so the read is repeated when the tab
 * gains focus, when the app returns to the foreground, when the calendar choice changes, and on
 * pull-to-refresh (`reload`). A stale read — a later one started before it finished — is dropped.
 */
export function useDeviceCalendarEvents({ days, timeZone, enabled = true }: { days: number[]; timeZone: string; enabled?: boolean }): {
  events: CalendarEvent[];
  /** Whether events can be read at all; false hides the device data as Swift's `hasDeviceData` does. */
  hasAccess: boolean;
  loaded: boolean;
  reload: () => Promise<void>;
} {
  const owner = useSession((state) => state.profile?.id ?? null);
  const selection = deviceCalendarSelection((state) => state.selection);
  const selectionLoaded = deviceCalendarSelection((state) => state.loaded);
  const revision = deviceCalendarSelection((state) => state.revision);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [hasAccess, setHasAccess] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const token = useRef(0);
  const first = days[0];
  const last = days[days.length - 1];

  useEffect(() => {
    void deviceCalendarSelection.getState().load(owner);
  }, [owner]);

  const reload = useCallback(async () => {
    if (!enabled || owner === null || first === undefined || last === undefined || !selectionLoaded) return;
    const current = ++token.current;
    const access = await hasDeviceCalendarAccess();
    const result = access
      ? await deviceCalendarEvents({
          start: addDays(first, -1, timeZone),
          end: addDays(last, 2, timeZone),
          selectedIds: selectedCalendarIds({ selection }),
        }).catch(() => [])
      : [];
    if (current !== token.current) return;
    setHasAccess(access);
    setEvents(result);
    setLoaded(true);
  }, [enabled, owner, first, last, timeZone, selection, selectionLoaded]);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  // `.onChange(of: scenePhase) { if .active { load() } }` (CalendarView.swift:203).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload();
    });
    return () => subscription.remove();
  }, [reload]);

  // No change notification exists, so a return to the tab re-reads.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { events: enabled && owner !== null ? events : [], hasAccess: enabled && owner !== null && hasAccess, loaded, reload };
}
