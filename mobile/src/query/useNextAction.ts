import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { endpoints, type ProactiveNextResponse, type ProtectedTimeProposal } from '../api';
import { queryKeys } from './keys';
import { bumpRevision } from './taskRevision';

/**
 * `AppModel.refreshNextAction()`, `respondToProtectedTime(_:accept:)` and `dismissPersistentNext()`
 * (ios/App/NexdoApp.swift:21-71) — the data behind sections 7 and 8 of the Today dashboard.
 *
 * TWO REQUESTS, ONE REFRESH. Swift asks `/api/schedule-intelligence` for the next action first, and
 * only then asks `/api/protected-time`; the second is a `try?`, so a failure there leaves the
 * next-action card alone. That ordering matters: the protected-time proposal is about the task the
 * next-action pass just considered.
 */

/** `try await Task.sleep(for: .milliseconds(350))` (NexdoApp.swift:31) before the request goes out. */
export const NEXT_ACTION_DEBOUNCE_MS = 350;

/**
 * `persistentNext` (`:17`).
 *
 * "Never keep a stale recommendation after a failed refresh" (`:37`) — so a failure resolves to an
 * empty recommendation rather than leaving the previous one on screen, and nothing is retried.
 */
export function useNextAction(enabled: boolean) {
  return useQuery<ProactiveNextResponse | null>({
    queryKey: queryKeys.nextAction(),
    enabled,
    retry: false,
    // Swift discards the recommendation whenever the app leaves the foreground, and re-asks on return.
    gcTime: 0,
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, NEXT_ACTION_DEBOUNCE_MS));
      try {
        return await endpoints.nextAction();
      } catch {
        return null;
      }
    },
  });
}

/** `protectedTime` (`:15`). The second, optional half of the same refresh. */
export function useProtectedTime(enabled: boolean) {
  return useQuery<ProtectedTimeProposal | null>({
    queryKey: queryKeys.protectedTime(),
    enabled,
    retry: false,
    gcTime: 0,
    queryFn: async () => {
      try {
        return (await endpoints.protectedTime()).proposal ?? null;
      } catch {
        // `try?` (NexdoApp.swift:35): a failure here hides the card, it does not surface an error.
        return null;
      }
    },
  });
}

/** `invalidateNextAction()` (`:21-23`): drop both, so nothing stale is shown. */
export function invalidateNextAction(queryClient: QueryClient): void {
  queryClient.setQueryData(queryKeys.nextAction(), null);
  queryClient.setQueryData(queryKeys.protectedTime(), null);
  void queryClient.invalidateQueries({ queryKey: queryKeys.nextAction() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.protectedTime() });
}

/**
 * `respondToProtectedTime(_:accept:)` (`:46-61`).
 *
 * Accepting reserves the block AND reloads the account's data; declining only records the answer.
 * Either way the proposal goes and the next action is asked for again. The receipt's `warnings` are
 * surfaced as Swift's app-wide error.
 */
export function useRespondToProtectedTime() {
  const queryClient = useQueryClient();
  return useMutation<string | null, Error, { proposal: ProtectedTimeProposal; accept: boolean }>({
    mutationFn: async ({ proposal, accept }) => {
      const receipt = await endpoints.respondToProtectedTime({
        accept,
        taskId: proposal.taskId,
        startAt: proposal.startAt,
        expectedUpdatedAt: proposal.expectedUpdatedAt,
      });
      queryClient.setQueryData(queryKeys.protectedTime(), null);
      if (accept) {
        // `await refresh()`
        bumpRevision();
        void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.scheduleIntelligence() });
      }
      return receipt.warnings.length > 0 ? receipt.warnings.join('\n') : null;
    },
    onSettled: () => invalidateNextAction(queryClient),
  });
}

/** `dismissPersistentNext()` (`:62-71`): hide it locally first, then tell the server. */
export function useDismissNextAction() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { contextActionId: string }>({
    mutationFn: async ({ contextActionId }) => {
      invalidateNextAction(queryClient);
      try {
        await endpoints.dismissNextAction(contextActionId);
      } catch {
        // "Card remains hidden locally." (`:69`)
      }
      invalidateNextAction(queryClient);
    },
  });
}

/** `protectedTimeLabel(_:)` (NexdoApp.swift:40-45): `.medium` date, `.short` time, ACCOUNT zone. */
export function protectedTimeLabel(startAt: string, timeZone: string): string {
  const at = Date.parse(startAt);
  if (Number.isNaN(at)) return startAt;
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(at));
}

/** `DurationDisplay.durationLabel(_:)` (DoNowRecommendation.swift:56-63). */
export function durationLabel(totalMinutes: number): string {
  const hours = Math.trunc(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  return parts.join(' ');
}
