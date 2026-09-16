import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

import { endpoints, type Agenda, type CalendarEventInput } from '../api';
import { getApiUrl } from '../config';
import { queryKeys } from './keys';
import { bumpRevision, currentRevision, isCurrent } from './taskRevision';
import { reloadProfile } from './useProfile';
import { scheduleRequest, type ScheduleConflict } from './useTasks';

/**
 * The Calendar tab's data. Ports `CalendarView.load()` (ios/App/CalendarView.swift:481-500) and
 * `AppModel.calendarAgenda(from:days:)` / `createCalendarEvent` (NexdoApp.swift:431-434, 456-468).
 */

/**
 * `GET /api/agenda?from=<yyyy-MM-dd>&days=<n>`.
 *
 * Swift validates the response before publishing it: every requested day must be present in
 * `result.range.days`, otherwise it is treated as an invalid response
 * (CalendarView.swift:494). The same check is here, because a short range would silently render
 * empty days rather than an error.
 *
 * The `taskRevision` guard is reused: the agenda carries task rows, so a response captured before a
 * save must not reinstate the pre-save copy.
 */
export function useCalendarAgenda(from: string, days: number) {
  const queryClient = useQueryClient();
  const key = queryKeys.agenda.range(from, String(days));
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const captured = currentRevision();
      const response = await endpoints.agenda(days, from);
      const returned = new Set(response.range.days ?? []);
      // The caller asks for `days` consecutive days starting at `from`; all must come back.
      if (returned.size < days) throw new Error('Couldn’t refresh this date range.');
      if (!isCurrent(captured)) {
        const existing = queryClient.getQueryData<Agenda>(key);
        if (existing) return existing;
      }
      return response;
    },
  });
}

/**
 * `AppModel.createCalendarEvent` (NexdoApp.swift:456-468).
 *
 * `requestId` is a fresh UUID per attempt in Swift's editor (`@State private var requestID = UUID()`),
 * and the server uses it to deduplicate a repeat series, so it is generated once per submission and
 * REUSED across a schedule-warning retry — a new id on the retry would create a second series.
 */
export function useCreateCalendarEvent({ onConflict }: { onConflict: (conflict: ScheduleConflict) => void }) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, Omit<CalendarEventInput, 'requestId'> & { requestId?: string }>({
    mutationFn: async (input) => {
      const requestId = input.requestId ?? randomUUID();
      const response = await scheduleRequest(
        (body) => endpoints.createCalendarEvent(body as unknown as CalendarEventInput),
        { ...input, requestId } as unknown as Record<string, unknown>,
        onConflict,
      );
      // `guard result.success else { throw APIError.invalidResponse }`
      if (!response.success) throw new Error('The server returned an unexpected response. Please try again later.');
    },
    onSuccess: () => {
      // `await refresh()` — a new event changes the agenda, and the day view merges tasks into it.
      bumpRevision();
      void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.scheduleIntelligence() });
    },
  });
}

/**
 * The Calendar TAB still has no connect or sync controls, and that is correct: "Connect Google
 * Calendar" and "Synchronize now" live in `ProfileSettingsView`'s "Calendars and privacy" card
 * (ios/App/ProfileView.swift:223-234). Phase 7 built them there, and `useConnectGoogleCalendar`
 * below is the `ASWebAuthenticationSession` half.
 */

/**
 * The Google OAuth start URL, built exactly as `CalendarOAuthCoordinator.connectGoogle` builds it
 * (ios/App/ProfileView.swift:11): the `/api/calendar/oauth/google/start` route with `native=1`.
 *
 * Swift HARDCODES the production origin there rather than using the configured API base. This takes
 * the base as an argument so a development build points at the same server the rest of the app does;
 * pass `getApiUrl()` to reproduce Swift against production.
 *
 * TODO(server-connect-token): this flow is currently BROKEN against production for any in-app
 * browser, Swift's included. The route requires the account session cookie, which neither
 * `ASWebAuthenticationSession` nor `expo-web-browser` sends, so the server returns a blank page
 * instead of redirecting to Google. A server-side fix is in progress, most likely accepting a
 * short-lived connect token as a query parameter. When it lands, add that parameter HERE — this is
 * the only place the URL is built, so nothing else changes.
 */
export function googleConnectStartUrl(baseUrl: string): string {
  return `${baseUrl}/api/calendar/oauth/google/start?native=1`;
}

/** The callback scheme `ASWebAuthenticationSession` is started with (ProfileView.swift:12). */
export const CONNECT_CALLBACK_SCHEME = 'nexdo';

export type GoogleConnectResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * The callback handler (ProfileView.swift:13-24).
 *
 * A callback carrying `calendar=error`, or ANY `detail` parameter, is a failure — Swift checks for
 * the presence of `detail`, not its value. Otherwise the profile is reloaded and the connection is
 * reported as made.
 */
export function parseGoogleCallback(callbackUrl: string | null | undefined): GoogleConnectResult {
  if (!callbackUrl) return { ok: false, message: 'Google Calendar authorization was cancelled.' };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(callbackUrl.split('?')[1] ?? '');
  } catch {
    return { ok: false, message: 'Google Calendar connection failed: authorization failed.' };
  }

  if (params.get('calendar') === 'error' || params.has('detail')) {
    const detail = params.get('detail') ?? 'authorization failed';
    return { ok: false, message: `Google Calendar connection failed: ${detail}` };
  }
  return { ok: true, message: 'Google Calendar connected and synchronized.' };
}

/**
 * `CalendarOAuthCoordinator.connectGoogle(model:completion:)` (ios/App/ProfileView.swift:9-29).
 *
 * `expo-web-browser`'s `openAuthSessionAsync` is `ASWebAuthenticationSession`: it opens the start URL
 * in a system browser tab that shares cookies with Safari/Chrome and hands back the first redirect to
 * the app's scheme. Swift sets `prefersEphemeralWebBrowserSession = false`, which is this default —
 * an existing Google sign-in in the system browser is reused.
 *
 * On success Swift reloads the profile and reports "connected and synchronized"; a reload that fails
 * still counts as connected, with a softer message (`:22-23`).
 */
export function useConnectGoogleCalendar() {
  const queryClient = useQueryClient();
  return useMutation<GoogleConnectResult, Error, void>({
    mutationFn: async () => {
      const result = await WebBrowser.openAuthSessionAsync(
        googleConnectStartUrl(getApiUrl()),
        `${CONNECT_CALLBACK_SCHEME}://`,
      );

      // `guard let callback else { completion("… was cancelled.") }` — dismiss and cancel both land
      // here, as they do in Swift's `.canceledLogin` branch.
      if (result.type !== 'success') {
        return { ok: false, message: 'Google Calendar authorization was cancelled.' };
      }

      const parsed = parseGoogleCallback(result.url);
      if (!parsed.ok) return parsed;

      try {
        await reloadProfile(queryClient);
        void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all() });
        return parsed;
      } catch {
        return { ok: true, message: 'Google Calendar connected, but Nexdo could not refresh it yet.' };
      }
    },
  });
}
