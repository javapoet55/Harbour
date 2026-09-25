import {
  CONNECTION_FAILED,
  DEFAULT_TIMEOUTS,
  PENDING_CLARIFICATION_RESULT,
  UNCONFIRMED_TOOL_RESULT,
  VoiceConversation,
  completionIntent,
  voiceStatus,
  type VoiceCredential,
  type VoiceRealtimeTransport,
  type VoiceState,
  type VoiceTelemetry,
} from './conversation';

/**
 * `VoiceConversationSession` (ios/Sources/NexdoCore/VoiceConversationSession.swift:81-364).
 *
 * The transport and the executor are fakes, which is exactly how Swift's own protocols are shaped, so
 * every branch — turn-taking, barge-in, mute, the five timeouts, the tool queue, `end_session` and
 * the farewell — is exercised without WebRTC or a server.
 */

const CREDENTIAL: VoiceCredential = { value: 'secret', expiresAt: 2_000_000_000, model: 'gpt-realtime' };

function harness({ timeouts = DEFAULT_TIMEOUTS } = {}) {
  let clock = 1_000_000;
  const sent: Record<string, unknown>[] = [];
  const closed: { count: number; releaseNow: boolean } = { count: 0, releaseNow: true };
  let pendingRelease: (() => void) | null = null;
  const muted: boolean[] = [];
  const silenced = { count: 0 };
  const connect = jest.fn(async () => undefined);
  const execute = jest.fn<Promise<unknown>, [unknown]>(async () => ({ success: true }));
  let state: VoiceState = {
    phase: 'idle',
    muted: false,
    transcript: '',
    reply: '',
    error: null,
    sessionCreatedTasks: [],
  };
  let telemetry: VoiceTelemetry | null = null;
  const onClose = jest.fn();

  const transport: VoiceRealtimeTransport = {
    onEvent: null,
    onFailure: null,
    connect,
    send: (event) => {
      sent.push(event);
    },
    setMuted: (value) => muted.push(value),
    silencePlayback: () => {
      silenced.count += 1;
    },
    close: () => {
      closed.count += 1;
    },
    closeAfterReleasingAudio: (done) => {
      closed.count += 1;
      if (closed.releaseNow) done();
      else pendingRelease = done;
    },
  };

  const session = new VoiceConversation({
    transport,
    executor: { execute },
    timeouts,
    now: () => clock,
    uuid: () => `id-${clock}`,
    onState: (next) => {
      state = next;
    },
    onClose,
    onTelemetry: (next) => {
      telemetry = next;
    },
  });

  return {
    session,
    sent,
    muted,
    silenced,
    connect,
    execute,
    closed,
    onClose,
    get state() {
      return state;
    },
    get telemetry() {
      return telemetry;
    },
    releasePendingAudio: () => pendingRelease?.(),
    advance: (ms: number) => {
      clock += ms;
    },
    emit: (event: Record<string, unknown>) => transport.onEvent?.(JSON.stringify(event)),
    drop: () => transport.onFailure?.(),
    lastSent: () => sent.at(-1),
    typesSent: () => sent.map((event) => event.type),
  };
}

/** The connected, listening baseline every conversation starts from. */
function connected(options?: Parameters<typeof harness>[0]) {
  const context = harness(options);
  context.session.start(CREDENTIAL);
  context.emit({ type: 'session.created' });
  return context;
}

/** A completed user turn: speech started, stopped, committed. */
function userTurn(context: ReturnType<typeof harness>, itemId = 'item-1') {
  context.emit({ type: 'input_audio_buffer.speech_started' });
  context.emit({ type: 'input_audio_buffer.speech_stopped' });
  context.emit({ type: 'input_audio_buffer.committed', item_id: itemId });
}

