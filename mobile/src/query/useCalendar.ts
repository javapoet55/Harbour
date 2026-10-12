import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

import { endpoints, isApiError, type Agenda, type CalendarConnection, type CalendarEventInput, type CalendarEventResponse } from '../api';
import { connectOutcome, DISCONNECTED_MESSAGE, writesMessage } from '../lib/calendarConnections';
import { calendarPushNotice } from '../lib/calendarPush';
import { useCalendarNotice } from '../store/calendarNotice';
import { useSession } from '../store/session';
import { getApiUrl } from '../config';
import { beginOAuthSession, LATE_CALLBACK_MS, takeOAuthCallback, waitForOAuthCallback } from '../lib/oauthCallbacks';
import { queryKeys } from './keys';
import { bumpRevision, currentRevision, isCurrent } from './taskRevision';
import { refreshSupplementaryData, reloadProfile } from './useProfile';
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
  return useMutation<CalendarEventResponse, Error, Omit<CalendarEventInput, 'requestId'> & { requestId?: string }>({
    mutationFn: async (input) => {
      const requestId = input.requestId ?? randomUUID();
      const response = await scheduleRequest(
        (body) => endpoints.createCalendarEvent(body as unknown as CalendarEventInput),
        { ...input, requestId } as unknown as Record<string, unknown>,
        onConflict,
      );
      // `guard result.success else { throw APIError.invalidResponse }`
      if (!response.success) throw new Error('The server returned an unexpected response. Please try again later.');
      return response;
    },
    onSuccess: (response) => {
      // Where the event went: New Event closes on success, so the Calendar tab shows this.
      useCalendarNotice.getState().show(calendarPushNotice(response), useSession.getState().profile?.id);
      // `await refresh()` — a new event changes the agenda, and the day view merges tasks into it.
      bumpRevision();
      void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.scheduleIntelligence() });
    },
  });
}

/**
 * The Calendar TAB still has no connect or sync controls, and that is correct: the connection list,
 * "Connect Google Calendar" and "Synchronize now" live in `ProfileSettingsView`'s "Calendars and
 * privacy" card (ios/App/ProfileView.swift:227-236, `connectionList` `:290-331`). The hooks below are
 * that card's data.
 */

/**
 * The Google OAuth start URL, built as `calendarConnectURL(provider:)` builds it
 * (ios/App/NexdoApp.swift:293-304, commit 3a26c52): the `/start` route on the CONFIGURED API origin
 * with `native=1` and the one-time `connect_token`.
 *
 * The token replaces the account session cookie, which no in-app browser sends — the reason the old
 * cookie-only flow came back "Sign in required" on both platforms. The server's start route verifies
 * it (src/app/api/calendar/oauth/[provider]/start/route.ts:17-19); it is valid for five minutes.
 */
export function googleConnectStartUrl(baseUrl: string, connectToken: string): string {
  return calendarConnectStartUrl(baseUrl, 'google', connectToken);
}

/** The same URL for any OAuth provider (`calendarConnectURL(provider:)`, NexdoApp.swift:311-322). */
export function calendarConnectStartUrl(baseUrl: string, provider: string, connectToken: string): string {
  const query = new URLSearchParams({ native: '1', connect_token: connectToken });
  return `${baseUrl}/api/calendar/oauth/${encodeURIComponent(provider)}/start?${query.toString()}`;
}

/** The OAuth providers the server connects (`src/app/api/calendar/oauth/[provider]`). */
export type CalendarOAuthProvider = 'google' | 'microsoft';

/** `providerName` as Swift derives it from a connection row (ProfileView.swift:546). */
export function oauthProviderName(provider: CalendarOAuthProvider): string {
  return provider === 'microsoft' ? 'Microsoft' : 'Google';
}

/** The provider a connection row belongs to; anything but microsoft is Google, as in Swift. */
export function oauthProviderOf(connection: Pick<CalendarConnection, 'provider'> | null | undefined): CalendarOAuthProvider {
  return connection?.provider.toLowerCase() === 'microsoft' ? 'microsoft' : 'google';
}

