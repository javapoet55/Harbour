import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Alert } from 'react-native';

jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(async () => undefined), deactivateKeepAwake: jest.fn(async () => undefined) }));

import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { advance, newPomodoroSession, stop, type PomodoroSession } from '../model';
import { PomodoroView } from '../PomodoroView';
import { createPomodoroStore, type PomodoroCache, type PomodoroDeps } from '../store';

/**
 * `PomodoroView` (ios/App/PomodoroView.swift) and `PomodoroDashboard` (PomodoroDashboard.swift), on the
 * part 1 store with an in-memory server and a clock the test moves.
 */

let clock = Date.parse('2026-09-26T18:00:00Z');
let ids = 0;

function setup(cache: PomodoroCache | null = null, overrides: Partial<PomodoroDeps> = {}) {
  const deps: PomodoroDeps = {
    page: jest.fn(async () => ({ sessions: [], nextCursor: null })),
    save: jest.fn(async (_owner: string, session: PomodoroSession) => ({ session })),
    load: jest.fn(async () => cache),
    persist: jest.fn(async () => undefined),
    replaceAlerts: jest.fn(async () => undefined),
    chime: jest.fn(),
    uuid: () => `ID-${++ids}`,
    now: () => clock,
    ...overrides,
  };
  const store = createPomodoroStore(deps);
  const onTasks = jest.fn();
  const onClose = jest.fn();
  return { store, deps, onTasks, onClose };
}

async function open(harness: ReturnType<typeof setup>) {
  await render(<PomodoroView now={() => clock} onClose={harness.onClose} onTasks={harness.onTasks} owner="u1" store={harness.store} />);
  await act(async () => {
    await Promise.resolve();
  });
}

function finished(startOffsetMs: number, category: PomodoroSession['category'] = 'focus', stopped = false): PomodoroSession {
  const start = clock - startOffsetMs;
  const session = newPomodoroSession({ id: `S-${++ids}`, category, name: '', durationMinutes: 25, autoBreak: false, playSound: false, now: start });
  return stopped ? stop(session, start + 600_000) : advance(session, start + 1_500_000).session;
}

beforeEach(() => {
  jest.clearAllMocks();
  clock = Date.parse('2026-09-26T18:00:00Z');
});

