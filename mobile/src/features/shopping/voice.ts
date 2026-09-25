import { createStore, type StoreApi } from 'zustand';

import type { VoiceCredential, VoiceRealtimeTransport } from '../../voice/conversation';
import { ShoppingTranscript } from './model';

/**
 * `ShoppingVoice` (ios/App/ShoppingVoice.swift:5-76): one WebRTC TRANSCRIPTION session kept open across
 * several speech turns. It never runs tools and never speaks; it only turns speech into text, which is
 * then sent to the server's `parse` like typed text.
 *
 * The Phase 9 `WebRtcTransport` is reused unchanged — it is injected here, so the whole event handling,
 * the five-minute cap, the 12,000-character cap and `finish()` are tested with a fake transport.
 */

export type ShoppingVoiceState = {
  listening: boolean;
  connecting: boolean;
  finishing: boolean;
  text: string;
  error: string | null;
};

export type ShoppingVoiceDeps = {
  credential: () => Promise<VoiceCredential>;
  createTransport: () => VoiceRealtimeTransport;
  /** `AVAudioApplication.requestRecordPermission()`. */
  requestMicrophone: () => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  setTimer: (callback: () => void, ms: number) => () => void;
  uuid: () => string;
};

export const VOICE_MESSAGES = {
  microphone: 'Allow microphone access in your phone’s Settings, or type your items.',
  disconnected: 'Voice disconnected. Your transcript is kept. Review it or reconnect.',
  timeLimit: 'Five-minute session ended. Your transcript is ready to review.',
  full: 'Transcript is full. Review these items before adding more.',
  failed: 'Some speech could not be transcribed. Review the transcript or try again.',
  unfinished: 'Some speech is unfinished. Check the transcript before adding items.',
  connect: (message: string) => `${message} Your transcript is kept; retry or type your items.`,
};

export const SESSION_LIMIT_MS = 300_000;
export const TRANSCRIPT_LIMIT = 12_000;

export class ShoppingVoice {
  readonly state: StoreApi<ShoppingVoiceState>;
  private transcript = new ShoppingTranscript();
  private connection: VoiceRealtimeTransport | null = null;
  private run = 0;
  private cancelTimer: (() => void) | null = null;
  private speaking = false;
  private waiting = new Set<string>();
  /** True while the microphone permission request is in flight (see `leaveApp`). */
  private requestingPermission = false;

  constructor(private readonly deps: ShoppingVoiceDeps) {
    this.state = createStore<ShoppingVoiceState>()(() => ({ listening: false, connecting: false, finishing: false, text: '', error: null }));
  }

  private set(patch: Partial<ShoppingVoiceState>) {
    this.state.setState(patch);
  }

  private get snapshot() {
    return this.state.getState();
  }

  /** The TextEditor binding: the person may edit the transcript between turns. */
  setText(text: string) {
    this.set({ text });
  }

  /** `start(store:)` (`:14-41`). */
  async start(): Promise<void> {
    if (this.snapshot.listening || this.snapshot.connecting) return;
    this.transcript = new ShoppingTranscript();
    // Whatever is already in the box — typed or from an earlier session — is kept as a finished turn.
    if (this.snapshot.text !== '') this.transcript.append(this.deps.uuid(), this.snapshot.text, true);
    const generation = ++this.run;
    this.set({ connecting: true, error: null });
    let granted: boolean;
    this.requestingPermission = true;
    try {
      granted = await this.deps.requestMicrophone();
    } catch (error) {
      // The request itself failed (a native error, not a refusal). It used to escape `start()` as an
      // unhandled rejection and leave the sheet on "Connecting…"; show it instead.
      console.warn('[ShoppingVoice] microphone permission request failed', error);
      if (this.run !== generation) return;
      this.set({ connecting: false, error: VOICE_MESSAGES.connect(error instanceof Error ? error.message : String(error)) });
      return;
    } finally {
      this.requestingPermission = false;
    }
    if (!granted) {
      this.set({ connecting: false, error: VOICE_MESSAGES.microphone });
      return;
    }
    if (this.run !== generation) return;
    try {
      const credential = await this.deps.credential();
      if (this.run !== generation) return;
      const transport = this.deps.createTransport();
      this.connection = transport;
      transport.onEvent = (data) => {
        if (this.run === generation) this.receive(data);
      };
      transport.onFailure = () => {
        this.set({ error: VOICE_MESSAGES.disconnected });
        this.close();
      };
      await transport.connect(credential);
      if (this.run !== generation) {
        transport.close();
        return;
      }
      this.set({ connecting: false, listening: true });
      this.cancelTimer = this.deps.setTimer(() => {
        this.set({ error: VOICE_MESSAGES.timeLimit });
        this.close();
      }, SESSION_LIMIT_MS);
    } catch (error) {
      if (this.run !== generation) return;
      console.warn('[ShoppingVoice] could not start listening', error);
      this.set({ error: VOICE_MESSAGES.connect(error instanceof Error ? error.message : String(error)) });
      this.close();
    }
  }

