/**
 * `PomodoroCategory` and `PomodoroSession` (ios/Sources/NexdoCore/Pomodoro.swift).
 *
 * The session is the wire shape `PUT /api/pomodoro` stores and `GET /api/pomodoro` returns
 * (src/server/pomodoro/sessions.ts:4-21): every time field is EPOCH SECONDS, as Swift's
 * `timeIntervalSince1970`. Every `now` argument here is epoch MILLISECONDS, like the rest of the app.
 *
 * Swift mutates in place; these return a new session, and `advance` also says whether it moved.
 */

export const POMODORO_CATEGORIES = ['reading', 'focus', 'coding', 'diary', 'math', 'stretching'] as const;
export type PomodoroCategory = (typeof POMODORO_CATEGORIES)[number];

/** `PomodoroCategory.title` (Pomodoro.swift:5-7). */
export const POMODORO_CATEGORY_TITLES: Record<PomodoroCategory, string> = {
  reading: 'Reading',
  focus: 'Focus time',
  coding: 'Coding',
  diary: 'Write a diary',
  math: 'Study',
  stretching: 'Yoga & Stretching',
};

/** `PomodoroCategory.icon` (Pomodoro.swift:8-10): SF Symbol names; the screens map them. */
export const POMODORO_CATEGORY_SYMBOLS: Record<PomodoroCategory, string> = {
  reading: 'book.fill',
  focus: 'stopwatch.fill',
  coding: 'chevron.left.forwardslash.chevron.right',
  diary: 'heart.fill',
  math: 'graduationcap.fill',
  stretching: 'figure.flexibility',
};

export type PomodoroPhase = 'focus' | 'shortBreak' | 'completed' | 'stopped';

/** `PomodoroSession` (Pomodoro.swift:13-34). */
export type PomodoroSession = {
  id: string;
  category: PomodoroCategory;
  name: string;
  durationMinutes: number;
  autoBreak: boolean;
  playSound: boolean;
  keepAwake: boolean;
  phase: PomodoroPhase;
  paused: boolean;
  deadline?: number | null;
  pausedRemaining?: number | null;
  focusSeconds: number;
  breakSeconds: number;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number | null;
  revision: number;
};

/** The five-minute short break, which Swift writes as the literal 300 throughout. */
export const BREAK_SECONDS = 300;

/** `active` (Pomodoro.swift:33). */
export function isActive(session: Pick<PomodoroSession, 'phase'>): boolean {
  return session.phase === 'focus' || session.phase === 'shortBreak';
}

/**
 * `String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(120))`.
 *
 * DIVERGENCE: Swift's `prefix` counts grapheme clusters, but the server's `z.string().max(120)` counts
 * UTF-16 units, so a Swift name of 120 emoji is refused and stays pending. This keeps whole code points
 * up to 120 UTF-16 units, which the server always accepts.
 */
export function sessionName(name: string): string {
  let result = '';
  for (const point of Array.from(name.trim())) {
    if (result.length + point.length > 120) break;
    result += point;
  }
  return result;
}

/** `PomodoroSession.init` (Pomodoro.swift:36-43). `id` is the caller's UUID (Swift: `UUID().uuidString`). */
export function newPomodoroSession({
  id,
  category,
  name,
  durationMinutes,
  autoBreak,
  playSound,
  keepAwake = true,
  now = Date.now(),
}: {
  id: string;
  category: PomodoroCategory;
  name: string;
  durationMinutes: number;
  autoBreak: boolean;
  playSound: boolean;
  keepAwake?: boolean;
  now?: number;
}): PomodoroSession {
  const minutes = Math.min(120, Math.max(1, Math.trunc(durationMinutes)));
  const startedAt = now / 1000;
  return {
    id,
    category,
    name: sessionName(name),
    durationMinutes: minutes,
    autoBreak,
    playSound,
    keepAwake,
    phase: 'focus',
    paused: false,
    deadline: startedAt + minutes * 60,
    pausedRemaining: null,
    focusSeconds: 0,
    breakSeconds: 0,
    startedAt,
    updatedAt: startedAt,
    finishedAt: null,
    revision: 1,
  };
}