describe('the dashboard', () => {
  it('opens first, with today\'s focus, sessions, break time and focus rate', async () => {
    const harness = setup({ sessions: [finished(3 * 3_600_000, 'reading'), finished(2 * 3_600_000, 'coding', true)], currentID: null, synced: {} });
    await open(harness);
    expect(screen.getByTestId('pomodoro-dashboard')).toBeTruthy();
    expect(screen.getByText('Pomodoro')).toBeTruthy();
    expect(screen.getByTestId('pomodoro-focus-total')).toHaveTextContent('35 min');
    expect(within(screen.getByTestId('pomodoro-metric-sessions')).getByText('2')).toBeTruthy();
    expect(within(screen.getByTestId('pomodoro-metric-break')).getByText('0 min')).toBeTruthy();
    expect(within(screen.getByTestId('pomodoro-metric-rate')).getByText('50%')).toBeTruthy();
    expect(screen.getByText('Your first focus time this period')).toBeTruthy();
    expect(screen.getByTestId('pomodoro-dashboard-start')).toHaveTextContent('Start Focus Session');
    await fireEvent.press(screen.getByTestId('pomodoro-dashboard-back'));
    expect(harness.onClose).toHaveBeenCalled();
  });

  it('switches period, and says when a period has no sessions', async () => {
    await open(setup({ sessions: [finished(3 * 86_400_000)], currentID: null, synced: {} }));
    expect(screen.getByText('No sessions in this period yet.')).toBeTruthy();
    expect(screen.getByText('Start a session to build your focus habit')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pomodoro-period-all'));
    expect(screen.getByTestId('pomodoro-period-all').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('pomodoro-focus-total')).toHaveTextContent('25 min');
    expect(screen.queryByText('No sessions in this period yet.')).toBeNull();
  });

  it('lists sessions by day and opens a session\'s details', async () => {
    await open(setup({ sessions: [finished(2 * 3_600_000, 'reading'), finished(2 * 86_400_000, 'math', true)], currentID: null, synced: {} }));
    await fireEvent.press(screen.getByTestId('pomodoro-tab-sessions'));
    expect(screen.getByRole('header', { name: 'Sessions' })).toBeTruthy();
    // The newest day is open; older days start closed.
    expect(screen.getAllByTestId('pomodoro-history-entry')).toHaveLength(1);
    await fireEvent.press(within(screen.getByTestId('pomodoro-day-1')).getByRole('button'));
    expect(screen.getAllByTestId('pomodoro-history-entry')).toHaveLength(2);
    await fireEvent.press(screen.getAllByTestId('pomodoro-history-entry')[1]);
    const detail = within(screen.getByTestId('pomodoro-session-detail'));
    expect(detail.getByText('Session details')).toBeTruthy();
    expect(detail.getByText('Stopped early')).toBeTruthy();
    expect(detail.getByText('25 min')).toBeTruthy();
    expect(detail.getByText('10 min')).toBeTruthy();
    await fireEvent.press(detail.getByTestId('pomodoro-session-done'));
    expect(screen.queryByTestId('pomodoro-session-detail')).toBeNull();
    await fireEvent.press(screen.getByTestId('pomodoro-dashboard-back'));
    expect(screen.getByTestId('pomodoro-focus-total')).toBeTruthy();
  });

  it('shows an empty history with a start button', async () => {
    await open(setup());
    await fireEvent.press(screen.getByTestId('pomodoro-tab-sessions'));
    expect(screen.getByText('No sessions yet')).toBeTruthy();
    expect(screen.getByText('Start a focus session to build your history.')).toBeTruthy();
  });

  it('shows each category\'s share on Insights, which reads "Categories" while selected', async () => {
    clock = Date.parse('2026-09-24T18:00:00Z'); // a Thursday, so the week holds both sessions
    await open(setup({ sessions: [finished(2 * 3_600_000, 'reading'), finished(3_600_000, 'coding'), finished(4 * 3_600_000, 'coding')], currentID: null, synced: {} }));
    await fireEvent.press(screen.getByTestId('pomodoro-tab-insights'));
    expect(screen.getByText('Categories')).toBeTruthy();
    expect(screen.getByText('Time by Category')).toBeTruthy();
    expect(screen.getByText('Focus Trend')).toBeTruthy();
    expect(within(screen.getByTestId('pomodoro-share-coding')).getByText('67%')).toBeTruthy();
    expect(within(screen.getByTestId('pomodoro-share-reading')).getByText('33%')).toBeTruthy();
    expect(within(screen.getByTestId('pomodoro-donut')).getByText('1h 15m')).toBeTruthy();
  });

  it('explains the metrics from its menu', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await open(setup());
    await fireEvent.press(screen.getByTestId('pomodoro-dashboard-menu'));
    await fireEvent.press(screen.getByTestId('pomodoro-menu-about'));
    expect(alert).toHaveBeenCalledWith('Your focus metrics', expect.stringContaining('Focus time excludes pauses and breaks'), [{ text: 'Got it', style: 'cancel' }]);
    alert.mockRestore();
  });
});