/**
 * The provider a callback URL names (`calendar=<provider>-connected`), for a deep link that lands after
 * Android dropped the browser session and the screen no longer knows which page started it.
 */
export function oauthProviderFromCallback(callbackUrl: string): CalendarOAuthProvider {
  const params = new URLSearchParams(callbackUrl.split('#')[0].split('?')[1] ?? '');
  return params.get('calendar') === 'microsoft-connected' ? 'microsoft' : 'google';
}

/** `CalendarConnectError.unavailable` (NexdoApp.swift:305-308): the server issued no usable token. */
export const CONNECT_UNAVAILABLE = 'Nexdo could not start the calendar connection. Please try again.';

/** The callback scheme `ASWebAuthenticationSession` is started with (ProfileView.swift:13). */
export const CONNECT_CALLBACK_SCHEME = 'nexdo';

/**
 * `CalendarOAuthResult` (ios/Sources/NexdoCore/ProfileSettings.swift, commit 27798c5): how a finished
 * Google sign-in ended. Closing Google's page is `cancelled`, and Settings then says nothing.
 */
export type CalendarOAuthResult = { kind: 'connected' } | { kind: 'cancelled' } | { kind: 'failed'; message: string };

/** What Settings shows: nothing when cancelled, else a message or a failure. */
export type GoogleConnectResult = { kind: 'cancelled' } | { kind: 'connected' | 'failed'; message: string };

/** 08be688 (ProfileSettings.swift:126-128): the callback is not Nexdo's calendar deep link. */
export const CALLBACK_UNEXPECTED = 'Unexpected calendar sign-in response. Please try again.';
/** 08be688 (ProfileSettings.swift:133-135): the server did not say this provider connected. */
export const CALLBACK_UNCONFIRMED = 'Calendar connection was not confirmed. Please try again.';

/**
 * `CalendarOAuthResult.init(callback:cancelled:error:providerName:)` (ProfileSettings.swift:121-137)
 * for the callback URL, in Swift's order:
 * 1. no callback — the browser closed without signing in — is `cancelled`;
 * 2. anything but `nexdo://calendar-connected` is a failure (Android's `nexdo:///calendar-connected`
 *    is the same link, as `oauthCallbackKind` reads it);
 * 3. `calendar=error`, or ANY `detail` parameter, is a failure quoting the detail;
 * 4. only `calendar=<provider>-connected` — what the server's callback sends on success
 *    (src/app/api/calendar/oauth/[provider]/callback/route.ts:76) — is `connected`. A bare callback, a
 *    cancelled one or another provider's is "not confirmed".
 */
