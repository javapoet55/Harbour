import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';

import { endpoints, type Agenda, type CalendarEventInput } from '../api';
import { queryKeys } from './keys';
import { bumpRevision, currentRevision, isCurrent } from './taskRevision';
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
 * TODO(phase7): the Calendar TAB has no connect or sync controls. "Connect Google Calendar" and
 * "Synchronize now" live in `ProfileSettingsView`'s "Calendars and privacy" card
 * (ios/App/ProfileView.swift:223-234), which is screen 30 — Phase 7. `CalendarOAuth.connectGoogle`
 * (ProfileView.swift:10-30) drives an `ASWebAuthenticationSession` against
 * `/api/calendar/oauth/google/start` with the callback scheme `nexdo`, and `syncProfileCalendars`
 * POSTs `/api/calendar/sync` (NexdoApp.swift:291-294).
 *
 * When Phase 7 builds them:
 * - `expo-web-browser`'s `openAuthSessionAsync(startUrl, 'nexdo://')` mirrors the Swift session. That
 *   package contains NATIVE code, so adding it forces a new development build.
 * - The start URL is built in `googleConnectStartUrl` below so the server-side fix is one line.
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
