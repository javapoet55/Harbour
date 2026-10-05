import { describe, expect, it, vi } from 'vitest';
import { FrameChunker, mulawDecodeSample, mulawEncodeSample, mulawToPcm16, pcm16ToMulaw } from './audio.mjs';
import { CallBridge } from './bridge.mjs';
import { createApiClient } from './api.mjs';

describe('μ-law codec', () => {
  it('matches G.711 reference points', () => {
    expect(mulawEncodeSample(0)).toBe(0xff);
    expect(mulawDecodeSample(0xff)).toBe(0);
    expect(mulawDecodeSample(0x00)).toBe(-32124);
    expect(mulawDecodeSample(0x80)).toBe(32124);
  });
  it('round-trips every code word exactly and speech-range samples within quantization error', () => {
    for (let b = 0; b < 256; b++) if (b !== 0x7f) expect(mulawEncodeSample(mulawDecodeSample(b))).toBe(b); // 0x7f and 0xff both decode to 0
    for (const s of [100, -100, 1000, -5000, 20000]) expect(Math.abs(mulawToPcm16(pcm16ToMulaw(new Int16Array([s])))[0] - s)).toBeLessThanOrEqual(Math.abs(s) * 0.07 + 8);
  });
  it('re-chunks arbitrary sizes into fixed frames', () => {
    const c = new FrameChunker(4);
    expect(c.push(new Uint8Array([1, 2, 3]))).toEqual([]);
    expect(c.push(new Uint8Array([4, 5, 6, 7, 8, 9])).map(f => [...f])).toEqual([[1, 2, 3, 4], [5, 6, 7, 8]]);
  });
});

class FakeSocket {
  sent: Record<string, unknown>[] = []; handlers: Record<string, ((d?: unknown) => void)[]> = {}; closed = false;
  on(event: string, fn: (d?: unknown) => void) { (this.handlers[event] ??= []).push(fn); return this; }
  emit(event: string, data?: unknown) { for (const fn of this.handlers[event] ?? []) fn(data); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.closed = true; }
  types() { return this.sent.map(e => e.type); }
}
const flush = () => new Promise(r => setTimeout(r, 0));

function setup(toolResult: Record<string, unknown> = { saved: [], dayTotalKcal: 0 }) {
  const openai = new FakeSocket();
  const toTwilio: Record<string, unknown>[] = [];
  const api = {
    session: vi.fn().mockResolvedValue({ callId: 'c1', maxSeconds: 300, wrapUpAtSeconds: 250, session: { model: 'gpt-realtime-2.1', type: 'realtime' } }),
    tool: vi.fn().mockResolvedValue(toolResult),
    complete: vi.fn().mockResolvedValue({ ok: true }),
  };
  const timers: { fn: () => void; ms: number }[] = [];
  const flux = { send: vi.fn(), finish: vi.fn().mockResolvedValue(['I had two rotis']) };
  let closedTwilio = false;
  const bridge = new CallBridge({
    api, sendToTwilio: (m: object) => { toTwilio.push(m as Record<string, unknown>); }, closeTwilio: () => { closedTwilio = true; },
    connectOpenAI: () => openai, createNoiseFilter: () => ({ name: 'openai_only', reason: null, process: (b: Uint8Array) => [b], close() {} }),
    createBackupTranscriber: () => flux,
    setTimer: (fn: () => void, ms: number) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {},
  });
  return { bridge, openai, toTwilio, api, timers, flux, closedTwilio: () => closedTwilio };
}
const start = { event: 'start', start: { streamSid: 'MZ1', callSid: 'CA1', customParameters: { callToken: 'c1.sig' } } };
const model = (o: FakeSocket, e: object) => o.emit('message', JSON.stringify(e));

