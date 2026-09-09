# Executive Companion implementation

Implemented locally on September 5, 2026, in the existing Nexdo working tree. No commit, push, Railway deployment, or production calendar modification was performed. Existing unrelated changes were preserved.

The [pre-implementation audit](executive-companion-audit.md) was written before application changes. It distinguishes existing functionality from the extensions below.

## Use Case A — Focus Today

**PARTIAL → IMPLEMENTED**

“What should I focus on today?”, “What should I do today?”, “What are my priorities?”, “What's most important?”, and “What should I work on next?” now use authenticated, saved task/calendar context and the existing normalized scorer. Completed, cancelled, waiting, and dependency-blocked work is excluded. Approximately three candidates are returned with deadline slack and concrete reasons. “Why?” refers to the preceding recommendation and rechecks current data.

The existing score uses 30% urgency, 25% importance, 20% deadline risk, 10% dependency impact, 10% explicit user preference, and 5% current context. This is a deterministic heuristic, not an LLM selecting the first three records.

Files: `src/lib/intent.ts`, `src/lib/schedule-intelligence.ts`, `src/lib/executive-recommendations.ts`, `src/server/schedule-intelligence.ts`, `src/server/executive-companion.ts`, `src/server/conversational-agent.ts`, `src/components/voice-dock.tsx`.

## Use Case B — Fix My Afternoon

**PARTIAL → IMPLEMENTED**

Afternoon/rest-of-day requests calculate available working minutes, flexible workload, and any deficit. The existing replan algorithm is constrained to that window, preserves imported appointments and protected tasks, reserves assumed transition buffers, respects dependencies and deadlines, and proposes moving lower-priority work into later working slots when necessary. Impossible work is reported rather than silently placed after its deadline.

Ask Nexdo shows before/after changes, preserved commitments, capacity, and risks. Apply and Keep current plan are server-side actions. “Don't move the dentist” recalculates a proposal; ambiguous targets require clarification and invalidate the earlier proposal. Fixed external appointments are never moved by these plans.

Pending plans are scoped to the authenticated user, atomically claimed on application, protected against replay, and invalidated by changed task/calendar/preference context. New blocks leave at least five minutes for review; plans expire after 15 minutes or when a proposed start passes. Only after approval are Nexdo task changes saved and the existing permitted calendar-write/reminder integration invoked. External sync failures are reported separately from successful local changes.

Files: `src/lib/replanning.ts`, `src/lib/executive-recommendations.ts`, `src/server/replanner.ts`, `src/server/executive-companion.ts`, `src/app/api/assistant/route.ts`, `src/components/voice-dock.tsx`.

## Use Case C — Driving Briefing

**MISSING (dedicated mode) → IMPLEMENTED**

Driving/evening phrases select a short audio-oriented account of completed important work, unfinished critical work, remaining calendar commitments, tomorrow's first commitment, conflicts, and deadline risks. The script avoids reading the entire task list and targets roughly 30–60 seconds, depending on content and speaking rate.

“Tell me about the conflict”, “What can wait?”, “What's my first meeting?”, and “Move anything nonessential tomorrow morning” use saved conversational context. The last request creates a proposal requiring approval; it does not silently move work.

The existing browser speech input and OpenAI TTS endpoint are reused. Spoken replies respect the saved voice preference, include AI-voice disclosure when audio is available, and fall back to readable text if speech is unavailable. Actual local OpenAI audio was not tested because the local API key is not configured; the provider contract and failure/disabled behavior were tested with mocks.

Files: `src/lib/intent.ts`, `src/lib/executive-recommendations.ts`, `src/server/executive-companion.ts`, `src/server/conversational-agent.ts`, `src/app/api/speech/route.ts`, `src/components/voice-dock.tsx`.

## Use Case D — Free-Time Recommendation

**MISSING (window-fit mode) → IMPLEMENTED**

Accepts numeric minutes/hours, an hour, half an hour, and “before my next meeting”. The requested window is capped by the next saved commitment and its buffer, including existing task blocks. Ongoing/all-day commitments can leave no usable opening.