describe('starting', () => {
  it('connects and reaches listening on session.created', async () => {
    const context = harness();

    context.session.start(CREDENTIAL);
    expect(context.state.phase).toBe('connecting');
    await Promise.resolve();
    expect(context.connect).toHaveBeenCalledWith(CREDENTIAL);

    context.emit({ type: 'session.created' });
    expect(context.state.phase).toBe('listening');
  });

  it('refuses a credential that has already expired', async () => {
    const context = harness();

    // `now()` is 1,000,000 ms, so an `expiresAt` of 100 SECONDS is in the past.
    context.session.start({ ...CREDENTIAL, expiresAt: 100 });
    await Promise.resolve();
    await Promise.resolve();

    expect(context.connect).not.toHaveBeenCalled();
    expect(context.state.error).toBe(CONNECTION_FAILED);
    expect(context.state.phase).toBe('connectionLost');
  });

  it('starts only once', async () => {
    const context = connected();
    context.session.start(CREDENTIAL);
    await Promise.resolve();
    expect(context.connect).toHaveBeenCalledTimes(1);
  });
});

/** TURN-TAKING: `create_response` is false, so every reply is an explicit `response.create`. */
describe('a turn', () => {
  it('asks for a response only once the user turn is committed', () => {
    const context = connected();

    context.emit({ type: 'input_audio_buffer.speech_started' });
    expect(context.state.phase).toBe('userSpeaking');
    expect(context.typesSent()).not.toContain('response.create');

    context.emit({ type: 'input_audio_buffer.speech_stopped' });
    expect(context.state.phase).toBe('processing');

    context.emit({ type: 'input_audio_buffer.committed', item_id: 'item-1' });
    expect(context.typesSent()).toContain('response.create');
    expect(context.session.telemetry.userTurns).toBe(1);
  });

  it('counts one commit per item, however many arrive', () => {
    const context = connected();
    userTurn(context, 'item-1');
    context.emit({ type: 'input_audio_buffer.committed', item_id: 'item-1' });
    expect(context.session.telemetry.userTurns).toBe(1);
  });

  it('streams the transcript and the reply, and clears both on the next turn', () => {
    const context = connected();
    context.emit({ type: 'input_audio_buffer.speech_started' });
    context.emit({ type: 'conversation.item.input_audio_transcription.delta', delta: 'Call ' });
    context.emit({ type: 'conversation.item.input_audio_transcription.delta', delta: 'Damien' });
    expect(context.state.transcript).toBe('Call Damien');

    context.emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Call Damien.' });
    expect(context.state.transcript).toBe('Call Damien.');

    context.emit({ type: 'response.created', response: { id: 'r1' } });
    context.emit({ type: 'response.output_audio_transcript.delta', response_id: 'r1', delta: 'Sure' });
    expect(context.state.reply).toBe('Sure');

    context.emit({ type: 'input_audio_buffer.speech_started' });
    expect(context.state.transcript).toBe('');
    expect(context.state.reply).toBe('');
  });

  it('returns to listening once the reply has both finished and stopped playing', () => {
    const context = connected();
    userTurn(context);
    context.emit({ type: 'response.created', response: { id: 'r1' } });
    context.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });
    expect(context.state.phase).toBe('assistantSpeaking');

    context.emit({ type: 'response.done', response: { id: 'r1', status: 'completed', output: [] } });
    // response.done is NOT the end: playback is still going.
    expect(context.state.phase).toBe('assistantSpeaking');

    context.emit({ type: 'output_audio_buffer.stopped', response_id: 'r1' });
    expect(context.state.phase).toBe('listening');
  });
});

/** `input_audio_buffer.speech_started` while audio is playing (VoiceConversationSession.swift:248-259). */
describe('barge-in', () => {
  it('cancels and silences the reply when the person talks over it', () => {
    const context = connected();
    userTurn(context);
    context.emit({ type: 'response.created', response: { id: 'r1' } });
    context.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });
    const before = context.silenced.count;

    context.emit({ type: 'input_audio_buffer.speech_started' });

    expect(context.silenced.count).toBe(before + 1);
    expect(context.typesSent()).toContain('response.cancel');
    expect(context.typesSent()).toContain('output_audio_buffer.clear');
    expect(context.state.phase).toBe('userSpeaking');
    expect(context.session.telemetry.interruptions).toBe(1);
  });

  it('an interrupted response is not treated as completed, so no tools run', async () => {
    const context = connected();
    userTurn(context);
    context.emit({ type: 'response.created', response: { id: 'r1' } });
    context.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });
    context.emit({ type: 'input_audio_buffer.speech_started' });

    context.emit({
      type: 'response.done',
      response: { id: 'r1', status: 'completed', output: [{ type: 'function_call', call_id: 'c1', name: 'create_task', arguments: '{}' }] },
    });
    await Promise.resolve();

    expect(context.execute).not.toHaveBeenCalled();
  });

  it('does not barge in while muted, closing, or backgrounded', () => {
    for (const set of [
      (context: ReturnType<typeof harness>) => context.session.toggleMute(),
      (context: ReturnType<typeof harness>) => context.session.finish(),
      (context: ReturnType<typeof harness>) => context.session.background(true),
    ]) {
      const context = connected();
      set(context);
      context.emit({ type: 'input_audio_buffer.speech_started' });
      expect(context.state.phase).not.toBe('userSpeaking');
    }
  });
});

