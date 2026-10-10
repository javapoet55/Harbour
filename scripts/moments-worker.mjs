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
let calendarInterval = null;
try { calendarInterval = calendarSyncIntervalMs(process.env.CALENDAR_SYNC_INTERVAL_MS); }
catch (error) { console.error(`Calendar sync: off (${error.message})`); }
const calendarUrl = new URL('/api/calendar/sync', base);
const calendarTimer = calendarInterval === null ? null : startCalendarSyncTimer({
  intervalMs: calendarInterval,
  run: () => runCalendarSync({ url: calendarUrl, secret, timeoutMs: Math.min(calendarInterval, MAX_CALENDAR_SYNC_TIMEOUT_MS) }),
});

// Independent timer: a slow shopping or Moments tick must not delay the 6 a.m. briefing.
let morningRunning = false;
async function morningTick() {
  if (morningRunning || stopping) return;
  morningRunning = true;
  try {
    const response = await fetch(new URL('/api/notifications/morning-tick', base), {
      method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(55000),
    });
    console.log(`Morning summary tick: HTTP ${response.status}`);
    if (response.ok) {
      const counts = await response.json();
      console.log(`Morning summary deliveries: sent=${Number(counts.sent) || 0} skipped=${Number(counts.skipped) || 0} failed=${Number(counts.failed) || 0}`);
    } else { await response.body?.cancel(); }
  } catch { console.error('Morning summary tick failed; checking again next cycle'); }
  finally { morningRunning = false; }
}
let stopping = false;
const morningTimer = setInterval(() => { void morningTick(); }, 60000);
void morningTick();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; clearInterval(morningTimer); void calendarTimer?.stop(); });
while (!stopping) {
  const started = Date.now();
  try {
    const response = await fetch(url, { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(55000) });
    // No payloads, credentials or recipient information in worker logs.
    console.log(`Moments tick: HTTP ${response.status}`);
    await response.body?.cancel();
  } catch { console.error('Moments tick failed; retrying on next cycle'); }
  // Shopping email failures must not interrupt Moments or calendar scheduling.
  try {
    const response = await fetch(new URL('/api/shopping/email-tick', base), {method:'POST', redirect:'error', headers:{Authorization:`Bearer ${secret}`}, signal:AbortSignal.timeout(55000)});
    console.log(`Shopping email tick: HTTP ${response.status}`);
    await response.body?.cancel();
  } catch { console.error('Shopping email tick failed; retrying on next cycle'); }
  // Database lease/due date ensures one daily collection per shared offer region.
  try {
    const response = await fetch(new URL('/api/shopping/offers-tick', base), {method:'POST', redirect:'error', headers:{Authorization:`Bearer ${secret}`}, signal:AbortSignal.timeout(30000)});
    console.log(`Shopping offers tick: HTTP ${response.status}`);
    await response.body?.cancel();
  } catch { console.error('Shopping offers check failed; retrying on next cycle'); }
  // Durable bug report delivery and retention use the existing authenticated worker.
  try {
    const response = await fetch(new URL('/api/feedback/bug-tick', base), {method:'POST', redirect:'error', headers:{Authorization:`Bearer ${secret}`}, signal:AbortSignal.timeout(55000)});
    console.log(`Bug report tick: HTTP ${response.status}`);
    await response.body?.cancel();
  } catch { console.error('Bug report tick failed; retrying next cycle'); }
  if (!stopping) await delay(Math.max(1000, 60000 - (Date.now() - started)));
}