Ranking combines the shared priority/risk score with duration fit and context. A high-priority but too-long unsplittable task is excluded. A task explicitly marked splittable may receive a useful partial-progress session, bounded by its minimum useful chunk and deadline.

Start Focus Session validates ownership, task state/dependencies, and the current recommendation again, then starts the requested-duration countdown through the existing task endpoint. Today, task details, and Ask Nexdo share one timer, with pause/resume, completion, and end controls. Timestamp-based remaining time survives route changes/reloads in the same browser tab. When personalization is enabled, active segments use existing TaskWorkSession records; pauses and delayed browser wake-up do not add extra work time. No work-session data is created without learning consent.

Files: `src/lib/executive-recommendations.ts`, `src/lib/focus-session.ts`, `src/components/focus-session.tsx`, `src/components/today-board.tsx`, `src/components/task-browser.tsx`, `src/components/voice-dock.tsx`, `src/components/app-shell.tsx`, `src/components/authed.tsx`, `src/app/api/tasks/[id]/route.ts`, `src/server/tasks.ts`.

## Shared architecture

The path is: intent detection → one request-scoped schedule context → existing deterministic scoring/interval/replan helpers → validated ExecutiveRecommendation → optional AI explanation → existing Ask Nexdo/voice UI → explicit approval → existing task/calendar execution.

- `src/lib/executive-contract.ts`: Zod-validated intent, summaries, priorities, conflicts, risks, reasoning, actions, before/after changes, protected commitments, capacity, assumptions, and confidence.
- `src/server/executive-companion.ts`: thin conversation adapter; not a second scheduling engine.
- `src/server/schedule-intelligence.ts`: owned tasks, visible imported events, mirror deduplication, dependencies, completed-today work, working hours/time zone, explicit memory preferences, and opt-in learned estimates.
- Existing VoiceSession, VoiceTranscript, AssistantAction, and UserMemory records hold context/proposals. No parallel conversation store.
- Existing OpenAI Responses integration makes at most one optional explanation call for a direct executive query. Simple follow-ups do not need an LLM. Explanation failure leaves deterministic facts and actions available.
- Model input excludes credentials, password hashes, task notes, and unnecessary account/calendar metadata. Arithmetic, ranking, identifiers, and schedule writes do not depend on parsing model prose.
- Existing metrics/logging records executive_companion_query, intent_detected, recommendation_generated, schedule_risk_detected, schedule_change_proposed/accepted/rejected, and focus_session_started, using intents/counts rather than task titles or transcripts.

