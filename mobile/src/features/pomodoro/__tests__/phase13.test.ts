import { CATEGORY_COLORS, CATEGORY_ICONS, TIMER_TINTS } from '../format';
import { newPomodoroSession, POMODORO_CATEGORIES, POMODORO_CATEGORY_SYMBOLS, POMODORO_CATEGORY_TITLES, stop, tick, togglePause, type PomodoroSession } from '../model';

/** The cases are Swift's own: ios/Tests/NexdoCoreTests/PomodoroTests.swift (bb57e09). */

const START = 1_790_000_000_000;

function session(autoBreak: boolean, playSound: boolean): PomodoroSession {
  return newPomodoroSession({ id: '11111111-1111-4111-8111-111111111111', category: 'personalWork', name: '', durationMinutes: 25, autoBreak, playSound, now: START });
}

/** Steps the session like `PomodoroStore.tick`, returning whether that tick chimed. */
function stepper(initial: PomodoroSession) {
  let current = initial;
  return {
    tick: (seconds: number) => {
      const result = tick(current, START + seconds * 1000);
      current = result.session;
      return result.shouldPlaySound;
    },
    get: () => current,
    set: (next: PomodoroSession) => {
      current = next;
    },
  };
}

// personalWorkAndSoundPreferenceSurviveSaveAndRestore
it.each([false, true])('saves and restores Personal Work with Play Sound %s', (enabled) => {
  const restored = JSON.parse(JSON.stringify({ ...session(true, enabled), name: 'Home paperwork' })) as PomodoroSession;
  expect(restored.category).toBe('personalWork');
  expect(restored.playSound).toBe(enabled);
  expect(POMODORO_CATEGORY_TITLES[restored.category]).toBe('Personal Work');
  expect(POMODORO_CATEGORY_SYMBOLS[restored.category]).not.toBe('');
});

it('lists Personal Work last, as the server’s enum, with its blue', () => {
  expect(POMODORO_CATEGORIES[POMODORO_CATEGORIES.length - 1]).toBe('personalWork');
  expect([TIMER_TINTS.personalWork, CATEGORY_COLORS.personalWork, CATEGORY_ICONS.personalWork]).toEqual(['#007AFF', '#007AFF', 'person']);
});

// pomodoroSoundPlaysOnceAtEachAutomaticBoundaryOnlyWhenEnabled
it.each([false, true])('chimes once at each automatic boundary, only when Play Sound is %s', (enabled) => {
  const timer = stepper(session(true, enabled));
  expect(timer.tick(1499)).toBe(false);
  expect(timer.tick(1500)).toBe(enabled);
  expect(timer.get().phase).toBe('shortBreak');
  expect(timer.tick(1501)).toBe(false);
  expect(timer.tick(1800)).toBe(enabled);
  expect(timer.tick(1801)).toBe(false);
});

// pomodoroSoundRespectsPauseStopAndNoBreak
it('stays quiet while paused or stopped, and chimes at the end without a break', () => {
  const timer = stepper(session(false, true));
  timer.set(togglePause(timer.get(), START + 60_000));
  expect(timer.tick(2000)).toBe(false);
  timer.set(togglePause(timer.get(), START + 2_000_000));
  expect(timer.tick(3440)).toBe(true);
  expect(timer.get().phase).toBe('completed');

  const stopped = stepper(stop(session(true, true), START + 20_000));
  expect(stopped.tick(2000)).toBe(false);
});
