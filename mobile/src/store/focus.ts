import { create } from 'zustand';

import { endpoints, type NexdoTask, type TaskResponse } from '../api';

/**
 * The focus session. Ports `AppModel.startFocus` / `finishFocus` (ios/App/NexdoApp.swift:611-665),
 * `NativeFocusSession` (ios/App/FocusSessionStrip.swift:3-10) and the completion task that closes the
 * session when the timer runs out (NexdoApp.swift:636-647).
 *
 * This replaces the Phase 3 stub, which only recorded intent.
 *
 * PERSISTENCE, checked rather than assumed: `focusSession` is a plain `@Published` property
 * (NexdoApp.swift:121). The only `UserDefaults` key in the whole model is
 * `nexdo.lastSignedInFirstName` (`:126, 238, 303`). So a focus session is IN MEMORY ONLY: it survives
 * backgrounding for as long as the process lives, and is gone after a relaunch. Nothing here is
 * persisted either, deliberately.
 *
 * THERE IS NO CANCEL, and no pause. `FocusSessionStrip`'s single button reads "End focus" (or "Finish"
 * once the timer reaches zero) and calls `finishFocus()` either way (FocusSessionStrip.swift:42-43).
 * The brief asked for cancel and pause; Swift has neither, so neither is here.
 *
 * Completing the task ENDS the session: `changeTaskStatus(..., "COMPLETED")` calls `finishFocus()`
 * first when the session belongs to that task (NexdoApp.swift:592). Finishing a session does NOT
 * complete the task — it only closes the work session, and the task stays IN_PROGRESS.
 */

/** `NativeFocusSession` (FocusSessionStrip.swift:3-10). */
export type FocusSession = {
  taskId: string;
  title: string;
  /** Epoch ms. */
  endsAt: number;
  workSessionId: string | null;
  token: string;
  /**
   * False when the server returned no focus receipt. Older deployments do that, and Swift keeps the
   * Pomodoro running locally anyway — but then `finishFocus` must NOT send a request, because there is
   * no server-side session to close (NexdoApp.swift:653-657).
   */
  serverBacked: boolean;
};

export const FOCUS_SESSION_MINUTES = 25;

type FocusStore = {
  session: FocusSession | null;
  /** True while a start or finish request is in flight. Mirrors `model.busy` for this screen's buttons. */
  busy: boolean;
  /** The last error, for the strip's "Focus session" alert (FocusSessionStrip.swift:47-49). */
  error: string | null;
  startFocus: (task: NexdoTask, minutes?: number, fromRecommendation?: boolean) => Promise<void>;
  finishFocus: () => Promise<void>;
  clearError: () => void;
  /** `reset()` on sign-out (NexdoApp.swift:729). */
  clear: () => void;
};

/** The pending auto-finish, cancelled whenever the session changes. Not part of the store's state. */
let completionTimer: ReturnType<typeof setTimeout> | null = null;

function cancelCompletion(): void {
  if (completionTimer !== null) {
    clearTimeout(completionTimer);
    completionTimer = null;
  }
}

/** `UUID().uuidString` for the local token when the server sends no receipt. */
function localToken(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useFocus = create<FocusStore>()((set, get) => ({
  session: null,
  busy: false,
  error: null,

  /** `startFocus(_:minutes:fromRecommendation:)` (NexdoApp.swift:618-647). */
  startFocus: async (task, minutes = FOCUS_SESSION_MINUTES, fromRecommendation = false) => {
    if (get().busy) throw new Error('Another update is in progress. Please try again.');
    // Starting a second session closes the first, unless this start came from a recommendation,
    // which is allowed to continue an existing session.
    if (get().session !== null && !fromRecommendation) await get().finishFocus();

    set({ busy: true, error: null });
    const started = Date.now();
    try {
      const response: TaskResponse = await endpoints.updateTask(task.id, {
        status: 'IN_PROGRESS',
        focusMinutes: minutes,
        fromRecommendation,
      });

      const receipt = response.focus ?? null;
      const granted = receipt?.minutes ?? minutes;
      const session: FocusSession = {
        taskId: task.id,
        title: task.title,
        endsAt: started + granted * 60_000,
        workSessionId: receipt?.workSessionId ?? null,
        token: receipt?.focusToken ?? localToken(),
        serverBacked: receipt !== null,
      };
      set({ session });
      scheduleCompletion(session, set, get);
    } finally {
      set({ busy: false });
    }
  },

  /** `finishFocus()` (NexdoApp.swift:650-665). */
  finishFocus: async () => {
    if (get().busy) throw new Error('Another update is in progress. Please try again.');
    const session = get().session;
    if (session === null) return;

    // No receipt means no server-side session: clear locally and send nothing.
    if (!session.serverBacked) {
      cancelCompletion();
      set({ session: null });
      return;
    }

    set({ busy: true });
    try {
      await endpoints.updateTask(session.taskId, {
        focusAction: 'finish',
        focusToken: session.token,
        // `min(Date(), session.endsAt)` — never report more time than the session allowed.
        endedAt: new Date(Math.min(Date.now(), session.endsAt)).toISOString(),
        ...(session.workSessionId !== null ? { workSessionId: session.workSessionId } : {}),
      });
      cancelCompletion();
      set({ session: null });
    } finally {
      set({ busy: false });
    }
  },

  clearError: () => set({ error: null }),

  clear: () => {
    cancelCompletion();
    set({ session: null, busy: false, error: null });
  },
}));

type Setter = (partial: Partial<FocusStore>) => void;
type Getter = () => FocusStore;

/**
 * The auto-finish (NexdoApp.swift:636-647). When the timer runs out the session closes itself, but it
 * waits for any in-flight write first, so two writes never overlap. A session that was replaced while
 * the timer was pending is ignored, which is what the token comparison does in Swift.
 */
function scheduleCompletion(session: FocusSession, set: Setter, get: Getter): void {
  cancelCompletion();
  const delay = Math.max(0, session.endsAt - Date.now());
  completionTimer = setTimeout(() => {
    void (async () => {
      // `while self?.busy == true { sleep(1) }`
      while (get().busy) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (get().session?.token !== session.token) return;
      try {
        await get().finishFocus();
      } catch {
        set({ error: 'Couldn’t save your focus time. Use Finish to retry.' });
      }
    })();
  }, delay);
}

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

/** Test seam: drop the pending auto-finish without touching the store. */
export function cancelFocusCompletionForTests(): void {
  cancelCompletion();
}
