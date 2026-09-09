# Executive Companion — strict production-readiness audit

Audit date: September 5, 2026. Verdict: **not yet cleared for production release**. The four requested application flows pass local integration tests after the fixes below. This is not a claim that live Railway, live Google/Microsoft, or physical iPhone voice behavior has passed acceptance testing.

No deployment, push, credential rotation, production task edit, or production calendar mutation was performed. Existing unrelated working-tree changes were preserved. Mutating tests used disposable SQLite databases and test-only accounts. The existing local iPhone preview was used for read-only conversations; those conversations create normal assistant history, not task/calendar changes.

## Evidence standard and suite results

The initial suite passed **179 tests / 22 files**, yet four newly written deterministic regressions failed: competing future deadlines, deadlines beyond the planning horizon, retained task-block collisions, and omitted blocked workload. This demonstrates why the previous green suite was insufficient.

Final results:

| Check | Result | Artifact |
| --- | --- | --- |
| `npm test` | **205 passed / 24 files** | [Full test output](/private/tmp/nexdo-readiness.vU3vvS/final-tests.log) |
| `npm run typecheck` | Passed | [Typecheck output](/private/tmp/nexdo-readiness.vU3vvS/final-typecheck.log) |
| `npm run lint` | Passed, no diagnostics | [Lint output](/private/tmp/nexdo-readiness.vU3vvS/final-lint.log) |
| `npm run build` | Failed: Turbopack CSS worker could not bind a port (`Operation not permitted`); a requested unrestricted retry encountered the same restriction | [Default build](/private/tmp/nexdo-readiness.vU3vvS/build.log), [retry](/private/tmp/nexdo-readiness.vU3vvS/build-unrestricted.log) |
| `npx next build --webpack` | Passed compilation, TypeScript, page-data collection, prerendering, and build traces | [Production Webpack build](/private/tmp/nexdo-readiness.vU3vvS/final-build-webpack.log) |
| `git diff --check` | Passed | Reproducible command in this checkout |

The package's default build command was not silently changed. Its Turbopack restriction remains an explicit validation limitation. Temporary log paths are local audit artifacts, not durable CI storage.

[Test configuration](/Users/sri/Documents/ChatGPT/Harbour/vitest.config.ts:6) now creates a fresh temporary SQLite file on every test run; [global setup](/Users/sri/Documents/ChatGPT/Harbour/vitest.global-setup.ts:4) applies the actual migrations. Tests cannot silently fall back to `prisma/dev.db`. No old test cases were removed.

### What the new integration tests actually execute

[executive-readiness.integration.test.ts](/Users/sri/Documents/ChatGPT/Harbour/src/server/executive-readiness.integration.test.ts:1) executes real signed-session creation/verification, `requireUser`, actual route handlers, Prisma queries/transactions, task/calendar rows, deterministic engines, approval storage, calendar synchronization, the actual Google adapter, and the speech endpoint. It substitutes only Next's request-cookie transport and the external HTTP transport. Provider responses are controlled fixtures; database retrieval and provider adapter code are **not** mocked. Assertions inspect both database state and outbound provider URL/method/body.

This proves adapter behavior against specified provider responses, **not** that Google accepted a real write or that an MP3 played on an iPhone. The older Executive integration file mocks `pushTaskToExternal`; its calendar assertions are therefore weaker and are not used alone as external-write evidence. Existing `a11y.test.ts` checks static arrays, not rendered accessibility; it is not evidence of a screen-reader audit.

## End-to-end traces

Shared entry: [VoiceDock](/Users/sri/Documents/ChatGPT/Harbour/src/components/voice-dock.tsx:28) supplies exact shortcut text. Typed submission and `SpeechRecognition.onresult` both reach `submit` at line 194. It sends `transcript`, approval/rejection IDs when present, and `contextActionId` to [POST /api/assistant](/Users/sri/Documents/ChatGPT/Harbour/src/app/api/assistant/route.ts:7). The route validates input and obtains the user from the signed session; it does not accept a client-supplied user ID. [runConversationalAgent](/Users/sri/Documents/ChatGPT/Harbour/src/server/conversational-agent.ts:255) calls [handleExecutiveTurn](/Users/sri/Documents/ChatGPT/Harbour/src/server/executive-companion.ts:27) before the general LLM planner.

