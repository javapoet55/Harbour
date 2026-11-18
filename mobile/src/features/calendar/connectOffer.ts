import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import type { CalendarConnection } from '../../api';
import { refreshCalendarConnections } from '../../query/useCalendar';
import { useSession } from '../../store/session';
import { hasDeviceCalendarAccess } from './deviceCalendars';

/**
 * The Calendar tab's "Connect your calendar" offer (fbce45b, 9acb39a; `offerCalendarConnection()`,
 * ios/App/CalendarView.swift:263-277): "Only prompt after a successful status refresh. Empty events or an
 * offline response do not mean that the user has never connected a calendar."
 */

/**
 * Whether the sheet shows, given a refresh that SUCCEEDED for the account still signed in:
 *
 * - `model.calendarConnections.isEmpty`: no Google or Outlook connection on the server, and
 * - `EKEventStore.authorizationStatus(for: .event) != .fullAccess`: the phone's own calendars cannot be read
 *   (on Android, calendar permission not granted).
 */
export function offersCalendarConnection(connections: readonly CalendarConnection[], deviceCalendarsReadable: boolean): boolean {
  return connections.length === 0 && !deviceCalendarsReadable;
}

/**
 * ANDROID AHEAD (docs/android-polish.md §57; §24 Swift bug 14): Swift keeps "Not now" in view state only, so the
 * offer returns on every cold launch. Here an answer — Not now, Back, a tap outside, or Yes — is remembered on
 * this device for that account, and the offer never comes back for it. An offer left unanswered (the app
 * closed under it) is not an answer, so it is offered again.
 */
export const CALENDAR_OFFER_ANSWERED_PREFIX = 'nexdo.calendarConnectOffer.answered.';

export async function calendarOfferAnswered(owner: string): Promise<boolean> {
  return (await AsyncStorage.getItem(CALENDAR_OFFER_ANSWERED_PREFIX + owner).catch(() => null)) === 'true';
}

export async function rememberCalendarOfferAnswered(owner: string): Promise<void> {
  await AsyncStorage.setItem(CALENDAR_OFFER_ANSWERED_PREFIX + owner, 'true').catch(() => undefined);
}

/**
 * The offer's state for the Calendar tab. It runs each time the tab comes into focus, as Swift's
 * `.task(id: model.profile?.id)` reruns on every appearance. It shows at most once per signed-in account
 * for as long as the tab stays mounted (`promptedAccount`): "Do not repeatedly interrupt this visit after
 * Not now or a swipe dismissal." Once answered, never again on this device for that account (above).
 *
 * A failed refresh, a sign-out or account switch mid-check, or the tab losing focus first shows nothing
 * and leaves the account un-prompted, so the next visit asks again.
 */
export function useCalendarConnectOffer(): { visible: boolean; close: () => void } {
  const queryClient = useQueryClient();
  const owner = useSession((state) => state.profile?.id ?? null);
  const promptedAccount = useRef<string | null>(null);
  const [visible, setVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      // `guard let owner = model.profile?.id, promptedAccount != owner else { return }`
      if (owner === null || promptedAccount.current === owner) return;
      let cancelled = false;
      void (async () => {
        // Answered before on this device: no refresh, no offer.
        if (await calendarOfferAnswered(owner)) {
          promptedAccount.current = owner;
          return;
        }
        if (cancelled) return;
        let connections: CalendarConnection[];
        try {
          connections = await refreshCalendarConnections(queryClient);
        } catch {
          return;
        }
        // `!Task.isCancelled, model.profile?.id == owner`
        if (cancelled || useSession.getState().profile?.id !== owner) return;
        const readable = await hasDeviceCalendarAccess().catch(() => false);
        if (cancelled || promptedAccount.current === owner || !offersCalendarConnection(connections, readable)) return;
        promptedAccount.current = owner;
        setVisible(true);
      })();
      return () => {
        cancelled = true;
      };
    }, [owner, queryClient]),
  );

  // Every way out of the sheet is an answer, so each one is remembered for the account it was shown to.
  const close = useCallback(() => {
    setVisible(false);
    if (promptedAccount.current !== null) void rememberCalendarOfferAnswered(promptedAccount.current);
  }, []);
  return { visible, close };
}
