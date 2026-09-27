// One phone call: Twilio Media Stream ⇄ (noise filter) ⇄ OpenAI Realtime, with tools executed by the Nexdo API.
import { MULAW_BYTES_PER_MS } from './audio.mjs';

const PRE_SESSION_BUFFER_FRAMES = 100; // ~2 s of caller audio kept while the model session opens
const HANGUP_FALLBACK_MS = 6000;       // hang up even if Twilio never confirms playback finished

export class CallBridge {
  /**
   * @param {object} deps
   * @param {(msg: object) => void} deps.sendToTwilio
   * @param {() => void} deps.closeTwilio
   * @param {{ session: Function, tool: Function, complete: Function }} deps.api
   * @param {(model: string) => any} deps.connectOpenAI  ws-like: send, close, on(open|message|close|error)
   * @param {() => { name: string, reason?: string|null, process: (b: Uint8Array) => Uint8Array[], close: () => void }} deps.createNoiseFilter
   * @param {() => ({ send: Function, finish: Function } | null)} deps.createBackupTranscriber
   * @param {() => number} [deps.now]
   * @param {(fn: () => void, ms: number) => any} [deps.setTimer]
   * @param {(handle: any) => void} [deps.clearTimer]
   * @param {(message: string) => void} [deps.log]
   */
  constructor(deps) {
    this.d = { now: () => Date.now(), setTimer: setTimeout, clearTimer: clearTimeout, log: () => {}, ...deps };
    this.streamSid = null; this.callSid = null; this.token = null;
    this.openai = null; this.ready = false; this.pending = [];
    this.filter = null; this.flux = null;
    this.transcript = []; this.startedAt = null; this.timers = [];
    this.assistantItem = null; this.assistantAudioMs = 0; this.firstDeltaAt = null; this.marksPending = 0;
    this.endAfterResponse = false; this.hangupTimer = null; this.ended = false;
  }

