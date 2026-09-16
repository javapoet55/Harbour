/**
 * The phases `AddTaskByVoiceView` moves through (ios/App/AddTaskByVoiceView.swift), named for what the
 * screen shows rather than for the transport underneath, so Phase 9 can swap the session in without
 * changing the screen.
 */
export type VoiceCapturePhase = 'idle' | 'listening' | 'transcribing' | 'review' | 'error';

/** `voice.status` (AddTaskByVoiceView.swift:45): the bold line under the heading. */
export const VOICE_PHASE_STATUS: Record<VoiceCapturePhase, string> = {
  idle: 'Tap to start',
  listening: 'Listening…',
  transcribing: 'Connecting…',
  review: 'Ready to add',
  error: 'Voice unavailable',
};
