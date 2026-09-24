# Voice Analytics costs (USD)

The selected UTC date range applies to receipts; drilldowns group receipt dates in Pacific Time. Text-token cost and voice/audio cost are disjoint estimates, not invoices. Realtime session minutes are never multiplied by a made-up per-minute Realtime rate. Audio token cost and provider-reported live-transcription seconds form the voice/audio subtotal. Combined estimates appear in the user/date drilldown.

Standard pricing verified 2026-09-23: https://developers.openai.com/api/docs/pricing
- gpt-realtime-2.1: text input/cache/output $4/$0.40/$24 per million; audio $32/$0.40/$64.
- gpt-realtime-2.1-mini: text $0.60/$0.06/$2.40; audio $10/$0.30/$20.
- gpt-live-transcribe and gpt-realtime-whisper: $0.017/minute using provider-reported duration only.

Client receipts now carry the session model and text/audio/cache breakdown when available. Transcription model is read from provider session events. Missing or unknown model, modality breakdown, cached breakdown, unsupported image tokens or transcription duration produces Unavailable, not zero or a guessed model. Existing receipts are not backfilled. iOS rebuild is required for new detailed receipts. API accepts old receipts. Idempotent receipt IDs still prevent double counting.

Cards and tables disclose priced/unpriced receipt coverage. Sessions without any receipts, text-tool requests, separate TTS/upload-transcription requests, taxes and negotiated pricing are outside these subtotals. These are client-reported usage estimates and are not suitable as customer invoices. Rate constants are versioned in code; retain the dated rate schedule when adding future price changes.
