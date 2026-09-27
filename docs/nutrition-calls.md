# Daily food check-in calls (Calorie Tracker backend)

An AI agent phones the user at their chosen time (default 20:00), asks what they ate, logs each food
with calories computed in code from USDA / Open Food Facts data, reads the list back, and saves it
after the user confirms. Calls are capped at 5 minutes. The feature is **off** until
`NUTRITION_CALLS_ENABLED=true`.

## How a call flows

1. `nutrition-call-worker` (separate Railway service) POSTs `/api/nutrition-calls/tick` every minute.
2. The tick queues due calls (one per user per local day; unique index prevents duplicates) and dials
   them through Twilio with answering-machine detection and `TimeLimit=300`.
3. On answer Twilio fetches `/api/nutrition-calls/twiml`. Machines get `<Hangup/>`; humans get
   `<Connect><Stream>` to `wss://<worker>/twilio-media` with a signed per-call token.
4. The worker fetches the Realtime session from `/api/internal/nutrition-calls/session`, opens
   `gpt-realtime-2.1` over WebSocket (G.711 μ-law both ways, the user's voice, near-field noise
   reduction), relays audio, clears playback on barge-in, and runs every tool call through
   `/api/internal/nutrition-calls/tool`.
5. At 4:10 the model is told to wrap up; at 4:57 the worker hangs up; Twilio enforces 5:00.
6. The worker reports transcripts to `/api/internal/nutrition-calls/complete`. Items not confirmed on
   the call, calorie estimates without a database match, and (if Deepgram is configured) items the
   independent Flux transcript never heard are marked `NEEDS_REVIEW` for the user to check in the app.

Calls are only placed 08:00–21:30 in the user's time zone and up to 60 minutes late (e.g. after a
worker restart). No-answer policy: `NOTIFY` (push), `RETRY_ONCE` (+15 min) or `SKIP`.

Noise handling at launch is OpenAI Realtime's near-field noise reduction. A server-side filter
(e.g. Krisp) plugs into `scripts/nutrition-call-worker/noise-filter.mjs` without other changes; each
call records which filter was used (`NutritionCall.noiseFilter`).

## Deploy checklist

1. **Migration** `20260927200000_nutrition_calls` (additive: three new tables) runs automatically on
   deploy via `db:migrate:deploy`.
2. **Twilio**: a voice-capable number on an upgraded (non-trial) account. Nothing to configure on the
   number itself; calls are outbound only. Enable voice geo-permissions for any non-US countries.
3. **Harbour service variables**:
   - `NUTRITION_CALLS_ENABLED=true` (leave unset to keep the feature dark)
   - `VOICE_WORKER_SECRET` — long random string, shared with the worker
   - `NUTRITION_CALL_WORKER_URL=wss://<worker-domain>/twilio-media`
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VOICE_NUMBER` (falls back to `TWILIO_FROM_NUMBER`)
   - `APP_URL` must be the exact public origin Twilio calls (e.g. `https://app.nexdoapp.com`);
     Twilio signatures are verified against it.
   - Optional: `NUTRITION_CALL_MAX_SECONDS` (60–300, default 300), `NUTRITION_OPENAI_NOISE_REDUCTION=off`
4. **New Railway service `nutrition-call-worker`** from this repo:
   - Build: `npm ci --ignore-scripts` · Start: `node scripts/nutrition-call-worker.mjs`
   - No pre-deploy migration; public domain on; healthcheck path `/health`; restart always
   - `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=330` so redeploys let live calls finish
   - Variables: `NUTRITION_API_BASE_URL=https://app.nexdoapp.com`, `VOICE_WORKER_SECRET` (same value),
     `HARBOR_CRON_SECRET=${{Harbour.HARBOR_CRON_SECRET}}`, `OPENAI_API_KEY`,
     optional `DEEPGRAM_API_KEY` (Flux backup transcript), `NUTRITION_WORKER_DRAIN_SECONDS` (default 300)
5. **Try it**: verify your phone in the app (or via the API below), enable, then `POST /api/nutrition/call-now`.

## API for the app screens

All routes use the normal session cookie. Dates are the user's local `YYYY-MM-DD`.

| Screen / action | Request |
|---|---|
| Load setup & dashboard settings | `GET /api/nutrition/settings` → `{ enabled, phone, phoneVerified, localTime, timeZone, repeatDaily, noAnswer, voice, calorieGoal, goals, voices }` |
| Save time / time zone / repeat / if-no-answer / voice / goals / on-off | `PUT /api/nutrition/settings` with any of `{ enabled, localTime "20:00", timeZone, repeatDaily, noAnswer "NOTIFY"\|"RETRY_ONCE"\|"SKIP", voice, calorieGoal, goals {label: number} }`. `enabled:true` returns 409 `PHONE_NOT_VERIFIED` until the phone is verified. |
| Send phone code | `POST /api/nutrition/phone` `{ action: "start", phone: "+14155550123" }` (one per minute) |
| Confirm phone code | `POST /api/nutrition/phone` `{ action: "verify", code: "123456" }` (10-minute expiry, 5 attempts) |
| Try a call now | `POST /api/nutrition/call-now` (10-minute cooldown, calling window applies) |
| Today / food log | `GET /api/nutrition/log?date=` → `{ totals {kcal, proteinG, carbsG, fatG}, calorieGoal, needsReview, entries[] }` |
| Add food | `POST /api/nutrition/log` `{ date, meal "BREAKFAST"\|"LUNCH"\|"DINNER"\|"SNACKS", description, kcal? , foodName?, grams? }` (without `kcal` it is looked up) |
| Edit / confirm a flagged item | `PATCH /api/nutrition/log/{id}` `{ kcal?, meal?, description?, confirm: true }` |
| Remove food | `DELETE /api/nutrition/log/{id}` |
| Week / Month charts | `GET /api/nutrition/summary?period=week\|month&date=` → daily kcal, average, days logged |

Errors return `{ code, error }` with a user-readable `error`.

## Tests

- `src/server/nutrition/nutrition.test.ts` — scheduling/time zones/DST, calorie math and fallbacks,
  Twilio signature, call tokens, session config.
- `src/server/nutrition/nutrition.integration.test.ts` — the full call lifecycle on the SQLite test DB.
- `scripts/nutrition-call-worker/worker.test.ts` — μ-law codec and the call bridge (greeting, audio,
  barge-in, tools, goodbye/hang-up, time limit, rejected token).

Not yet covered by automated tests: a live Twilio + OpenAI call. Do one end-to-end call on a verified
number after deploying, and listen for greeting, barge-in, read-back and hang-up.
