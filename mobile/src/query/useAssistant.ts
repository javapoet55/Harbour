import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { endpoints, type AssistantTurn } from '../api';
import { useAssistantStore } from '../store/assistant';
import { useConsent } from '../store/consent';
import { queryKeys } from './keys';
import { bumpRevision } from './taskRevision';

/**
 * Ask AI's data layer: `AppModel.ask(_:accept:)` (ios/App/NexdoApp.swift:693-711).
 *
 * ONE endpoint does all three jobs. Asking a question, approving a proposal and rejecting a proposal
 * are all `POST /api/assistant`; approve and reject differ only by which of `confirmActionId` /
 * `rejectActionId` carries the proposal's `actionId`, and by the fixed transcript "yes" / "no" that
 * `AskResponseView` (ios/App/AskResponseView.swift:60-63) sends. REJECTING STILL CALLS THE SERVER —
 * the proposal is server-side state, and declining it has to be recorded.
 *
 * The response is a single JSON body (src/app/api/assistant/route.ts:22), so there is no stream
 * reader here.
 */
export type AskInput = {
  /** The prompt, or "yes" / "no" for the confirmation buttons. */
  text: string;
  /** `true` approves the pending proposal, `false` rejects it, omitted for a plain question. */
  accept?: boolean;
};

/** Thrown instead of a request when Swift's `ask` would have returned `false` without calling out. */
export class AskRefused extends Error {
  constructor(reason: string) {
    super(reason);
    Object.setPrototypeOf(this, AskRefused.prototype);
    this.name = 'AskRefused';
  }
}

/**
 * `try await load()` plus `invalidateScheduleIntelligence()` / `refreshScheduleIntelligence()`
 * (NexdoApp.swift:704-708). The assistant can create, move and reschedule tasks, so once it says it
 * changed something every cached view of that data is stale.
 */
function reloadAfterChanges(queryClient: QueryClient): void {
  bumpRevision();
  void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.scheduleIntelligence() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
}

export function useAsk() {
  const queryClient = useQueryClient();

  return useMutation<AssistantTurn, Error, AskInput>({
    mutationFn: async ({ text, accept }) => {
      // `guard aiConsent, !busy, !text.trimmed.isEmpty, text.count <= 4000 else { return false }`
      if (!useConsent.getState().ai) throw new AskRefused('Sharing with OpenAI has not been allowed.');
      if (text.trim().length === 0 || text.length > 4000) throw new AskRefused('The prompt is empty or too long.');

      // `let proposal = turn?.confirmation?.actionId` — an approval with nothing to approve is a no-op.
      const proposal = useAssistantStore.getState().turn?.confirmation?.actionId;
      if (accept !== undefined && !proposal) throw new AskRefused('There is no proposal to answer.');

      return endpoints.assistant({
        transcript: text,
        contextActionId: useAssistantStore.getState().contextId ?? undefined,
        confirmActionId: accept === true ? proposal : undefined,
        rejectActionId: accept === false ? proposal : undefined,
      });
    },
    onSuccess: (turn, { text, accept }) => {
      useAssistantStore.getState().setTurn(turn, text);
      if (accept === true || turn.createdTaskId) reloadAfterChanges(queryClient);
    },
  });
}
