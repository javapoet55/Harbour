import type { NexdoTask } from '../api/types';

/**
 * `VoiceConversationSession` (ios/Sources/NexdoCore/VoiceConversationSession.swift:81-364) —
 * "One object, one connection, one conversation. Audio playback completion is distinct from
 * response.done (which only signals generation completion)."
 *
 * Everything here is transport-agnostic: the WebRTC peer connection is behind
 * `VoiceRealtimeTransport` and the server round trip is behind `VoiceToolExecuting`, exactly as in
 * Swift, so the whole state machine — turn-taking, barge-in, mute, the five timeouts, the tool queue,
 * `end_session` and the farewell — is testable without a device.
 *
 * TURN-TAKING: the server session is created with `create_response: false`, so the model never
 * answers on its own. Every reply is an explicit `response.create` from here, which is what makes
 * mid-turn tool calls and the closing farewell possible.
 */

/** `VoiceTaskSession` (VoiceConversationSession.swift:4-8). */
export type VoiceCredential = {
  value: string;
  /** Epoch SECONDS, as the server sends it. */
  expiresAt: number;
  model: string;
};

/** `VoicePhase` (`:9-11`). */
export type VoicePhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'userSpeaking'
  | 'processing'
  | 'toolExecution'
  | 'assistantSpeaking'
  | 'closing'
  | 'disconnected'
  | 'connectionLost';

/** `VoiceTerminationReason` (`:29-31`). */
export type VoiceTerminationReason =
  | 'userVoiceCommand'
  | 'userTappedDone'
  | 'userClosed'
  | 'inactivityTimeout'
  | 'networkFailure'
  | 'appBackgrounded'
  | 'audioInterruption';

/** `ConversationIntent` (`:13-27`). */
export type ConversationIntent = 'endSession' | 'answerQuestion' | 'continueConversation';

/**
 * `ConversationIntent.completion(reason:question:utterance:)` (`:17-26`) —
 * "The model resolves conversational meaning; this guard prevents ambiguous short answers from
 * bypassing the question that was active when speech began."
 */
