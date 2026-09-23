// Run as a separate persistent service. Do not start an in-process web timer.
import { setTimeout as delay } from 'node:timers/promises';
import { calendarSyncIntervalMs, MAX_CALENDAR_SYNC_TIMEOUT_MS, runCalendarSync, startCalendarSyncTimer } from './calendar-sync-timer.mjs';
const base = process.env.MOMENTS_API_BASE_URL;
const secret = process.env.HARBOR_CRON_SECRET;
if (!base || !secret) throw new Error('MOMENTS_API_BASE_URL and HARBOR_CRON_SECRET are required');
const url = new URL('/api/moments/tick', base);
if (url.protocol !== 'https:') throw new Error('MOMENTS_API_BASE_URL must use HTTPS');

// Calendar sync runs on its own timer (CALENDAR_SYNC_INTERVAL_MS, default 10 minutes, 0 = off). It never
// awaits or blocks the Moments loop below, and a bad setting turns it off rather than stopping the worker.
let calendarInterval = 0;
try { calendarInterval = calendarSyncIntervalMs(process.env.CALENDAR_SYNC_INTERVAL_MS); }
catch (error) { console.error(`Calendar sync: off (${error.message})`); }
const calendarUrl = new URL('/api/calendar/sync', base);
const calendarTimer = startCalendarSyncTimer({
  intervalMs: calendarInterval,
  run: () => runCalendarSync({ url: calendarUrl, secret, timeoutMs: Math.min(calendarInterval, MAX_CALENDAR_SYNC_TIMEOUT_MS) }),
});

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; void calendarTimer?.stop(); });
while (!stopping) {
  const started = Date.now();
  try {
    const response = await fetch(url, { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(55000) });
    // No payloads, credentials or recipient information in worker logs.
    console.log(`Moments tick: HTTP ${response.status}`);
    await response.body?.cancel();
  } catch { console.error('Moments tick failed; retrying on next cycle'); }
  if (!stopping) await delay(Math.max(1000, 60000 - (Date.now() - started)));
}
