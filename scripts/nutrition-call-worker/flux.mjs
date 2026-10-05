// Deepgram Flux backup transcript of the (cleaned) caller audio. Optional: without DEEPGRAM_API_KEY it is off.
import WebSocket from 'ws';

export function createBackupTranscriber(env = process.env, WebSocketImpl = WebSocket) {
  const key = env.DEEPGRAM_API_KEY;
  if (!key) return null;
  const url = 'wss://api.deepgram.com/v2/listen?model=flux-general-en&encoding=mulaw&sample_rate=8000';
  const socket = new WebSocketImpl(url, { headers: { Authorization: `Token ${key}` } });
  const turns = [];
  const queue = [];
  let open = false, closed = false;
  socket.on('open', () => { open = true; for (const b of queue.splice(0)) socket.send(b); });
  socket.on('message', data => {
    try {
      const msg = JSON.parse(String(data));
      if (msg.type === 'TurnInfo' && msg.event === 'EndOfTurn' && typeof msg.transcript === 'string' && msg.transcript.trim()) turns.push(msg.transcript.trim());
    } catch { /* ignore non-JSON frames */ }
  });
  socket.on('close', () => { closed = true; });
  socket.on('error', () => { closed = true; });
  return {
    send(bytes) {
      if (closed) return;
      const buf = Buffer.from(bytes);
      if (open) socket.send(buf); else if (queue.length < 250) queue.push(buf);
    },
    /** Flushes, closes and returns the turns heard. Never waits more than timeoutMs. */
    async finish(timeoutMs = 3000) {
      if (!closed && open) {
        try { socket.send(JSON.stringify({ type: 'CloseStream' })); } catch { /* socket already gone */ }
        await new Promise(resolve => { const t = setTimeout(resolve, timeoutMs); socket.once('close', () => { clearTimeout(t); resolve(); }); });
      }
      try { socket.close(); } catch { /* ignore */ }
      return turns;
    },
  };
}
