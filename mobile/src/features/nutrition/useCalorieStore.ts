import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import type {
  NutritionCallStarted,
  NutritionCodeSent,
  NutritionDay,
  NutritionEntry,
  NutritionEntryPatch,
  NutritionInsight,
  NutritionMeal,
  NutritionSettings,
  NutritionSettingsUpdate,
  NutritionSummary,
} from '../../api/nutrition';
import {
  useAddNutritionEntry,
  useDeleteNutritionEntry,
  useNutritionCallNow,
  useNutritionDay,
  useNutritionInsight,
  useNutritionInsightAction,
  useNutritionSettings,
  useNutritionSummary,
  useSaveNutritionSettings,
  useSendNutritionCode,
  useUpdateNutritionEntry,
  useVerifyNutritionCode,
} from '../../query/useNutrition';
import { useSession } from '../../store/session';
import { recomputed, sampleDay, SAMPLE_SUMMARY } from './sample';

/**
 * `CalorieStore` (ios/App/CalorieTrackerView.swift:70-215) for the Calorie Tracker's pages: one interface
 * over the part 1 query hooks when live, and over local sample data when not ("With no API client it
 * runs the design preview on local sample data").
 *
 * What loads mirrors Swift's `refresh()` (`:376-382`): the selected day always; the insight only for
 * today on the Today period; the summary for Week or Month, and the week on the Insights page.
 *
 * Every failed write — and a failed settings, day or summary load — goes to `onError`, which the screen
 * shows in Swift's one alert (`attempt`, `:107-110`). A failed insight load is no error (`:136`).
 */

export type CalorieStore = {
  live: boolean;
  settings: NutritionSettings | null;
  day: NutritionDay | null;
  summary: NutritionSummary | null;
  insight: NutritionInsight | null;
  /** `store.loading`: the first settings load. */
  loading: boolean;
  save: (update: NutritionSettingsUpdate) => Promise<boolean>;
  /** The server's answer — how the code went out, or that the number is already verified — or `null` after an error. */
  sendCode: (phone: string) => Promise<NutritionCodeSent | null>;
  verify: (code: string) => Promise<boolean>;
  /** The call's `status` from the server (`dialing`, `cancelled`, `failed`, …), or `null` after an error. */
  callNow: () => Promise<NutritionCallStarted['status'] | null>;
  add: (input: { meal: NutritionMeal; description: string; kcal: number }) => Promise<boolean>;
  update: (entry: NutritionEntry, change: { meal?: NutritionMeal; description?: string; kcal?: number; confirm?: boolean }) => Promise<boolean>;
  remove: (entry: NutritionEntry) => Promise<void>;
  actOnInsight: (add: boolean) => Promise<void>;
  /** Swift's `refresh()` on `go(.insights / .dashboard / .log)`: reload what the page shows. */
  refresh: () => void;
};

function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Request failed.';
}