[loadScheduleContext](/Users/sri/Documents/ChatGPT/Harbour/src/server/schedule-intelligence.ts:11) retrieves owned tasks, dependency status, dependents, completed-today work, visible saved calendar events, calendar freshness, preferences, and consented duration estimates. It checks external task-link drift and deduplicates matching task mirrors. [buildExecutiveRecommendation](/Users/sri/Documents/ChatGPT/Harbour/src/lib/executive-recommendations.ts:18) constructs the result from these rows. The UI renders `visual.sections`, computed before/after changes, optional focus actions, and follow-up buttons. Spoken output goes through the existing authenticated [speech endpoint](/Users/sri/Documents/ChatGPT/Harbour/src/app/api/speech/route.ts:6), subject to voice preference.

### 1. “What should I focus on today?”

`FOCUS_TODAY` → shared owned context → cumulative deadline capacity → `scoreTasks` → at most three actionable tasks with reasons/slack → sectioned answer. Completed, cancelled, waiting, and dependency-blocked work is excluded from the actionable ranking. This is not `tasks.slice(0, 3)`.

The score is an explainable heuristic: urgency 30%, importance 25%, deadline risk 20%, dependency impact 10%, saved preference 10%, context 5%. There is no evidence that these weights are calibrated to real-world completion outcomes. LLM output does not set ranks, capacities, IDs, deadlines, or mutations.

Proof: [A full-stack test](/Users/sri/Documents/ChatGPT/Harbour/src/server/executive-readiness.integration.test.ts:63), [ranking/slack tests](/Users/sri/Documents/ChatGPT/Harbour/src/lib/executive-recommendations.test.ts:29). A critical 90-minute task plus 30 minutes already overdue share a 45-minute deadline window: the tested shortfall is 75 minutes, not 45. Another test gives two 60-minute tasks the same one-hour future window and expects a 60-minute deficit, rather than allocating that hour twice.

The test asks another question before “Why?”, passes the original `contextActionId`, and verifies the explanation still refers to the original recommendation. Another account's context ID receives 404. Task rows are identical before/after the read-only questions; no provider write occurs.

### 2. “Fix my afternoon.”

`FIX_SCHEDULE` → current context/version → afternoon or remaining-day working windows → unioned calendar buffers/fixed task blocks → deterministic dependency-aware placement → proposed task IDs with before/after timestamps → persisted pending action → **Apply changes / Keep current plan**.

[storeExecutiveProposal](/Users/sri/Documents/ChatGPT/Harbour/src/server/replanner.ts:39) atomically supersedes older proposals. [applyReplanProposal](/Users/sri/Documents/ChatGPT/Harbour/src/server/replanner.ts:114) refreshes visible connected providers, then checks semantic schedule version, dependencies/preferences, proposal age, starts that have passed, and each task version. Claiming the action and updating tasks occur in one transaction. Rejection persists without changing tasks. External writes happen only after the local transaction and only for the approved task records.

Proof: [B approval/rejection and actual adapter test](/Users/sri/Documents/ChatGPT/Harbour/src/server/executive-readiness.integration.test.ts:84), [provider changes/outage](/Users/sri/Documents/ChatGPT/Harbour/src/server/executive-readiness.integration.test.ts:110), [concurrent approval](/Users/sri/Documents/ChatGPT/Harbour/src/server/executive-readiness.integration.test.ts:190), [dependency invalidation](/Users/sri/Documents/ChatGPT/Harbour/src/server/executive-readiness.integration.test.ts:230). Tests compare saved timestamps to the approved `after` values and inspect the Google request's calendar ID, task title, and start time. The fixed appointment's title/start/end remain unchanged. Replay causes no second provider write.

Placement is greedy with priorities and constraints, not a globally optimal solver. Unplaceable original blocks remain reserved; dependent moves are pruned when a prerequisite's move cannot safely occur. Insufficient capacity is reported, not silently squeezed into a shorter task.

### 3. “I'm driving home. What do I need to know?”

`DRIVING_BRIEFING` → completed-today important tasks + unfinished critical work + remaining calendar commitments + tomorrow's first commitment + computed conflicts/risks → bounded factual spoken script and expandable detail → speech endpoint. No location/GPS, route, email, or driving-state inference is used.

Proof: [C full-stack and speech transport test](/Users/sri/Documents/ChatGPT/Harbour/src/server/executive-readiness.integration.test.ts:122), [driving algorithm tests](/Users/sri/Documents/ChatGPT/Harbour/src/lib/executive-recommendations.test.ts:119), [speech route tests](/Users/sri/Documents/ChatGPT/Harbour/src/app/api/speech/route.test.ts:1). The tested scenario includes one important completion, critical unfinished work, and a real saved tomorrow appointment. The speech request's input equals the computed spoken response; disabling voice returns 403; no calendar write occurs. Tested script is under 160 words. “Tell me about the conflict” and “What's my first meeting?” reuse the prior intent while re-reading current data.

