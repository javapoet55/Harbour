# Nexdo live voice protocol

Last updated: 2026-09-15. Written before the Phase 0 React Native proof of concept.

This describes how a live voice conversation works today, between the server and the SwiftUI app. Sources:

- Server: `src/app/api/realtime/task-session/route.ts`, `transcription-session/route.ts`, `tool/route.ts`, `src/server/voice/configuration.ts`, `tools.ts`, `time-context.ts`.
- Swift client: `ios/App/VoiceWebRTCTransport.swift`, `ios/Sources/NexdoCore/VoiceConversationSession.swift`, `VoiceToolResponse.swift`, `ios/App/VoiceToolExecutor.swift`, `AppModel.voiceTaskSession` and `AppModel.executeVoiceTool` in `ios/App/NexdoApp.swift` (lines 470–495).

## Key finding

**The phone talks to OpenAI directly, not through our server.** Our server does three things:

1. Mints a short-lived OpenAI client secret with the session configuration baked in (model, voice, VAD, tools, instructions).
2. Executes tool calls that the phone forwards to it.
3. Owns all data access.

Audio and model events travel over one WebRTC peer connection between the phone and `api.openai.com`. The SDP offer/answer is a single HTTPS POST from the phone to OpenAI, authorised with the client secret. There is no trickle ICE and no signalling server.

Nothing in this protocol is specific to Apple:

- Everything the Swift transport uses exists in `react-native-webrtc`: unified-plan peer connection, one audio track, an ordered data channel, `createOffer`, local and remote descriptions.
- Microphone capture and playback are handled inside WebRTC (Opus).
- `RealtimePCMConverter.swift` / `RealtimeTaskAudio.swift` (24 kHz Int16 PCM taps) are not used by the WebRTC path. `RealtimeTaskAudio` has no call sites.

Two things need attention in React Native:

- **Speaker routing on Android.** iOS sets `AVAudioSession` to `.playAndRecord` with `.defaultToSpeaker` and `.voiceChat`. `react-native-webrtc` has no equivalent, so the React Native side needs `react-native-incall-manager` (or similar) to force the loudspeaker.
- **Output gain.** iOS applies `remoteAudio.source.volume = volume * 3`. `react-native-webrtc` exposes `MediaStreamTrack._setVolume` (private API) for the same thing.

## 1. Get a session

`AppModel.voiceTaskSession` runs only if the person has granted both AI consent and voice consent (stored on the device). It syncs the device time zone to the account first, then:

```
POST /api/realtime/task-session         (session cookie, JSON, 25 s timeout)
```

```ts
type TaskSessionRequest = {
  consent: true;                         // anything else → 400 "Allow voice sharing before starting."
  scope?: 'general' | 'calendar';        // Swift always sends one; server defaults to general
};

type TaskSessionResponse = {
  value: string;                         // OpenAI ephemeral client secret ("ek_…")
  expiresAt: number;                     // Unix seconds; the secret lives 60 s from creation
  model: string;                         // "gpt-realtime-2.1" (informational)
};

// Errors (JSON { error }): 401 signed out · 400 no consent · 503 OPENAI_API_KEY missing · 502 OpenAI failure.
```

The server calls `POST https://api.openai.com/v1/realtime/client_secrets` with `{ expires_after: { anchor: 'created_at', seconds: 60 }, session }`. The phone never sends a session configuration. Everything is fixed at mint time:

```ts
type RealtimeSessionConfig = {
  type: 'realtime';
  model: 'gpt-realtime-2.1';
  output_modalities: ['audio'];
  max_output_tokens: 1800;
  audio: {
    input: {
      transcription: { model: 'gpt-live-transcribe' };
      // create_response: false → the CLIENT must send response.create after each user turn.
      turn_detection: { type: 'semantic_vad'; eagerness: 'medium'; create_response: false; interrupt_response: true };
    };
    output: { voice: 'marin' };
  };
  tools: RealtimeFunctionTool[];         // general: 17 tools; calendar scope: 6 (see configuration.ts)
  tool_choice: 'auto';
  instructions: string;                  // includes the account time zone and current local time
};

type RealtimeFunctionTool = {
  type: 'function';
  name: string;
  description: string;
  parameters: { type: 'object'; additionalProperties: false; properties: Record<string, unknown>; required: string[] };
};
```

The general tools are:
- `get_current_time`, `get_recommendations`, `list_categories`
- `create_calendar_event`, `create_reminder`
- `create_task`, `update_task`, `delete_task`, `complete_task`
- `find_tasks`, `get_schedule`, `find_free_time`
- `prepare_call`, `prepare_email`
- `set_conversation_context`, `end_session`

`POST /api/realtime/transcription-session` has the same shape: body `{ consent: true }`, response `TaskSessionResponse`. It mints a `type: 'transcription'` session (`gpt-live-transcribe`, `server_vad`, 1.8 s silence) used by live dictation (`LiveVoiceTranscription.swift`) over the same WebRTC transport. It is not part of the conversation PoC.

## 2. Connect (Swift `VoiceWebRTCTransport.connect`)

