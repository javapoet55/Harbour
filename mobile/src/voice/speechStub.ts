/**
 * ============================ STUB — PHASE 9 REPLACES THIS ============================
 *
 * "Read Loud" in Ask AI. Swift's `speakAnswer` / `speakChunks` (ios/App/AskNexdoView.swift:420-445)
 * POSTs each chunk to `/api/speech`, receives `audio/mpeg`, and plays it through `VoicePlayback`.
 * Neither the request nor the playback is wired here: audio playback needs a native module
 * (expo-audio), which would force a new development build, and Ask AI's voice side is Phase 9.
 *
 * This walks the same STATES the real path publishes — preparing, then speaking, chunk by chunk — on
 * timers, so the controls, their copy and their transitions can be built and tested now.
 *
 * Like `taskCaptureStub`, it is `__DEV__`-only by construction: outside a development build it
 * throws, and the screen shows the same error banner Swift shows when `/api/speech` fails
 * ("Your answer is ready to read. " + the message).
 * =====================================================================================
 */

export type SpeechStubHandlers = {
  /** `preparingSpeech`: the request for this chunk's audio is in flight. */
  onPreparing: (preparing: boolean) => void;
  /** `playback.isPlaying`. */
  onPlaying: (playing: boolean) => void;
  /** Every chunk has been spoken; `readingSection` goes back to nil. */
  onFinished: () => void;
};

export type SpeechStub = {
  /** `stopSpeech()`: cancels the pending chunk and stops playback. Safe to call more than once. */
  stop: () => void;
};

/** Roughly the shape of a short `/api/speech` round trip and one chunk of audio. */
const PREPARE_MS = 600;
const SPEAK_MS = 1400;

export function startSpeechStub(chunks: string[], handlers: SpeechStubHandlers): SpeechStub {
  if (!__DEV__) {
    throw new Error('Read Loud is not available in this build yet. Phase 9 adds spoken replies.');
  }

  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const speak = (index: number) => {
    if (cancelled) return;
    if (index >= chunks.length) {
      handlers.onPlaying(false);
      handlers.onFinished();
      return;
    }
    handlers.onPreparing(true);
    timer = setTimeout(() => {
      if (cancelled) return;
      handlers.onPreparing(false);
      handlers.onPlaying(true);
      timer = setTimeout(() => speak(index + 1), SPEAK_MS);
    }, PREPARE_MS);
  };

  speak(0);

  return {
    stop: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      handlers.onPreparing(false);
      handlers.onPlaying(false);
    },
  };
}