Physical microphone recognition, background audio, Safari autoplay restrictions, Bluetooth routing, and actual OpenAI voice generation were **not** tested. Local preview showed the explicit “Audio unavailable · read the answer above” fallback because voice was not configured. This is not a verified hands-free driving product.

### 4. “I have 45 minutes free. What should I do?”

`FREE_WINDOW` with parsed 45 minutes → earliest blocking appointment/task including disclosed buffers → actionable fit ranking → whole-task fit or explicit splittable partial session → **Start N-minute focus session** → [PATCH /api/tasks/:id](/Users/sri/Documents/ChatGPT/Harbour/src/app/api/tasks/[id]/route.ts:1) → atomic fresh-context validation and `startTask` → shared countdown.

Proof: [D full-stack test](/Users/sri/Documents/ChatGPT/Harbour/src/server/executive-readiness.integration.test.ts:138), [fit/partial/blocker tests](/Users/sri/Documents/ChatGPT/Harbour/src/lib/executive-recommendations.test.ts:36), [focus recording/ownership/staleness tests](/Users/sri/Documents/ChatGPT/Harbour/src/server/executive-companion.integration.test.ts:162). A 90-minute explicitly splittable task receives exactly a 45-minute session; an unsplittable long task is not falsely described as fitting. Starting marks only the selected owned task in progress; it does not mark it completed or write a calendar block. Recorded work segments require personalization consent.

The [countdown](/Users/sri/Documents/ChatGPT/Harbour/src/components/focus-session.tsx:22) uses timestamps, recalculates on visibility changes, and persists per user in sessionStorage. [Countdown arithmetic test](/Users/sri/Documents/ChatGPT/Harbour/src/lib/executive-recommendations.test.ts:137) checks background elapsed time/pause, not real iOS suspension. Cross-tab/cross-device synchronization is not implemented.

## Runtime mobile verification

All four exact questions were typed into the existing signed-in **440 × 956** iPhone-frame preview. Focus returned two owned overdue tasks; “Why?” retained the selected recommendation after display. Fix-afternoon correctly reported zero remaining working capacity on the current non-working evening and offered no unsafe mutation. Driving used saved completion/deadline facts and displayed audio fallback.

The live 45-minute question exposed an additional defect: at about 11:30 PM it returned only 29 minutes because the interval was clipped at midnight. After the fix it returned 45 minutes and offered a fitting 30-minute task. [Regression](/Users/sri/Documents/ChatGPT/Harbour/src/lib/executive-recommendations.test.ts:21) also proves a next-day appointment still shortens a cross-midnight opening correctly. No real user's Start or Apply control was clicked.

## Fixed findings and wider inspection

