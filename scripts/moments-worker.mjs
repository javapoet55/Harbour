// Run as a separate persistent service. Do not start an in-process web timer.
import { setTimeout as delay } from 'node:timers/promises';
const base = process.env.MOMENTS_API_BASE_URL;
const secret = process.env.HARBOR_CRON_SECRET;
if (!base || !secret) throw new Error('MOMENTS_API_BASE_URL and HARBOR_CRON_SECRET are required');
const url = new URL('/api/moments/tick', base);
if (url.protocol !== 'https:') throw new Error('MOMENTS_API_BASE_URL must use HTTPS');
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; });
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
