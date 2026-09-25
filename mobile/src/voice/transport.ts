import { exchangeSdp, DATA_CHANNEL_LABEL } from './protocol';
import type { VoiceCredential, VoiceRealtimeTransport } from './conversation';

/**
 * `VoiceWebRTCTransport` (ios/App/VoiceWebRTCTransport.swift:5-146).
 *
 * The one piece that talks to the peer connection. The native modules are injected through
 * `WebRtcDriver`, exactly as the Phase 0 proof of concept did, so this file imports no native code
 * and the whole transport is testable with fakes.
 *
 * The connection is Swift's, step for step: microphone permission → audio session as a voice call on
 * the speaker → peer connection with NO ICE servers (OpenAI's answer carries its own candidates) →
 * a microphone track → the ordered `oai-events` data channel → offer → `POST
 * https://api.openai.com/v1/realtime/calls` with the ephemeral secret → answer.
 */

type Listener = (event: { data?: unknown; track?: { kind?: string } | null; streams?: unknown }) => void;

export type DataChannelLike = {
  readyState: string;
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'close' | 'error' | 'message', listener: Listener): void;
};

export type TrackLike = { kind: string; enabled: boolean; stop(): void };

export type StreamLike = {
  getTracks(): TrackLike[];
  getAudioTracks(): TrackLike[];
  release?(releaseTracks?: boolean): void;
};

export type PeerLike = {
  connectionState?: string;
  iceConnectionState?: string;
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
  /** `RTCAudioSession` category, mode and `.defaultToSpeaker` (VoiceWebRTCTransport.swift:36-42). */
  audioRoute: { start(): void; stop(): void; setVolume?(volume: number): void };
};

export type WebRtcTransportOptions = {
  driver: WebRtcDriver;
  fetchImpl?: typeof fetch;
  /** `AppVoice.volume`, 0…1. The output gain is this ×3; see `applyVolume`. */
  volume: () => number;
};

/**
 * The output gain (VoiceWebRTCTransport.swift:143) —
 * "Realtime's track supports gain above unity. 3.0 preserves Nexdo's existing +200% voice gain at the
 * slider's 100% position."
 */
export const VOICE_OUTPUT_GAIN = 3;

export class WebRtcTransport implements VoiceRealtimeTransport {
  onEvent: ((data: unknown) => void) | null = null;
  onFailure: (() => void) | null = null;

  private readonly driver: WebRtcDriver;
  private readonly fetchImpl: typeof fetch;
  private readonly volume: () => number;

  private peer: PeerLike | null = null;
  private channel: DataChannelLike | null = null;
  private microphone: StreamLike | null = null;
  private remote: TrackLike | null = null;
  private run = 0;
  private outputMuted = false;
  private responseId: string | null = null;
  private interruptedResponseId: string | null = null;
  private routeStarted = false;

  constructor(options: WebRtcTransportOptions) {
    this.driver = options.driver;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.volume = options.volume;
  }

  /** `connect(credential:)` (VoiceWebRTCTransport.swift:30-83). */
  async connect(credential: VoiceCredential): Promise<void> {
    const token = ++this.run;

    // `getUserMedia` raises the microphone permission prompt, which is Swift's
    // `AVAudioApplication.requestRecordPermission()`.
    const microphone = await this.driver.getMicrophone();
    if (token !== this.run) {
      releaseStream(microphone);
      throw new Error('cancelled');
    }
    this.microphone = microphone;

    this.driver.audioRoute.start();
    this.routeStarted = true;
    this.applyVolume();

    const peer = this.driver.createPeer();
    this.peer = peer;
    for (const track of microphone.getAudioTracks()) peer.addTrack(track, microphone);

    const channel = peer.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
    this.channel = channel;
    channel.addEventListener('message', (event) => {
      if (this.channel !== channel) return;
      this.deliver(event.data);
    });
    channel.addEventListener('close', () => {
      if (this.channel === channel) this.onFailure?.();
    });
    channel.addEventListener('error', () => {
      if (this.channel === channel) this.onFailure?.();
    });

    // `didAdd stream` (VoiceWebRTCTransport.swift:133-139): keep the remote track so playback can be
    // silenced for barge-in and so the gain can be applied.
    peer.addEventListener('track', (event) => {
      const track = event.track;
      if (!track || track.kind !== 'audio') return;
      this.remote = track as TrackLike;
      this.applyVolume();
      this.remote.enabled = !this.outputMuted;
    });

    const dropped = () => {
      const state = peer.iceConnectionState ?? peer.connectionState;
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        if (this.peer === peer) this.onFailure?.();
      }
    };
    peer.addEventListener('iceconnectionstatechange', dropped);
    peer.addEventListener('connectionstatechange', dropped);