  // ---------- Twilio side ----------
  async handleTwilioMessage(raw) {
    let msg; try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.event === 'start') return this.start(msg.start ?? {});
    if (msg.event === 'media' && msg.media?.payload && (msg.media.track ?? 'inbound') === 'inbound') return this.callerAudio(Buffer.from(msg.media.payload, 'base64'));
    if (msg.event === 'mark') { this.marksPending = Math.max(0, this.marksPending - 1); if (this.endAfterResponse && this.responseDone && this.marksPending === 0) this.end('finished'); return; }
    if (msg.event === 'stop') return this.end('caller_hangup');
  }
  handleTwilioClose() { void this.end('stream_closed'); }

  async start(start) {
    this.streamSid = start.streamSid ?? null; this.callSid = start.callSid ?? null;
    this.token = start.customParameters?.callToken ?? null;
    this.startedAt = this.d.now();
    let config;
    try { config = await this.d.api.session(this.token, this.callSid); }
    catch { this.d.log('session_rejected'); return this.end('session_rejected', { report: false }); }
    this.filter = this.d.createNoiseFilter();
    if (this.filter.reason) this.d.log(`noise_filter: ${this.filter.reason}`);
    this.flux = this.d.createBackupTranscriber();
    this.timers.push(this.d.setTimer(() => this.wrapUp(), config.wrapUpAtSeconds * 1000));
    this.timers.push(this.d.setTimer(() => this.end('time_limit'), Math.max(10, config.maxSeconds - 3) * 1000));
    const ws = this.d.connectOpenAI(config.session.model);
    this.openai = ws;
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'session.update', session: config.session }));
      ws.send(JSON.stringify({ type: 'response.create' })); // the assistant speaks first
      this.ready = true;
      for (const frame of this.pending.splice(0)) this.appendAudio(frame);
    });
    ws.on('message', data => { void this.handleOpenAIEvent(data); });
    ws.on('close', () => { void this.end('model_closed'); });
    ws.on('error', () => { this.d.log('model_socket_error'); });
  }

  callerAudio(bytes) {
    if (!this.filter) return;
    for (const frame of this.filter.process(bytes)) {
      this.flux?.send(frame);
      if (this.ready) this.appendAudio(frame);
      else if (this.pending.length < PRE_SESSION_BUFFER_FRAMES) this.pending.push(frame);
    }
  }
  appendAudio(frame) { this.sendModel({ type: 'input_audio_buffer.append', audio: Buffer.from(frame).toString('base64') }); }
  sendModel(event) { try { this.openai?.send(JSON.stringify(event)); } catch { /* socket closing */ } }

  wrapUp() {
    this.sendModel({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: 'Time is almost up. Go straight to get_day_summary and the read-back, then finish_call within 40 seconds.' }] } });
  }

  // ---------- Model side ----------
  async handleOpenAIEvent(raw) {
    let e; try { e = JSON.parse(String(raw)); } catch { return; }
    switch (e.type) {
      case 'response.output_audio.delta':
      case 'response.audio.delta': {
        if (!e.delta) return;
        if (this.assistantItem !== e.item_id) { this.assistantItem = e.item_id; this.assistantAudioMs = 0; this.firstDeltaAt = this.d.now(); }
        this.assistantAudioMs += Buffer.from(e.delta, 'base64').length / MULAW_BYTES_PER_MS;
        this.d.sendToTwilio({ event: 'media', streamSid: this.streamSid, media: { payload: e.delta } });
        this.d.sendToTwilio({ event: 'mark', streamSid: this.streamSid, mark: { name: 'agent' } });
        this.marksPending++;
        return;
      }
      case 'input_audio_buffer.speech_started': return this.bargeIn();
      case 'conversation.item.input_audio_transcription.completed':
        if (e.transcript?.trim()) this.transcript.push({ role: 'user', text: e.transcript.trim().slice(0, 4000) });
        return;
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
        if (e.transcript?.trim()) this.transcript.push({ role: 'assistant', text: e.transcript.trim().slice(0, 4000) });
        return;
      case 'response.done': return this.responseFinished(e.response ?? {});
      case 'error': this.d.log(`model_error: ${e.error?.code ?? e.error?.type ?? 'unknown'}`); return;
      default: return;
    }
  }

  /** The caller started talking over the assistant: stop Twilio playback and trim what was not heard. */
  bargeIn() {
    if (this.marksPending === 0 || !this.assistantItem) return;
    this.d.sendToTwilio({ event: 'clear', streamSid: this.streamSid });
    const heardMs = Math.max(0, Math.min(this.assistantAudioMs, this.d.now() - (this.firstDeltaAt ?? this.d.now())));
    this.sendModel({ type: 'conversation.item.truncate', item_id: this.assistantItem, content_index: 0, audio_end_ms: Math.floor(heardMs) });
    this.marksPending = 0; this.assistantItem = null;
  }

  async responseFinished(response) {
    this.responseDone = true;
    const calls = (response.output ?? []).filter(item => item.type === 'function_call');
    if (!calls.length) {
      if (this.endAfterResponse) this.scheduleHangup();
      return;
    }
    this.responseDone = false;
    let end = false;
    for (const call of calls) {
      let result;
      try { result = await this.d.api.tool(this.token, call.name, call.arguments ?? '{}'); }
      catch { result = { error: 'tool_unavailable', say: 'Apologize briefly: saving is not working right now; they can add items in the app.' }; }
      if (result?.end) end = true;
      this.sendModel({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result ?? {}) } });
    }
    if (end) {
      this.endAfterResponse = true;
      this.sendModel({ type: 'response.create', response: { instructions: 'Say a warm one-sentence goodbye now. Do not call any tools.', tool_choice: 'none' } });
    } else this.sendModel({ type: 'response.create' });
  }

  scheduleHangup() {
    if (this.marksPending === 0) return this.end('finished');
    if (!this.hangupTimer) this.hangupTimer = this.d.setTimer(() => this.end('finished'), HANGUP_FALLBACK_MS);
  }

  // ---------- End of call ----------
  async end(reason, { report = true } = {}) {
    if (this.ended) return;
    this.ended = true;
    for (const t of [...this.timers, this.hangupTimer]) if (t) this.d.clearTimer(t);
    try { this.openai?.close(); } catch { /* already closed */ }
    try { this.d.closeTwilio(); } catch { /* already closed */ }
    this.filter?.close();
    const backup = this.flux ? await this.flux.finish().catch(() => []) : undefined;
    if (!report || !this.token) return;
    const durationSec = this.startedAt ? Math.round((this.d.now() - this.startedAt) / 1000) : 0;
    try {
      await this.d.api.complete(this.token, {
        durationSec, endReason: reason, noiseFilter: this.filter?.name ?? 'openai_only',
        transcript: this.transcript, ...(backup ? { backupTranscript: backup } : {}),
      });
    } catch { this.d.log('complete_report_failed'); }
  }
}
