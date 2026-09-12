# Continuous Add by Voice

Implementation prepared September 12, 2026 in an isolated copy of the existing Harbour working files. The original checkout has not been modified or deployed.

## Architecture and lifecycle

`AddTaskByVoiceView` starts a single `VoiceConversationSession` after existing consent and microphone authorization. An authenticated backend credential request configures the model, semantic VAD, tools and spoken output. `VoiceWebRTCTransport` attaches a native audio track and ordered `oai-events` data channel, posts its SDP offer to `/v1/realtime/calls` using the short-lived credential, and applies the answer. The same peer connection and Realtime conversation remain alive across requests and clarification turns.

The event-driven states are idle → connecting → listening → userSpeaking → processing → toolExecution → assistantSpeaking → listening. Closing/disconnected and connectionLost handle termination. Mute is orthogonal to these states. No blocking conversation loop is used. The timer only checks configurable deadlines.

Semantic VAD has `interrupt_response: true` and `create_response: false`. The client explicitly requests responses after committed speech and completed tool batches, so new requests wait for outstanding tool results. Only completed function calls are executed. Generation completion (`response.done`) and audio playback completion (`output_audio_buffer.stopped`) are treated separately. A goodbye drains before cleanup; a bounded closing timeout handles a missing playback event.

## Files

Created:
- `ios/Sources/NexdoCore/VoiceConversationSession.swift`: session, state machine, context, configuration and metadata counters.
- `ios/Sources/NexdoCore/VoiceToolResponse.swift`: bounded tool result decoding without dropping schedule fields.
- `ios/App/VoiceWebRTCTransport.swift`: native WebRTC transport and audio session ownership.
- `ios/App/VoiceToolExecutor.swift`: authenticated service bridge and local contact resolution.
- `ios/Tests/NexdoCoreTests/VoiceConversationTests.swift`: scripted transport/tool tests.
- `src/server/voice/configuration.ts`: centralized Realtime model routing, session instructions and tool schemas.
- `src/server/voice/tools.ts`: validated, user-scoped execution using existing task services.
- `src/server/voice/tools.test.ts`: validation, ownership, idempotency inputs, reminders and free-time tests.
- `src/app/api/realtime/tool/route.ts` and `route.test.ts`: authenticated tool endpoint and failure tests.
- `voice-vitest.config.ts`: focused tests with mocked services and a workspace-local cache.

Modified:
- `ios/App/AddTaskByVoiceView.swift`: automatic start, continuing conversation, state animation, transcript, task history, Mute/Done/Close and interruption handling.
- `ios/App/VoiceTaskSession.swift`: retires the old one-task WebSocket controller; session credentials now live in NexdoCore.
- `ios/App/NexdoApp.swift`: tool API bridge and canonical task reconciliation.
- `ios/Nexdo.xcodeproj/project.pbxproj`: WebRTC package dependency and contact permission wording.
- `src/app/api/realtime/task-session/route.ts` and `route.test.ts`: continuous audio configuration.
- `.env.example`: task Realtime model override.
- This document.

## Tools and task execution

`create_task`, `update_task`, `delete_task`, `complete_task`, `find_tasks`, `get_schedule`, `find_free_time`, `prepare_call`, `prepare_email` are exposed. Two session-only tools, `set_conversation_context` and `end_session`, manage question state and completion.

Each task in an utterance maps to its own create call. Execution is serialized, results are returned to the same Realtime conversation, and only then is a response requested. A created task appears immediately in the current screen. Canonical IDs are returned from persistence. The existing Task Engine and reminder scheduler are reused. Creates use an existing unique database idempotency key scoped to user/session/call. The client suppresses duplicate call events. Dispatched mutations are not automatically retried after an uncertain failure.

Updates can change a schedule and metadata using the existing services. Multi-step updates can partially succeed: the endpoint reports uncertainty rather than claiming all changes succeeded. Reminder setup failure is returned separately from a confirmed task save. Existing configured calendar synchronization and replanning are preserved through the same service calls; downstream failures are returned as warnings rather than disguising a confirmed save. Schedule queries read currently synced calendar data. Existing non-voice task/calendar paths remain unchanged.

Creation supports single occurrences. Recurring creation remains unsupported and is explicitly described to the model; removing recurrence from an existing task is supported. Calls and emails are prepared only: the contact result instructs the user to review and approve through the existing task action UI. No dial/send capability is exposed to the model.

## Context and interruption

`VoiceTaskSessionContext` retains last-created and last-modified IDs, created IDs, pending intent text and clarification kind. `taskId: "last"` resolves deterministically before a tool reaches the backend. The model retains the full active conversation; NexDo retains the relevant task identity independently. Context is temporary and cleared on close.

Before asking a question the model records its question kind. An `end_session` call with `declinedMore` is rejected unless the pending question is `anythingElse`. Explicit finishing uses `explicitFinish`. Natural language interpretation still depends on the Realtime model; the tests exercise structured tool decisions, not live speech recognition or model accuracy.

