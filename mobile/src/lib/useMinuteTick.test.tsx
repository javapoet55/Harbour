import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { MINUTE, useMinuteTick } from './useMinuteTick';

const START = Date.parse('2026-09-19T12:00:00.000Z');

function Clock() {
  const now = useMinuteTick();
  return <Text testID="clock">{String(now)}</Text>;
}

const reading = () => Number(screen.getByTestId('clock').props.children);

/** Advances the fake clock and lets React commit the re-render it schedules. */
async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/**
 * Fake timers are safe in this file because it is a module of its own: jest gives each test FILE its
 * own environment, so the timer mode never reaches the Settings screen's suite, where switching it
 * mid-run breaks React Query's scheduling for every later test.
 */
describe('useMinuteTick', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(START);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts at the current clock', async () => {
    await render(<Clock />);
    expect(reading()).toBe(START);
  });

  it('does not move before a whole minute has passed', async () => {
    await render(<Clock />);
    await advance(MINUTE - 1);
    expect(reading()).toBe(START);
  });

  it('re-reads the clock every minute', async () => {
    await render(<Clock />);
    await advance(MINUTE);
    expect(reading()).toBe(START + MINUTE);
    await advance(3 * MINUTE);
    expect(reading()).toBe(START + 4 * MINUTE);
  });

  it('stops ticking once its screen closes', async () => {
    // `Clock` owns exactly one interval, so any clear during unmount is the hook's own cleanup.
    // Counting `jest.getTimerCount()` would not do: unmounting schedules timers of React's own.
    const clear = jest.spyOn(global, 'clearInterval');
    try {
      const view = await render(<Clock />);
      await advance(MINUTE);
      expect(reading()).toBe(START + MINUTE);

      const before = clear.mock.calls.length;
      // React 19 runs effect cleanups on commit, so the unmount needs its own act.
      await act(async () => {
        view.unmount();
      });
      expect(clear.mock.calls.length).toBeGreaterThan(before);
    } finally {
      clear.mockRestore();
    }
  });
});
