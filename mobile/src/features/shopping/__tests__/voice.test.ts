import type { VoiceRealtimeTransport } from '../../../voice/conversation';
import { ShoppingVoice, VOICE_MESSAGES, type ShoppingVoiceDeps } from '../voice';

class FakeTransport implements VoiceRealtimeTransport {
  onEvent: ((data: unknown) => void) | null = null;
  onFailure: (() => void) | null = null;
  sent: Record<string, unknown>[] = [];
  muted = false;
  closed = false;
  connect = jest.fn(async () => undefined);
  send(event: Record<string, unknown>) {
    this.sent.push(event);
  }
  setMuted(muted: boolean) {
    this.muted = muted;
  }
  silencePlayback() {}
  close() {
    this.closed = true;
  }
  closeAfterReleasingAudio(done: () => void) {
    done();
  }
  emit(event: Record<string, unknown>) {
    this.onEvent?.(JSON.stringify(event));
  }
}

function harness(overrides: Partial<ShoppingVoiceDeps> = {}) {
  const transport = new FakeTransport();
  let timer: (() => void) | null = null;
  const onSleep: (() => void)[] = [];
  const deps: ShoppingVoiceDeps = {
    credential: jest.fn(async () => ({ value: 'ek', expiresAt: 9_999_999_999, model: 'gpt-4o-transcribe' })),
    createTransport: () => transport,
    requestMicrophone: jest.fn(async () => true),
    sleep: jest.fn(async () => {
      onSleep.shift()?.();
    }),
    setTimer: jest.fn((callback: () => void) => {
      timer = callback;
      return () => {
        timer = null;
      };
    }),
    uuid: () => 'seed',
    ...overrides,
  };
  const voice = new ShoppingVoice(deps);
  return { voice, transport, deps, fireTimer: () => timer?.(), onSleep };
}

