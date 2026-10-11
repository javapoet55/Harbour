# Voice Analytics costs (USD)

The selected UTC date range applies to receipts; drilldowns group receipt dates in Pacific Time. Text-token cost and voice/audio cost are disjoint estimates, not invoices. Realtime session minutes are never multiplied by a made-up per-minute Realtime rate. Audio token cost and provider-reported live-transcription seconds form the voice/audio subtotal. Combined estimates appear in the user/date drilldown.

Standard pricing verified 2026-09-23: https://developers.openai.com/api/docs/pricing
- gpt-realtime-2.1: text input/cache/output $4/$0.40/$24 per million; audio $32/$0.40/$64.
- gpt-realtime-2.1-mini: text $0.60/$0.06/$2.40; audio $10/$0.30/$20.
- gpt-live-transcribe and gpt-realtime-whisper: $0.017/minute using provider-reported duration only.

Client receipts now carry the session model and text/audio/cache breakdown when available. Transcription model is read from provider session events. Missing or unknown model, modality breakdown, cached breakdown, unsupported image tokens or transcription duration produces Unavailable, not zero or a guessed model. Existing receipts are not backfilled. iOS rebuild is required for new detailed receipts. API accepts old receipts. Idempotent receipt IDs still prevent double counting.

Cards and tables disclose priced/unpriced receipt coverage. Sessions without any receipts, text-tool requests, separate TTS/upload-transcription requests, taxes and negotiated pricing are outside these subtotals. These are client-reported usage estimates and are not suitable as customer invoices. Rate constants are versioned in code; retain the dated rate schedule when adding future price changes.

## General AI and server voice APIs (2026-10-10)

Voice Analytics now includes an **AI and voice API costs** table, grouped by account, feature, endpoint type and model for the selected dates, plus a combined known estimate. Existing Realtime cards are explicitly labeled Realtime; their subtotals and server API receipts are disjoint. Authenticated requests use server-authenticated identity, while background/anonymous calls are labeled separately. No prompts, transcripts, audio, credentials or provider response bodies are persisted.

`AiApiReceipt` is a separate durable ledger, independent of health telemetry's enable flag and 31-day retention. Deploy migration `20261010140000_ai_api_receipts`, the backend, then admin. It records new Responses/Chat Completions calls (including support), uploaded-audio transcription, speech generation and image generation attempts. Realtime credential requests are excluded. Old unrecorded requests cannot be backfilled. Failed, aborted, unsupported or missing-usage calls remain visibly unpriced; recording failures increment `ai_cost.write_failures` and never break the customer's request. Image costs remain unpriced until a supported pricing calculation exists.

Speech requests use `stream_format: sse` to capture `speech.audio.done.usage`. The server decodes `speech.audio.delta` back into MP3 for the unchanged client contract. Missing completion or invalid audio is rejected. Limits bound SSE collection to 16 MiB and 45 seconds; client request aborts propagate. See [speech API](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create).

Built-in **standard-tier** USD rates verified 2026-10-10: [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini) input/cache/output 0.75/0.075/4.50 per million tokens; [GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini) 0.15/0.075/0.60; [mini TTS](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts) text input 0.60 and audio output 12; [mini transcription](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe) input 1.25 and output 5. Reported duration can use the provider's estimated 0.003/minute transcription rate. These are estimates, not invoices, and exclude taxes, contractual discounts and tool fees.

`NEXDO_AI_PRICES_JSON` overrides whole exact-model entries. Supported fields: `input`, `cachedInput`, `output`, `audioInput`, `audioOutput` (USD/million tokens), `perMinute`, and `perMillionCharacters`. Configure only units actually billed for that model. The applicable numeric rate snapshot is saved with each receipt; later pricing changes do not rewrite past estimates. Unknown models and nonstandard processing tiers stay unpriced. Do not set character rates for token-billed speech. No per-user spending enforcement is introduced by this reporting change.

Deploy the nutrition call worker after the backend to include its OpenAI Realtime response usage. Worker completion reports contain numeric receipts, attributed to the call owner and deduplicated by provider response ID. Missing breakdowns remain unpriced. Twilio telephony, optional Deepgram transcription, noise-filter licensing and other third-party invoices are not included in these OpenAI estimates.

## Monthly voice admission limit

The backend checks the authenticated account's recorded monthly voice usage before issuing conversational or transcription Realtime credentials, generating speech, or accepting uploaded transcription. At 6,000 seconds (100 minutes), it returns HTTP 429 with `VOICE_MONTHLY_LIMIT_REACHED` and a next-month message. The month is calculated in the account timezone, using the same ledger as My Page; another user's usage does not affect the decision. No reset job or migration is needed. Accounting lookup failures do not allow paid calls through. Typed requests remain available.

This is a server-side admission check against recorded usage. Existing direct-to-provider sessions are not forcibly disconnected by this change, and concurrent sessions or delayed/missing client usage reports can overshoot the allowance. A strict live-duration cap requires server-controlled session lifetime and authoritative duration accounting; credential expiry alone does not terminate an established session.