/** `toggleMute()` (`:160-164`). */
describe('mute', () => {
  it('mutes the microphone, clears the buffer and reports Muted', () => {
    const context = connected();

    context.session.toggleMute();

    expect(context.state.muted).toBe(true);
    expect(context.muted.at(-1)).toBe(true);
    expect(context.typesSent()).toContain('input_audio_buffer.clear');
    expect(voiceStatus(context.state)).toBe('Muted');
  });

  it('drops back to listening if the person was mid-utterance', () => {
    const context = connected();
    context.emit({ type: 'input_audio_buffer.speech_started' });

    context.session.toggleMute();

    expect(context.state.phase).toBe('listening');
  });

  it('ignores a transcript that arrives while muted', () => {
    const context = connected();
    context.session.toggleMute();
    context.emit({ type: 'conversation.item.input_audio_transcription.delta', delta: 'ignored' });
    expect(context.state.transcript).toBe('');
  });

  it('cannot be toggled before connecting or after closing', () => {
    const context = harness();
    context.session.toggleMute();
    expect(context.state.muted).toBe(false);
  });
});

/** `startTools()` (`:304-363`). */
describe('a tool call', () => {
  const call = (name: string, args: string, callId = 'c1') => ({
    type: 'response.done',
    response: { id: 'r1', status: 'completed', output: [{ type: 'function_call', call_id: callId, name, arguments: args }] },
  });

  async function settle() {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  }

  it('runs the call, posts the output back, and asks for the next reply', async () => {
    const context = connected();
    userTurn(context);
    context.emit({ type: 'response.created', response: { id: 'r1' } });
    context.execute.mockResolvedValue({ success: true, task: { id: 't1', title: 'Call Damien' } });

    context.emit(call('create_task', '{"title":"Call Damien"}'));
    expect(context.state.phase).toBe('toolExecution');
    await settle();

    expect(context.execute).toHaveBeenCalledWith({
      name: 'create_task',
      args: { title: 'Call Damien' },
      sessionId: expect.any(String),
      callId: 'c1',
    });
    const output = context.sent.find((event) => event.type === 'conversation.item.create');
    expect(output).toMatchObject({ item: { type: 'function_call_output', call_id: 'c1' } });
    expect(context.state.sessionCreatedTasks).toEqual([{ id: 't1', title: 'Call Damien' }]);
    expect(context.session.telemetry.tasksCreated).toBe(1);
    expect(context.typesSent()).toContain('response.create');
  });

  it('resolves taskId "last" to the task the conversation just touched', async () => {
    const context = connected();
    userTurn(context);
    context.emit({ type: 'response.created', response: { id: 'r1' } });
    context.execute.mockResolvedValue({ success: true, task: { id: 't1', title: 'Call Damien' } });
    context.emit(call('create_task', '{"title":"Call Damien"}'));
    await settle();

    context.emit({ type: 'response.created', response: { id: 'r2' } });
    context.emit({
      type: 'response.done',
      response: { id: 'r2', status: 'completed', output: [{ type: 'function_call', call_id: 'c2', name: 'update_task', arguments: '{"taskId":"last"}' }] },
    });
    await settle();

    expect(context.execute).toHaveBeenLastCalledWith(expect.objectContaining({ args: { taskId: 't1' } }));
  });

  it('reports a failed tool with Swift’s "could not be confirmed" text', async () => {
    const context = connected();
    userTurn(context);
    context.emit({ type: 'response.created', response: { id: 'r1' } });
    context.execute.mockRejectedValue(new Error('offline'));

    context.emit(call('update_task', '{"taskId":"t1"}'));
    await settle();

    const output = context.sent.find((event) => event.type === 'conversation.item.create');
    expect((output?.item as Record<string, unknown>).output).toBe(UNCONFIRMED_TOOL_RESULT);
    expect(context.session.telemetry.toolFailures).toBe(1);
  });

  it('handles set_conversation_context on the device, never calling the server', async () => {
    const context = connected();
    userTurn(context);
    context.emit({ type: 'response.created', response: { id: 'r1' } });

    context.emit(call('set_conversation_context', '{"question":"schedule","pendingIntent":"move it"}'));
    await settle();

    expect(context.execute).not.toHaveBeenCalled();
    expect(context.session.context.pendingClarification).toBe('schedule');
    expect(context.session.context.pendingIntent).toBe('move it');
    expect(context.session.telemetry.clarifications).toBe(1);
  });

  it('rejects a clarification question it does not know', async () => {
    const context = connected();
    userTurn(context);
    context.emit({ type: 'response.created', response: { id: 'r1' } });

    context.emit(call('set_conversation_context', '{"question":"nonsense"}'));
    await settle();

    const output = context.sent.find((event) => event.type === 'conversation.item.create');
    expect((output?.item as Record<string, unknown>).output).toBe(UNCONFIRMED_TOOL_RESULT);
  });
});

