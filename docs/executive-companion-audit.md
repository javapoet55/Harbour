# Executive Companion — pre-implementation audit

Audited September 5, 2026. This report records the existing working tree **before implementation**; it includes earlier, uncommitted Nexdo work. No production deployment is part of this request.

## Architecture inventory

| Area | Existing implementation and findings |
| --- | --- |
| Tasks and database | `prisma/schema.prisma`, `server/tasks.ts`, task APIs, `components/task-browser.tsx`, `today-board.tsx`. Owned CRUD, dependencies, subtasks, deadlines, duration, energy, recurrence, completion and work sessions exist. No explicit splittability/minimum focus chunk. |
| Calendar and unified timeline | `server/agenda.ts`, `server/calendar-sync.ts`, `providers/calendar.ts`, `lib/calendar-view.ts`, `components/calendar-screen.tsx`. Imported, visible, user-owned events; task/calendar mirror deduplication exists in schedule intelligence. Retrieval reads saved sync data, not live Google on every question. |
| Daily briefing / Today | `server/briefing.ts`, `server/schedule-intelligence.ts`, `components/today-snapshot.tsx`. Today/tomorrow/multi-day, overdue, focus and risk summaries exist. Several older paths still use different ranking/capacity calculations. |
| AI assistant / LLM | `server/conversational-agent.ts`, `server/assistant.ts`, `lib/intent.ts`, `/api/assistant`. OpenAI Responses with structured output and approval exists. Deterministic shortcuts bypass it. Generic LLM context includes full user data (including an unnecessarily selected password hash) and no calendar context. Executive planning must bypass generic action generation. |
| Conversation memory | Existing `VoiceSession`, `VoiceTranscript`, `AssistantAction`, `UserMemory` models support recent turns, explicit preferences and corrections. Deterministic responses do not yet resolve recommendation follow-ups. |
| Scheduling / priority | `lib/replanning.ts`, `server/replanner.ts`, `lib/schedule-intelligence.ts`, `lib/focus-ranking.ts`, `server/planner.ts`. Replanning, version-checked approval, weighted 30/25/20/10/10/5 scoring already exist. Replan horizon defaults to seven days; buffer handling and priority scoring are not unified with intelligence. Dependency ordering needs hardening for chains/cycles. |
| Conflicts / deadline slack | `analyzeSchedule` detects nested event overlaps, task/calendar overlaps, cumulative deadline deficits and priority displacement; merges busy intervals. Deadline analysis primarily covers today. |
| Travel / buffers | A disclosed assumed 15-minute transition buffer exists. Calendar location exists but no routes, live location, measured travel or per-event travel fields. Do not pretend this is real travel-time estimation. |
| Preferences / goals | Working days/hours, time zone, energy, opt-in learned duration/completion, and explicit user memories exist. No standalone goals model; reuse explicitly saved goal/project preferences, without inferring private goals. |
| Voice | `components/voice-dock.tsx`, `/api/speech`. Browser SpeechRecognition input, OpenAI Coral TTS output, playback/pause and text fallback exist. No audio-specific executive brief; long summaries can exceed the speech endpoint limit. Voice preference is not currently consulted by the dock. |
| Focus | TodayBoard has a 25-minute component-local interval; task details can trigger it. `startTask` and `TaskWorkSession` already track progress (learning only with consent). No shared variable-duration countdown across assistant/Tasks/Today. |
| Auth / authorization | `server/auth.ts`, `session.ts`, middleware and APIs enforce authenticated user scoping. Replan application checks task versions, but needs proposal rejection, replay protection and calendar/context freshness checks for executive plans. Existing public demo credentials are a separate production hardening concern. |
| Observability | `lib/logger.ts` and `metrics.ts` provide redacted logging, counters and timing. Reuse these, logging intent/counts only. |
| Tests | Vitest unit suites cover intent, focus ranking, replanning, recurrence, schedule intelligence, time zones/DST, credentials, speech and user isolation. `server/harbor.integration.test.ts` covers real Prisma CRUD, approvals, sync, memory and personalization. Tests currently default to dev.db; validation must use an isolated temporary database. |

## A — “What should I focus on today?” — PARTIAL

