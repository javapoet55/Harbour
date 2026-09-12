# Continuous Add by Voice

Tasks → Add by Voice starts one WebRTC Realtime session after consent and microphone permission. `gpt-realtime-2.1` handles conversation, tools and spoken replies (Marin); `gpt-live-transcribe` supplies the displayed input text.

The active screen uses `VoiceConversationSession`, `VoiceWebRTCTransport`, and `VoiceToolExecutor`. The former single-task `VoiceTaskController` is no longer used. Tasks are saved via authenticated backend tools and reconciled into the app. Replies follow successful tool output, then the screen returns to listening automatically. Corrections resolve “last” to the most recently modified task ID. No microphone tap is required between turns.

Semantic VAD detects turns. The client requests responses on committed input, suppresses duplicate commits, cancels and clears interrupted playback, and rejects tool calls from interrupted responses. Playback completion, rather than generation completion, controls the transition back to listening. A readiness bell is bundled; Done has a white label.

Conversation states are event-driven. Muting is tracked separately from response/tool progress so in-flight saves can finish. The UI timer only checks configurable deadlines. Network failures are terminal rather than automatically reconnecting and risking repeated mutations. Backgrounding mutes audio immediately and closes after the configured grace period; audio interruptions close the session. Closing by voice waits for goodbye playback. A failed save is reported and is not automatically retried.

Validation: 14 native scripted voice tests (including three tasks, a last-task correction, one connection, graceful goodbye, barge-in, cancellation, mute, and timeouts), 16 backend tests, and the original Harbour iOS simulator build passed. These use mocked service events; live iPhone/OpenAI conversation quality and model access still require physical-device verification.

Build the original project at `/Users/sri/Documents/ChatGPT/Harbour/ios/Nexdo.xcodeproj` and install the updated app. The backend must include `/api/realtime/task-session`, `/api/realtime/tool`, and `src/server/voice`. An older installed app will still show the former single-task behavior until rebuilt.
