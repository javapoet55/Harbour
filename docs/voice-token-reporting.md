# Voice token reporting

Admin → Voice Analytics supports date presets and custom UTC date ranges. All metrics follow the selected range. The token eye button opens a paginated user/date breakdown; dates in the table are Pacific Time (PST/PDT).

The rebuilt iOS app reports numeric OpenAI `response.done.response.usage` and token-based input transcription usage to authenticated `POST /api/voice/tokens`. No audio or transcript is included. Input already includes cached tokens, so cached tokens are not added again. Interrupted/out-of-order responses are captured when usage is present. Missing usage is never inferred from duration.

Receipts use the existing UserMemory table with kind `voice_tokens`, isolated from conversational memory. Stable provider response/item IDs and authenticated user IDs make retries idempotent. Receipt creation time is retained on retries and used for reporting. Counts are client-reported operational telemetry, not a billing ledger. Network failures retry twice; permanent failures or app termination can leave gaps.

Deploy the backend first, then rebuild/install the iPhone app. Earlier builds did not retain these counts, so historical per-user totals cannot be backfilled. A period without token receipts displays Unavailable, not zero. No database migration is required.

Validation: backend schema/grouping/integration tests, Swift usage parser and out-of-order callback tests, iOS Simulator build, and live Admin date-filter and details-panel checks.