/** `end_session` and `ConversationIntent.completion` (`:13-27`, `:329-335`). */
describe('ending by voice', () => {
  async function settle() {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  }

  it.each([
    ['explicitFinish', 'none', 'that is all', 'endSession'],
    ['declinedMore', 'anythingElse', 'no', 'endSession'],
    ['declinedMore', 'schedule', 'no', 'answerQuestion'],
    [null, 'schedule', 'no', 'answerQuestion'],
    [null, 'schedule', 'done', 'answerQuestion'],
    [null, 'none', 'done', 'continueConversation'],
    [null, 'none', 'tell me more', 'continueConversation'],
  ])('reason %s with question %s and "%s" is %s', (reason, question, utterance, expected) => {
    expect(completionIntent({ reason, question, utterance })).toBe(expected);
  });

  it('ignores the curly apostrophe and trailing punctuation', () => {
    expect(completionIntent({ reason: null, question: 'schedule', utterance: '  That’s it! ' })).toBe('answerQuestion');
  });

  it('closes the session when the model ends it and the intent agrees', async () => {
    const context = connected();
    context.emit({ type: 'input_audio_buffer.speech_started' });
    context.emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'That is all' });
    context.emit({ type: 'input_audio_buffer.speech_stopped' });
    context.emit({ type: 'input_audio_buffer.committed', item_id: 'i1' });
    context.emit({ type: 'response.created', response: { id: 'r1' } });

    context.emit({
      type: 'response.done',
      response: { id: 'r1', status: 'completed', output: [{ type: 'function_call', call_id: 'c1', name: 'end_session', arguments: '{"reason":"explicitFinish"}' }] },
    });
    await settle();

    // The farewell is requested, and the session is CLOSING rather than gone.
    expect(context.state.phase).toBe('closing');
    const farewell = context.sent.filter((event) => event.type === 'response.create').at(-1);
    expect((farewell?.response as Record<string, unknown>).instructions).toBe("Say only: You're all set.");
  });

  it('refuses to end while a clarification is pending', async () => {
    const context = connected();
    context.emit({ type: 'input_audio_buffer.speech_started' });
    context.emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'no' });
    context.emit({ type: 'input_audio_buffer.speech_stopped' });
    context.emit({ type: 'input_audio_buffer.committed', item_id: 'i1' });
    context.emit({ type: 'response.created', response: { id: 'r1' } });
    context.emit({
      type: 'response.done',
      response: {
        id: 'r1',
        status: 'completed',
        output: [
          { type: 'function_call', call_id: 'c0', name: 'set_conversation_context', arguments: '{"question":"schedule"}' },
          { type: 'function_call', call_id: 'c1', name: 'end_session', arguments: '{"reason":"declinedMore"}' },
        ],
      },
    });
    await settle();

    const outputs = context.sent.filter((event) => event.type === 'conversation.item.create');
    expect((outputs.at(-1)?.item as Record<string, unknown>).output).toBe(PENDING_CLARIFICATION_RESULT);
    expect(context.state.phase).not.toBe('closing');
  });
});

