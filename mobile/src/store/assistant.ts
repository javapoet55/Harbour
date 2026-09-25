import { create } from 'zustand';

import type { AssistantTurn } from '../api';

/**
 * The assistant's conversation state.
 *
 * Swift keeps exactly three things on `AppModel`, and NO message list: `turn` (NexdoApp.swift:119),
 * `lastAssistantPrompt` (`:120`) and the private `contextID` (`:127`). `AskNexdoView` renders ONE
 * turn at a time — "Show suggestions" (AskNexdoView.swift:246) and the close button (`:193`) both set
 * `model.turn = nil`. There is no transcript, no scrollback and no bubbles, so there is none here.
 *
 * It lives outside React Query because it is not a cache of a GET: every turn is the result of a
 * write, it is replaced rather than refetched, and it must survive the Ask sheet being dismissed and
 * reopened the way an `@Published` property on `AppModel` does.
 *
 * IN MEMORY ONLY, like `useConsent`: nothing here is written to storage, so a relaunch starts with no
 * prior answer and no conversation context.
 */
export type AssistantState = {
  /** The single current turn, or `null` for the suggestions view. */
  turn: AssistantTurn | null;
  /** The prompt that produced `turn`, shown above the answer. */
  lastAssistantPrompt: string | null;
  /** `contextID`: the server's thread handle, echoed back on the next request. */
  contextId: string | null;
};

type AssistantStore = AssistantState & {
  /** `turn = result; lastAssistantPrompt = text; contextID = result.contextActionId` (NexdoApp.swift:702). */
  setTurn: (turn: AssistantTurn, prompt: string) => void;
  /** "Show suggestions" and the close button: the answer goes, the thread handle stays. */
  clearTurn: () => void;
  /** `withdrawConsent()` (NexdoApp.swift:720): clears the answer AND the thread handle. */
  reset: () => void;
};

const EMPTY: AssistantState = { turn: null, lastAssistantPrompt: null, contextId: null };

export const useAssistantStore = create<AssistantStore>()((set) => ({
  ...EMPTY,
  setTurn: (turn, prompt) => set({ turn, lastAssistantPrompt: prompt, contextId: turn.contextActionId ?? null }),
  clearTurn: () => set({ turn: null }),
  reset: () => set({ ...EMPTY }),
}));
