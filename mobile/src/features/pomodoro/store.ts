import { createStore } from 'zustand';

import type { PomodoroPage, PomodoroSaved } from '../../api/pomodoro';
import { advance, BREAK_SECONDS, isActive, newPomodoroSession, type PomodoroCategory, type PomodoroSession } from './model';

/**
 * `PomodoroStore` (ios/App/PomodoroStore.swift:10-146).
 *
 * The timer runs ON THE PHONE. The server only keeps history: every change bumps the session's
 * `revision`, and `sync` PUTs each session whose revision is ahead of the last one the server
 * acknowledged. The cache is per account, under Swift's key, so a session started offline survives a
 * restart and is sent later.
 *
 * Swift builds one store per screen with its owner. This is one store for the app: `activate(owner)`
 * loads that account's cache, and any answer that lands after the owner changed is dropped.
 */

export const SYNC_MESSAGE = 'Saved on this device. Connect to sync your sessions.';

/** `Cache` (PomodoroStore.swift:23), stored under `nexdo.pomodoro.v1.<owner>`. */
export type PomodoroCache = { sessions: PomodoroSession[]; currentID?: string | null; synced: Record<string, number> };

export function cacheKey(owner: string): string {
  return `nexdo.pomodoro.v1.${owner}`;
}

/** One local notification `replaceAlerts` would schedule (PomodoroStore.swift:121-139). `at` is epoch ms. */
export type PomodoroAlert = { id: string; at: number; title: string; body: string; sound: boolean };

const BREAK_DONE = 'Your break is complete. Ready for another session?';

/**
 * The alerts for the current session (PomodoroStore.swift:126-139): one at the phase deadline, and —
 * during focus with auto-break — a second when the break would end. None while paused or finished,
 * and none in the past. Identifiers are `pomodoro.<owner>.<id>.phase` / `.complete`, as Swift's.
 */
export function pomodoroAlerts(owner: string, session: PomodoroSession | null | undefined, now: number): PomodoroAlert[] {
  if (!session || !isActive(session) || session.paused || session.deadline == null) return [];
  const prefix = `pomodoro.${owner}.${session.id}`;
  const deadline = session.deadline * 1000;
  const alerts: PomodoroAlert[] = [];
  const add = (at: number, suffix: string, body: string) => {
    if (at > now) alerts.push({ id: prefix + suffix, at, title: 'Pomodoro', body, sound: session.playSound });
  };
  add(
    deadline,
    '.phase',
    session.phase === 'focus'
      ? session.autoBreak
        ? 'Focus complete. Time for a five-minute break!'
        : 'Great job! Your focus session is complete.'
      : BREAK_DONE,
  );
  if (session.phase === 'focus' && session.autoBreak) add(deadline + BREAK_SECONDS * 1000, '.complete', BREAK_DONE);
  return alerts;
}

export type PomodoroDeps = {
  page: (owner: string, cursor: string | null) => Promise<PomodoroPage>;
  save: (owner: string, session: PomodoroSession) => Promise<PomodoroSaved>;
  load: (owner: string) => Promise<PomodoroCache | null>;
  persist: (owner: string, cache: PomodoroCache) => Promise<void>;
  /** Remove this owner's pending Pomodoro alerts and schedule these instead. */
  replaceAlerts: (owner: string, alerts: PomodoroAlert[]) => Promise<void>;
  /** `AudioServicesPlaySystemSound(1005)` when a phase ends while the timer is on screen. */
  chime: () => void;
  uuid: () => string;
  now: () => number;
};

export type PomodoroState = {
  owner: string | null;
  sessions: PomodoroSession[];
  currentID: string | null;
  syncMessage: string | null;
  syncing: boolean;
  loadingHistory: boolean;
  /** Loads this account's cache (Swift's `init`). Call again on sign-in; `reset` on sign-out. */
  activate: (owner: string) => Promise<void>;
  start: (input: { category: PomodoroCategory; name: string; minutes: number; autoBreak: boolean; sound: boolean }) => void;
  /** `mutate(_:)`: change the current session (pause, stop, keep awake). */
  mutate: (action: (session: PomodoroSession, now: number) => PomodoroSession) => void;
  /** Once a second while the timer is visible. */
  tick: () => void;
  newSession: () => void;
  restore: () => Promise<void>;
  sync: () => Promise<void>;
  setSyncMessage: (message: string | null) => void;
  reset: () => void;
};

/** `current` (PomodoroStore.swift:27). */
export function currentSession(state: Pick<PomodoroState, 'sessions' | 'currentID'>): PomodoroSession | undefined {
  return state.sessions.find((session) => session.id === state.currentID);
}