/** `remaining(at:)` (Pomodoro.swift:44-47), in seconds. */
export function remaining(session: PomodoroSession, now: number): number {
  if (!isActive(session)) return 0;
  const seconds = now / 1000;
  return Math.max(0, session.paused ? (session.pausedRemaining ?? 0) : (session.deadline ?? seconds) - seconds);
}

/** `progress(at:)` (Pomodoro.swift:48-51): 0…1 through the current phase. */
export function progress(session: PomodoroSession, now: number): number {
  const total = session.phase === 'shortBreak' ? BREAK_SECONDS : session.durationMinutes * 60;
  return Math.min(1, Math.max(0, 1 - remaining(session, now) / total));
}

/** `changed(_:)` (Pomodoro.swift:52): a new revision, and `updatedAt` never earlier than `startedAt`. */
function changed(session: PomodoroSession, now: number): PomodoroSession {
  return { ...session, revision: session.revision + 1, updatedAt: Math.max(now / 1000, session.startedAt) };
}

/** `finish(at:)` (Pomodoro.swift:65-67). */
function finish(session: PomodoroSession, time: number): PomodoroSession {
  return { ...session, phase: 'completed', finishedAt: time, deadline: null, pausedRemaining: null, paused: false };
}

/**
 * `advance(at:)` (Pomodoro.swift:53-64): move past a deadline that has gone by. A restored session
 * that slept through both the focus and the break deadline completes in one step, with no extra break.
 */
export function advance(session: PomodoroSession, now: number): { session: PomodoroSession; changed: boolean } {
  const end = session.deadline;
  const seconds = now / 1000;
  if (!isActive(session) || session.paused || end == null || seconds < end) return { session, changed: false };
  let next: PomodoroSession;
  if (session.phase === 'focus') {
    next = { ...session, focusSeconds: session.durationMinutes * 60 };
    if (session.autoBreak) {
      next = { ...next, phase: 'shortBreak', deadline: end + BREAK_SECONDS };
      if (seconds >= end + BREAK_SECONDS) next = finish({ ...next, breakSeconds: BREAK_SECONDS }, end + BREAK_SECONDS);
    } else {
      next = finish(next, end);
    }
  } else {
    next = finish({ ...session, breakSeconds: BREAK_SECONDS }, end);
  }
  return { session: changed(next, now), changed: true };
}

/** `togglePause(at:)` (Pomodoro.swift:68-74). */
export function togglePause(session: PomodoroSession, now: number): PomodoroSession {
  const current = advance(session, now).session;
  if (!isActive(current)) return current;
  const seconds = now / 1000;
  const next: PomodoroSession = current.paused
    ? { ...current, deadline: seconds + (current.pausedRemaining ?? 0), pausedRemaining: null, paused: false }
    : { ...current, pausedRemaining: remaining(current, now), deadline: null, paused: true };
  return changed(next, now);
}

/**
 * `stop(at:)` (Pomodoro.swift:75-81). Stopping during focus is NOT a completion (`stopped`, with the
 * focus actually done); stopping during the break completes the session with the break actually taken.
 */
export function stop(session: PomodoroSession, now: number): PomodoroSession {
  const current = advance(session, now).session;
  if (!isActive(current)) return current;
  const left = remaining(current, now);
  const next: PomodoroSession =
    current.phase === 'focus'
      ? { ...current, focusSeconds: Math.max(0, current.durationMinutes * 60 - left), phase: 'stopped' }
      : { ...current, breakSeconds: Math.max(0, BREAK_SECONDS - left), phase: 'completed' };
  return changed(
    { ...next, finishedAt: Math.max(now / 1000, current.startedAt), deadline: null, pausedRemaining: null, paused: false },
    now,
  );
}

/** `setKeepAwake(_:at:)` (Pomodoro.swift:82). */
export function setKeepAwake(session: PomodoroSession, value: boolean, now: number): PomodoroSession {
  return changed({ ...session, keepAwake: value }, now);
}