The OpenAI Docs skill informed the reuse of [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and the existing [text-to-speech](https://developers.openai.com/api/docs/guides/text-to-speech) integration, including AI-generated voice disclosure.

## Database changes

Two additive fields on the existing Task model:

| Field | Default | Purpose |
| --- | --- | --- |
| splittable | false | Explicit permission to recommend partial progress |
| minFocusMin | 15 | Minimum useful chunk in minutes |

Files: `prisma/schema.prisma`, `prisma/migrations/5_executive_companion/migration.sql`. Recurring tasks preserve these fields. No new tables.

The isolated test database ran the full migration chain. The local development database was previously initialized without Prisma migration history, so migrate deploy reported P3005. After a SQLite backup, the exact additive migration SQL was applied locally. Task count remained 11 and a schema diff reported no difference. Production was not touched. The local migration-history baseline remains a pre-existing setup issue; do not reset the database to address it.

## APIs

**No new endpoint paths.** Existing APIs were extended:

- `POST /api/assistant`: structured executive result plus optional confirmActionId or rejectActionId; validated input, authenticated scoping, private/no-store response, stale-plan 409.
- `PATCH /api/tasks/:id`: existing IN_PROGRESS action accepts focusMinutes and fromRecommendation; returns chosen minutes and an optional consented work-session ID. A focusAction=finish closes the caller's captured work segment idempotently. Task editing accepts splittable/minFocusMin.
- `POST /api/speech`: existing synthesis path now enforces the user's spoken-reply preference.

## UI changes

No additional complicated screen. The existing Ask Nexdo sheet gains afternoon, free-time, and driving shortcuts while preserving the existing leading prompts. Answers reuse section cards, expandable assumptions, contextual follow-up chips, before/after review, explicit Apply/Keep controls, and a real focus action. Prior structured answers stay expandable rather than becoming a wall of prose. Task details expose splitting preferences. The shared focus controller is available throughout the authenticated app.

The existing 440 × 956 iPhone 17 Pro Max browser preview was checked with real local read-only requests: Top 3, 45-minute fit, and “Why?”. User task/calendar changes were not approved or started as part of that manual check. Mutating flows were tested only against isolated test accounts.

## Tests and validation

**179 tests passing across 22 files**, including the earlier functionality in the current working tree. Added 64 cases:

- `src/lib/executive-recommendations.test.ts`: 42 tests covering phrases, durations, actionable ranking, slack, fit/splitting, free/overloaded days, ongoing/all-day appointments, conflicts and transition buffers, bounded proposals, deferral, dependencies/cycles, time zones/DST, driving brevity, and countdown arithmetic.
- `src/server/executive-companion.integration.test.ts`: 17 real-Prisma integration tests covering ownership, hidden calendars/mirrors, contextual follow-ups, no writes before approval, approval/rejection/replay, stale context/review time, protected/ambiguous targets, provider fallback/data minimization, focus start/revalidation, consented pause/resume accounting, and external-sync failure reporting.
- `src/app/api/assistant/route.test.ts`: 4 tests for authentication, input validation, private response/voice preference, and stale-plan handling.
- Existing speech route suite: one added voice-disabled case; the suite now has 5 tests.

Validation commands:

```sh
HARBOR_DATABASE_URL='file:/private/tmp/nexdo-executive.pZLDwr/test.db' npm test
npm run lint
npm run typecheck
npm run build -- --webpack
git diff --check
```

The production Webpack build passed. The default Turbopack build was blocked by an environment permission error while binding a worker port, not a reported application compilation error. Package scripts were not changed to hide that limitation. Existing Prisma configuration and Next middleware deprecation warnings remain.

## Known limitations

1. Intelligence uses the most recently synchronized, visible calendar data; it does not force a live provider sync for every question.
2. Travel is a disclosed assumed buffer (default 15 minutes before and after appointments), not location-aware routing. No inferred location or new goals system was introduced; explicit saved goal/project preferences are reused when present.
3. Replanning is a bounded deterministic heuristic, not a global optimum. Future capacity/slack is evaluated over seven saved days; some legacy Today risk helpers remain today-scoped. Confidence is a fixed heuristic indicator, not a calibrated probability.
4. Partial-focus completion does not automatically reduce the task's remaining estimate or mark it done. Users retain control of task estimates/completion.
5. The timer persists only in the same browser tab. It is not a native iOS background timer/notification service. A fully closed tab cannot reliably send a final work-segment update; learning time is best-effort in that case. Device microphone permission/support and audio autoplay depend on Safari/browser settings.
6. Live OpenAI wording/audio and live Google writes were not exercised in this local implementation run. Mocked provider contracts and real database action workflows passed; a configured-key, real-device acceptance pass is still needed.
7. External sync is not transactionally atomic with local task updates. Failures are surfaced, but a durable retry/outbox remains future work. Fixed imported appointments are intentionally not rescheduled.
8. Existing demo authentication and deployment configuration still require production hardening. No deployment or App Store compliance is implied by this change.

## Next recommended improvement

Add calendar-sync freshness visibility and a durable retry/outbox for approved external writes, then run a real iPhone Safari acceptance pass with OpenAI enabled and a dedicated test calendar. This would validate voice permissions/playback and provider round trips without risking the user's primary calendar.

## Try it locally

Open `/mobile-preview`, select Ask AI, then try the four new/updated prompts. Ask “Why?” after Focus Today; request “Don't move the dentist” after a proposal; use Keep current plan to reject. To test a 45-minute partial session, explicitly mark a suitable longer task splittable in task details first. Any Apply or Start action changes the currently signed-in local account, so use disposable test tasks for validation.