export function createPomodoroStore(deps: PomodoroDeps) {
  let synced: Record<string, number> = {};
  let scheduling = false;
  let reschedule = false;

  return createStore<PomodoroState>()((set, get) => {
    const persist = () => {
      const { owner, sessions, currentID } = get();
      if (owner) void deps.persist(owner, { sessions, currentID, synced }).catch(() => undefined);
    };

    /** `scheduleAlerts()` (PomodoroStore.swift:115-120): one replacement at a time, re-run if asked again. */
    const scheduleAlerts = async () => {
      if (scheduling) {
        reschedule = true;
        return;
      }
      scheduling = true;
      try {
        do {
          reschedule = false;
          const owner = get().owner;
          if (owner) await deps.replaceAlerts(owner, pomodoroAlerts(owner, currentSession(get()), deps.now())).catch(() => undefined);
        } while (reschedule);
      } finally {
        scheduling = false;
      }
    };

    const afterChange = () => {
      persist();
      void scheduleAlerts().then(() => get().sync());
    };

    return {
      owner: null,
      sessions: [],
      currentID: null,
      syncMessage: null,
      syncing: false,
      loadingHistory: false,

      async activate(owner) {
        if (get().owner === owner) return;
        synced = {};
        set({ owner, sessions: [], currentID: null, syncMessage: null, syncing: false, loadingHistory: false });
        const cache = await deps.load(owner).catch(() => null);
        if (get().owner !== owner || !cache) return;
        synced = { ...cache.synced };
        set({ sessions: cache.sessions, currentID: cache.currentID ?? null });
      },

      start({ category, name, minutes, autoBreak, sound }) {
        const current = currentSession(get());
        if (!get().owner || (current && isActive(current))) return;
        const session = newPomodoroSession({ id: deps.uuid(), category, name, durationMinutes: minutes, autoBreak, playSound: sound, now: deps.now() });
        set((state) => ({ sessions: [session, ...state.sessions], currentID: session.id }));
        afterChange();
      },

      mutate(action) {
        const { currentID, sessions } = get();
        const index = sessions.findIndex((session) => session.id === currentID);
        if (index === -1) return;
        const next = [...sessions];
        next[index] = action(sessions[index], deps.now());
        set({ sessions: next });
        afterChange();
      },

      tick() {
        const { currentID, sessions } = get();
        const index = sessions.findIndex((session) => session.id === currentID);
        if (index === -1) return;
        const previous = sessions[index];
        const moved = advance(previous, deps.now());
        if (!moved.changed) return;
        if (previous.phase !== moved.session.phase && moved.session.playSound) deps.chime();
        const next = [...sessions];
        next[index] = moved.session;
        set({ sessions: next });
        afterChange();
      },

      newSession() {
        const current = currentSession(get());
        if (current && isActive(current)) return;
        set({ currentID: null });
        persist();
      },

      async restore() {
        get().tick();
        const owner = get().owner;
        if (!owner || get().loadingHistory) return;
        set({ loadingHistory: true });
        await scheduleAlerts();
        try {
          let cursor: string | null = null;
          do {
            const response = await deps.page(owner, cursor);
            if (get().owner !== owner) return;
            // Swift indexes positions once, so a long history merges in linear time (7a23da4).
            const sessions = [...get().sessions];
            const positions = new Map(sessions.map((session, index) => [session.id, index]));
            for (const remote of response.sessions) {
              const index = positions.get(remote.id);
              if (index === undefined) {
                positions.set(remote.id, sessions.length);
                sessions.push(remote);
              } else if (remote.revision >= sessions[index].revision) {
                sessions[index] = remote;
              }
              synced[remote.id] = remote.revision;
            }
            set({ sessions });
            cursor = response.nextCursor;
            persist();
          } while (cursor !== null);
          const sorted = [...get().sessions].sort((a, b) => b.startedAt - a.startedAt);
          set((state) => ({ sessions: sorted, currentID: state.currentID ?? sorted.find(isActive)?.id ?? null }));
          persist();
          get().tick();
          await scheduleAlerts();
          await get().sync();
        } catch {
          if (get().owner === owner) set({ syncMessage: SYNC_MESSAGE });
        } finally {
          if (get().owner === owner) set({ loadingHistory: false });
        }
      },

      async sync() {
        const owner = get().owner;
        if (!owner || get().syncing) return;
        set({ syncing: true });
        try {
          for (;;) {
            const pending = get().sessions.find((session) => session.revision > (synced[session.id] ?? 0));
            if (!pending) break;
            const response = await deps.save(owner, pending);
            if (get().owner !== owner) return;
            synced[pending.id] = response.session.revision;
            set((state) => ({
              sessions: state.sessions.map((session) =>
                session.id === pending.id && response.session.revision >= session.revision ? response.session : session,
              ),
            }));
            persist();
          }
          set({ syncMessage: null });
        } catch {
          if (get().owner === owner) set({ syncMessage: SYNC_MESSAGE });
        } finally {
          if (get().owner === owner) set({ syncing: false });
        }
      },

      setSyncMessage: (syncMessage) => set({ syncMessage }),

      reset() {
        const owner = get().owner;
        synced = {};
        set({ owner: null, sessions: [], currentID: null, syncMessage: null, syncing: false, loadingHistory: false });
        // `PomodoroStore.cancelAlerts(owner:)` on sign-out.
        if (owner) void deps.replaceAlerts(owner, []).catch(() => undefined);
      },
    };
  });
}

export type PomodoroStoreApi = ReturnType<typeof createPomodoroStore>;
