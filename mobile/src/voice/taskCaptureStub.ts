import type { VoiceCapturePhase } from './taskCaptureTypes';

/**
 * ============================ STUB — PHASE 9 REPLACES THIS ============================
 *
 * `AddTaskByVoiceView` drives a real `VoiceConversationSession`
 * (ios/Sources/NexdoCore/VoiceConversationSession.swift) over WebRTC: microphone capture, a realtime
 * transcript, tool calls that create tasks, and spoken replies. None of that is wired here.
 *
 * This stub walks the same PHASES the real session publishes, on timers, and yields one fixed
 * transcript, so the screen's layout and state machine can be built and tested now. The Phase 0 proof
 * of concept (`app/dev/voice-check.tsx`) already demonstrates the real transport; Phase 9 joins them.
 *
 * It is `__DEV__`-only by construction: `startVoiceCaptureStub` refuses to run in a production build,
 * so shipping this by accident produces an immediate error rather than a fake transcript.
 * =====================================================================================
 */

export const STUB_TRANSCRIPT = 'Call Damien tomorrow at 11 AM';

export type VoiceCaptureStub = {
  /** Cancels any pending step. Safe to call more than once. */
  stop: () => void;
};

/**
 * Steps idle → listening → transcribing → review, reporting each phase and finally the transcript.
 */
export function startVoiceCaptureStub(
  onPhase: (phase: VoiceCapturePhase) => void,
  onTranscript: (transcript: string) => void,
): VoiceCaptureStub {
  if (!__DEV__) {
    throw new Error('The voice capture stub cannot run outside a development build. Phase 9 replaces it.');
  }

  const timers: ReturnType<typeof setTimeout>[] = [];
  const at = (delay: number, run: () => void) => timers.push(setTimeout(run, delay));

  onPhase('listening');
  at(900, () => onPhase('transcribing'));
  at(1800, () => {
    onTranscript(STUB_TRANSCRIPT);
    onPhase('review');
  });

  return {
    stop: () => {
      for (const timer of timers) clearTimeout(timer);
      timers.length = 0;
    },
  };
}