The Swift client refuses to start if `expiresAt` is not in the future. The steps, in order:

1. Request microphone permission. Configure the audio session: `playAndRecord`, mode `voiceChat`, options `defaultToSpeaker` and `allowBluetoothHFP`, then activate.
2. `RTCPeerConnectionFactory`, `RTCConfiguration` with `sdpSemantics = .unifiedPlan`, **no ICE servers**, no constraints.
3. Create an audio source and track `trackId: "nexdo-microphone"`. `peer.add(track, streamIds: ["nexdo-voice"])`.
4. Data channel: `peer.dataChannel(forLabel: "oai-events", configuration: { isOrdered: true })`. Create it **before** the offer so the offer includes SCTP.
5. `peer.offer(for: mandatoryConstraints ["OfferToReceiveAudio": "true"])`, then `setLocalDescription(offer)`.
   - The offer is sent immediately, without waiting for ICE gathering. Host candidates are in the SDP; OpenAI's answer carries its candidates.
6. SDP exchange, directly with OpenAI:

   ```
   POST https://api.openai.com/v1/realtime/calls
   Authorization: Bearer <TaskSessionResponse.value>
   Content-Type: application/sdp
   body: <offer.sdp as UTF-8>
   (ephemeral URLSession, 25 s timeout, no cookies)

   2xx → body is the answer SDP (text). Anything else → failure.
   ```

   There is no `model` query parameter: the model comes from the client secret.
7. `setRemoteDescription({ type: 'answer', sdp })`.
8. Remote audio arrives through `didAdd stream`. The first audio track plays automatically through the audio session, with gain `AppVoice.volume × 3`.

Failure handling:
- The ICE connection state `failed` or `disconnected` ends the session ("connection lost").
- A data channel that closes while in use does the same.
- A 25 s connect timeout (`VoiceTimeoutConfiguration.connection`) fails the session if `session.created` has not arrived.

## 3. Data channel `oai-events`

Messages are UTF-8 JSON text frames (`isBinary: false`), one event per message. The phone sends:

```ts
type ClientEvent =
  | { type: 'response.create'; response: { instructions?: string; tool_choice?: 'none' } }
  | { type: 'conversation.item.create'; item: { type: 'function_call_output'; call_id: string; output: string /* JSON text */ } }
  | { type: 'response.cancel' }
  | { type: 'output_audio_buffer.clear' }
  | { type: 'input_audio_buffer.clear' };   // on mute
```

Server events the Swift session reacts to (everything else is ignored):

```ts
type ServerEvent =
  | { type: 'session.created' }                                            // connected → phase listening; connection latency measured here
  | { type: 'input_audio_buffer.speech_started' }                          // user started talking; barge-in handling
  | { type: 'input_audio_buffer.speech_stopped' }
  | { type: 'input_audio_buffer.committed'; item_id?: string }             // a user turn is complete → client sends response.create
  | { type: 'conversation.item.input_audio_transcription.delta'; delta: string }
  | { type: 'conversation.item.input_audio_transcription.completed'; transcript: string }
  | { type: 'response.created'; response: { id: string } }
  | { type: 'response.output_audio_transcript.delta'; response_id: string; delta: string }
  | { type: 'output_audio_buffer.started'; response_id: string }           // first audio frame of a reply is playing
  | { type: 'output_audio_buffer.stopped' | 'output_audio_buffer.cleared'; response_id: string }
  | { type: 'response.done'; response: RealtimeResponse }
  | { type: 'error'; error: { code?: string; message?: string } };         // fatal, except response_cancel_not_active and conversation_already_has_active_response

type RealtimeResponse = {
  id: string;
  status: 'completed' | 'cancelled' | 'failed' | 'incomplete' | string;
  output?: Array<
    | { type: 'function_call'; call_id: string; name: string; arguments: string /* JSON text */ }
    | { type: 'message'; content?: Array<{ type: 'audio' | 'output_audio' | string }> }
  >;
};
```

### Turn flow

Because `create_response` is `false`, the model never replies on its own:

1. `input_audio_buffer.committed` (deduplicated by `item_id`) makes the client send `{ type: 'response.create', response: {} }`. The client waits if a response or tool call is already in flight.
2. `response.created` records the active response ID.
3. `output_audio_buffer.started` for that ID means audio is playing. The Swift code measures "response latency" from the last activity to here.
4. `response.done` with `status: 'completed'` collects every `output[]` item with `type: 'function_call'`, deduplicated by `call_id`, and runs them (section 4).
5. When the tool results are sent, the client sends `response.create` again so the model speaks about the results.

### Barge-in and closing
- **Speech while the assistant is speaking.** The client silences the remote track, sends `response.cancel` (for the active response) and `output_audio_buffer.clear`, and marks that response as interrupted.
- **Closing.** A farewell is sent as `response.create` with `instructions: "Say only: You're all set."` and `tool_choice: 'none'`. The session closes after that response's `response.done` and `output_audio_buffer.stopped`.
- **Inactivity.** After 45 s the client asks "Are you still there?". After 20 s more it says "I'll close voice mode for now." and closes.