export function completionIntent({
  reason,
  question,
  utterance,
}: {
  reason: string | null;
  question: string;
  utterance: string;
}): ConversationIntent {
  const text = utterance
    .toLowerCase()
    .replace(/’/g, "'")
    // `.trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))`
    .replace(/^[\s!-#%-*,-/:;?@[-\]_{}]+/, '')
    .replace(/[\s!-#%-*,-/:;?@[-\]_{}]+$/, '');

  if (text === 'no' || text === 'nope' || reason === 'declinedMore') {
    return question === 'anythingElse' ? 'endSession' : 'answerQuestion';
  }
  if ((text === 'done' || text === 'finish' || text === "that's it") && question !== 'none' && question !== 'anythingElse') {
    return 'answerQuestion';
  }
  return reason === 'explicitFinish' ? 'endSession' : 'continueConversation';
}

/** `VoiceTimeoutConfiguration` (`:32-39`), in MILLISECONDS. */
export type VoiceTimeouts = {
  inactivity: number;
  inactivityGrace: number;
  connection: number;
  response: number;
  closing: number;
  backgroundGrace: number;
};

export const DEFAULT_TIMEOUTS: VoiceTimeouts = {
  inactivity: 45_000,
  inactivityGrace: 20_000,
  connection: 25_000,
  response: 40_000,
  closing: 15_000,
  backgroundGrace: 5_000,
};

/** `VoiceTaskSessionContext` (`:40-49`). */
export type VoiceContext = {
  lastCreatedTaskId: string | null;
  lastModifiedTaskId: string | null;
  createdTaskIds: string[];
  pendingIntent: string;
  pendingClarification: string;
};

/** `VoiceTelemetry` (`:50-64`). */
export type VoiceTelemetry = {
  model: string;
  duration: number;
  connectionLatency: number;
  lastResponseLatency: number;
  userTurns: number;
  tasksCreated: number;
  tasksUpdated: number;
  clarifications: number;
  toolCalls: number;
  toolFailures: number;
  interruptions: number;
  terminationReason: VoiceTerminationReason | null;
};

/** `VoiceRealtimeTransport` (`:65-74`). */
export type VoiceRealtimeTransport = {
  onEvent: ((data: unknown) => void) | null;
  onFailure: (() => void) | null;
  connect(credential: VoiceCredential): Promise<void>;
  send(event: Record<string, unknown>): void;
  setMuted(muted: boolean): void;
  silencePlayback(): void;
  close(): void;
  closeAfterReleasingAudio(done: () => void): void;
};

/** `VoiceToolExecuting` (`:76-78`). */
export type VoiceToolExecuting = {
  execute(input: { name: string; args: Record<string, unknown>; sessionId: string; callId: string }): Promise<unknown>;
};

/** The published state, one object so a React store can subscribe to it whole. */
export type VoiceState = {
  phase: VoicePhase;
  muted: boolean;
  transcript: string;
  reply: string;
  error: string | null;
  sessionCreatedTasks: NexdoTask[];
};

export const INITIAL_STATE: VoiceState = {
  phase: 'idle',
  muted: false,
  transcript: '',
  reply: '',
  error: null,
  sessionCreatedTasks: [],
};

/** `status` (`:130-144`). Muted wins over every live phase. */
export function voiceStatus(state: VoiceState): string {
  if (state.muted && state.phase !== 'closing' && state.phase !== 'disconnected' && state.phase !== 'connectionLost') {
    return 'Muted';
  }
  switch (state.phase) {
    case 'idle':
      return 'Ready';
    case 'connecting':
      return 'Connecting…';
    case 'listening':
      return 'Listening…';
    case 'userSpeaking':
      return 'Listening to you…';
    case 'processing':
      return 'Understanding…';
    case 'toolExecution':
      return 'Updating your tasks…';
    case 'assistantSpeaking':
      return 'Speaking…';
    case 'closing':
      return 'Finishing…';
    case 'disconnected':
      return 'Finished';
    case 'connectionLost':
      return 'Connection lost';
  }
}

/** `fail()` (`:220`). */
export const CONNECTION_FAILED = 'The voice connection ended. Saved tasks are preserved. Close and try again.';
/** The tool catch-all (`:338`). */
export const UNCONFIRMED_TOOL_RESULT =
  '{"success":false,"error":"Operation could not be confirmed. Check current tasks before retrying. Do not claim success."}';
/** The `end_session` refusal (`:333`). */
export const PENDING_CLARIFICATION_RESULT =
  '{"success":false,"error":"No answers the pending clarification. Continue the conversation."}';
const SUCCESS_RESULT = '{"success":true}';

/** The five questions `set_conversation_context` accepts (`:324`). */
const CLARIFICATIONS = ['none', 'anythingElse', 'schedule', 'recurrence', 'contact'];

/** `error` events the session ignores rather than failing on (`:296-298`). */
const BENIGN_ERROR_CODES = ['response_cancel_not_active', 'conversation_already_has_active_response'];

const EMPTY_CONTEXT: VoiceContext = {
  lastCreatedTaskId: null,
  lastModifiedTaskId: null,
  createdTaskIds: [],
  pendingIntent: '',
  pendingClarification: 'none',
};

const EMPTY_TELEMETRY: VoiceTelemetry = {
  model: '',
  duration: 0,
  connectionLatency: 0,
  lastResponseLatency: 0,
  userTurns: 0,
  tasksCreated: 0,
  tasksUpdated: 0,
  clarifications: 0,
  toolCalls: 0,
  toolFailures: 0,
  interruptions: 0,
  terminationReason: null,
};

export type ConversationOptions = {
  transport: VoiceRealtimeTransport;
  executor: VoiceToolExecuting;
  timeouts?: VoiceTimeouts;
  now?: () => number;
  uuid?: () => string;
  onState: (state: VoiceState) => void;
  onClose?: () => void;
  onTelemetry?: (telemetry: VoiceTelemetry) => void;
};

export class VoiceConversation {
  private readonly transport: VoiceRealtimeTransport;
  private readonly executor: VoiceToolExecuting;
  private readonly now: () => number;
  private readonly uuid: () => string;
  private readonly onState: (state: VoiceState) => void;
  readonly timeouts: VoiceTimeouts;

  onClose: (() => void) | null = null;
  onTelemetry: ((telemetry: VoiceTelemetry) => void) | null = null;

  private state: VoiceState = { ...INITIAL_STATE };
  context: VoiceContext = { ...EMPTY_CONTEXT };
  telemetry: VoiceTelemetry = { ...EMPTY_TELEMETRY };

  private sessionId: string;
  private generation: string;
  private started = 0;
  private activity = 0;
  private phaseStarted = 0;
  private backgrounded: number | null = null;
  private warned = false;
  private playbackResponse: string | null = null;
  private activeResponse: string | null = null;
  private responsePending = false;
  private responseCompleted = false;
  private audioPlaying = false;
  private audioFinished = false;
  private userSpeaking = false;
  private needsResponse = false;
  private closingReason: VoiceTerminationReason | null = null;
  private results = new Map<string, string>();
  private queuedIds = new Set<string>();
  private questionAtSpeechStart: string | null = null;
  private latestUserUtterance = '';
  private committedItems = new Set<string>();
  private interruptedResponses = new Set<string>();
  private queue: Record<string, unknown>[] = [];
  private working = false;
  private didDisconnect = false;

  constructor(options: ConversationOptions) {
    this.transport = options.transport;
    this.executor = options.executor;
    this.timeouts = options.timeouts ?? DEFAULT_TIMEOUTS;
    this.now = options.now ?? Date.now;
    this.uuid = options.uuid ?? (() => `${Math.random()}`);
    this.onState = options.onState;
    this.onClose = options.onClose ?? null;
    this.onTelemetry = options.onTelemetry ?? null;
    this.sessionId = this.uuid();
    this.generation = this.uuid();

    this.transport.onEvent = (data) => this.receive(data);
    this.transport.onFailure = () => this.fail();
  }

  get snapshot(): VoiceState {
    return this.state;
  }

  private publish(changes: Partial<VoiceState>): void {
    this.state = { ...this.state, ...changes };
    this.onState(this.state);
  }

  /** `start(credential:)` (`:145-159`). */
  start(credential: VoiceCredential): void {
    if (this.state.phase !== 'idle') return;
    this.started = this.now();
    this.activity = this.started;
    this.telemetry = { ...this.telemetry, model: credential.model };
    this.setPhase('connecting');

    const run = this.generation;
    void (async () => {
      try {
        // `guard credential.expiresAt > now().timeIntervalSince1970` — expiry is in SECONDS.
        if (credential.expiresAt <= this.now() / 1000) throw new Error('expired');
        await this.transport.connect(credential);
      } catch {
        if (run === this.generation) this.fail();
      }
    })();
  }

  /** `toggleMute()` (`:160-164`). */
  toggleMute(): void {
    if (['idle', 'connecting', 'closing', 'disconnected', 'connectionLost'].includes(this.state.phase)) return;
    const muted = !this.state.muted;
    this.publish({ muted });
    this.transport.setMuted(muted);
    this.activity = this.now();
    if (muted) {
      this.emit({ type: 'input_audio_buffer.clear' });
      this.userSpeaking = false;
      if (this.state.phase === 'userSpeaking') this.setPhase('listening');
    }
  }

  /** `background(_:)` (`:165-174`). */
  background(background: boolean): void {
    this.backgrounded = background ? this.now() : null;
    this.transport.setMuted(background || this.state.muted || this.closingReason !== null);
    if (background) {
      if (this.activeResponse !== null) this.emit({ type: 'response.cancel' });
      if (this.audioPlaying) this.emit({ type: 'output_audio_buffer.clear' });
      this.transport.silencePlayback();
    } else {
      this.settle();
    }
  }

  /** `interruptAudio()` (`:175`): a phone call or an unplugged headset ends the session. */
  interruptAudio(): void {
    this.close('audioInterruption');
  }

  /** `finish()` (`:176-186`): the Done button. Lets dispatched mutations finish, then says goodbye. */
  finish(): void {
    if (this.closingReason !== null || ['disconnected', 'connectionLost'].includes(this.state.phase)) return;
    if (this.state.phase === 'idle' || this.state.phase === 'connecting') {
      this.close('userTappedDone');
      return;
    }
    this.closingReason = 'userTappedDone';
    this.transport.setMuted(true);
    this.userSpeaking = false;
    this.needsResponse = false;
    if (this.activeResponse !== null) this.emit({ type: 'response.cancel' });
    this.transport.silencePlayback();
    this.emit({ type: 'output_audio_buffer.clear' });
    if (!this.working && this.activeResponse === null && !this.responsePending) this.farewell();
  }

  /** `close(reason:)` (`:187-204`). */
  close(reason: VoiceTerminationReason = 'userClosed'): void {
    if (this.didDisconnect) return;
    this.didDisconnect = true;
    this.generation = this.uuid();
    this.transport.setMuted(true);
    // "Do not cancel a dispatched mutation: its result still reconciles the app."
    this.queue = [];
    this.needsResponse = false;
    this.activeResponse = null;
    this.responsePending = false;
    this.telemetry = { ...this.telemetry, duration: this.now() - this.started, terminationReason: reason };
    this.onTelemetry?.(this.telemetry);

    this.transport.closeAfterReleasingAudio(() => {
      this.context = { ...EMPTY_CONTEXT, createdTaskIds: [] };
      this.results.clear();
      this.queuedIds.clear();
      this.committedItems.clear();
      this.interruptedResponses.clear();
      this.questionAtSpeechStart = null;
      this.latestUserUtterance = '';
      this.publish({ transcript: '', reply: '', sessionCreatedTasks: [] });
      this.setPhase(reason === 'networkFailure' ? 'connectionLost' : 'disconnected');
      if (reason !== 'networkFailure') this.onClose?.();
    });
  }

  /** `tick()` (`:205-218`). Driven by a one-second timer, as Swift's `Timer.publish(every: 1)` is. */
  tick(): void {
    if (this.didDisconnect) return;
    if (['idle', 'disconnected', 'connectionLost'].includes(this.state.phase)) return;
    const time = this.now();

    if (this.backgrounded !== null && time - this.backgrounded >= this.timeouts.backgroundGrace) {
      this.close('appBackgrounded');
      return;
    }
    if (this.state.phase === 'connecting' && time - this.phaseStarted > this.timeouts.connection) {
      this.fail();
      return;
    }
    if (this.state.phase === 'closing' && time - this.phaseStarted > this.timeouts.closing) {
      this.close(this.closingReason ?? 'userTappedDone');
      return;
    }
    if (this.state.phase === 'processing' && time - this.phaseStarted > this.timeouts.response) {
      this.fail();
      return;
    }

    const quiet =
      this.state.phase === 'listening' &&
      !this.working &&
      this.activeResponse === null &&
      !this.responsePending &&
      !this.audioPlaying &&
      !this.userSpeaking &&
      this.backgrounded === null;
    if (!quiet) return;

    if (time - this.activity >= (this.warned ? this.timeouts.inactivityGrace : this.timeouts.inactivity)) {
      if (this.warned) {
        this.closingReason = 'inactivityTimeout';
        this.farewell();
      } else {
        this.warned = true;
        this.requestResponse('Ask briefly: Are you still there? Then wait.');
      }
    }
  }

  private setPhase(value: VoicePhase): void {
    this.phaseStarted = this.now();
    this.publish({ phase: value });
  }

  private emit(event: Record<string, unknown>): void {
    try {
      this.transport.send(event);
    } catch {
      this.fail();
    }
  }

  private fail(): void {
    this.publish({ error: CONNECTION_FAILED });
    this.close('networkFailure');
  }

  /** `requestResponse(instructions:)` (`:221-230`). */
  private requestResponse(instructions?: string): void {
    if (
      this.activeResponse !== null ||
      this.responsePending ||
      this.working ||
      this.userSpeaking ||
      this.backgrounded !== null
    ) {
      this.needsResponse = true;
      return;
    }
    this.needsResponse = false;
    this.responsePending = true;
    this.responseCompleted = false;
    this.audioFinished = false;
    this.setPhase(this.closingReason === null ? 'processing' : 'closing');
    const response = instructions === undefined ? {} : { instructions, tool_choice: 'none' };
    this.emit({ type: 'response.create', response });
  }

  /** `farewell()` (`:231-233`). */
  private farewell(): void {
    this.requestResponse(
      this.closingReason === 'inactivityTimeout' ? "Say only: I'll close voice mode for now." : "Say only: You're all set.",
    );
  }

  /** `settle()` (`:234-241`). */
  private settle(): void {
    if (this.working || this.activeResponse !== null || this.responsePending || this.audioPlaying || this.userSpeaking) {
      return;
    }
    if (this.closingReason !== null) {
      if (this.state.phase === 'closing' && this.responseCompleted && this.audioFinished) this.close(this.closingReason);
      else if (this.state.phase !== 'closing') this.farewell();
    } else if (this.needsResponse) {
      this.requestResponse();
    } else {
      this.activity = this.now();
      this.setPhase('listening');
    }
  }

  /** `receive(_:)` (`:242-302`). */
  receive(data: unknown): void {
    if (this.didDisconnect) return;
    if (['disconnected', 'connectionLost'].includes(this.state.phase)) return;
    const event = parseEvent(data);
    if (!event) return;
    const type = event.type;

    switch (type) {
      case 'session.created': {
        this.telemetry = { ...this.telemetry, connectionLatency: this.now() - this.started };
        this.activity = this.now();
        this.setPhase('listening');
        return;
      }

      // BARGE-IN: the person talks over the assistant, so the reply is cancelled and silenced.
      case 'input_audio_buffer.speech_started': {
        if (this.state.muted || this.closingReason !== null || this.backgrounded !== null) return;
        if (this.audioPlaying || this.activeResponse !== null) {
          this.telemetry = { ...this.telemetry, interruptions: this.telemetry.interruptions + 1 };
          this.transport.silencePlayback();
          if (this.activeResponse !== null) {
            this.interruptedResponses.add(this.activeResponse);
            this.emit({ type: 'response.cancel' });
          }
          this.emit({ type: 'output_audio_buffer.clear' });
        }
        this.audioPlaying = false;
        this.audioFinished = true;
        this.userSpeaking = true;
        this.warned = false;
        this.activity = this.now();
        this.questionAtSpeechStart = this.context.pendingClarification;
        this.latestUserUtterance = '';
        this.publish({ transcript: '', reply: '' });
        this.setPhase('userSpeaking');
        return;
      }

      case 'input_audio_buffer.speech_stopped': {
        this.userSpeaking = false;
        if (this.closingReason === null) this.setPhase('processing');
        return;
      }

      case 'input_audio_buffer.committed': {
        if (this.closingReason !== null || this.state.muted) return;
        const itemId = stringOf(event.item_id);
        if (itemId !== undefined) {
          if (this.committedItems.has(itemId)) return;
          this.committedItems.add(itemId);
        }
        this.telemetry = { ...this.telemetry, userTurns: this.telemetry.userTurns + 1 };
        this.activity = this.now();
        this.needsResponse = true;
        this.settle();
        return;
      }

      case 'conversation.item.input_audio_transcription.delta': {
        if (!this.state.muted) this.publish({ transcript: this.state.transcript + (stringOf(event.delta) ?? '') });
        return;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        if (!this.state.muted) {
          const transcript = stringOf(event.transcript) ?? '';
          this.latestUserUtterance = transcript;
          this.publish({ transcript });
        }
        return;
      }

      case 'response.created': {
        this.responsePending = false;
        this.activeResponse = stringOf((event.response as Record<string, unknown> | undefined)?.id) ?? null;
        this.playbackResponse = this.activeResponse;
        if (this.closingReason === null && !this.userSpeaking) this.setPhase('processing');
        this.publish({ reply: '' });
        this.responseCompleted = false;
        this.audioFinished = false;
        if (this.closingReason !== null && this.state.phase !== 'closing') this.emit({ type: 'response.cancel' });
        return;
      }

      case 'response.output_audio_transcript.delta': {
        if (stringOf(event.response_id) === this.activeResponse) {
          this.publish({ reply: this.state.reply + (stringOf(event.delta) ?? '') });
        }
        return;
      }

      case 'output_audio_buffer.started': {
        if (stringOf(event.response_id) !== this.playbackResponse || this.userSpeaking) return;
        this.audioPlaying = true;
        this.audioFinished = false;
        this.telemetry = { ...this.telemetry, lastResponseLatency: this.now() - this.activity };
        if (this.closingReason === null) this.setPhase('assistantSpeaking');
        return;
      }

      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared': {
        if (stringOf(event.response_id) !== this.playbackResponse) return;
        this.audioPlaying = false;
        this.audioFinished = true;
        this.settle();
        return;
      }

      case 'response.done': {
        const response = event.response as Record<string, unknown> | undefined;
        const id = stringOf(response?.id);
        if (!response || id === undefined || id !== this.activeResponse) return;
        this.activeResponse = null;
        this.responsePending = false;
        this.responseCompleted = stringOf(response.status) === 'completed' && !this.interruptedResponses.has(id);

        const output = Array.isArray(response.output) ? (response.output as Record<string, unknown>[]) : [];
        const hasAudio = output.some((item) => {
          const content = Array.isArray(item.content) ? (item.content as Record<string, unknown>[]) : [];
          return content.some((part) => part.type === 'audio' || part.type === 'output_audio');
        });
        if (hasAudio && !this.audioFinished && !this.userSpeaking) this.audioPlaying = true;

        if (this.responseCompleted && this.closingReason === null) {
          for (const call of output.filter((item) => item.type === 'function_call')) {
            const callId = stringOf(call.call_id);
            if (callId !== undefined && !this.queuedIds.has(callId)) {
              this.queuedIds.add(callId);
              this.queue.push(call);
            }
          }
          if (this.queue.length > 0) {
            this.startTools();
            return;
          }
        } else if (!this.responseCompleted) {
          this.audioFinished = true;
          this.audioPlaying = false;
        }
        this.settle();
        return;
      }

      case 'error': {
        // Swift CLOSES on a realtime error, unless the code is one of the two benign ones.
        const code = stringOf((event.error as Record<string, unknown> | undefined)?.code);
        if (code !== undefined && BENIGN_ERROR_CODES.includes(code)) return;
        this.fail();
        return;
      }

      default:
        return;
    }
  }

  /** `startTools()` (`:304-363`). One at a time, in order, each result fed back as a conversation item. */
  private startTools(): void {
    if (this.working) return;
    const run = this.generation;
    this.working = true;
    this.setPhase('toolExecution');

    void (async () => {
      while (this.queue.length > 0 && this.generation === run) {
        const call = this.queue.shift() as Record<string, unknown>;
        const callId = stringOf(call.call_id);
        const name = stringOf(call.name);
        const raw = stringOf(call.arguments);
        if (callId === undefined || name === undefined || raw === undefined) continue;

        this.telemetry = { ...this.telemetry, toolCalls: this.telemetry.toolCalls + 1 };
        let result: string;
        try {
          const parsed: unknown = JSON.parse(raw);
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('arguments');
          const args = { ...(parsed as Record<string, unknown>) };

          // `"last"` means the task this conversation most recently touched.
          if (args.taskId === 'last') {
            const target = this.context.lastModifiedTaskId ?? this.context.lastCreatedTaskId;
            if (target === null || target === undefined) throw new Error('no referenced task');
            args.taskId = target;
          }

          const cached = this.results.get(callId);
          if (cached !== undefined) {
            result = cached;
          } else if (name === 'set_conversation_context') {
            const question = stringOf(args.question) ?? 'none';
            if (!CLARIFICATIONS.includes(question)) throw new Error('question');
            this.context = {
              ...this.context,
              pendingClarification: question,
              pendingIntent: (stringOf(args.pendingIntent) ?? '').slice(0, 2000),
            };
            if (question !== 'none' && question !== 'anythingElse') {
              this.telemetry = { ...this.telemetry, clarifications: this.telemetry.clarifications + 1 };
            }
            result = SUCCESS_RESULT;
          } else if (name === 'end_session') {
            const intent = completionIntent({
              reason: stringOf(args.reason) ?? null,
              question: this.questionAtSpeechStart ?? this.context.pendingClarification,
              utterance: this.latestUserUtterance,
            });
            if (intent === 'endSession') {
              this.closingReason = 'userVoiceCommand';
              result = SUCCESS_RESULT;
            } else {
              result = PENDING_CLARIFICATION_RESULT;
            }
          } else {
            const value = await this.executor.execute({ name, args, sessionId: this.sessionId, callId });
            result = JSON.stringify(value);
          }
        } catch {
          result = UNCONFIRMED_TOOL_RESULT;
        }

        if (this.generation !== run) {
          this.working = false;
          return;
        }
        this.results.set(callId, result);
        this.applyToolResult(name, result);
        this.emit({
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id: callId, output: result },
        });
      }

      this.working = false;
      if (run !== this.generation) return;
      if (this.closingReason !== null) this.farewell();
      else {
        this.needsResponse = true;
        this.settle();
      }
    })();
  }

  /** The bookkeeping at `:341-357`: which task the conversation is now talking about. */
  private applyToolResult(name: string, result: string): void {
    let object: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(result);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return;
      object = parsed as Record<string, unknown>;
    } catch {
      return;
    }

    if (object.success !== true) {
      this.telemetry = { ...this.telemetry, toolFailures: this.telemetry.toolFailures + 1 };
      return;
    }

    const task = object.task as NexdoTask | undefined;
    if (!task || typeof task.id !== 'string') return;

    if (name === 'create_task' || name === 'create_reminder') {
      this.context = { ...this.context, lastCreatedTaskId: task.id, lastModifiedTaskId: task.id };
      if (!this.context.createdTaskIds.includes(task.id)) {
        this.context = { ...this.context, createdTaskIds: [...this.context.createdTaskIds, task.id] };
        this.publish({ sessionCreatedTasks: [...this.state.sessionCreatedTasks, task] });
        this.telemetry = { ...this.telemetry, tasksCreated: this.telemetry.tasksCreated + 1 };
      }
      return;
    }

    this.context = { ...this.context, lastModifiedTaskId: task.id };
    if (name === 'update_task') this.telemetry = { ...this.telemetry, tasksUpdated: this.telemetry.tasksUpdated + 1 };
    const index = this.state.sessionCreatedTasks.findIndex((item) => item.id === task.id);
    if (index < 0) return;
    const tasks = [...this.state.sessionCreatedTasks];
    if (name === 'delete_task') tasks.splice(index, 1);
    else tasks[index] = task;
    this.publish({ sessionCreatedTasks: tasks });
  }
}

function parseEvent(data: unknown): (Record<string, unknown> & { type: string }) | null {
  let value: unknown = data;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return typeof record.type === 'string' ? (record as Record<string, unknown> & { type: string }) : null;
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