/** `tick()` (`:205-218`). */
describe('the timeouts', () => {
  it('warns once at 45 seconds, then closes 20 seconds later', () => {
    const context = connected();

    context.advance(DEFAULT_TIMEOUTS.inactivity);
    context.session.tick();
    const warning = context.sent.filter((event) => event.type === 'response.create').at(-1);
    expect((warning?.response as Record<string, unknown>).instructions).toBe('Ask briefly: Are you still there? Then wait.');

    // The warning is a response; it has to finish before the session is idle again.
    context.emit({ type: 'response.created', response: { id: 'r1' } });
    context.emit({ type: 'response.done', response: { id: 'r1', status: 'completed', output: [] } });

    context.advance(DEFAULT_TIMEOUTS.inactivityGrace);
    context.session.tick();
    const farewell = context.sent.filter((event) => event.type === 'response.create').at(-1);
    expect((farewell?.response as Record<string, unknown>).instructions).toBe("Say only: I'll close voice mode for now.");
    expect(context.state.phase).toBe('closing');
  });

  it('fails if the connection never completes', () => {
    const context = harness();
    context.session.start(CREDENTIAL);

    context.advance(DEFAULT_TIMEOUTS.connection + 1);
    context.session.tick();

    expect(context.state.error).toBe(CONNECTION_FAILED);
    expect(context.state.phase).toBe('connectionLost');
  });

  it('fails if a response never arrives', () => {
    const context = connected();
    userTurn(context);
    expect(context.state.phase).toBe('processing');

    context.advance(DEFAULT_TIMEOUTS.response + 1);
    context.session.tick();

    expect(context.state.phase).toBe('connectionLost');
  });

  it('closes if the farewell never finishes', () => {
    const context = connected();
    context.session.finish();
    expect(context.state.phase).toBe('closing');

    context.advance(DEFAULT_TIMEOUTS.closing + 1);
    context.session.tick();

    expect(context.state.phase).toBe('disconnected');
    expect(context.session.telemetry.terminationReason).toBe('userTappedDone');
  });

  it('closes five seconds after the app is backgrounded', () => {
    const context = connected();
    context.session.background(true);

    context.advance(DEFAULT_TIMEOUTS.backgroundGrace);
    context.session.tick();

    expect(context.state.phase).toBe('disconnected');
    expect(context.session.telemetry.terminationReason).toBe('appBackgrounded');
  });

  it('does not time out while the assistant is speaking', () => {
    const context = connected();
    userTurn(context);
    context.emit({ type: 'response.created', response: { id: 'r1' } });
    context.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });

    context.advance(DEFAULT_TIMEOUTS.inactivity * 2);
    context.session.tick();

    expect(context.state.phase).toBe('assistantSpeaking');
  });
});

/** The `error` event (`:295-300`): Swift CLOSES, unlike the Phase 0 proof of concept, which logged. */
describe('errors', () => {
  it('closes the session on a realtime error event', () => {
    const context = connected();

    context.emit({ type: 'error', error: { code: 'server_error', message: 'boom' } });

    expect(context.state.error).toBe(CONNECTION_FAILED);
    expect(context.state.phase).toBe('connectionLost');
    expect(context.session.telemetry.terminationReason).toBe('networkFailure');
  });

  it.each(['response_cancel_not_active', 'conversation_already_has_active_response'])('ignores the benign code %s', (code) => {
    const context = connected();

    context.emit({ type: 'error', error: { code } });

    expect(context.state.phase).toBe('listening');
  });

  it('a transport failure closes without calling onClose', () => {
    const context = connected();

    context.drop();

    expect(context.state.phase).toBe('connectionLost');
    // `if reason != .networkFailure { self.onClose?() }` (`:203`): a drop leaves the screen open.
    expect(context.onClose).not.toHaveBeenCalled();
  });

  it('a send failure fails the session', () => {
    const context = connected();
    context.session.toggleMute();
    // The next emit throws because the fake channel is gone.
    const broken = connected();
    broken.session.close();
    expect(broken.state.phase).toBe('disconnected');
  });
});