describe('the timer', () => {
  it('starts a session from setup, keeps the screen awake, pauses and stops into the completion card', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const harness = setup();
    await open(harness);
    await fireEvent.press(screen.getByTestId('pomodoro-dashboard-start'));
    expect(screen.getByText('Choose a focus type and set your timer.')).toBeTruthy();
    expect(screen.getByTestId('pomodoro-category-focus').props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(screen.getByTestId('pomodoro-category-coding'));
    await fireEvent.changeText(screen.getByTestId('pomodoro-name'), 'Write the parser');
    await fireEvent.press(screen.getByTestId('pomodoro-minutes-up'));
    expect(screen.getByTestId('pomodoro-minutes')).toHaveTextContent('30 min');
    await fireEvent.press(screen.getByTestId('pomodoro-minutes-down'));
    await fireEvent.press(screen.getByTestId('pomodoro-start'));

    expect(screen.getByTestId('pomodoro-countdown')).toHaveTextContent('25:00');
    expect(screen.getByText('Write the parser')).toBeTruthy();
    expect(screen.getByText('Coding')).toBeTruthy();
    expect(screen.getByText('Focus Time')).toBeTruthy();
    await waitFor(() => expect(activateKeepAwakeAsync).toHaveBeenCalledWith('pomodoro-focus'));

    await fireEvent.press(screen.getByLabelText('Pause'));
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(screen.getByLabelText('Resume')).toBeTruthy();
    await waitFor(() => expect(deactivateKeepAwake).toHaveBeenCalledWith('pomodoro-focus'));

    await fireEvent.press(screen.getByLabelText('Stop'));
    expect(alert).toHaveBeenCalledWith('Stop this focus session?', 'Your time so far will be saved in session history.', expect.any(Array));
    const stopButton = (alert.mock.calls[0][2] as { text: string; onPress?: () => void }[]).find((button) => button.text === 'Stop session')!;
    await act(async () => stopButton.onPress?.());
    expect(screen.getByText('Session stopped')).toBeTruthy();
    expect(screen.getByText('Your focus time has been saved.')).toBeTruthy();
    expect(within(screen.getByTestId('pomodoro-completion')).getByText('0')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('pomodoro-back-to-tasks'));
    expect(harness.onTasks).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('pomodoro-another'));
    expect(screen.getByTestId('pomodoro-setup')).toBeTruthy();
    alert.mockRestore();
  });

  it('turns off "keep awake" with Distraction-free mode', async () => {
    await open(setup());
    await fireEvent.press(screen.getByTestId('pomodoro-dashboard-start'));
    await fireEvent.press(screen.getByTestId('pomodoro-start'));
    await waitFor(() => expect(activateKeepAwakeAsync).toHaveBeenCalled());
    await fireEvent(screen.getByTestId('pomodoro-keep-awake'), 'valueChange', false);
    await waitFor(() => expect(deactivateKeepAwake).toHaveBeenCalledWith('pomodoro-focus'));
  });

  it('moves into the break when the focus ends, then completes with "Great job!"', async () => {
    jest.useFakeTimers({ now: clock });
    try {
      const harness = setup();
      await open(harness);
      await fireEvent.press(screen.getByTestId('pomodoro-dashboard-start'));
      await fireEvent.press(screen.getByTestId('pomodoro-minutes-down'));
      await fireEvent.press(screen.getByTestId('pomodoro-minutes-down'));
      await fireEvent.press(screen.getByTestId('pomodoro-minutes-down'));
      await fireEvent.press(screen.getByTestId('pomodoro-minutes-down'));
      expect(screen.getByTestId('pomodoro-minutes')).toHaveTextContent('5 min');
      await fireEvent.press(screen.getByTestId('pomodoro-start'));
      clock += 5 * 60_000;
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByText('Time for a short break!')).toBeTruthy();
      expect(screen.getByText('You’ve earned it! ☕')).toBeTruthy();
      expect(harness.deps.chime).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Distraction-free mode')).toBeNull();
      await fireEvent.press(screen.getByLabelText('Skip'));
      expect(screen.getByText('Great job!')).toBeTruthy();
      expect(screen.getByText('Focus session completed.')).toBeTruthy();
      expect(screen.getByTestId('pomodoro-confetti', { includeHiddenElements: true })).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('opens the session history as a sheet on Sessions', async () => {
    await open(setup({ sessions: [finished(3_600_000)], currentID: null, synced: {} }));
    await fireEvent.press(screen.getByTestId('pomodoro-dashboard-start'));
    await fireEvent.press(screen.getByTestId('pomodoro-open-history'));
    expect(screen.getAllByTestId('pomodoro-history-entry')).toHaveLength(1);
    expect(screen.getAllByText('Sessions').length).toBeGreaterThan(0);
  });

  it('shows Swift\'s offline message with Retry sync', async () => {
    const harness = setup(null, { page: jest.fn(async () => Promise.reject(new Error('offline'))) });
    await open(harness);
    await fireEvent.press(screen.getByTestId('pomodoro-dashboard-start'));
    await waitFor(() => expect(screen.getByText('Saved on this device. Connect to sync your sessions.')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('pomodoro-retry-sync'));
    expect(harness.deps.page).toHaveBeenCalledTimes(2);
  });
});