    const offer = await peer.createOffer({ offerToReceiveAudio: true });
    if (token !== this.run) throw new Error('cancelled');
    await peer.setLocalDescription(offer);
    if (token !== this.run) throw new Error('cancelled');

    const answer = await exchangeSdp(offer.sdp ?? '', credential.value, this.fetchImpl);
    if (token !== this.run) throw new Error('cancelled');
    await peer.setRemoteDescription({ type: 'answer', sdp: answer });
  }

  /** `send(_:)` (`:84-86`): a closed channel is a failure, not a silent drop. */
  send(event: Record<string, unknown>): void {
    const channel = this.channel;
    if (!channel || channel.readyState !== 'open') throw new Error('The voice data channel is not open.');
    channel.send(JSON.stringify(event));
  }

  /** `setMuted(_:)` (`:87`): the MICROPHONE track, so the person stops being heard. */
  setMuted(muted: boolean): void {
    for (const track of this.microphone?.getAudioTracks() ?? []) track.enabled = !muted;
  }

  /** `silencePlayback()` (`:88`): barge-in. The remote track is disabled until the next response starts. */
  silencePlayback(): void {
    this.interruptedResponseId = this.responseId;
    this.outputMuted = true;
    if (this.remote) this.remote.enabled = false;
  }

  /** `close()` (`:89-99`). */
  close(): void {
    this.run += 1;
    this.setMuted(true);
    if (this.remote) this.remote.enabled = false;

    this.channel?.close();
    this.channel = null;
    this.peer?.close();
    this.peer = null;
    this.remote = null;

    for (const track of this.microphone?.getTracks() ?? []) track.stop();
    this.microphone?.release?.(true);
    this.microphone = null;

    if (this.routeStarted) {
      this.driver.audioRoute.stop();
      this.routeStarted = false;
    }
  }

  /**
   * `closeAfterReleasingAudio(_:)` (`:100-106`) — the completion runs only once the audio session has
   * actually been released, so the caller does not reactivate it underneath the teardown.
   */
  closeAfterReleasingAudio(done: () => void): void {
    this.close();
    setTimeout(done, 0);
  }

  /**
   * `deliver(_:)` (`:107-116`): remembers which response is playing, and un-silences the output when a
   * NEW response starts — a barge-in must not mute every reply that follows it.
   */
  private deliver(data: unknown): void {
    if (typeof data === 'string') {
      try {
        const event = JSON.parse(data) as Record<string, unknown>;
        if (event.type === 'response.created') {
          const response = event.response as Record<string, unknown> | undefined;
          this.responseId = typeof response?.id === 'string' ? response.id : null;
        }
        if (event.type === 'output_audio_buffer.started') {
          const id = typeof event.response_id === 'string' ? event.response_id : null;
          if (id !== null && id === this.responseId && id !== this.interruptedResponseId) {
            this.outputMuted = false;
            if (this.remote) this.remote.enabled = true;
          }
        }
      } catch {
        // A non-JSON frame is passed through; the session parses and ignores it.
      }
    }
    this.onEvent?.(data);
  }

  /** `applyVoiceVolume()` (`:141-144`). Called on connect and whenever the slider moves. */
  applyVolume(): void {
    this.driver.audioRoute.setVolume?.(Math.min(Math.max(this.volume(), 0), 1) * VOICE_OUTPUT_GAIN);
  }
}

/** Stops and releases a microphone stream the session never took ownership of. */
function releaseStream(stream: StreamLike): void {
  for (const track of stream.getTracks()) track.stop();
  stream.release?.(true);
}
