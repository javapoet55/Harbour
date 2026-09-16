import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { endpoints, type Agenda, type DoNowRecommendation, type WeatherResponse, type WeeklySummary } from '../api';
import { queryKeys } from './keys';
import { currentRevision, isCurrent } from './taskRevision';

/**
 * The Today tab's data. Ports `AppModel.refreshAgenda` (ios/App/NexdoApp.swift:368-371),
 * `refreshWeather` (`:419-422`) and `recommendDoNow` (`:603-609`).
 */

/**
 * `GET /api/agenda?days=5`.
 *
 * The same `taskRevision` guard the task list uses: the agenda carries task rows, so a response
 * captured before a save must not reinstate the pre-save copy (NexdoApp.swift:369 checks
 * `taskRevision == revision` before publishing).
 */
export function useAgenda(days = 5) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.agenda.range(String(days), 'today'),
    queryFn: async () => {
      const captured = currentRevision();
      const response = await endpoints.agenda(days);
      if (!isCurrent(captured)) {
        const existing = queryClient.getQueryData<Agenda>(queryKeys.agenda.range(String(days), 'today'));
        if (existing) return existing;
      }
      return response;
    },
  });
}

/**
 * Weather.
 *
 * NO DEVICE LOCATION, and no new dependency. `WeatherClient.forecast()`
 * (ios/Sources/NexdoCore/WeatherClient.swift:14-32) calls open-meteo DIRECTLY with HARDCODED
 * coordinates — 37.7547, -121.8997, which is San Ramon, California, matching the "San Ramon weather"
 * accessibility label on the top bar (RootView.swift:1319). It never asks CoreLocation, and it never
 * goes through the Nexdo server, using a cookie-free ephemeral session so the account session is not
 * sent to a third party. This does the same with a bare `fetch`.
 *
 * TODO(phase7): the hardcoded coordinates are Swift's, not a Nexdo setting. If the account ever gains
 * a location preference, this is where it lands.
 */
const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=37.7547&longitude=-121.8997' +
  '&current=temperature_2m,weather_code' +
  '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
  '&forecast_days=5&temperature_unit=fahrenheit&timezone=auto';

export async function fetchWeather(): Promise<WeatherResponse> {
  const response = await fetch(WEATHER_URL, { credentials: 'omit' });
  if (!response.ok) throw new Error('Weather is temporarily unavailable.');
  const forecast = (await response.json()) as WeatherResponse;
  // `guard forecast.daily?.days.count == 5 else { throw APIError.invalidResponse }`
  if ((forecast.daily?.time.length ?? 0) !== 5) throw new Error('Weather is temporarily unavailable.');
  return forecast;
}

/**
 * Swift refreshes weather as part of `refreshSupplementaryData`, which runs alongside the agenda on
 * every `load()` and never blocks it — a failure is swallowed (`try?`, NexdoApp.swift:420). So this
 * never retries and never surfaces an error: the chip simply shows a dash.
 */
export function useWeather() {
  return useQuery({
    queryKey: queryKeys.weather(),
    queryFn: fetchWeather,
    retry: false,
    // Open-meteo's own cache is ten minutes; refetching faster gains nothing.
    staleTime: 10 * 60_000,
  });
}

/**
 * `AppModel.recommendDoNow(minutes:)` (NexdoApp.swift:603-609).
 *
 * NOT a query: Swift calls it on demand and on a 60-second loop while the sheet is open, and it is a
 * POST. `minutes` is null to use the calendar opening, or 1-480 to override it.
 *
 * It throws `APIError.response(403)` without AI consent, and `invalidResponse` when the turn carries
 * no `executive.nextAction` — both reproduced here.
 */
export function useDoNow() {
  return useMutation<DoNowRecommendation, Error, { minutes: number | null; aiConsent: boolean }>({
    mutationFn: async ({ minutes, aiConsent }) => {
      if (!aiConsent) throw new Error('Nexdo needs permission to use your tasks and calendar.');
      const response = await endpoints.doNow(minutes);
      const recommendation = response.executive;
      if (!recommendation || !recommendation.nextAction) {
        throw new Error('The server returned an unexpected response. Please try again later.');
      }
      return recommendation;
    },
  });
}

/** `recommendation.canStart` (DoNowRecommendation.swift:30). */
export function canStartRecommendation(recommendation: DoNowRecommendation): boolean {
  return recommendation.recommendedActions.some((action) => action.type === 'START_FOCUS');
}

/**
 * `AppModel.weeklySummary(start:)` (NexdoApp.swift:712-714). The week start is a `yyyy-MM-dd` day in
 * the account zone; the server defaults to the current week when it is omitted.
 */
export function useWeeklySummary(start: string) {
  return useQuery({
    queryKey: queryKeys.weeklySummary(start),
    queryFn: () => endpoints.weeklySummary(start),
  });
}

/**
 * `AppModel.weeklySummaryTasks(for:)` (NexdoApp.swift:715-719).
 *
 * The summary usually embeds `taskGroups`. When a deployment does not, Swift refetches `/api/tasks`
 * and re-derives the groups with the same cohort rules. That derivation is NOT ported: it duplicates
 * the server's cohort logic, and every current deployment embeds the groups.
 * TODO(phase4b-decision): port `WeeklySummary.taskGroups(from:)` if a deployment is found without it.
 */
export function weeklyTaskGroups(summary: WeeklySummary | undefined) {
  return summary?.taskGroups ?? null;
}

/**
 * `AppModel.refreshScheduleIntelligence` (NexdoApp.swift:377-401).
 *
 * Swift additionally REJECTS a snapshot whose `today.day` is not the current day in its own zone
 * (`:394`), because a stale snapshot would date the whole dashboard. The same check is here.
 */
export function useScheduleIntelligence() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.scheduleIntelligence(),
    queryFn: async () => {
      const captured = currentRevision();
      const response = await endpoints.scheduleIntelligence();
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: response.today.timeZone }).format(new Date());
      if (response.today.day !== today) {
        throw new Error('The server returned an unexpected response. Please try again later.');
      }
      if (!isCurrent(captured)) {
        const existing = queryClient.getQueryData(queryKeys.scheduleIntelligence());
        if (existing) return existing as typeof response;
      }
      return response;
    },
    retry: false,
  });
}
