import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  nutritionApi,
  type NewNutritionEntry,
  type NutritionEntryPatch,
  type NutritionInsight,
  type NutritionSettings,
  type NutritionSettingsUpdate,
} from '../api/nutrition';
import { shoppingStore } from '../features/shopping/store';
import { useSession } from '../store/session';
import { queryKeys } from './keys';

/**
 * `CalorieStore` (ios/App/CalorieTrackerView.swift:70-215) as React Query: one cache per account, so an
 * answer can only land under the account that asked, and sign-out's `queryClient.clear()` drops it all.
 *
 * Swift reloads the day after every add, edit and delete (`if ok { await loadDay(date) }`); the
 * mutations here invalidate that day, its summaries and its insight.
 */

function useOwner(): string {
  return useSession((state) => state.profile?.id) ?? '';
}

/** `loadSettings()` (`:114-117`). */
export function useNutritionSettings() {
  const owner = useOwner();
  return useQuery({ queryKey: queryKeys.nutrition.settings(owner), queryFn: () => nutritionApi.settings(), enabled: owner !== '' });
}

/** `loadDay(_:)` (`:119-122`). */
export function useNutritionDay(date: string) {
  const owner = useOwner();
  return useQuery({ queryKey: queryKeys.nutrition.day(owner, date), queryFn: () => nutritionApi.day(date), enabled: owner !== '' && date !== '' });
}

/** `loadSummary(month:endingOn:)` (`:124-127`). The server picks the Monday–Sunday week containing `date`. */
export function useNutritionSummary(period: 'week' | 'month', date: string) {
  const owner = useOwner();
  return useQuery({
    queryKey: queryKeys.nutrition.summary(owner, period, date),
    queryFn: () => nutritionApi.summary(period, date),
    enabled: owner !== '' && date !== '',
  });
}

/**
 * `loadInsight(_:)` (`:134-137`): "an insight is optional; never block the dashboard on it" — any
 * failure answers `null` rather than an error.
 */
export function useNutritionInsight(date: string) {
  const owner = useOwner();
  return useQuery<NutritionInsight | null>({
    queryKey: queryKeys.nutrition.insight(owner, date),
    queryFn: async () => {
      try {
        return (await nutritionApi.insight(date)).insight;
      } catch {
        return null;
      }
    },
    enabled: owner !== '' && date !== '',
  });
}

/**
 * `actOnInsight(add:date:)` (`:139-147`): the card then reads "added" or "dismissed". Adding writes the
 * foods onto a shopping list ON THE SERVER, so the shopping lists are refreshed too.
 */
export function useNutritionInsightAction(date: string) {
  const owner = useOwner();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ insight, add }: { insight: NutritionInsight; add: boolean }) =>
      nutritionApi.actOnInsight({ date, key: insight.key, action: add ? 'add' : 'dismiss' }),
    onSuccess: (_result, { add }) => {
      queryClient.setQueryData<NutritionInsight | null>(queryKeys.nutrition.insight(owner, date), (current) =>
        current ? { ...current, state: add ? 'added' : 'dismissed' } : current,
      );
      if (add) void shoppingStore.getState().refresh();
    },
  });
}

/** Keeps the settings the server answered with, as Swift's `settings = value`. */
function useSettingsMutation<T>(run: (input: T) => Promise<NutritionSettings>) {
  const owner = useOwner();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (settings) => queryClient.setQueryData(queryKeys.nutrition.settings(owner), settings),
  });
}

/** `save(_:)` (`:149-152`). */
export function useSaveNutritionSettings() {
  return useSettingsMutation((update: NutritionSettingsUpdate) => nutritionApi.saveSettings(update));
}

/** `verify(code:)` (`:159-162`). */
export function useVerifyNutritionCode() {
  return useSettingsMutation((code: string) => nutritionApi.verifyCode(code));
}

/** `sendCode(to:)` (`:154-157`). Pass an E.164 number (`e164` in features/nutrition/model.ts). */
export function useSendNutritionCode() {
  return useMutation({ mutationFn: (phone: string) => nutritionApi.sendCode(phone) });
}

/** `callNow()` (`:164-167`). */
export function useNutritionCallNow() {
  return useMutation({ mutationFn: () => nutritionApi.callNow() });
}

function useEntryMutation<T>(date: string, run: (input: T) => Promise<unknown>) {
  const owner = useOwner();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.day(owner, date) });
      void queryClient.invalidateQueries({ queryKey: ['nutrition', owner, 'summary'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.insight(owner, date) });
    },
  });
}

/** `add(date:meal:description:kcal:)` (`:169-177`). */
export function useAddNutritionEntry(date: string) {
  return useEntryMutation(date, (entry: Omit<NewNutritionEntry, 'date'>) => nutritionApi.addEntry({ ...entry, date }));
}

/** `update(_:date:meal:description:kcal:confirm:)` (`:179-193`). */
export function useUpdateNutritionEntry(date: string) {
  return useEntryMutation(date, ({ id, patch }: { id: string; patch: NutritionEntryPatch }) => nutritionApi.updateEntry(id, patch));
}

/** `remove(_:date:)` (`:195-198`). */
export function useDeleteNutritionEntry(date: string) {
  return useEntryMutation(date, (id: string) => nutritionApi.deleteEntry(id));
}
