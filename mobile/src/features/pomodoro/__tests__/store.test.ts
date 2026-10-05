import { advance, newPomodoroSession, togglePause, type PomodoroSession } from '../model';
import { createPomodoroStore, currentSession, pomodoroAlerts, SYNC_MESSAGE, type PomodoroCache, type PomodoroDeps } from '../store';

/**
 * `PomodoroStore` (ios/App/PomodoroStore.swift). Swift has no tests for the store; these pin the
 * behaviour the screens rely on: start, offline cache, history merge by revision, and sync.
 */

const T0 = Date.parse('2026-09-26T18:00:00Z');

function setup(overrides: Partial<PomodoroDeps> = {}) {
  let now = T0;
  let ids = 0;
  const saved: PomodoroSession[] = [];
  const caches = new Map<string, PomodoroCache>();
  const alerts: { owner: string; ids: string[] }[] = [];
  const deps: PomodoroDeps = {
    page: jest.fn(async () => ({ sessions: [], nextCursor: null })),
    save: jest.fn(async (_owner: string, session: PomodoroSession) => {
      saved.push(session);
      return { session };
    }),
    load: jest.fn(async (owner: string) => caches.get(owner) ?? null),
    persist: jest.fn(async (owner: string, cache: PomodoroCache) => {
      caches.set(owner, JSON.parse(JSON.stringify(cache)));
    }),
    replaceAlerts: jest.fn(async (owner: string, list) => {
      alerts.push({ owner, ids: list.map((alert) => alert.id) });
    }),
    chime: jest.fn(),
    uuid: () => `ID-${++ids}`,
    now: () => now,
    ...overrides,
  };
  const store = createPomodoroStore(deps);
  return { store, deps, saved, caches, alerts, advanceClock: (ms: number) => (now += ms) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('start makes the session current, caches it, schedules its alerts and syncs it', async () => {
  const { store, saved, caches, alerts } = setup();
  await store.getState().activate('user-1');
  store.getState().start({ category: 'reading', name: 'Chapter 3', minutes: 25, autoBreak: true, sound: true });
  await flush();
  await flush();
  const current = currentSession(store.getState());
  expect(current).toMatchObject({ id: 'ID-1', category: 'reading', name: 'Chapter 3', phase: 'focus' });
  expect(caches.get('user-1')?.currentID).toBe('ID-1');
  expect(alerts.at(-1)).toEqual({ owner: 'user-1', ids: ['pomodoro.user-1.ID-1.phase', 'pomodoro.user-1.ID-1.complete'] });
  expect(saved.map((s) => s.id)).toEqual(['ID-1']);
  // A second start while one is running is ignored, as Swift's `guard current?.active != true`.
  store.getState().start({ category: 'coding', name: '', minutes: 10, autoBreak: false, sound: false });
  expect(store.getState().sessions).toHaveLength(1);
});

test('a failed sync keeps the session and shows Swift\'s offline message; the next sync sends it', async () => {
  const save = jest.fn().mockRejectedValueOnce(new Error('offline'));
  const { store } = setup({ save });
  await store.getState().activate('user-1');
  store.getState().start({ category: 'focus', name: '', minutes: 25, autoBreak: false, sound: false });
  await flush();
  await flush();
  expect(store.getState().syncMessage).toBe(SYNC_MESSAGE);
  save.mockImplementation(async (_owner, session) => ({ session }));
  await store.getState().sync();
  expect(save).toHaveBeenCalledTimes(2);
  expect(store.getState().syncMessage).toBeNull();
});

test('restore pages through history, keeps the higher revision, sorts newest first and picks the running one', async () => {
  const local = newPomodoroSession({ id: 'A', category: 'focus', name: 'local', durationMinutes: 25, autoBreak: false, playSound: false, now: T0 - 600_000 });
  const remoteNewer = togglePause(local, T0 - 300_000);
  const remoteOld = advance(newPomodoroSession({ id: 'B', category: 'math', name: 'old', durationMinutes: 25, autoBreak: false, playSound: false, now: T0 - 86_400_000 }), T0).session;
  const page = jest
    .fn()
    .mockResolvedValueOnce({ sessions: [remoteNewer], nextCursor: '11111111-1111-1111-1111-111111111111' })
    .mockResolvedValueOnce({ sessions: [remoteOld], nextCursor: null });
  const { store, caches, deps } = setup({ page });
  caches.set('user-1', { sessions: [local], currentID: null, synced: {} });
  await store.getState().activate('user-1');
  await store.getState().restore();
  expect(page).toHaveBeenNthCalledWith(1, 'user-1', null);
  expect(page).toHaveBeenNthCalledWith(2, 'user-1', '11111111-1111-1111-1111-111111111111');
  const state = store.getState();
  expect(state.sessions.map((s) => s.id)).toEqual(['A', 'B']);
  expect(state.sessions[0].paused).toBe(true);
  expect(state.currentID).toBe('A');
  // Everything came from the server at its own revision, so nothing is sent back.
  expect(deps.save).not.toHaveBeenCalled();
});

test('a lower remote revision does not overwrite the local session', async () => {
  const local = togglePause(newPomodoroSession({ id: 'A', category: 'focus', name: '', durationMinutes: 25, autoBreak: false, playSound: false, now: T0 - 600_000 }), T0 - 100_000);
  const stale = { ...local, paused: false, revision: 1 };
  const { store, caches } = setup({ page: async () => ({ sessions: [stale], nextCursor: null }) });
  caches.set('user-1', { sessions: [local], currentID: 'A', synced: {} });
  await store.getState().activate('user-1');
  await store.getState().restore();
  expect(store.getState().sessions[0].paused).toBe(true);
});

test('tick moves past the deadline and chimes only when the session plays sound', async () => {
  const { store, deps, advanceClock } = setup();
  await store.getState().activate('user-1');
  store.getState().start({ category: 'focus', name: '', minutes: 1, autoBreak: true, sound: true });
  advanceClock(61_000);
  store.getState().tick();
  expect(currentSession(store.getState())?.phase).toBe('shortBreak');
  expect(deps.chime).toHaveBeenCalledTimes(1);
});

test('answers for a previous account are dropped, and sign-out clears that account\'s alerts', async () => {
  let release: (value: { sessions: PomodoroSession[]; nextCursor: null }) => void = () => undefined;
  const page = jest.fn(() => new Promise<{ sessions: PomodoroSession[]; nextCursor: null }>((resolve) => (release = resolve)));
  const { store, alerts } = setup({ page });
  await store.getState().activate('user-1');
  const restoring = store.getState().restore();
  await flush();
  store.getState().reset();
  await store.getState().activate('user-2');
  release({ sessions: [newPomodoroSession({ id: 'X', category: 'focus', name: '', durationMinutes: 25, autoBreak: false, playSound: false, now: T0 })], nextCursor: null });
  await restoring;
  expect(store.getState().owner).toBe('user-2');
  expect(store.getState().sessions).toEqual([]);
  expect(alerts).toContainEqual({ owner: 'user-1', ids: [] });
});

test('alerts: none while paused or finished; Swift\'s bodies otherwise', () => {
  const session = newPomodoroSession({ id: 'A', category: 'focus', name: '', durationMinutes: 25, autoBreak: false, playSound: true, now: T0 });
  expect(pomodoroAlerts('u', session, T0)).toEqual([
    { id: 'pomodoro.u.A.phase', at: T0 + 1_500_000, title: 'Pomodoro', body: 'Great job! Your focus session is complete.', sound: true },
  ]);
  const withBreak = { ...session, autoBreak: true };
  expect(pomodoroAlerts('u', withBreak, T0).map((alert) => alert.body)).toEqual([
    'Focus complete. Time for a five-minute break!',
    'Your break is complete. Ready for another session?',
  ]);
  expect(pomodoroAlerts('u', togglePause(session, T0 + 1000), T0 + 1000)).toEqual([]);
  expect(pomodoroAlerts('u', advance(session, T0 + 1_500_000).session, T0 + 1_500_000)).toEqual([]);
});