describe('ShoppingVoice', () => {
  it('connects with the transcription credential and listens', async () => {
    const h = harness();
    await h.voice.start();
    expect(h.transport.connect).toHaveBeenCalledWith({ value: 'ek', expiresAt: 9_999_999_999, model: 'gpt-4o-transcribe' });
    expect(h.voice.state.getState()).toMatchObject({ listening: true, connecting: false, error: null });
  });

  it('does not connect without the microphone', async () => {
    const h = harness({ requestMicrophone: async () => false });
    await h.voice.start();
    expect(h.transport.connect).not.toHaveBeenCalled();
    expect(h.voice.state.getState()).toMatchObject({ connecting: false, listening: false, error: VOICE_MESSAGES.microphone });
    // ShoppingVoice.swift:22 — the prompt names no platform.
    expect(VOICE_MESSAGES.microphone).toBe('Allow microphone access in your phone’s Settings, or type your items.');
  });

  /**
   * The Android mic bug (docs/android-polish.md, "Shopping voice"): the permission dialog pauses the
   * app, React Native reports AppState `background`, and the sheet closed the session — so after Allow
   * `start()` returned silently and the first tap never reached "Listening".
   */
  describe('the permission prompt', () => {
    it('does not cancel the session when the prompt sends the app to the background', async () => {
      let answer: (granted: boolean) => void = () => undefined;
      const h = harness({ requestMicrophone: () => new Promise<boolean>((resolve) => (answer = resolve)) });
      const starting = h.voice.start();
      expect(h.voice.state.getState().connecting).toBe(true);

      // The dialog opens: AppState goes to `background`.
      h.voice.leaveApp();
      expect(h.voice.state.getState().connecting).toBe(true);

      answer(true);
      await starting;
      expect(h.transport.connect).toHaveBeenCalled();
      expect(h.voice.state.getState()).toMatchObject({ listening: true, connecting: false, error: null });
    });

    it('still closes when the app really leaves the foreground while listening', async () => {
      const h = harness();
      await h.voice.start();
      h.voice.leaveApp();
      expect(h.transport.closed).toBe(true);
      expect(h.voice.state.getState()).toMatchObject({ listening: false, connecting: false });
    });

    it('shows the refusal when permission is denied, and never connects', async () => {
      const h = harness({ requestMicrophone: jest.fn(async () => false) });
      await h.voice.start();
      expect(h.deps.requestMicrophone).toHaveBeenCalledTimes(1);
      expect(h.transport.connect).not.toHaveBeenCalled();
      expect(h.voice.state.getState()).toMatchObject({ listening: false, connecting: false, error: VOICE_MESSAGES.microphone });
    });

    it('shows an error, rather than sticking on "Connecting…", when the permission request throws', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const h = harness({ requestMicrophone: async () => Promise.reject(new Error('The current activity is no longer available.')) });
      await expect(h.voice.start()).resolves.toBeUndefined();
      expect(h.transport.connect).not.toHaveBeenCalled();
      expect(h.voice.state.getState()).toMatchObject({
        listening: false,
        connecting: false,
        error: 'The current activity is no longer available. Your transcript is kept; retry or type your items.',
      });
      expect(warn).toHaveBeenCalledWith('[ShoppingVoice] microphone permission request failed', expect.any(Error));
      warn.mockRestore();
    });

    it('shows an error and logs when starting to listen fails', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const h = harness();
      h.transport.connect.mockRejectedValueOnce(new Error('Microphone is in use by another app.'));
      await h.voice.start();
      expect(h.voice.state.getState()).toMatchObject({
        listening: false,
        connecting: false,
        error: 'Microphone is in use by another app. Your transcript is kept; retry or type your items.',
      });
      expect(h.transport.closed).toBe(true);
      expect(warn).toHaveBeenCalledWith('[ShoppingVoice] could not start listening', expect.any(Error));
      warn.mockRestore();
    });
  });

  it('keeps the transcript when the session cannot be created', async () => {
    jest.spyOn(console, 'warn').mockImplementationOnce(() => undefined);
    const h = harness({ credential: async () => Promise.reject(new Error('Live transcription is not configured yet.')) });
    h.voice.setText('milk');
    await h.voice.start();
    expect(h.voice.state.getState().error).toBe('Live transcription is not configured yet. Your transcript is kept; retry or type your items.');
    expect(h.voice.state.getState().text).toBe('milk');
  });

  it('accumulates deltas, replaces them with the final, and dedupes by item id', async () => {
    const h = harness();
    await h.voice.start();
    h.transport.emit({ type: 'input_audio_buffer.committed', item_id: 'a' });
    h.transport.emit({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'a', delta: 'six ' });
    h.transport.emit({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'a', delta: 'banana' });
    expect(h.voice.state.getState().text).toBe('six banana');
    h.transport.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'a', transcript: 'six bananas' });
    h.transport.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'a', transcript: 'six bananas' });
    h.transport.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'b', transcript: 'one gallon of milk' });
    expect(h.voice.state.getState().text).toBe('six bananas; one gallon of milk');
  });

  it('seeds a new session with the text already in the box', async () => {
    const h = harness();
    h.voice.setText('eggs');
    await h.voice.start();
    h.transport.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'x', transcript: 'bread' });
    expect(h.voice.state.getState().text).toBe('eggs; bread');
  });

  it('stops on a transcription failure or a provider error, keeping the text', async () => {
    const h = harness();
    await h.voice.start();
    h.transport.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'a', transcript: 'rice' });
    h.transport.emit({ type: 'conversation.item.input_audio_transcription.failed', item_id: 'b' });
    expect(h.voice.state.getState()).toMatchObject({ listening: false, error: VOICE_MESSAGES.failed, text: 'rice' });
    expect(h.transport.closed).toBe(true);
  });

  it('caps the transcript at 12,000 characters and the session at five minutes', async () => {
    const h = harness();
    await h.voice.start();
    h.transport.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'a', transcript: 'x'.repeat(12_001) });
    expect(h.voice.state.getState()).toMatchObject({ listening: false, error: VOICE_MESSAGES.full });

    const t = harness();
    await t.voice.start();
    expect(t.deps.setTimer).toHaveBeenCalledWith(expect.any(Function), 300_000);
    t.fireTimer();
    expect(t.voice.state.getState()).toMatchObject({ listening: false, error: VOICE_MESSAGES.timeLimit });
  });

  it('reports a dropped connection', async () => {
    const h = harness();
    await h.voice.start();
    h.transport.onFailure?.();
    expect(h.voice.state.getState()).toMatchObject({ listening: false, error: VOICE_MESSAGES.disconnected });
  });

  it('finish(): mutes, commits a turn still being spoken, waits for the final, then closes', async () => {
    const h = harness();
    await h.voice.start();
    h.transport.emit({ type: 'input_audio_buffer.speech_started' });
    h.transport.emit({ type: 'input_audio_buffer.committed', item_id: 'late' });
    // The final lands during the fourth wait.
    h.onSleep.push(
      () => undefined,
      () => undefined,
      () => undefined,
      () => h.transport.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'late', transcript: 'paper towels' }),
    );
    await h.voice.finish();
    expect(h.transport.muted).toBe(true);
    expect(h.transport.sent).toEqual([{ type: 'input_audio_buffer.commit' }]);
    // The minimum wait is nine 200ms ticks even when nothing is outstanding.
    expect(h.deps.sleep).toHaveBeenCalledTimes(9);
    expect(h.voice.state.getState()).toMatchObject({ listening: false, finishing: false, error: null, text: 'paper towels' });
  });

  it('finish(): gives up after 8 seconds and says the speech is unfinished', async () => {
    const h = harness();
    await h.voice.start();
    h.transport.emit({ type: 'input_audio_buffer.committed', item_id: 'never' });
    await h.voice.finish();
    expect(h.deps.sleep).toHaveBeenCalledTimes(40);
    expect(h.transport.sent).toEqual([]);
    expect(h.voice.state.getState().error).toBe(VOICE_MESSAGES.unfinished);
  });

  it('finish() does nothing without a connection', async () => {
    const h = harness();
    await h.voice.finish();
    expect(h.deps.sleep).not.toHaveBeenCalled();
  });
});