| Area | Finding and change | Proof / limitation |
| --- | --- | --- |
| LLM fact invention / prompt injection | Schema-valid free-text explanations could add invented facts. Optional explanation now selects an **exact server-generated candidate**, with enum schema and independent membership check. No LLM arithmetic, task IDs, or mutation plan on these four routes. | [Implementation](/Users/sri/Documents/ChatGPT/Harbour/src/server/conversational-agent.ts:14), malicious-response test A. This changes the LLM role from rewriting to selecting grounded wording. General free-form chat outside these routes is not thereby certified. |
| Future deadlines / duration assumptions | Competing deadlines reused time; long-range tasks falsely looked impossible against only seven days. Capacity is cumulative within the declared horizon; outside-horizon slack is unknown. Personalized estimates never silently reduce saved estimates, and learning samples must be completed positive-duration tasks. | Four initially failing regressions now pass; [duration reader](/Users/sri/Documents/ChatGPT/Harbour/src/server/predictions.ts:12). Saved duration and dueAt remain assumptions about the user's real work. |
| Placement / blocked work | Proposed moves could collide with an unplaceable task left at its original time. Final retained-block/dependency validation added; blocked/waiting workload contributes to the deficit. | [retainSafeMoves](/Users/sri/Documents/ChatGPT/Harbour/src/lib/replanning.ts:193), regression tests. |
| Follow-up context | Latest per-user action could select another screen's conversation. UI now carries an owned recommendation ID; server revalidates it and rereads current data. | A test interleaves questions and attempts foreign-context access. Unknown free-form follow-ups still use the general interpreter. |
| Approval races | Executive proposal replacement, approval claims, version checks, and task writes made transactional. Legacy LLM-plan approval claim/version validation also moved inside the transaction; model memories are not saved before material-plan approval. | [Executive concurrency test](/Users/sri/Documents/ChatGPT/Harbour/src/server/executive-readiness.integration.test.ts:190), [legacy concurrency test](/Users/sri/Documents/ChatGPT/Harbour/src/server/executive-readiness.integration.test.ts:198). Not a multi-process load test. |
| External calendar ownership | Changing the default calendar could redirect an existing exported task update to the wrong calendar. Updates resolve the original owned mirror/connection; ambiguous or unwritable links fail closed. | [pushTaskToExternal](/Users/sri/Documents/ChatGPT/Harbour/src/server/calendar-sync.ts:78), [original-calendar test](/Users/sri/Documents/ChatGPT/Harbour/src/server/executive-readiness.integration.test.ts:149). Existing imported appointments are not proposed for mutation. |
| Stale calendar state | Added refresh-before-approval, freshness warnings, external-link drift protection, atomic sync, full-snapshot missing-event removal, invalid-snapshot rejection, and optimistic sync-version claim. Removed one per-event lookup by prefetching existing rows. | [syncConnection](/Users/sri/Documents/ChatGPT/Harbour/src/server/calendar-sync.ts:4), [competing syncs](/Users/sri/Documents/ChatGPT/Harbour/src/server/executive-readiness.integration.test.ts:211), snapshot/drift tests. A remote edit after refresh remains possible. |
| Google incremental sync | Recurrence/deletion flags differed between full and incremental requests. They are now stable in both. | Actual adapter query-parameter assertions in the all-day test. Google requires consistent other query parameters for incremental sync: [events.list reference](https://developers.google.com/workspace/calendar/api/v3/reference/events/list). |
| Time zones / DST | Google all-day events used UTC midnight; nonexistent local DST times silently shifted; created tasks used a schema-default zone. All-day conversion uses calendar/user zone, gaps are rejected, new tasks use owner zone; settings validate zones/hours. | 25-hour all-day import, spring gap, 23/25-hour days, fractional-offset and task-zone tests. Ambiguous fall-back wall times have no UI choice of first/second occurrence. |
| Duplicate scheduling calculations | Legacy daily-plan and personalization capacity summed unclipped overlapping meetings and ignored remaining working time/visibility. Both now reuse interval union/subtraction and working windows. Alternate legacy FIX_SCHEDULE response removed; direct fallback uses Executive handler. | [daily planner](/Users/sri/Documents/ChatGPT/Harbour/src/server/planner.ts:9), [capacity integration test](/Users/sri/Documents/ChatGPT/Harbour/src/server/executive-readiness.integration.test.ts:274). Legacy full-briefing ranking still uses `rankFocusTasks`, while Executive uses `scoreTasks`; different ranking policies remain. |
| Duplicate/dead services | Removed uncalled fake language-model, browser-speech adapter, and duplicate mock-calendar exports from `providers/index.ts` after caller search. A/C/D no longer unnecessarily run the replanner. | Typecheck/lint/build and complete suite pass; real speech uses `/api/speech`, calendars use `calendarProviderFor`. This is not proof all unrelated app code is reachable. |
| Authorization / production mocks | Shared session/OAuth signing key now fails closed in production when missing/weak, restricts JWT algorithm, and uses secure production cookies. Public demo-password sign-in is refused in production. Demo seed is blocked in production. Unconfigured notifications fail rather than pretend delivery; mock calendar adapter cannot run in production. | [signing key](/Users/sri/Documents/ChatGPT/Harbour/src/server/session-key.ts:1), forged-session/secure-cookie/mock-notification test. Requires deployment configuration and real-user credential rotation before rollout. |
| Invalid settings / graceful errors | Settings validate full input and ownership before transactional writes; invalid time zone/default calendar cannot partially change profile. Stale requests return 409. Middleware no longer redirects API calls to HTML or traps invalid-cookie users away from login. | Settings ownership/rollback test, [middleware tests](/Users/sri/Documents/ChatGPT/Harbour/src/middleware.test.ts:1), API validation tests. Broader legacy routes have not received exhaustive malformed-input testing. |
| PII in logs | Removed notification mocks logging recipient/content; provider failure reasons no longer embed raw response bodies. Executive metrics log intent/counts, not notes/titles/tokens. | Provider logging test. Intentional stored transcripts/activity records contain user content; runtime retention, access and hosting logs require separate operational review. |
| Hard-coded demo UI | Header's constant 72° badge is now development-only. Fixture data remains in test/seed/marketing demo code, not Executive fact retrieval. | Source branches and real-account UI checks. Profile image and legacy fixed-ZIP weather remain existing product/demo choices, not personalized intelligence. |
| N+1 / performance | Executive read path batches tasks/dependencies, events, preferences and link checks; no query per ranked task. Sync prefetches previous records once, then performs required per-record writes transactionally. | Traced queries in shared reader and sync function. Queries are not hard-capped for very large accounts; no production query-plan, index/load, throughput or memory profiling was performed. |

OpenAI Docs informed the model boundary: structured JSON alone is not a factuality/security guarantee. The fix enforces exact candidate membership in application code, rather than relying on the prompt. References: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [agent safety guidance](https://developers.openai.com/api/docs/guides/agent-builder-safety).

## Capability verdict table

“Verified locally” means observed API/DB/adapter or UI behavior under the tests above, not an unconditional production guarantee.

| Capability | Status | Evidence | Tests | Remaining Risk |
| --- | --- | --- | --- | --- |
| Focus today | Verified locally | Owned read model → cumulative capacity → deterministic score → structured response | A full-stack; ranking, deadline, dependency, empty-data regressions | Heuristic weights; saved estimates and freshness; legacy briefing can rank differently |
| Fix afternoon | Verified locally; production partial | Pending before/after proposal; refresh/version/approval transaction; owned task export | B, reject/replay, concurrency, dependency/stale calendar, provider outage | Local commit and external write are not one atomic operation; no durable export outbox |
| Driving briefing | Partial | Computed factual script → actual speech endpoint; local text fallback observed | C, voice-disabled/provider-error tests | Live voice generation, physical iPhone input/playback and safe hands-free behavior unverified |
| 45-minute fit + focus | Verified locally; device partial | Blocker-limited fit, splittability, explicit Start, atomic start validation, shared timestamp timer | D, partial/unsplittable, ownership, recording, midnight and countdown tests | Last synced state can miss very recent remote events; sessionStorage is tab-local |
| Grounded LLM / follow-ups | Verified for the four bounded flows | Candidate-membership validation; owned contextActionId; current-data re-read | Invented-output rejection, provider fallback, interleaved Why and foreign-context tests | General free-form LLM answers are not covered by the same factual allowlist |
| External calendar protection | Verified adapter behavior; live validation missing | Original-calendar binding, fixed-event preservation, refresh gate, drift warning, sync CAS | Actual URL/body, stale/outage, same-ID/default change, snapshot and concurrent-sync tests | No live Google/Microsoft acceptance test; no provider ETag conflict check on export; API access scopes remain broad |
| Production security / operations | Partial | Fail-closed keys, secure cookies, public-demo-password refusal, validated owned settings | Auth/isolation/settings/middleware tests | No distributed rate/cost limiting; credential rollout, backup/restore, retention job and production observability not verified |
| Build / test gate | Partial | 205 tests; lint/typecheck; Webpack production build | Full suite outputs above | Default Turbopack build remains restricted in this environment; CI/Railway build not verified |

## Release gates that remain

1. **Durable external-write recovery.** A process can stop after local approval commits but before provider writes finish. A durable idempotent outbox/retry/reconciliation mechanism and provider concurrency controls are not implemented. Current failures are surfaced honestly, but crash recovery is not guaranteed.
2. **Real provider and physical-device acceptance.** Use a dedicated live test calendar to verify OAuth refresh, recurrence, deletion, simultaneous external edits, approval/write behavior and reconnects; test real iPhone microphone, audio, background/resume and accessibility. None of that is proved by fixture HTTP responses.
3. **Security/operations rollout.** Configure a strong `HARBOR_SESSION_SECRET` and replace accounts using the public demo password before deploying these guards; otherwise those logins will intentionally fail. Review previously exposed OAuth credentials for rotation. Add centralized rate/cost controls, audit retained transcripts/hosting logs, and prove backups/restoration and scheduled synchronization/retention in Railway. No secrets are reproduced here.
4. **Explicit model semantics.** Buffers are assumptions, not routes/travel-time estimates. Saved `dueAt` is treated as a real deadline, even when older task-creation paths copied the scheduled start into it. The calendar schema does not preserve full provider free/busy/transparency semantics; imported all-day commitments conservatively block capacity. Resolve these semantics before promising universally accurate availability.
5. **Remaining breadth/scale.** Legacy full-briefing ranking and general free-form interpretation are separate policies, not certified equivalent to Executive recommendations. Load/query profiling, multi-instance focus coordination, broader accessibility, and CI/default-bundler validation remain outstanding.

These remaining risks are deliberately not relabeled as DONE or hidden behind the passing test count.