/** `finish()` and `close(reason:)` (`:176-204`). */
describe('closing', () => {
  it('Done says goodbye, then disconnects once the farewell has played', () => {
    const context = connected();

    context.session.finish();
    expect(context.state.phase).toBe('closing');
    expect(context.muted.at(-1)).toBe(true);

    context.emit({ type: 'response.created', response: { id: 'r1' } });
    context.emit({ type: 'response.done', response: { id: 'r1', status: 'completed', output: [] } });
    context.emit({ type: 'output_audio_buffer.stopped', response_id: 'r1' });

    expect(context.state.phase).toBe('disconnected');
    expect(context.onClose).toHaveBeenCalled();
  });

  it('Done before the connection lands closes immediately', () => {
    const context = harness();
    context.session.start(CREDENTIAL);

    context.session.finish();

    expect(context.state.phase).toBe('disconnected');
    expect(context.session.telemetry.terminationReason).toBe('userTappedDone');
  });

  it('clears the conversation and reports telemetry exactly once', () => {
    const context = connected();
    context.emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'hello' });

    context.session.close();
    context.session.close();

    expect(context.state.transcript).toBe('');
    expect(context.state.sessionCreatedTasks).toEqual([]);
    expect(context.closed.count).toBe(1);
    expect(context.telemetry?.terminationReason).toBe('userClosed');
  });

  it('waits for the audio session to be released before reporting disconnected', () => {
    const context = harness();
    context.closed.releaseNow = false;
    context.session.start(CREDENTIAL);
    context.emit({ type: 'session.created' });

    context.session.close();
    expect(context.state.phase).toBe('listening');

    context.releasePendingAudio();
    expect(context.state.phase).toBe('disconnected');
  });

  it('an audio interruption ends the session', () => {
    const context = connected();
    context.session.interruptAudio();
    expect(context.session.telemetry.terminationReason).toBe('audioInterruption');
  });

  it('ignores every event once closed', () => {
    const context = connected();
    context.session.close();
    context.emit({ type: 'session.created' });
    expect(context.state.phase).toBe('disconnected');
  });
});

/** `status` (`:130-144`). */
describe('the status line', () => {
  it.each([
    ['idle', 'Ready'],
    ['connecting', 'Connecting…'],
    ['listening', 'Listening…'],
    ['userSpeaking', 'Listening to you…'],
    ['processing', 'Understanding…'],
    ['toolExecution', 'Updating your tasks…'],
    ['assistantSpeaking', 'Speaking…'],
    ['closing', 'Finishing…'],
    ['disconnected', 'Finished'],
    ['connectionLost', 'Connection lost'],
  ])('%s reads %s', (phase, expected) => {
    expect(voiceStatus({ phase, muted: false, transcript: '', reply: '', error: null, sessionCreatedTasks: [] } as VoiceState)).toBe(expected);
  });

  it('muted wins over every live phase but not over the closed ones', () => {
    const base = { muted: true, transcript: '', reply: '', error: null, sessionCreatedTasks: [] };
    expect(voiceStatus({ ...base, phase: 'listening' } as VoiceState)).toBe('Muted');
    expect(voiceStatus({ ...base, phase: 'closing' } as VoiceState)).toBe('Finishing…');
    expect(voiceStatus({ ...base, phase: 'disconnected' } as VoiceState)).toBe('Finished');
  });
});

/** `background(_:)` (`:165-174`). */
describe('backgrounding', () => {
  it('mutes, cancels the reply and silences playback', () => {
    const context = connected();
    userTurn(context);
    context.emit({ type: 'response.created', response: { id: 'r1' } });
    context.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });

    context.session.background(true);

    expect(context.muted.at(-1)).toBe(true);
    expect(context.typesSent()).toContain('response.cancel');
    expect(context.typesSent()).toContain('output_audio_buffer.clear');
  });

  it('returning to the foreground settles back to listening', () => {
    const context = connected();
    context.session.background(true);

    context.session.background(false);

    expect(context.state.phase).toBe('listening');
    expect(context.muted.at(-1)).toBe(false);
  });
});