  /**
   * The app left the foreground: `.onChange(of: scenePhase) { if value != .active { voice.close() } }`.
   *
   * EXCEPT while the microphone permission request is in flight. The system permission dialog is its
   * own activity on Android, so opening it pauses the app and React Native reports AppState
   * `background`. Closing then bumped `run`, and when the person tapped Allow, `start()` saw a new
   * generation and returned silently: the first tap on the mic never reached "Listening". iOS reports
   * `inactive` under its permission alert, so the same guard covers it.
   */
  leaveApp(): void {
    if (this.requestingPermission) return;
    this.close();
  }

  /** `receive(_:)` (`:42-59`). */
  receive(data: unknown): void {
    let event: Record<string, unknown>;
    try {
      event = typeof data === 'string' ? (JSON.parse(data) as Record<string, unknown>) : (data as Record<string, unknown>);
    } catch {
      return;
    }
    if (!event || typeof event.type !== 'string') return;
    const type = event.type;
    const itemId = typeof event.item_id === 'string' ? event.item_id : null;
    switch (type) {
      case 'input_audio_buffer.speech_started':
        this.speaking = true;
        break;
      case 'input_audio_buffer.speech_stopped':
        this.speaking = false;
        break;
      case 'input_audio_buffer.committed':
        if (itemId) {
          this.waiting.add(itemId);
          this.transcript.append(itemId, '', false);
        }
        break;
      case 'conversation.item.input_audio_transcription.delta':
      case 'conversation.item.input_audio_transcription.completed': {
        if (!itemId) return;
        const done = type.endsWith('.completed');
        if (done) this.waiting.delete(itemId);
        const value = event[done ? 'transcript' : 'delta'];
        this.transcript.append(itemId, typeof value === 'string' ? value : '', done);
        const text = this.transcript.text;
        this.set({ text });
        if ([...text].length > TRANSCRIPT_LIMIT) {
          this.set({ error: VOICE_MESSAGES.full });
          this.close();
        }
        break;
      }
      case 'error':
      case 'conversation.item.input_audio_transcription.failed':
        this.set({ error: VOICE_MESSAGES.failed });
        this.close();
        break;
      default:
        break;
    }
  }

  /**
   * `finish()` (`:60-71`): mute, commit a turn still being spoken, then keep the connection open until
   * the outstanding final transcripts arrive — at least 1.8s, at most 8s — and close.
   */
  async finish(): Promise<void> {
    if (this.snapshot.finishing || this.connection === null) return;
    this.set({ finishing: true });
    this.connection.setMuted(true);
    if (this.speaking) {
      try {
        this.connection.send({ type: 'input_audio_buffer.commit' });
      } catch {
        // `try?`
      }
    }
    for (let count = 0; count < 40; count++) {
      await this.deps.sleep(200);
      if (count >= 8 && this.waiting.size === 0 && !this.transcript.hasPending) break;
    }
    if (this.waiting.size > 0 || this.transcript.hasPending) this.set({ error: VOICE_MESSAGES.unfinished });
    this.close();
    this.set({ finishing: false });
  }

  /** `close()` (`:72`). The transcript text stays. */
  close(): void {
    this.run++;
    this.cancelTimer?.();
    this.cancelTimer = null;
    if (this.connection) {
      this.connection.onEvent = null;
      this.connection.onFailure = null;
      this.connection.close();
    }
    this.connection = null;
    this.speaking = false;
    this.waiting = new Set();
    this.set({ listening: false, connecting: false });
  }
}