## 4. Tool calls

For each queued `function_call`, handled one at a time and in order:

1. Parse `arguments` (a JSON string) into an object. A parse failure produces the generic failure result below.
2. If `taskId === "last"`, replace it with the ID of the last task this session modified or created. If there is none, fail.
3. If the result for this `call_id` is already cached, reuse it.
4. Some tools are handled **on the device** and never reach the server:
   - `set_conversation_context { question, pendingIntent }` stores the pending clarification and returns `{"success":true}`.
   - `end_session { reason }` checks the model's intent against the question active when the user started speaking (`ConversationIntent.completion`). It returns `{"success":true}` and starts closing, or returns `{"success":false,"error":"No answers the pending clarification. Continue the conversation."}`.
   - `prepare_call` / `prepare_email` resolve contacts from the on-device address book (`VoiceToolExecutor`). Phone numbers and emails never leave the phone.
   - In the calendar scope, tools outside `get_current_time`, `create_calendar_event`, `get_schedule`, `find_free_time` return `{"success":false,"error":"This screen creates appointments and events only."}`.
5. Everything else is forwarded to the server:

   ```
   POST /api/realtime/tool                 (session cookie, JSON, 30 s timeout, body ≤ 16 KB)
   ```

   ```ts
   type ToolRequest = {
     consent: true;
     scope?: 'general' | 'calendar';
     sessionId: string;                     // UUID v4, one per conversation (idempotency: sha256(user:session:call))
     callId: string;                        // the model's call_id, 1–200 chars
     name: string;                          // tool name, ≤ 50 chars
     arguments: Record<string, unknown>;    // the parsed arguments object, not the JSON string
   };                                       // zod .strict(): no other keys

   type ToolResult =
     | { success: true; [key: string]: unknown }                        // e.g. task: { id, title, status, priority, durationMin, startAt, dueAt }, warnings: string[]
     | { success: false; requiresConfirmation: true; warnings: string[]; message: string }  // schedule conflict; model asks, retries with allowScheduleConflict
     | { success: false; error: string; uncertain?: true };

   // HTTP: 200 with ToolResult · 400 { success:false, error } invalid args / calendar scope · 401 signed out
   //       413 too large · 500 { success:false, uncertain:true, error }
   ```

6. A thrown error (any non-2xx, since the Swift `APIClient` throws on non-2xx, or a network error) becomes:
   `{"success":false,"error":"Operation could not be confirmed. Check current tasks before retrying. Do not claim success."}`
7. On `success: true` with a `task`, record `lastCreatedTaskID` (for `create_task` and `create_reminder`) or `lastModifiedTaskID`, and update the app's task list.
8. Send the result back as the **JSON text** of the result:

   ```json
   { "type": "conversation.item.create", "item": { "type": "function_call_output", "call_id": "<call_id>", "output": "<ToolResult as JSON string>" } }
   ```

After the queue drains, the client sends `response.create`, or the farewell if the session is closing.

## 5. Teardown (Swift `close`)

1. Increment the run token so late callbacks are ignored.
2. Disable the microphone and remote tracks.
3. Close the data channel (after removing its delegate) and the peer connection.
4. Cancel the SDP URLSession.
5. Deactivate the audio session on the audio queue.
6. Only after audio is released is the session marked finished, so a new session can start.

## 6. Mapping to React Native (`react-native-webrtc` 124)

| Swift | React Native |
| --- | --- |
| `RTCPeerConnectionFactory` + `RTCConfiguration(unifiedPlan)` | `new RTCPeerConnection({ iceServers: [] })` (unified plan is the default) |
| `factory.audioTrack` + `peer.add(track, streamIds:)` | `mediaDevices.getUserMedia({ audio: true, video: false })`, then `pc.addTrack(track, stream)` |
| `dataChannel(forLabel: "oai-events", isOrdered: true)` | `pc.createDataChannel('oai-events', { ordered: true })` |
| `offer(OfferToReceiveAudio)` | `pc.createOffer({ offerToReceiveAudio: true })` or an `addTransceiver('audio', { direction: 'sendrecv' })` equivalent |
| `URLSession` POST `application/sdp` | `fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', headers, body: sdp, credentials: 'omit' })` |
| `didAdd stream` | `pc.addEventListener('track', e => …)`; audio tracks play automatically |
| `RTCAudioSession` speaker config | Android: `react-native-incall-manager` `start({ media: 'audio' })` + `setForceSpeakerphoneOn(true)`; iOS: the library's audio session, verify |
| `remoteAudio.source.volume = v × 3` | `track._setVolume(v)` (private API) |
| `channel.sendData(isBinary: false)` | `channel.send(JSON.stringify(event))` |
| `AVAudioApplication.requestRecordPermission` | `getUserMedia` requests `RECORD_AUDIO` on Android; iOS uses `NSMicrophoneUsageDescription` |

Nothing here needs our server to change. The only non-API dependency is that `api.openai.com` must be reachable from the phone's network over HTTPS and UDP, or the TURN/TCP fallback OpenAI provides.
