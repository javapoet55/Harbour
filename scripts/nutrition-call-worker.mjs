// Daily food check-in voice worker. Run as its own Railway service with a public domain:
//   node scripts/nutrition-call-worker.mjs
// - Accepts Twilio Media Streams at wss://<worker-domain>/twilio-media and bridges each call to OpenAI Realtime.
// - Calls POST /api/nutrition-calls/tick every minute so due calls are placed.
// Logs never contain audio, transcripts, phone numbers or credentials.
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket, { WebSocketServer } from 'ws';
import { createApiClient } from './nutrition-call-worker/api.mjs';
import { CallBridge } from './nutrition-call-worker/bridge.mjs';
import { createBackupTranscriber } from './nutrition-call-worker/flux.mjs';
import { createNoiseFilter } from './nutrition-call-worker/noise-filter.mjs';

const env = process.env;
const required = ['NUTRITION_API_BASE_URL', 'VOICE_WORKER_SECRET', 'HARBOR_CRON_SECRET', 'OPENAI_API_KEY'];
const missing = required.filter(name => !env[name]);
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
const baseUrl = new URL(env.NUTRITION_API_BASE_URL);
if (baseUrl.protocol !== 'https:' && env.NODE_ENV === 'production') throw new Error('NUTRITION_API_BASE_URL must use HTTPS');

const api = createApiClient({ baseUrl, workerSecret: env.VOICE_WORKER_SECRET });
const log = message => console.log(`[nutrition-call] ${message}`);
const active = new Set();
let stopping = false;

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(`ok ${active.size}`); return; }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url ?? '/', 'http://worker').pathname !== '/twilio-media' || stopping) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, twilio => wss.emit('connection', twilio));
});

wss.on('connection', twilio => {
  const bridge = new CallBridge({
    api, log,
    sendToTwilio: msg => { if (twilio.readyState === WebSocket.OPEN) twilio.send(JSON.stringify(msg)); },
    closeTwilio: () => twilio.close(),
    connectOpenAI: model => new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` } }),
    createNoiseFilter: () => createNoiseFilter(),
    createBackupTranscriber: () => createBackupTranscriber(env),
  });
  active.add(bridge);
  twilio.on('message', data => { void bridge.handleTwilioMessage(data); });
  twilio.on('close', () => { bridge.handleTwilioClose(); active.delete(bridge); });
  twilio.on('error', () => log('twilio_socket_error'));
});

const port = Number(env.PORT || 8080);
server.listen(port, () => log(`listening on ${port}`));

// Minute tick, same pattern as the Moments worker.
const tickUrl = new URL('/api/nutrition-calls/tick', baseUrl);
(async () => {
  while (!stopping) {
    const started = Date.now();
    try {
      const response = await fetch(tickUrl, { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${env.HARBOR_CRON_SECRET}` }, signal: AbortSignal.timeout(55000) });
      log(`tick: HTTP ${response.status}`);
      await response.body?.cancel();
    } catch { log('tick failed; retrying next cycle'); }
    if (!stopping) await delay(Math.max(1000, 60000 - (Date.now() - started)));
  }
})();

// On deploy: stop taking calls, let live calls finish (up to the drain window), then end the rest cleanly.
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const drainMs = Math.min(Number(env.NUTRITION_WORKER_DRAIN_SECONDS ?? 300), 330) * 1000;
  const deadline = Date.now() + drainMs;
  while (active.size && Date.now() < deadline) await delay(1000);
  await Promise.all([...active].map(bridge => bridge.end('worker_shutdown')));
  server.close();
  process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void shutdown(); });