export function parseCalendarCallback(callbackUrl: string | null | undefined, providerName = 'Google'): CalendarOAuthResult {
  if (!callbackUrl) return { kind: 'cancelled' };
  if (!/^nexdo:\/\/\/?calendar-connected(?:[?#]|$)/i.test(callbackUrl)) return { kind: 'failed', message: CALLBACK_UNEXPECTED };
  const params = new URLSearchParams(callbackUrl.split('#')[0].split('?')[1] ?? '');
  if (params.get('calendar') === 'error' || params.has('detail')) {
    const detail = params.get('detail') ?? 'authorization failed';
    return { kind: 'failed', message: `${providerName} Calendar connection failed: ${detail}` };
  }
  if (params.get('calendar') !== `${providerName.toLowerCase()}-connected`) return { kind: 'failed', message: CALLBACK_UNCONFIRMED };
  return { kind: 'connected' };
}

/** Google's callback, which is the only provider Settings connects today. */
export function parseGoogleCallback(callbackUrl: string | null | undefined): CalendarOAuthResult {
  return parseCalendarCallback(callbackUrl, 'Google');
}

/**
 * `ProfileSettingsView.connect(reconnecting:)` (ProfileView.swift, commit 27798c5) with
 * `CalendarOAuthCoordinator` and `calendarConnectURL` (NexdoApp.swift:293-304). The variable is the
 * row whose Reconnect started it, or `null` for a new connection: the same flow, since the server
 * updates the existing connection when the same Google account signs in.
 *
 * 1. `POST /api/calendar/oauth/google/connect-token` over the authenticated API session. An error
 *    here propagates with the API's own message; an empty token is `CONNECT_UNAVAILABLE`.
 * 2. `openAuthSessionAsync` on `/start?native=1&connect_token=…` — `ASWebAuthenticationSession`'s
 *    equivalent, with `prefersEphemeralWebBrowserSession = false`, so an existing Google sign-in in the
 *    system browser is reused. The server redirects back to `nexdo://calendar-connected?…`.
 * 3. Closing the browser is `cancelled`: no message. Any other browser error is a failure.
 * 4. Otherwise `completeGoogleConnect`.
 */
export function useConnectGoogleCalendar() {
  const connect = useConnectCalendar();
  return useMutation<GoogleConnectResult, Error, CalendarConnection | null>({
    mutationFn: (reconnecting) => connect.mutateAsync({ provider: oauthProviderOf(reconnecting), reconnecting }),
  });
}

/**
 * The same flow for either OAuth provider: the Connect Calendar provider page's Connect Now
 * (CalendarConnectionView.swift:244-262) and Settings' Reconnect, which Swift already sends to the
 * row's own provider (ProfileView.swift:545-546). `reconnecting` is the row whose Reconnect started
 * it, or `null` for a new connection.
 */
export function useConnectCalendar() {
  const queryClient = useQueryClient();
  return useMutation<GoogleConnectResult, Error, { provider: CalendarOAuthProvider; reconnecting?: CalendarConnection | null }>({
    mutationFn: async ({ provider, reconnecting = null }) => {
      const issued = await endpoints.calendarConnectToken(provider);
      if (!issued?.token) throw new Error(CONNECT_UNAVAILABLE);

      // Open while the browser is: `+native-intent` then leaves the redirect to this session.
      const end = beginOAuthSession('calendar');
      let callback: string | null;
      try {
        takeOAuthCallback('calendar');
        const result = await WebBrowser.openAuthSessionAsync(
          calendarConnectStartUrl(getApiUrl(), provider, issued.token),
          `${CONNECT_CALLBACK_SCHEME}://`,
        );
        // Android's polyfill reports `dismiss` when the app turns active, which can be just before the
        // redirect's deep link lands. iOS reports a real cancel as `cancel`.
        callback = result.type === 'success' ? result.url : result.type === 'dismiss' ? await waitForOAuthCallback('calendar', LATE_CALLBACK_MS) : null;
        takeOAuthCallback('calendar');
      } catch (cause) {
        return { kind: 'failed', message: `${oauthProviderName(provider)} Calendar connection failed: ${cause instanceof Error ? cause.message : String(cause)}` };
      } finally {
        end();
      }

      return completeCalendarConnect(queryClient, callback, provider, reconnecting);
    },
  });
}

/** `completeCalendarConnect` for Google: Settings' deep-link completion before the Microsoft page existed. */
export function completeGoogleConnect(queryClient: QueryClient, callbackUrl: string | null, reconnecting: CalendarConnection | null = null): Promise<GoogleConnectResult> {
  return completeCalendarConnect(queryClient, callbackUrl, 'google', reconnecting);
}

/**
 * Everything after the browser in `connect(reconnecting:)`, for a callback URL whichever way it
 * arrived: from the session, or as a deep link after Android dropped the session
 * (src/lib/oauthCallbacks.ts). Reloads the profile, then the connection list, then says which.
 */
export async function completeCalendarConnect(
  queryClient: QueryClient,
  callbackUrl: string | null,
  provider: CalendarOAuthProvider,
  reconnecting: CalendarConnection | null = null,
): Promise<GoogleConnectResult> {
  const providerName = oauthProviderName(provider);
  const parsed = parseCalendarCallback(callbackUrl, providerName);
  if (parsed.kind !== 'connected') return parsed;

  let refreshed = true;
  try {
    await reloadProfile(queryClient);
  } catch {
    refreshed = false;
  }
  // A failed refresh keeps the accounts already known (ProfileView.swift:557-558 reads the list
  // either way); the card shows `CONNECTIONS_REFRESH_FAILED` from the query's error.
  const connections = await queryClient
    .fetchQuery({ queryKey: queryKeys.calendar.connections(), queryFn: loadCalendarConnections, staleTime: 0, retry: false })
    .catch(() => queryClient.getQueryData<CalendarConnection[]>(queryKeys.calendar.connections()) ?? []);
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all() });
  return connectOutcome(reconnecting, refreshed, connections, providerName);
}

/**
 * The Connect Calendar screen's line when the connection worked but the list could not be reloaded
 * (CalendarConnectionView.swift:255-257). The screen waits for captures.
 */
export const CONNECTED_STATUS_UNLOADED = 'Calendar connected, but its latest status could not be loaded. Retry from Calendars & Privacy.';

/** What Settings shows when a refresh fails (`calendarConnectionsError`, NexdoApp.swift:345). */
export const CONNECTIONS_REFRESH_FAILED = 'Could not refresh calendar connections. Please try again.';

/**
 * `loadCalendarConnections()` (NexdoApp.swift:328-349). A failed refresh is now an ERROR, and the
 * accounts already on screen stay: Swift used to clear the list and mark it loaded, so one dropped
 * request read as "No calendars connected yet." and offered to connect again. It now keeps the list,
 * leaves `loaded` false until a load succeeds, and shows `CONNECTIONS_REFRESH_FAILED`.
 *
 * React Query keeps the previous `data` when a refetch throws, which is exactly that. One attempt,
 * 15 seconds, no automatic retry, as Swift. A sign-out clears the cache (useSignOut), which is
 * Swift's owner/generation guard.
 */
async function loadCalendarConnections(): Promise<CalendarConnection[]> {
  try {
    return (await endpoints.calendarConnections()).connections;
  } catch (cause) {
    if (isApiError(cause) && cause.code === 'SIGNED_OUT') throw cause;
    throw new Error(CONNECTIONS_REFRESH_FAILED);
  }
}

export function useCalendarConnections() {
  return useQuery({ queryKey: queryKeys.calendar.connections(), queryFn: loadCalendarConnections, retry: false });
}

/**
 * The card's state from the query: the accounts (kept through a failed refresh), whether a load has
 * ever succeeded (`calendarConnectionsLoaded`), and the refresh error (`calendarConnectionsError`).
 */
export function connectionsState(query: { data?: CalendarConnection[]; error: Error | null; isSuccess: boolean; dataUpdatedAt: number }): { connections: CalendarConnection[]; loaded: boolean; error: string | null } {
  return { connections: query.data ?? [], loaded: query.dataUpdatedAt > 0, error: query.error ? query.error.message : null };
}

/** `setCalendarWrites(id:enabled:)` (NexdoApp.swift:319-324). Resolves to the message Swift shows. */
export function useSetCalendarWrites() {
  const queryClient = useQueryClient();
  return useMutation<string, Error, { id: string; enabled: boolean }>({
    mutationFn: async ({ id, enabled }) => {
      await endpoints.setCalendarWrites(id, enabled);
      await queryClient.invalidateQueries({ queryKey: queryKeys.calendar.connections() });
      return writesMessage(enabled);
    },
  });
}

/** `disconnectCalendar(id:)` (NexdoApp.swift:325-331), which also refreshes the supplementary data. */
export function useDisconnectCalendar() {
  const queryClient = useQueryClient();
  return useMutation<string, Error, string>({
    mutationFn: async (id) => {
      await endpoints.disconnectCalendar(id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.calendar.connections() });
      refreshSupplementaryData(queryClient);
      return DISCONNECTED_MESSAGE;
    },
  });
}
