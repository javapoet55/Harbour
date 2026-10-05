# Voice input and network recovery

Realtime conversation and dictation credentials now use near-field noise reduction
and server VAD (threshold 0.65, 400 ms prefix, 800 ms silence). Conversation response
creation stays client-controlled so transcript/context gating does not create
duplicate responses. Interruption remains enabled. Models are unchanged.

The native client already uses WebRTC with its default iOS audio device and
playAndRecord/voiceChat audio session, including Bluetooth HFP. Keep this native
voice-processing path; do not run a separate recorder alongside WebRTC.

ICE interruptions retain the existing 8-second recovery window. Longer failures
trigger credential renewal and bounded automatic reconnection, preserving task
context and idempotency. Returning connectivity permits retry after exhausted
attempts. Stale peer/data-channel callbacks cannot affect replacement connections.
Live dictation retains its existing disconnect/review behavior; automatic logical
conversation recovery applies to the conversational voice screen.

## Internal tuning

Server environment variables, effective for newly created sessions:
- VOICE_NOISE_REDUCTION: near_field (default) or far_field.
- VOICE_VAD_THRESHOLD: 0.6–0.75 inclusive (default 0.65).
Invalid settings fall back to defaults. No database migration is needed.

Apple Console subsystem com.nexdo.voice records VAD speech start/stop, ICE state,
connection closure/failure reasons and network availability/interface changes.
These diagnostics do not contain audio, transcripts, credentials or network names.

## Validation

23 backend tests passed; 259 Swift core tests passed, including reconnection,
preserved task context and in-flight tool idempotency. iOS simulator build and
TypeScript type checking passed. No live OpenAI/audio road test was performed.

Before rollout, test quiet room, parked car cabin, roadside and AirPods using the
same phrases at thresholds 0.6/0.65/0.75; compare near/far field with the phone held
close and farther away. Measure false starts, clipped words, end-of-turn latency,
and successful recovery during Wi-Fi/cellular switches. Confirm saved tasks remain
single instances after reconnect. Do not operate a device while driving.

Server deployment and an updated iOS build are required to deliver both changes.

References:
- https://developers.openai.com/api/docs/guides/realtime-vad
- https://developers.openai.com/api/docs/guides/voice-webrtc
