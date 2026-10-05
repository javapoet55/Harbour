import { advance, newPomodoroSession, remaining, sessionName, stop, togglePause, type PomodoroSession } from '../model';

/** Port of ios/Tests/NexdoCoreTests/PomodoroTests.swift. Times in the session are seconds; `now` is ms. */

const start = 1_790_000_000;
const at = (offset: number) => (start + offset) * 1000;

function session(auto = true): PomodoroSession {
  return newPomodoroSession({ id: 'S', category: 'focus', name: 'Proposal', durationMinutes: 25, autoBreak: auto, playSound: false, now: start * 1000 });
}

test('pause does not count toward focus', () => {
  let s = togglePause(session(), at(60));
  expect(remaining(s, at(600))).toBe(1440);
  s = togglePause(s, at(600));
  const early = advance(s, at(1500));
  expect(early.changed).toBe(false);
  const due = advance(early.session, at(2040));
  expect(due.changed).toBe(true);
  expect(due.session.phase).toBe('shortBreak');
  expect(due.session.focusSeconds).toBe(1500);
});

test('restores across both deadlines without an extra break', () => {
  const restored = JSON.parse(JSON.stringify(session())) as PomodoroSession;
  const due = advance(restored, at(1900));
  expect(due.changed).toBe(true);
  expect(due.session.phase).toBe('completed');
  expect(due.session.breakSeconds).toBe(300);
  expect(due.session.finishedAt).toBe(start + 1800);
  const repeated = advance(due.session, at(2000));
  expect(repeated.changed).toBe(false);
  expect(repeated.session.revision).toBe(due.session.revision);
});

test('no auto-break completes, and stop is not a completion', () => {
  const s = advance(session(false), at(1500)).session;
  expect(s.phase).toBe('completed');
  expect(s.breakSeconds).toBe(0);
  const stopped = stop(session(), at(75));
  expect(stopped.phase).toBe('stopped');
  expect(stopped.focusSeconds).toBe(75);
});

test('stop before start keeps the server schema invariants', () => {
  // A backward clock jump must not produce a session the API schema rejects
  // (finishedAt/updatedAt below startedAt), which would stay pending forever.
  const skewed = stop(session(), at(-60));
  expect(skewed.phase).toBe('stopped');
  expect(skewed.finishedAt).toBe(start);
  expect(skewed.updatedAt).toBeGreaterThanOrEqual(skewed.startedAt);
  const paused = togglePause(session(), at(-30));
  expect(paused.updatedAt).toBeGreaterThanOrEqual(paused.startedAt);
});

test('skipping the break preserves the actual break time', () => {
  const s = stop(advance(session(), at(1500)).session, at(1520));
  expect(s.phase).toBe('completed');
  expect(s.breakSeconds).toBe(20);
});

test('new sessions clamp the duration and trim the name to what the server accepts', () => {
  expect(newPomodoroSession({ id: 'A', category: 'coding', name: '  x  ', durationMinutes: 500, autoBreak: true, playSound: true, now: 0 })).toMatchObject({
    name: 'x',
    durationMinutes: 120,
    deadline: 7200,
    keepAwake: true,
    revision: 1,
  });
  expect(newPomodoroSession({ id: 'B', category: 'coding', name: '', durationMinutes: 0, autoBreak: true, playSound: true, now: 0 }).durationMinutes).toBe(1);
  expect(sessionName('a'.repeat(200))).toHaveLength(120);
  // 61 two-unit emoji would be 122 UTF-16 units; the last whole one that fits is kept, never half of one.
  expect(sessionName('😀'.repeat(61))).toBe('😀'.repeat(60));
});
