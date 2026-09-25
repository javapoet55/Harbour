import type { NexdoTask } from '../api/types';

const mockUpdateTask = jest.fn();
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  endpoints: { updateTask: (...args: unknown[]) => mockUpdateTask(...args) },
}));

import { cancelFocusCompletionForTests, useFocus } from './focus';
import { durationLabel, focusAccessibilityLabel, focusLabel, remainingSeconds } from '../lib/focusClock';

const NOW = Date.parse('2026-09-16T03:30:00.000Z');

function task(overrides: Partial<NexdoTask> = {}): NexdoTask {
  return { id: 't1', title: 'Pack boxes', status: 'PLANNED', priority: 'NORMAL', durationMin: 30, ...overrides };
}

const RECEIPT = { minutes: 25, workSessionId: 'w1', focusToken: 'tok-1' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  useFocus.getState().clear();
});

afterEach(() => {
  cancelFocusCompletionForTests();
  jest.useRealTimers();
});

/** `FocusClock` (ios/Sources/NexdoCore/FocusClock.swift). */
describe('FocusClock', () => {
  it('rounds the remainder up and never goes below zero', () => {
    expect(remainingSeconds(NOW + 1500, NOW)).toBe(2);
    expect(remainingSeconds(NOW, NOW)).toBe(0);
    expect(remainingSeconds(NOW - 10_000, NOW)).toBe(0);
  });

  it('formats mm:ss with two digits, and does not wrap past an hour', () => {
    expect(focusLabel(0)).toBe('00:00');
    expect(focusLabel(65)).toBe('01:05');
    expect(focusLabel(1500)).toBe('25:00');
    // `%02d:%02d` on 3700 seconds gives 61:40, not 1:01:40.
    expect(focusLabel(3700)).toBe('61:40');
  });

  it('spells the remaining time out for assistive technology', () => {
    expect(focusAccessibilityLabel(65)).toBe('1 minutes, 5 seconds remaining');
  });
});

/** `DurationDisplay.durationLabel` (DoNowRecommendation.swift:52-61). */
describe('durationLabel', () => {
  it.each([
    [0, '0 minutes'],
    [1, '1 minute'],
    [45, '45 minutes'],
    [60, '1 hour'],
    [90, '1 hour 30 minutes'],
    [125, '2 hours 5 minutes'],
  ])('%d reads "%s"', (minutes, expected) => {
    expect(durationLabel(minutes)).toBe(expected);
  });
});