describe('call bridge', () => {
  it('opens the model session, greets first, and forwards caller audio buffered before the socket opened', async () => {
    const { bridge, openai, api, timers, flux } = setup();
    await bridge.handleTwilioMessage(JSON.stringify(start));
    await bridge.handleTwilioMessage(JSON.stringify({ event: 'media', media: { track: 'inbound', payload: Buffer.from([1, 2, 3]).toString('base64') } }));
    expect(api.session).toHaveBeenCalledWith('c1.sig', 'CA1');
    openai.emit('open');
    expect(openai.types()).toEqual(['session.update', 'response.create', 'input_audio_buffer.append']);
    expect(openai.sent[2].audio).toBe(Buffer.from([1, 2, 3]).toString('base64'));
    expect(flux.send).toHaveBeenCalledTimes(1);
    expect(timers.map(t => t.ms)).toEqual([250_000, 297_000]);
  });
  it('plays model audio to Twilio and clears it when the caller talks over it', async () => {
    const { bridge, openai, toTwilio } = setup();
    await bridge.handleTwilioMessage(JSON.stringify(start)); openai.emit('open');
    model(openai, { type: 'response.output_audio.delta', item_id: 'item_a', delta: Buffer.alloc(800).toString('base64') });
    expect(toTwilio.map(m => m.event)).toEqual(['media', 'mark']);
    model(openai, { type: 'input_audio_buffer.speech_started' });
    await flush();
    expect(toTwilio.at(-1)).toEqual({ event: 'clear', streamSid: 'MZ1' });
    const truncate = openai.sent.find(e => e.type === 'conversation.item.truncate')!;
    expect(truncate).toMatchObject({ item_id: 'item_a', content_index: 0 });
    expect(truncate.audio_end_ms as number).toBeLessThanOrEqual(100); // 800 bytes = 100 ms sent
  });
  it('runs tool calls through the API and asks the model to continue', async () => {
    const { bridge, openai, api } = setup({ saved: [{ id: 'e1', kcal: 105 }], dayTotalKcal: 105 });
    await bridge.handleTwilioMessage(JSON.stringify(start)); openai.emit('open');
    model(openai, { type: 'response.done', response: { output: [{ type: 'function_call', call_id: 'fc1', name: 'log_food_items', arguments: '{"items":[]}' }] } });
    await flush(); await flush();
    expect(api.tool).toHaveBeenCalledWith('c1.sig', 'log_food_items', '{"items":[]}');
    const output = openai.sent.find(e => e.type === 'conversation.item.create')!;
    expect(output.item).toEqual({ type: 'function_call_output', call_id: 'fc1', output: JSON.stringify({ saved: [{ id: 'e1', kcal: 105 }], dayTotalKcal: 105 }) });
    expect(openai.types().at(-1)).toBe('response.create');
  });
  it('says goodbye after finish_call, hangs up once playback ends, and reports both transcripts', async () => {
    const { bridge, openai, api, closedTwilio } = setup({ ok: true, end: true });
    await bridge.handleTwilioMessage(JSON.stringify(start)); openai.emit('open');
    model(openai, { type: 'conversation.item.input_audio_transcription.completed', transcript: 'two rotis and dal' });
    model(openai, { type: 'response.done', response: { output: [{ type: 'function_call', call_id: 'fc2', name: 'finish_call', arguments: '{"confirmed":true}' }] } });
    await flush(); await flush();
    const goodbye = openai.sent.at(-1)!;
    expect(goodbye).toMatchObject({ type: 'response.create', response: { tool_choice: 'none' } });
    model(openai, { type: 'response.output_audio.delta', item_id: 'bye', delta: Buffer.alloc(80).toString('base64') });
    model(openai, { type: 'response.output_audio_transcript.done', transcript: 'Thanks, have a good night!' });
    model(openai, { type: 'response.done', response: { output: [{ type: 'message' }] } });
    await flush();
    expect(closedTwilio()).toBe(false);                   // still playing
    await bridge.handleTwilioMessage(JSON.stringify({ event: 'mark', mark: { name: 'agent' } }));
    await flush(); await flush();
    expect(closedTwilio()).toBe(true);
    expect(api.complete).toHaveBeenCalledWith('c1.sig', expect.objectContaining({
      endReason: 'finished', noiseFilter: 'openai_only', backupTranscript: ['I had two rotis'],
      transcript: [{ role: 'user', text: 'two rotis and dal' }, { role: 'assistant', text: 'Thanks, have a good night!' }],
    }));
  });
  it('uses the tool’s closing line when it provides one (e.g. "Connecting you now")', async () => {
    const { bridge, openai } = setup({ ok: true, end: true, say: 'Say only: "Connecting you to Mom now."' });
    await bridge.handleTwilioMessage(JSON.stringify(start)); openai.emit('open');
    model(openai, { type: 'response.done', response: { output: [{ type: 'function_call', call_id: 'fc3', name: 'connect_now', arguments: '{}' }] } });
    await flush(); await flush();
    expect(openai.sent.at(-1)).toMatchObject({ type: 'response.create', response: { instructions: 'Say only: "Connecting you to Mom now." Do not call any tools.', tool_choice: 'none' } });
  });
  it('ends the call without a report when the API rejects the call token', async () => {
    const { bridge, api, closedTwilio } = setup();
    api.session.mockRejectedValueOnce(new Error('api_401'));
    await bridge.handleTwilioMessage(JSON.stringify(start));
    expect(closedTwilio()).toBe(true);
    expect(api.complete).not.toHaveBeenCalled();
  });
  it('sends the wrap-up nudge and hard-stops at the time limit', async () => {
    const { bridge, openai, timers, api } = setup();
    await bridge.handleTwilioMessage(JSON.stringify(start)); openai.emit('open');
    timers[0].fn();
    expect(openai.sent.at(-1)).toMatchObject({ type: 'conversation.item.create', item: { role: 'system' } });
    timers[1].fn(); await flush(); await flush();
    expect(api.complete).toHaveBeenCalledWith('c1.sig', expect.objectContaining({ endReason: 'time_limit' }));
  });
});

describe('api client', () => {
  it('authenticates with the worker secret and unwraps tool results', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: { ok: true } }), { status: 200 }));
    const api = createApiClient({ baseUrl: 'https://app.example.com', workerSecret: 'w', fetchImpl });
    expect(await api.tool('t', 'get_day_summary', '{}')).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('https://app.example.com/api/internal/nutrition-calls/tool');
    expect(init.headers.Authorization).toBe('Bearer w');
  });
});
