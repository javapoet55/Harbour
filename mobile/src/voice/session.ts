// PHASE 0 PROOF OF CONCEPT. Phase 9 replaces this with a full port of VoiceConversationSession.swift
// (barge-in, mute, inactivity timeouts, farewell, backgrounding, end_session intent checks).
//
// One live conversation: task-session → microphone → peer connection → `oai-events` data channel → SDP
// exchange with OpenAI → turn-taking (create_response is false, so the client asks for each reply) → tool calls
// forwarded to /api/realtime/tool. WebRTC is injected so this file never imports native code.

import type { ApiClient } from '../api/client';
import {
  BENIGN_ERROR_CODES,
  DATA_CHANNEL_LABEL,
  TASK_SESSION_PATH,
  TOOL_PATH,
  UNCONFIRMED_TOOL_RESULT,
  assertUsableSession,
  clientEvents,
  exchangeSdp,
  functionCallsFrom,
  localToolResult,
  parseServerEvent,
  parseToolArguments,
  responseIdOf,
  taskIdFromResult,
  toolRequest,
  uuidV4,
  type ClientEvent,
  type FunctionCall,
  type ServerEvent,
  type VoiceScope,
} from './protocol';

// Structural subsets of react-native-webrtc, so tests can supply fakes.
type Listener = (event: { data?: unknown; track?: { kind?: string } | null }) => void;

export type DataChannelLike = {
  readyState: string;
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'close' | 'error' | 'message', listener: Listener): void;
};

export type TrackLike = { kind: string; stop(): void };

export type StreamLike = {
  getTracks(): TrackLike[];
  getAudioTracks(): TrackLike[];
  release?(releaseTracks?: boolean): void;
};

export type PeerLike = {
  connectionState: string;
  iceConnectionState: string;
  addTrack(track: TrackLike, stream: StreamLike): unknown;
  createDataChannel(label: string, init: { ordered: boolean }): DataChannelLike;
  createOffer(options: { offerToReceiveAudio: boolean }): Promise<{ type?: string; sdp?: string }>;
  setLocalDescription(description: { type?: string; sdp?: string }): Promise<void>;
  setRemoteDescription(description: { type: 'answer'; sdp: string }): Promise<void>;
  addEventListener(type: 'connectionstatechange' | 'iceconnectionstatechange' | 'track', listener: Listener): void;
  close(): void;
};

export type WebRtcDriver = {
  createPeer(): PeerLike;
  getMicrophone(): Promise<StreamLike>;
  /** Route playback to the loudspeaker for the life of the call. */
  audioRoute: { start(): void; stop(): void };
};

export type VoiceStatus = 'idle' | 'starting' | 'connected' | 'failed';

export type VoiceLogKind = 'state' | 'ice' | 'channel' | 'event' | 'send' | 'tool' | 'http' | 'latency' | 'error';
export type VoiceLogEntry = { at: number; kind: VoiceLogKind; message: string };

export type VoiceLatency = {
  /** Start tap → data channel open. */
  channelOpenMs?: number;
  /** Start tap → session.created. */
  sessionCreatedMs?: number;
  /** input_audio_buffer.speech_stopped → output_audio_buffer.started, for the latest reply. */
  lastReplyMs?: number;
};

export type VoiceSessionOptions = {
  api: Pick<ApiClient, 'post'>;
  driver: WebRtcDriver;
  scope?: VoiceScope;
  fetch?: typeof fetch;
  now?: () => number;
  uuid?: () => string;
  onLog?: (entry: VoiceLogEntry) => void;
  onStatus?: (status: VoiceStatus) => void;
  onLatency?: (latency: VoiceLatency) => void;
};

class StaleRun extends Error {}

export class VoiceSession {
  private readonly options: VoiceSessionOptions;
  private readonly now: () => number;
  private run = 0;
  private status: VoiceStatus = 'idle';
  private peer?: PeerLike;
  private channel?: DataChannelLike;
  private stream?: StreamLike;
  private routed = false;
  private sessionId = '';
  private startedAt = 0;
  private speechStoppedAt?: number;
  private activeResponse?: string;
  private responsePending = false;
  private needsResponse = false;
  private toolsRunning = false;
  private seenItems = new Set<string>();
  private seenCalls = new Set<string>();
  private lastTaskId?: string;
  private latency: VoiceLatency = {};

  constructor(options: VoiceSessionOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
  }

  get currentStatus(): VoiceStatus {
    return this.status;
  }

  get currentSessionId(): string {
    return this.sessionId;
  }