/** `AppModel.startFocus` / `finishFocus` (NexdoApp.swift:611-665). */
describe('focus store', () => {
  it('starts with no session', () => {
    expect(useFocus.getState().session).toBeNull();
  });

  it('start → POSTs the Swift body and holds a server-backed session', async () => {
    mockUpdateTask.mockResolvedValue({ task: task({ status: 'IN_PROGRESS' }), focus: RECEIPT });

    await useFocus.getState().startFocus(task());

    expect(mockUpdateTask).toHaveBeenCalledWith('t1', { status: 'IN_PROGRESS', focusMinutes: 25, fromRecommendation: false });
    expect(useFocus.getState().session).toEqual({
      taskId: 't1',
      title: 'Pack boxes',
      endsAt: NOW + 25 * 60_000,
      workSessionId: 'w1',
      token: 'tok-1',
      serverBacked: true,
    });
  });

  it('honours the minutes the SERVER granted over the minutes requested', async () => {
    mockUpdateTask.mockResolvedValue({ task: task(), focus: { ...RECEIPT, minutes: 10 } });

    await useFocus.getState().startFocus(task(), 25);

    expect(useFocus.getState().session?.endsAt).toBe(NOW + 10 * 60_000);
  });

  it('keeps the timer running locally when the server sends no receipt', async () => {
    mockUpdateTask.mockResolvedValue({ task: task() });

    await useFocus.getState().startFocus(task(), 25);

    const session = useFocus.getState().session;
    expect(session).toMatchObject({ serverBacked: false, workSessionId: null });
    expect(session?.endsAt).toBe(NOW + 25 * 60_000);
    expect(session?.token).toMatch(/^local-/);
  });

  it('tick → the clock counts down against the session end', async () => {
    mockUpdateTask.mockResolvedValue({ task: task(), focus: RECEIPT });
    await useFocus.getState().startFocus(task());
    const endsAt = useFocus.getState().session!.endsAt;

    expect(remainingSeconds(endsAt, NOW)).toBe(1500);
    expect(focusLabel(remainingSeconds(endsAt, NOW + 60_000))).toBe('24:00');
    expect(focusLabel(remainingSeconds(endsAt, NOW + 1500_000))).toBe('00:00');
  });

  it('finish → PATCHes the close body and clears the session', async () => {
    mockUpdateTask.mockResolvedValue({ task: task(), focus: RECEIPT });
    await useFocus.getState().startFocus(task());
    mockUpdateTask.mockClear();
    mockUpdateTask.mockResolvedValue({ ok: true });

    jest.setSystemTime(NOW + 5 * 60_000);
    await useFocus.getState().finishFocus();

    expect(mockUpdateTask).toHaveBeenCalledWith('t1', {
      focusAction: 'finish',
      focusToken: 'tok-1',
      endedAt: new Date(NOW + 5 * 60_000).toISOString(),
      workSessionId: 'w1',
    });
    expect(useFocus.getState().session).toBeNull();
  });

  it('never reports more time than the session allowed', async () => {
    mockUpdateTask.mockResolvedValue({ task: task(), focus: RECEIPT });
    await useFocus.getState().startFocus(task());
    const endsAt = useFocus.getState().session!.endsAt;
    mockUpdateTask.mockClear();
    mockUpdateTask.mockResolvedValue({ ok: true });

    // Finish an hour after the session should have ended.
    jest.setSystemTime(NOW + 85 * 60_000);
    await useFocus.getState().finishFocus();

    // `min(Date(), session.endsAt)`
    expect(mockUpdateTask.mock.calls[0][1]).toMatchObject({ endedAt: new Date(endsAt).toISOString() });
  });

  it('finishing a local-only session sends nothing', async () => {
    mockUpdateTask.mockResolvedValue({ task: task() });
    await useFocus.getState().startFocus(task());
    mockUpdateTask.mockClear();

    await useFocus.getState().finishFocus();

    expect(mockUpdateTask).not.toHaveBeenCalled();
    expect(useFocus.getState().session).toBeNull();
  });

  it('finishing with no session is a no-op', async () => {
    await useFocus.getState().finishFocus();
    expect(mockUpdateTask).not.toHaveBeenCalled();
  });

  it('starting a second session closes the first', async () => {
    mockUpdateTask.mockResolvedValue({ task: task(), focus: RECEIPT });
    await useFocus.getState().startFocus(task());

    mockUpdateTask.mockClear();
    mockUpdateTask.mockResolvedValue({ task: task({ id: 't2' }), focus: { ...RECEIPT, focusToken: 'tok-2' } });
    await useFocus.getState().startFocus(task({ id: 't2', title: 'Other' }));

    // The finish for t1 goes first, then the start for t2.
    expect(mockUpdateTask.mock.calls[0][0]).toBe('t1');
    expect(mockUpdateTask.mock.calls[0][1]).toMatchObject({ focusAction: 'finish' });
    expect(mockUpdateTask.mock.calls[1][0]).toBe('t2');
    expect(useFocus.getState().session).toMatchObject({ taskId: 't2' });
  });

  it('a recommended start does NOT close the running session first', async () => {
    mockUpdateTask.mockResolvedValue({ task: task(), focus: RECEIPT });
    await useFocus.getState().startFocus(task());

    mockUpdateTask.mockClear();
    mockUpdateTask.mockResolvedValue({ task: task({ id: 't2' }), focus: { ...RECEIPT, focusToken: 'tok-2' } });
    await useFocus.getState().startFocus(task({ id: 't2' }), 15, true);

    expect(mockUpdateTask).toHaveBeenCalledTimes(1);
    expect(mockUpdateTask.mock.calls[0][1]).toMatchObject({ fromRecommendation: true, focusMinutes: 15 });
  });

  it('the timer closes the session by itself when it runs out', async () => {
    mockUpdateTask.mockResolvedValue({ task: task(), focus: RECEIPT });
    await useFocus.getState().startFocus(task());
    mockUpdateTask.mockClear();
    mockUpdateTask.mockResolvedValue({ ok: true });

    jest.setSystemTime(NOW + 25 * 60_000);
    await jest.advanceTimersByTimeAsync(25 * 60_000);

    expect(mockUpdateTask).toHaveBeenCalledWith('t1', expect.objectContaining({ focusAction: 'finish' }));
    expect(useFocus.getState().session).toBeNull();
  });

  it('a session replaced before its timer fires does not close the newer one', async () => {
    mockUpdateTask.mockResolvedValue({ task: task(), focus: RECEIPT });
    await useFocus.getState().startFocus(task());

    // Replace it with a longer session from a recommendation, so no finish is sent in between.
    mockUpdateTask.mockResolvedValue({ task: task({ id: 't2' }), focus: { minutes: 50, workSessionId: 'w2', focusToken: 'tok-2' } });
    await useFocus.getState().startFocus(task({ id: 't2' }), 50, true);
    mockUpdateTask.mockClear();
    mockUpdateTask.mockResolvedValue({ ok: true });

    // Run past the FIRST session's 25 minutes; the second is still live.
    jest.setSystemTime(NOW + 25 * 60_000);
    await jest.advanceTimersByTimeAsync(25 * 60_000);

    expect(useFocus.getState().session).toMatchObject({ taskId: 't2' });
  });

  it('survives backgrounding: the session is time-based, not tick-based', async () => {
    mockUpdateTask.mockResolvedValue({ task: task(), focus: RECEIPT });
    await useFocus.getState().startFocus(task());
    const endsAt = useFocus.getState().session!.endsAt;

    // No ticks at all for ten minutes, as if the screen were unmounted.
    jest.setSystemTime(NOW + 10 * 60_000);

    // The remaining time is derived from the clock, so it is still correct.
    expect(focusLabel(remainingSeconds(endsAt, Date.now()))).toBe('15:00');
    expect(useFocus.getState().session).not.toBeNull();
  });

  it('clear() drops the session, as reset() does on sign-out', async () => {
    mockUpdateTask.mockResolvedValue({ task: task(), focus: RECEIPT });
    await useFocus.getState().startFocus(task());

    useFocus.getState().clear();

    expect(useFocus.getState().session).toBeNull();
    expect(useFocus.getState().busy).toBe(false);
  });

  it('does NOT persist, matching Swift: focusSession is @Published, not @AppStorage', async () => {
    mockUpdateTask.mockResolvedValue({ task: task(), focus: RECEIPT });
    await useFocus.getState().startFocus(task());

    // Nothing in the store carries a storage key, and no rehydrate entry point exists.
    expect(useFocus.getState()).not.toHaveProperty('hydrate');
    expect(useFocus.getState()).not.toHaveProperty('persist');
  });
});
