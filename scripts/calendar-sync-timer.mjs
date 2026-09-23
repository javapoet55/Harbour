// Calendar sync on its own timer inside the Moments worker. It shares nothing with the Moments tick
// loop except the process: a failing or slow sync only affects its own next run.

export const DEFAULT_CALENDAR_SYNC_INTERVAL_MS = 600_000;
/** A sync that has not answered by then is abandoned client-side; the server may still finish it. */
export const MAX_CALENDAR_SYNC_TIMEOUT_MS = 300_000;

/** CALENDAR_SYNC_INTERVAL_MS: unset means 10 minutes, 0 turns the timer off. Anything else invalid stops startup. */
export function calendarSyncIntervalMs(value) {
  if (value === undefined || value.trim() === '') return DEFAULT_CALENDAR_SYNC_INTERVAL_MS;
  const ms = Number(value);
  if (!Number.isInteger(ms) || ms < 0) throw new Error('CALENDAR_SYNC_INTERVAL_MS must be a whole number of milliseconds (0 turns calendar sync off)');
  if (ms > 0 && ms < 60_000) throw new Error('CALENDAR_SYNC_INTERVAL_MS must be 0 or at least 60000');
  return ms;
}

/**
 * One POST /api/calendar/sync. Never throws. The result holds counts only: no ids, tokens, emails or
 * provider error messages, so it is safe to log.
 * @returns {Promise<{ ok: boolean, status?: number, reason?: string, connections: number, errors: number, durationMs: number }>}
 */
export async function runCalendarSync({ url, secret, timeoutMs, fetchImpl = fetch, now = Date.now }) {
  const started = now();
  const done = (result) => ({ connections: 0, errors: 0, ...result, durationMs: now() - started });
  let response;
  try {
    response = await fetchImpl(url, { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    return done({ ok: false, reason: error?.name === 'TimeoutError' ? 'timeout' : 'network error' });
  }
  if (!response.ok) { await response.body?.cancel(); return done({ ok: false, status: response.status, reason: `HTTP ${response.status}` }); }
  try {
    const body = await response.json();
    const results = Array.isArray(body?.results) ? body.results : null;
    if (!results) return done({ ok: false, status: response.status, reason: 'unexpected response' });
    return done({ ok: true, status: response.status, connections: results.length, errors: results.filter((result) => result && result.error).length });
  } catch {
    return done({ ok: false, status: response.status, reason: 'unexpected response' });
  }
}

/** The one log line per run. */
export function describeCalendarSync(result) {
  const counts = `${result.connections} connections, ${result.errors} errors, ${result.durationMs} ms`;
  return result.ok ? `Calendar sync: ok, ${counts}` : `Calendar sync: failed (${result.reason}), ${counts}`;
}

/**
 * Runs `run` now and then `intervalMs` after each run finishes, so runs never overlap and a slow run
 * pushes the next one back instead of stacking. `run` must not throw; if it does, the error is logged
 * and the timer carries on. Returns null when the interval is 0.
 */
export function startCalendarSyncTimer({ intervalMs, run, log = console.log, logError = console.error, timers = { setTimeout, clearTimeout } }) {
  if (!intervalMs) { log('Calendar sync: off (CALENDAR_SYNC_INTERVAL_MS=0)'); return null; }
  let stopped = false;
  let running = false;
  let handle = null;
  let current = Promise.resolve();
  const tick = async () => {
    handle = null;
    if (stopped || running) return;
    running = true;
    try { log(describeCalendarSync(await run())); }
    catch { logError('Calendar sync: failed (internal error); retrying on next cycle'); }
    finally {
      running = false;
      if (!stopped) handle = timers.setTimeout(() => { current = tick(); }, intervalMs);
    }
  };
  current = tick();
  return {
    get running() { return running; },
    /** Stops scheduling; resolves when a run in progress has finished. */
    async stop() { stopped = true; if (handle) timers.clearTimeout(handle); handle = null; await current; },
  };
}