On `input_audio_buffer.speech_started`, the UI transitions immediately to user speaking, local playback is silenced, and WebRTC/server VAD cancels and truncates the interrupted output. Stale audio events cannot mark a newer response as finished. Recording remains logically active while the assistant speaks. Animation reflects conversation state, not measured voice amplitude.

## Termination and iOS behavior

Done queues a brief farewell after any dispatched mutation. Voice completion follows the same path. Close, network failure, audio interruption, consent withdrawal and account changes stop immediately. Successful persisted tasks survive cleanup. The transport closes its channel, peer connection and temporary network session, disables tracks, then releases the audio session on a serial queue.

Defaults are centralized in `VoiceTimeoutConfiguration`: 45 seconds before an inactivity prompt, 20 seconds afterward, 25 seconds connection timeout, 40 seconds response timeout, 15 seconds maximum farewell wait, and 5 seconds background grace. Inactivity is not evaluated during speech, playback or tool execution. Backgrounding immediately mutes capture and clears playback; a bounded iOS background task allows cleanup. Foreground entry rechecks the deadline. Route loss and audio interruption terminate safely.

## Backend and configuration

- Existing authenticated `POST /api/realtime/task-session`: `{ "consent": true }` → `{ "value": "temporary credential", "expiresAt": 123, "model": "…" }`. Client credential lifetime is 60 seconds for connection establishment; it is not the conversation inactivity timeout.
- New authenticated `POST /api/realtime/tool`: `{ "consent": true, "sessionId": "UUID", "callId": "…", "name": "create_task", "arguments": {…} }` → `{ "success": true, "task": {…} }` or a grounded error/uncertainty result. Local/session tools do not call this endpoint.
- `OPENAI_API_KEY` remains server-only. Both conversational task router entries use `gpt-realtime-2.1`, pinned centrally in `AIModelConfiguration`. Legacy `OPENAI_TASK_REALTIME_MODEL` and `OPENAI_REALTIME_MODEL` environment overrides are ignored so existing deployments cannot silently select Mini. The existing Ask AI feature was not migrated by this change.
- Both endpoints return `private, no-store`. No database migration is required; task idempotency already exists.

## Security, privacy and telemetry

All persistent tool operations require the existing signed-in user and current client voice consent. Tool names, argument shapes, string lengths, date offsets, future schedules, result counts and schedule windows are validated. Task access is scoped by user ID. Contacts are resolved on device through the existing resolver; only up to five names and temporary candidate tokens are returned, never addresses or phone numbers. Task searches return at most 20 results and calendar requests are limited to seven days. No complete user database is sent to the model.

Telemetry is in-memory structured metadata with an optional `onTelemetry` callback: duration, model, turn/task/tool/failure/clarification/interruption counts, connection and response latency, and termination reason. No default transcript/audio logging or telemetry upload is introduced. The permanent OpenAI key is never in Swift or the deliverable.

## Apple and dependency requirements

The existing microphone usage string and Contacts permission are retained; the Contacts wording now accurately discloses that matching names can be shared for voice clarification. No speech-recognition entitlement, background recording capability, or permanent background microphone mode is added. Contacts permission is requested only when resolution is needed. WebRTC `153.0.0` from `https://github.com/stasel/WebRTC.git` is declared as an exact Xcode package dependency.

The native dependency could not be downloaded under this task's network policy. A full simulator/device build, linking against that exact binary, is still required. Physical-device validation must cover echo cancellation, Bluetooth routing, microphone delivery, interruptions, actual audio drain, background expiry, and the seven requested natural-language conversations. Mock tests cannot establish those properties or validate model behavior.

## Official references checked

- https://developers.openai.com/api/docs/guides/voice-webrtc
- https://developers.openai.com/api/docs/guides/realtime-conversations
- https://developers.openai.com/api/docs/guides/realtime-vad
- https://developers.openai.com/api/docs/models/gpt-realtime-2.1
- https://github.com/stasel/WebRTC

## Validation results

- 12 new Swift scripted conversation/event-order tests pass.
- 15 focused backend tests pass (10 new tests plus 5 updated session-endpoint tests).
- Backend TypeScript checking passes.
- All iOS app Swift sources except the native WebRTC transport pass an iOS 17 simulator type check with a protocol-conforming transport stub. This is not a full native build.
- Xcode project file parses successfully; the patch passes `git apply --check` against the original Harbour checkout.
- The broader Swift suite has one existing failure: `overdueListUsesDeadlinesAndExcludesFinishedWork`. It fails identically in the unchanged baseline; this unrelated behavior was not modified.
- No live OpenAI session, real microphone, external calendar write, email or phone call was performed by tests.

## Follow-up build validation

During the task-category icon update on September 12, the pinned WebRTC package was successfully resolved. Two audio-session calls were updated to use typed AVAudioSession category/mode values. The complete native iOS simulator build then passed for arm64 and x86_64. This supersedes the earlier dependency-download and simulator-build limitation above; live physical-device voice testing is still outstanding.
