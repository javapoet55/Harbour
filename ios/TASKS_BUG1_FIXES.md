# Tasks Bug1 fixes

- Increased the shared header’s Nexdo wordmark from 20 to 24 pt, sparkle from 12 to 14.4 pt, and tagline from 5 to 6 pt (20%). The logo mark is unchanged.
- Swapped the weather and add-task controls: brand → weather → add task → account.
- Kept the existing Today initial filter and explicitly selects Today when entering Tasks from another tab. Returning from an Ask/task sheet preserves the current filter.
- Replaced the unavailable-voice alerts in the tab shell and Ask Nexdo with one reusable recording flow.

## Voice flow

Microphone → audio-sharing consent → iOS microphone permission → record (maximum two minutes) → stop → OpenAI transcription → editable transcript → Use this request → Ask → existing task proposal/approval → task refresh.

`VoiceCapture` uses native AVAudioRecorder with mono AAC/M4A and handles stop, cancellation, background/interruption, recording failure, and temporary-file cleanup. `VoiceInputView` owns the transcription task and cancels it on dismissal. Retrying transcription does not submit an assistant request or create a task. Audio consent is per session and is withdrawn with existing AI consent.

`VoiceUpload` sends a bounded multipart request through the existing authenticated `APIClient`. The new `/api/transcribe` route authenticates before reading audio, enforces a two-MiB file limit and bounded streamed request body, forwards the clip to OpenAI’s `gpt-4o-mini-transcribe`, and returns text only. It uses the existing server-side `OPENAI_API_KEY`; no provider key is sent to the app. Audio is forwarded in memory and is not persisted or logged by the route. Existing assistant context, task planning, approval, and calendar logic are reused.

The Xcode project now supplies the microphone usage description, and the privacy manifest includes audio data. Signing, bundle identifier, and deployment target remain unchanged.

API reference: [OpenAI file transcription](https://developers.openai.com/api/docs/guides/speech-to-text).

## Validation

- Debug simulator build passed using the existing Nexdo project, Xcode 26.6 / iOS 26.5 SDK.
- Release iPhone build passed with signing disabled.
- All 31 Swift core tests passed, including multipart encoding, size limits, and transcript validation.
- Six transcription-route tests passed: authentication, correct provider forwarding, malformed/oversized and chunked uploads, missing configuration, provider errors, silence, and oversized responses.
- TypeScript typecheck passed.
- `bash ios/scripts/check-voice-input.sh` passed against a mocked transport: separate audio consent, authenticated multipart upload, no task submission during transcription, assistant proposal, approval, task refresh, consent withdrawal, and expired-session cleanup.
- iPhone 17 Pro Max, iPhone 15 Pro Max, and small iPhone QA simulators: visually checked branding/control order and Today selected. On 17 Pro Max, checked All → Today tab → Tasks restores Today, microphone opens voice consent, and Cancel returns to Ask Nexdo. These were DEBUG fixtures, not authenticated customer sessions.
- Verified the generated app plist contains the microphone usage description; project and privacy manifest pass plist validation.

## Release dependency

The new `/api/transcribe` backend route must be deployed with the existing OpenAI server credential before the native voice upload can work against production. No backend deployment, live OpenAI call, real microphone recording, or customer-data task creation was performed. Permission denial, actual interruptions/audio capture, and physical-device validation remain unverified at runtime.

The workspace contains pre-existing and concurrent changes. This task did not revert, stage, commit, push, or deploy those changes.
