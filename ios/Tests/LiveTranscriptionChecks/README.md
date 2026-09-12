# Ask NexDo live transcription checks

Compile `ios/App/LiveVoiceTranscription.swift` and `Checks.swift` together using the Xcode Swift compiler, the macOS SDK, `-target arm64-apple-macos14.0`, and `-parse-as-library`. Run the resulting executable. These checks use an injected transport and permission provider; they do not access OpenAI or the microphone.

Covered: partial and final text, mismatched item IDs, late callbacks after cancellation, duplicate manual commits, empty transcripts, and denied permission.

Ask NexDo now requests `/api/realtime/transcription-session` and streams over WebRTC using `gpt-live-transcribe`. Its existing answer generation, speech playback, and action review remain in place. The older `/api/transcribe` upload endpoint remains available for older app versions; the updated Ask NexDo screen no longer calls it.

Deploy the backend before distributing the updated iOS app. Verify a physical-device session for live captions, Send now, pause-to-submit, follow-up questions, backgrounding, and consent withdrawal. Mock tests do not establish account model access or live audio quality.
