import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarSyncIntervalMs, describeCalendarSync, runCalendarSync, startCalendarSyncTimer } from './calendar-sync-timer.mjs';

type SyncResult = Awaited<ReturnType<typeof runCalendarSync>>;
const okResult: SyncResult = { ok: true, status: 200, connections: 2, errors: 0, durationMs: 5 };
const url = new URL('https://api.example.test/api/calendar/sync');

describe('CALENDAR_SYNC_INTERVAL_MS', () => {
  it('defaults to 10 minutes, 0 turns it off, and rejects anything unusable', () => {
    expect(calendarSyncIntervalMs(undefined)).toBe(600_000);
    expect(calendarSyncIntervalMs(' ')).toBe(600_000);
    expect(calendarSyncIntervalMs('0')).toBe(0);
    expect(calendarSyncIntervalMs('900000')).toBe(900_000);
    for (const bad of ['abc', '-1', '1.5', '30000', '10m']) expect(() => calendarSyncIntervalMs(bad)).toThrow('CALENDAR_SYNC_INTERVAL_MS');
  });
});

describe('one sync run', () => {
  it('posts with the cron secret and counts connections and errors', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ results: [{ id: 'c1', userId: 'u1', created: 1 }, { id: 'c2', userId: 'u2', error: 'Token has been expired or revoked.' }, { id: 'c3', userId: 'u1', updated: 0 }], replans: [] }));
    const result = await runCalendarSync({ url, secret: 's3cret', timeoutMs: 1000, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(url, expect.objectContaining({ method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer s3cret' } }));
    expect(result).toMatchObject({ ok: true, status: 200, connections: 3, errors: 1 });
  });

  it('reports HTTP failures, network errors, timeouts and odd responses without throwing', async () => {
    const run = (fetchImpl: () => Promise<Response>) => runCalendarSync({ url, secret: 's', timeoutMs: 1000, fetchImpl });
    expect(await run(async () => new Response('nope', { status: 500 }))).toMatchObject({ ok: false, status: 500, reason: 'HTTP 500', connections: 0, errors: 0 });
    expect(await run(async () => { throw new TypeError('fetch failed'); })).toMatchObject({ ok: false, reason: 'network error' });
    expect(await run(async () => { throw new DOMException('The operation timed out.', 'TimeoutError'); })).toMatchObject({ ok: false, reason: 'timeout' });
    expect(await run(async () => new Response('not json', { status: 200 }))).toMatchObject({ ok: false, reason: 'unexpected response' });
    expect(await run(async () => Response.json({ error: 'Unauthorized' }))).toMatchObject({ ok: false, reason: 'unexpected response' });
  });

  it('logs one line of counts only: no ids, emails, tokens or provider messages', async () => {
    const fetchImpl = async () => Response.json({ results: [{ id: 'conn-1', userId: 'user-1', error: 'Token has been expired or revoked. asha@example.com' }] });
    const line = describeCalendarSync(await runCalendarSync({ url, secret: 'top-secret', timeoutMs: 1000, fetchImpl, now: (() => { let t = 0; return () => (t += 250); })() }));
    expect(line).toBe('Calendar sync: ok, 1 connections, 1 errors, 250 ms');
    expect(describeCalendarSync({ ok: false, reason: 'HTTP 401', status: 401, connections: 0, errors: 0, durationMs: 12 })).toBe('Calendar sync: failed (HTTP 401), 0 connections, 0 errors, 12 ms');
    for (const secret of ['conn-1', 'user-1', 'expired', 'asha@', 'top-secret', 'Bearer']) expect(line).not.toContain(secret);
  });
});

describe('the timer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const logs = () => { const lines: string[] = []; return { lines, log: (line: string) => lines.push(line), logError: (line: string) => lines.push(line) }; };

  it('runs at start and then every interval, one log line per run', async () => {
    const run = vi.fn(async () => okResult);
    const { lines, log, logError } = logs();
    const timer = startCalendarSyncTimer({ intervalMs: 600_000, run, log, logError })!;
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(599_999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_200_000);
    expect(run).toHaveBeenCalledTimes(4);
    expect(lines).toEqual(Array(4).fill('Calendar sync: ok, 2 connections, 0 errors, 5 ms'));
    await timer.stop();
  });

  it('keeps going after failed runs and after a run that throws', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ ok: false, reason: 'HTTP 500', status: 500, connections: 0, errors: 0, durationMs: 3 })
      .mockRejectedValueOnce(new Error('boom asha@example.com'))
      .mockResolvedValue(okResult);
    const { lines, log, logError } = logs();
    const timer = startCalendarSyncTimer({ intervalMs: 60_000, run, log, logError })!;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(3);
    expect(lines).toEqual([
      'Calendar sync: failed (HTTP 500), 0 connections, 0 errors, 3 ms',
      'Calendar sync: failed (internal error); retrying on next cycle',
      'Calendar sync: ok, 2 connections, 0 errors, 5 ms',
    ]);
    await timer.stop();
  });

  it('is off when the interval is 0', async () => {
    const run = vi.fn(async () => okResult);
    const { lines, log, logError } = logs();
    expect(startCalendarSyncTimer({ intervalMs: 0, run, log, logError })).toBeNull();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(run).not.toHaveBeenCalled();
    expect(lines).toEqual(['Calendar sync: off (CALENDAR_SYNC_INTERVAL_MS=0)']);
  });

  it('never overlaps: a slow run pushes the next one back', async () => {
    let active = 0; let most = 0;
    const run = vi.fn(async () => {
      active++; most = Math.max(most, active);
      await new Promise((resolve) => setTimeout(resolve, 150_000)); // longer than the interval
      active--;
      return okResult;
    });
    const { log, logError } = logs();
    const timer = startCalendarSyncTimer({ intervalMs: 60_000, run, log, logError })!;
    await vi.advanceTimersByTimeAsync(100_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(timer.running).toBe(true);
    // First run ends at 150s; the next starts 60s after that, at 210s.
    await vi.advanceTimersByTimeAsync(109_999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000_000);
    expect(most).toBe(1);
    await timer.stop();
  });

  it('does not hold up the caller while a sync is running, and stop waits for it', async () => {
    let finish!: (value: SyncResult) => void;
    const run = vi.fn(() => new Promise<SyncResult>((resolve) => { finish = resolve; }));
    const { log, logError } = logs();
    const timer = startCalendarSyncTimer({ intervalMs: 60_000, run, log, logError })!;
    // start returned while the run is still pending: the Moments loop carries on.
    expect(timer.running).toBe(true);
    let stopped = false;
    const stopping = timer.stop().then(() => { stopped = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);
    finish(okResult);
    await stopping;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