  async start(): Promise<void> {
    if (this.status === 'starting' || this.status === 'connected') return;
    const run = ++this.run;
    this.resetConversation();
    this.sessionId = (this.options.uuid ?? uuidV4)();
    this.startedAt = this.now();
    this.setStatus('starting');
    this.publishLatency();

    try {
      this.log('http', `POST ${TASK_SESSION_PATH}`);
      const raw = await this.options.api.post<unknown>(TASK_SESSION_PATH, { consent: true, scope: this.options.scope ?? 'general' }, { timeoutMs: 25_000 });
      this.ensureCurrent(run);
      const session = assertUsableSession(raw, this.now());
      // Never log the secret itself.
      this.log('http', `task-session → keys [${Object.keys(raw as object).join(', ')}], model ${session.model}, expires in ${Math.round(session.expiresAt - this.now() / 1000)} s`);

      const stream = await this.options.driver.getMicrophone();
      if (run !== this.run) {
        stopStream(stream);
        return;
      }
      this.stream = stream;
      this.log('state', `microphone: ${stream.getAudioTracks().length} audio track(s)`);
      this.options.driver.audioRoute.start();
      this.routed = true;

      const peer = this.options.driver.createPeer();
      this.peer = peer;
      peer.addEventListener('connectionstatechange', () => {
        if (run !== this.run) return;
        this.log('state', `peer connection: ${peer.connectionState}`);
        if (peer.connectionState === 'failed') this.fail('The peer connection failed.');
      });
      peer.addEventListener('iceconnectionstatechange', () => {
        if (run !== this.run) return;
        this.log('ice', `ICE: ${peer.iceConnectionState}`);
        // Same rule as VoiceWebRTCTransport.swift:143.
        if (peer.iceConnectionState === 'failed' || peer.iceConnectionState === 'disconnected') this.fail(`ICE ${peer.iceConnectionState}.`);
      });
      peer.addEventListener('track', (event) => {
        if (run !== this.run) return;
        this.log('state', `remote track: ${event.track?.kind ?? 'unknown'} (plays automatically)`);
      });

      for (const track of stream.getAudioTracks()) peer.addTrack(track, stream);

      // Created before the offer so the SDP includes the data channel (VoiceWebRTCTransport.swift:57).
      const channel = peer.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
      this.channel = channel;
      channel.addEventListener('open', () => {
        if (run !== this.run) return;
        this.latency.channelOpenMs = this.now() - this.startedAt;
        this.publishLatency();
        this.log('channel', `data channel "${DATA_CHANNEL_LABEL}" open`);
        this.log('latency', `Start → channel open: ${this.latency.channelOpenMs} ms`);
        this.setStatus('connected');
      });
      channel.addEventListener('close', () => {
        if (run !== this.run) return;
        this.log('channel', 'data channel closed');
        this.fail('The data channel closed.');
      });
      channel.addEventListener('error', () => {
        if (run !== this.run) return;
        this.log('error', 'data channel error');
      });
      channel.addEventListener('message', (event) => {
        if (run !== this.run) return;
        this.receive(event.data, run);
      });

      const offer = await peer.createOffer({ offerToReceiveAudio: true });
      this.ensureCurrent(run);
      await peer.setLocalDescription(offer);
      this.ensureCurrent(run);
      if (!offer.sdp) throw new Error('The peer connection produced an empty offer.');

      this.log('http', `POST OpenAI /v1/realtime/calls (offer ${offer.sdp.length} bytes)`);
      const answer = await exchangeSdp(offer.sdp, session.value, this.options.fetch);
      this.ensureCurrent(run);
      this.log('http', `SDP answer ${answer.length} bytes`);

      await peer.setRemoteDescription({ type: 'answer', sdp: answer });
      this.ensureCurrent(run);
      this.log('state', 'remote description applied; waiting for the data channel');
    } catch (error) {
      if (error instanceof StaleRun || run !== this.run) return;
      this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  /** Close the channel, stop the microphone, close the peer connection. Safe to call at any time. */
  stop(): void {
    if (this.status === 'idle') return;
    this.teardown('idle');
    this.log('state', 'stopped');
  }

  private receive(data: unknown, run: number) {
    const event = parseServerEvent(data);
    if (!event) {
      this.log('error', 'unparseable data channel message');
      return;
    }
    this.log('event', describe(event));

    switch (event.type) {
      case 'session.created':
        this.latency.sessionCreatedMs = this.now() - this.startedAt;
        this.publishLatency();
        break;
      case 'input_audio_buffer.speech_stopped':
        this.speechStoppedAt = this.now();
        break;
      case 'input_audio_buffer.committed': {
        const itemId = typeof event.item_id === 'string' ? event.item_id : undefined;
        if (itemId && this.seenItems.has(itemId)) return;
        if (itemId) this.seenItems.add(itemId);
        // The session is minted with create_response: false, so the client asks for each reply.
        this.needsResponse = true;
        this.maybeRespond();
        break;
      }
      case 'response.created':
        this.responsePending = false;
        this.activeResponse = responseIdOf(event);
        break;
      case 'output_audio_buffer.started':
        if (this.speechStoppedAt !== undefined) {
          this.latency.lastReplyMs = this.now() - this.speechStoppedAt;
          this.speechStoppedAt = undefined;
          this.publishLatency();
          this.log('latency', `end of speech → first audio: ${this.latency.lastReplyMs} ms`);
        }
        break;
      case 'response.done': {
        if (responseIdOf(event) === this.activeResponse) this.activeResponse = undefined;
        this.responsePending = false;
        const calls = functionCallsFrom(event).filter((call) => !this.seenCalls.has(call.callId));
        calls.forEach((call) => this.seenCalls.add(call.callId));
        if (calls.length > 0) void this.runTools(calls, run);
        else this.maybeRespond();
        break;
      }
      case 'error': {
        const code = (event.error as { code?: unknown } | undefined)?.code;
        if (typeof code === 'string' && BENIGN_ERROR_CODES.includes(code)) return;
        // TODO(phase0-decision): the Swift session closes on any other error. The PoC logs it and keeps the
        // connection so the log shows what happens next.
        this.log('error', `realtime error: ${JSON.stringify(event.error)}`);
        break;
      }
    }
  }

  private maybeRespond() {
    if (!this.needsResponse || this.activeResponse || this.responsePending || this.toolsRunning) return;
    if (this.send(clientEvents.responseCreate())) {
      this.needsResponse = false;
      this.responsePending = true;
    }
  }

  private async runTools(calls: FunctionCall[], run: number) {
    this.toolsRunning = true;
    for (const call of calls) {
      this.log('tool', `call ${call.name} ${call.arguments.slice(0, 300)}`);
      let output: string;
      try {
        const args = parseToolArguments(call.arguments, this.lastTaskId);
        const local = localToolResult(call.name);
        if (local !== undefined) {
          output = local;
        } else {
          this.log('http', `POST ${TOOL_PATH} (${call.name})`);
          const result = await this.options.api.post<unknown>(TOOL_PATH, toolRequest(this.sessionId, call, args, this.options.scope), { timeoutMs: 30_000 });
          output = JSON.stringify(result);
        }
      } catch (error) {
        this.log('error', `tool ${call.name} failed: ${error instanceof Error ? error.message : String(error)}`);
        output = UNCONFIRMED_TOOL_RESULT;
      }
      if (run !== this.run) return;
      const taskId = taskIdFromResult(output);
      if (taskId) this.lastTaskId = taskId;
      this.log('tool', `result ${call.name}: ${output.slice(0, 300)}`);
      this.send(clientEvents.functionCallOutput(call.callId, output));
    }
    this.toolsRunning = false;
    this.needsResponse = true;
    this.maybeRespond();
  }

  private send(event: ClientEvent): boolean {
    if (this.channel?.readyState !== 'open') {
      this.log('error', `cannot send ${event.type}: data channel is ${this.channel?.readyState ?? 'missing'}`);
      return false;
    }
    this.channel.send(JSON.stringify(event));
    this.log('send', event.type);
    return true;
  }

  private fail(message: string) {
    this.log('error', message);
    this.teardown('failed');
  }

  private teardown(finalStatus: VoiceStatus) {
    this.run++;
    const { channel, stream, peer } = this;
    this.channel = undefined;
    this.stream = undefined;
    this.peer = undefined;
    attempt(() => channel?.close());
    if (stream) stopStream(stream);
    attempt(() => peer?.close());
    if (this.routed) attempt(() => this.options.driver.audioRoute.stop());
    this.routed = false;
    this.setStatus(finalStatus);
  }

  private resetConversation() {
    this.speechStoppedAt = undefined;
    this.activeResponse = undefined;
    this.responsePending = false;
    this.needsResponse = false;
    this.toolsRunning = false;
    this.seenItems.clear();
    this.seenCalls.clear();
    this.lastTaskId = undefined;
    this.latency = {};
  }

  private ensureCurrent(run: number) {
    if (run !== this.run) throw new StaleRun();
  }

  private setStatus(status: VoiceStatus) {
    this.status = status;
    this.options.onStatus?.(status);
  }

  private publishLatency() {
    this.options.onLatency?.({ ...this.latency });
  }

  private log(kind: VoiceLogKind, message: string) {
    this.options.onLog?.({ at: this.now(), kind, message });
  }
}

function stopStream(stream: StreamLike) {
  for (const track of stream.getTracks()) attempt(() => track.stop());
  attempt(() => stream.release?.());
}

function attempt(action: () => void) {
  try {
    action();
  } catch {
    // Teardown continues past a failing step.
  }
}

function describe(event: ServerEvent): string {
  if (event.type === 'response.done') {
    const response = event.response as { status?: unknown; output?: unknown[] } | undefined;
    return `response.done status=${String(response?.status)} outputs=${response?.output?.length ?? 0}`;
  }
  if (event.type === 'conversation.item.input_audio_transcription.completed') return `you said: ${String(event.transcript ?? '')}`;
  if (event.type === 'response.output_audio_transcript.done') return `assistant said: ${String(event.transcript ?? '')}`;
  if (event.type === 'error') return `error ${JSON.stringify(event.error)}`;
  return event.type;
}