- Existing: `intent.ts`, `assistant.ts`, `focus-ranking.ts`, `briefing.ts`, `schedule-intelligence.ts`, voice shortcuts.
- Works: multiple priority engines, incomplete/overdue work, dependency exclusion in intelligence, Top 3 inside full briefing.
- Missing: all requested phrase variations consistently reaching actionable Top 3; direct focus query currently returns high/critical tasks sorted by due date, not ranked recommendations. Structured recommendation IDs, deadline slack and grounded “Why?” follow-up are absent from this path.
- Backend: reuse schedule context and normalized scoring; return approximately three actionable candidates, reasons, capacity, conflicts/risks and a next action.
- Frontend: extend existing answer cards and focus action; preserve shortcuts.
- LLM: optional single explanation call on minimized deterministic facts, never ranking/calculating or generating calendar writes.
- Tests: variations, important versus merely first tasks, overdue/deadline <1 hour, dependencies, completed/waiting exclusion, no work, “Why?”, user isolation.

## B — “Fix my afternoon” — PARTIAL

- Existing: `intent.ts`, `assistant.ts` FIX_SCHEDULE, `replanning.ts`, `replanner.ts`, `/api/planner/replan`, planner UI.
- Works: proposes task moves around meetings; explicit separate apply API; version checks; calendar writes only during apply.
- Missing: actual afternoon/rest-of-day window, required/available/deficit numbers, travel buffers in placement, before/after plus working Apply/Reject directly in chat, protected-item follow-ups, refreshed context verification. Existing chat creates a proposal but omits its confirmation action ID.
- Backend: extend the existing replan algorithm with constrained windows, shared scores, protected commitments, buffer reservations and strict deadline handling; reuse action storage/application, add rejection and stale-context protection.
- Frontend: compact before/after review with explicit Apply/Keep current plan.
- LLM: explain the computed proposal only; user corrections rebuild it deterministically.
- Tests: overloaded/free afternoon, fixed/all-day events, travel buffers, dependencies, no writes before approval, reject/approve/replay, changed calendar, “Don’t move the dentist/that meeting”.

## C — Driving / evening briefing — MISSING (dedicated experience)

- Existing reusable components: `briefing.ts`, `schedule-intelligence.ts`, `conversational-agent.ts`, `voice-dock.tsx`, `/api/speech`, conversation tables.
- Works: generic briefing, typed input, recognition and TTS.
- Missing: audio-first selection of completed important work, unfinished critical work, remaining commitments, tomorrow’s first commitment and immediate risks; concise bounded spoken response; deterministic contextual follow-ups.
- Backend: a read-only executive operation over the same schedule read-model and completed-today tasks; keep the spoken version short and details expandable.
- Frontend: shortcut, existing playback and text fallback, respect voice preference; no new voice pipeline.
- LLM: optional concise wording on approved facts only; deterministic fallback if unconfigured/unavailable.
- Tests: content selection/bounds, empty day, tomorrow meeting, overlap/buffer risks, follow-ups, speech disabled/unavailable and no calendar mutations.

## D — “I have 45 minutes free” — MISSING (task-fit recommendation)

- Existing reusable components: `planner.ts` FIND_FREE_TIME estimates daily capacity, `scoreTasks`, TodayBoard focus timer, `startTask`.
- Missing: duration parsing, cap at next fixed commitment/buffer, fit ranking, explicit splittable/unsplittable behavior, variable-duration Start Focus Session, persistent timer across screens.
- Backend: reuse interval subtraction and scores; rank by priority/urgency/risk × fit × context. Add small fields on **existing Task** for explicit splittability/minimum chunk. Extend existing task API and work-session start, not a second model/API.
- Frontend: extract/reuse existing timer as a shared focus controller; support recommendation’s chosen duration and task details options.
- LLM: optional explanation, not task/window selection.
- Tests: arbitrary durations, next-meeting cap, ongoing meeting, too-long task, useful partial progress, unsplittable exclusion, deadline, time zones/DST, authenticated focus start.

## Implementation plan and boundaries

1. Extend existing deterministic schedule/replan helpers and shared read-model; no duplicate scheduling engine.
2. Add a thin executive orchestrator over those helpers and the existing assistant action/memory architecture.
3. Add typed/validated recommendation data, approval/rejection and grounded follow-ups to `/api/assistant`.
4. Reuse the OpenAI Responses integration for one optional explanation call and the existing speech endpoint; minimize sent context.
5. Extract the existing focus timer, expose fit actions and before/after inside Ask Nexdo, and add only necessary Task fields.
6. Add deterministic and integration regressions, run the full suite on temporary SQLite, lint, typecheck and production build. Do not send real user context to OpenAI during automated tests or modify production calendars.

Known limits to disclose: saved-calendar freshness, assumed (not routed) travel buffers, browser microphone support, no automatic movement of external appointments, no inferred location or goals, heuristic rather than globally optimal scheduling.