export function useCalorieStore({
  live,
  dateKey,
  period,
  onInsightsPage,
  isToday,
  onError,
}: {
  onError: (message: string) => void;
  live: boolean;
  dateKey: string;
  period: 'Today' | 'Week' | 'Month';
  onInsightsPage: boolean;
  isToday: boolean;
}): CalorieStore {
  const owner = useSession((state) => state.profile?.id) ?? '';
  const queryClient = useQueryClient();
  const [sample, setSample] = useState<NutritionDay>(sampleDay);

  const wantsSummary = period !== 'Today' || onInsightsPage;
  const settings = useNutritionSettings({ enabled: live });
  const day = useNutritionDay(live ? dateKey : '');
  const insight = useNutritionInsight(live && period === 'Today' && isToday ? dateKey : '');
  const summary = useNutritionSummary(onInsightsPage ? 'week' : period === 'Month' ? 'month' : 'week', live && wantsSummary ? dateKey : '');

  const saveSettings = useSaveNutritionSettings();
  const sendCodeMutation = useSendNutritionCode();
  const verifyMutation = useVerifyNutritionCode();
  const callNowMutation = useNutritionCallNow();
  const addMutation = useAddNutritionEntry(dateKey);
  const updateMutation = useUpdateNutritionEntry(dateKey);
  const deleteMutation = useDeleteNutritionEntry(dateKey);
  const insightAction = useNutritionInsightAction(dateKey);

  // A failed load shows once per failure, as Swift's `attempt` sets `error` once.
  const seen = useRef(new Set<unknown>());
  const loadErrors = [settings.error, day.error, summary.error];
  useEffect(() => {
    for (const failure of loadErrors) {
      if (failure && !seen.current.has(failure)) {
        seen.current.add(failure);
        onError(message(failure));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, loadErrors);

  /** `attempt(_:)`: true on success; a failure sets `error`. */
  const attempt = async (work: () => Promise<unknown>): Promise<boolean> => {
    try {
      await work();
      return true;
    } catch (failure) {
      onError(message(failure));
      return false;
    }
  };

  if (!live) {
    return {
      live,
      settings: null,
      day: sample,
      summary: SAMPLE_SUMMARY,
      insight: null,
      loading: false,
      // `guard let api else { return true }`: the preview saves nothing and calls nobody.
      save: async () => true,
      sendCode: async () => ({ sent: true, channel: 'voice' }),
      verify: async () => true,
      callNow: async () => 'dialing',
      add: async ({ meal, description, kcal }) => {
        setSample((current) =>
          recomputed({
            ...current,
            entries: [...current.entries, { id: `sample-${Date.now()}-${current.entries.length}`, meal, description, kcal, source: 'MANUAL', status: 'CONFIRMED', fromCall: false }],
          }),
        );
        return true;
      },
      update: async (entry, change) => {
        setSample((current) =>
          recomputed({
            ...current,
            entries: current.entries.map((item) =>
              item.id !== entry.id
                ? item
                : {
                    ...item,
                    ...(change.meal ? { meal: change.meal } : {}),
                    ...(change.description !== undefined ? { description: change.description } : {}),
                    ...(change.kcal !== undefined ? { kcal: change.kcal } : {}),
                    ...(change.confirm || change.kcal !== undefined ? { status: 'CONFIRMED' } : {}),
                  },
            ),
          }),
        );
        return true;
      },
      remove: async (entry) => setSample((current) => recomputed({ ...current, entries: current.entries.filter((item) => item.id !== entry.id) })),
      actOnInsight: async () => undefined,
      refresh: () => undefined,
    };
  }

  return {
    live,
    settings: settings.data ?? null,
    day: day.data ?? null,
    summary: summary.data ?? null,
    insight: insight.data ?? null,
    loading: settings.isLoading,
    save: (update) => attempt(() => saveSettings.mutateAsync(update)),
    sendCode: async (phone) => {
      let answer: NutritionCodeSent | null = null;
      const sent = await attempt(async () => {
        answer = await sendCodeMutation.mutateAsync(phone);
      });
      return sent ? answer : null;
    },
    verify: (code) => attempt(() => verifyMutation.mutateAsync(code)),
    callNow: async () => {
      let status: NutritionCallStarted['status'] | null = null;
      const placed = await attempt(async () => {
        status = (await callNowMutation.mutateAsync()).status;
      });
      return placed ? status : null;
    },
    add: (input) => attempt(() => addMutation.mutateAsync(input)),
    update: (entry, change) => {
      // `EntryPatch(meal:description:kcal:confirm: confirm ? true : nil)`
      const patch: NutritionEntryPatch = {
        ...(change.meal ? { meal: change.meal } : {}),
        ...(change.description !== undefined ? { description: change.description } : {}),
        ...(change.kcal !== undefined ? { kcal: change.kcal } : {}),
        ...(change.confirm ? { confirm: true as const } : {}),
      };
      return attempt(() => updateMutation.mutateAsync({ id: entry.id, patch }));
    },
    remove: async (entry) => {
      await attempt(() => deleteMutation.mutateAsync(entry.id));
    },
    actOnInsight: async (add) => {
      const current = insight.data;
      if (!current) return;
      try {
        await insightAction.mutateAsync({ insight: current, add });
      } catch (failure) {
        onError(message(failure));
      }
    },
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: ['nutrition', owner, 'day'] });
      void queryClient.invalidateQueries({ queryKey: ['nutrition', owner, 'insight'] });
      void queryClient.invalidateQueries({ queryKey: ['nutrition', owner, 'summary'] });
    },
  };
}
