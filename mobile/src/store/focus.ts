import { create } from 'zustand';

/**
 * ===================== STUB — PHASE 4 REPLACES THIS =====================
 *
 * The focus timer. In Swift this is real: `AppModel.startFocus` posts
 * `{status: "IN_PROGRESS", focusMinutes: 25, fromRecommendation: …}` to `/api/tasks/[id]`, the server
 * opens a `TaskWorkSession` and returns a `focusToken`, `AppModel.focusSession` drives
 * `FocusSessionStrip`, and `finishFocus` closes the segment
 * (`src/app/api/tasks/[id]/route.ts:76-118`, `ios/App/FocusSessionStrip.swift`).
 *
 * NONE of that is wired here. This store only RECORDS the intent so the detail screen's buttons are
 * real controls with the right enabled/disabled behaviour, and so Phase 4 has an obvious seam to
 * replace. Nothing reaches the network, no timer runs, and `session` never becomes non-null on its own.
 *
 * TODO(phase4): replace this with the real focus runtime — the POST, the returned `focusToken` and
 * `workSessionId`, the countdown, `FocusSessionStrip`, and `finishFocus` on completion. The detail
 * screen should then render the strip in place of the "Start a 25-minute focus session" button when
 * `session.taskId` matches the open task, exactly as `TaskDetailsView.swift:116-117` does.
 * ========================================================================
 */

/** `AppModel.startFocus` always requests 25 minutes from this button (TaskDetailsView.swift:119-120). */
export const FOCUS_SESSION_MINUTES = 25;

export type FocusIntent = {
  taskId: string;
  kind: 'focus-session' | 'start-task';
  minutes: number;
  /** When the intent was recorded, epoch ms. Phase 4 replaces this with the server's `startedAt`. */
  at: number;
};

type FocusStore = {
  /** The live focus session. Always null in this stub; Phase 4 populates it from the server. */
  session: { taskId: string; endsAt: number } | null;
  /** Every intent recorded this launch, newest last. Diagnostics only. */
  intents: FocusIntent[];
  /** `AppModel.startFocus(task)` — records, does not start anything. */
  startFocus: (taskId: string) => void;
  /** `AppModel.changeTaskStatus(task, status: "IN_PROGRESS")` — records, does not send anything. */
  startTask: (taskId: string) => void;
  clear: () => void;
};

export const useFocus = create<FocusStore>()((set) => ({
  session: null,
  intents: [],
  startFocus: (taskId) =>
    set((state) => ({
      intents: [...state.intents, { taskId, kind: 'focus-session', minutes: FOCUS_SESSION_MINUTES, at: Date.now() }],
    })),
  startTask: (taskId) =>
    set((state) => ({ intents: [...state.intents, { taskId, kind: 'start-task', minutes: 0, at: Date.now() }] })),
  clear: () => set({ session: null, intents: [] }),
}));

/**
 * `.disabled(currentTask.isDone || !["INBOX", "PLANNED", "IN_PROGRESS"].contains(currentTask.status))`
 * (TaskDetailsView.swift:121).
 */
export function canStartFocusSession(status: string, done: boolean): boolean {
  return !done && ['INBOX', 'PLANNED', 'IN_PROGRESS'].includes(status);
}

/** `.disabled(currentTask.isDone || currentTask.status == "IN_PROGRESS")` (TaskDetailsView.swift:125). */
export function canStartTask(status: string, done: boolean): boolean {
  return !done && status !== 'IN_PROGRESS';
}
