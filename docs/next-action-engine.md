# Nexdo — What Should I Do Next Engine

## Phase 1 audit (before changes, 2026-09-06)

Overall: **PARTIAL**. Traced `VoiceDock → /api/assistant → parseIntent → handleExecutiveTurn → loadScheduleContext → buildExecutiveRecommendation → response → shared focus/task API`.

| Capability | Initial status | Actual implementation / gap |
| --- | --- | --- |
| Owned data and ranking | Implemented | `loadScheduleContext` loads owned tasks, dependencies, visible calendar events, saved preferences. `scoreTasks` calculates urgency, priority, cumulative deadline capacity and dependency impact. |
| Best next task now | Partial | Broad focus intent gives a daily top three; not a distinct contiguous-now decision. |
| Limited windows | Implemented | `FREE_WINDOW` subtracts commitments and buffers, supports saved splittable/minimum-session metadata. |
| Changed schedule | Partial | Each request reloads saved state; stale external calendars warn. No proactive next-action refresh or conversational recovery routing. |
| Comparing candidates | Missing | No safe candidate resolution/comparison in the executive path. |
| Switching cost | Missing | In-progress preference exists, but no active-focus/time-invested penalty. |
| Follow-ups | Partial | Owned `AssistantAction` context supports Why; not temporary exclusion/another recommendation. |
| Proactive next steps | Missing | Existing browser change events and shared focus timer are present; no opt-in recommendation cooldown. |
| Focus and approvals | Implemented | Shared timer, owned task validation, fresh fit check on recommended starts; schedule proposals require approval. |

Implementation will extend these services, not add another engine, task model, calendar model, AI client, API route, or memory table.

## Final report — NEXDO — WHAT SHOULD I DO NEXT ENGINE

**Overall status: PARTIAL → COMPLETED for the in-app next-action engine. Production-readiness sign-off remains qualified, not an unconditional DONE.** The five use cases run through actual owned database records and shared deterministic calculations. External freshness, closed-app delivery, and device voice limitations are listed below rather than represented as verified capabilities.

### Capability evidence

| Capability | Status | Implementation evidence | Tests / observed result | Remaining risk |
| --- | --- | --- | --- | --- |
| Best next action now | Implemented, locally verified | [Intent routing](/Users/sri/Documents/ChatGPT/Harbour/src/lib/intent.ts), [shared engine](/Users/sri/Documents/ChatGPT/Harbour/src/lib/executive-recommendations.ts), [owned context](/Users/sri/Documents/ChatGPT/Harbour/src/server/schedule-intelligence.ts) | `next-action.test.ts`: strongest urgent task, exact 13:31:12 availability; integration A; mobile Today button produced the saved proposal task | Depends on accurate saved estimates/calendar state |
| Limited 15/30/45/60-minute windows | Implemented, locally verified | Same engine and `FREE_WINDOW`; existing interval union and task splittability | Unit window matrix; integration B; mobile 45-minute request correctly clipped to 42 remaining minutes before the commitment/buffer | Transition buffer is assumed, not a travel route calculation |
| Recover after schedule changes | Implemented for saved changes; unknown verbal changes fail safely | Fresh `loadScheduleContext` every turn; existing `buildReplan` and approval flow | Integration D: extending a saved meeting by exactly 45 minutes removes immediate capacity; deletion reopens it; stale focus start returns 409 | A verbal late-meeting report without an updated end time asks for calendar correction/sync; it does not fabricate or silently edit a meeting |
| Compare competing priorities | Implemented, locally verified | `resolveComparison` resolves owned task titles and restricts the same engine to those IDs | Two-, three-intent, and four-candidate tests; mobile C excluded the unrelated admin task | Conservative title matching asks for clarification when ambiguous; no inferred meeting-prep relationship |
| Proactive next step | Implemented on Today while the app is open | `proactiveNextAction`, existing `useTodaySnapshot`, task/focus events and boundary timers | Integration E and mobile E: complete an occupied task → new budget suggestion; concurrency/cooldown/dismissal tests | Not a background push service; depends on external changes reaching the local database |
| Contextual Why / another / rejection | Implemented, locally verified | Existing user-owned `AssistantAction` context and options | Explicit context survives unrelated turns; rejection excludes choices temporarily, leaves task rows unchanged; new direct question resets exclusions | Context expires after 24 hours; no new long-term preference inferred from rejection |
| Switching protection | Implemented, locally verified | Shared priority factors plus operational focus state, setup/investment/project penalty | Current-focus, small-improvement, large-improvement and saved-threshold unit tests; authenticated focus-state tests | Setup cost is a disclosed product-policy estimate, not measured task-specific setup time |
| Focus action and mutation safety | Reused and strengthened | [Task PATCH](/Users/sri/Documents/ChatGPT/Harbour/src/app/api/tasks/[id]/route.ts), [shared focus provider](/Users/sri/Documents/ChatGPT/Harbour/src/components/focus-session.tsx) | Fresh fit validation, ownership/blocking checks, stale 409, old-token race tests; mobile countdown observed at 29:54 | Recommended starts check saved calendar freshness; this is not a transaction spanning Google and Nexdo |
| Schedule approval / external protection | Existing implementation retained | [Replanner](/Users/sri/Documents/ChatGPT/Harbour/src/server/replanner.ts), existing provider adapter | Complete suite includes accepted/rejected proposal and owned external-write tests in `executive-readiness.integration.test.ts` | No new live provider mutation performed in this audit; prior outbox/retry release risks still apply |
| LLM factual boundary | Reused, locally verified | [Conversational agent](/Users/sri/Documents/ChatGPT/Harbour/src/server/conversational-agent.ts) | Deterministic next-action integration requires zero network calls; existing tests reject invented model responses | Live OpenAI service not called in this validation |

### Existing architecture reused / modified services

- UI and voice continue through `VoiceDock → POST /api/assistant → runConversationalAgent → handleExecutiveTurn`.
- `loadScheduleContext` remains the shared owned read model: tasks, visible non-deleted calendar events, dependency status, preferences, consented duration predictions, mirror deduplication and freshness warnings.
- `scoreTasks` now exposes its already-calculated factors; `buildExecutiveRecommendation` uses them for next-action fit and switching arithmetic. No second priority or scheduling engine was introduced.
- `workWindows` accepts an optional alignment parameter. Replanning keeps its 15-minute alignment; immediate recommendations use exact current time. This fixed a real bug at non-quarter-hour times.
- `AssistantAction` stores recommendation context/exclusions. `UserMemory` stores explicit settings and a single operational focus/cooldown state. Runtime keys are excluded from general LLM context and cannot be overwritten through LLM memory updates.
- Existing task PATCH, learning consent, shared focus countdown, planner approvals, calendar adapters, metrics and logger remain in use.

### Scoring algorithm

Factors are normalized to 0–100 and configured in [next-action-config.ts](/Users/sri/Documents/ChatGPT/Harbour/src/lib/next-action-config.ts):

`BaseScore = 0.30 × importance + 0.20 × urgency + 0.20 × deadlineRisk + 0.15 × windowFit + 0.10 × dependencyImpact + 0.05 × context`

Weights are normalized by their sum when overridden through the engine configuration. Context averages the existing saved preference and energy/in-progress factors. Final score is `max(0, BaseScore − switchingCost)`. Blocked/waiting/completed/cancelled or non-fitting tasks cannot win. A deterministic title tie-break preserves stable ordering. Normal next-action output has one best action plus up to two alternatives; explicit comparisons can include all eight supported named candidates.

### Window fit

- The opening starts **now**, ending before the next saved appointment plus pre-buffer, reserved task block, or workday end. An ongoing commitment yields zero capacity.
- Explicit `I have N minutes` requests may use time outside working hours, but still cannot overlap saved commitments. The range is bounded to 1–480 minutes.
- A full task fits only when its duration fits the opening and any future deadline. An unsplittable oversized task is excluded.
- A splittable task can use a partial window only when its saved `minFocusMin` fits. Continuing an explicitly started focus session uses the remaining timer interval.
- Full fit factor: `0.8 + 0.2 × duration / available`; partial fit: `0.7 + 0.3 × session / estimate`. Both are scaled to 0–100.
- Current focus can be continued without counting its own reserved block as a competing commitment. Other appointments and task reservations stay protected.

### Deadline risk / slack

Reuses cumulative deadline capacity: working time before a deadline minus unioned calendar/buffer blocks and other reserved work, then minus competing work due by that deadline. Slack is capacity minus that task’s duration. Negative slack and overdue work receive high risk; blocked work remains excluded. Capacity is evaluated over the existing seven-calendar-day horizon; later deadlines have unknown slack, not invented capacity.

### Switching cost

For a different task during a verified active focus session:

`switchingCost = saved improvement threshold + 5 setup points + min(10, elapsed focus minutes / 2) + 5 when saved project IDs differ`

The default improvement threshold is 10, with saved user controls in Settings. Small score improvements do not displace current focus. A sufficiently important improvement can be recommended, but never automatically starts, moves or completes work. Active timer state is operational, expires for planning at its saved end, and is overwritten/cleared; learning history still requires personalization consent.

### Proactive logic

- Off by default. Enable **Settings → Notifications → Suggest my next action**.
- Re-evaluates after task/calendar data revisions, task updates/completions, focus completion/pause/stop/resume, returning to the page, and one-shot upcoming schedule boundaries.
- Boundaries include meeting/buffer end, reserved task end, deadline urgency thresholds, work/quiet hours, midnight, focus end and calendar freshness expiry.
- Suppresses outside work hours, during quiet hours or active focus, with stale calendars, without an eligible task, or with less than 15 usable minutes.
- Thirty-minute cooldown between new suggestions. The same task is suppressed for eight hours unless its score materially improves. An existing still-valid card can refresh without creating another notification/action/metric.
- Dismissal persists suppression. A transaction and compare-and-set claim prevent simultaneous requests from generating duplicate suggestions; the concurrency test proves one action is created.
- No new aggressive polling loop, LLM call, push/email/SMS message, or automatic schedule mutation.

### UI changes

- Added “What should I do next?” to Ask AI and an entry point inside Today’s existing snapshot.
- Opt-in Today card shows one task, duration, available window, reasons, **Start focus**, **Why this?**, and **Dismiss**.
- The older planning suggestion is not duplicated alongside an active next-action card.
- Added **Give me another one** and **I don’t want to work on that** follow-ups.
- Existing mobile drawer, structured responses, microphone, speech endpoint and focus timer are reused. Network errors remain visible; no false “enjoy the opening” message when capacity is zero.

### Database/schema and API changes

**No new tables or schema migration in this change.** Existing `splittable` and `minFocusMin` fields are reused.

- `/api/assistant`: same route/request contract; new `NEXT_ACTION` and `COMPARE_TASKS` intent handling and typed `executive.nextAction` result.
- `/api/schedule-intelligence`: existing POST gains `operation: next-action` and `dismiss-next-action`; existing GET and replan behavior retained.
- `/api/settings` and `/api/me`: explicit opt-in and switching-threshold settings through existing `UserMemory`.
- `/api/tasks/[id]`: focus response includes a per-start token; finish clears only the matching operational timer. Legacy consented work-session clients still work. Recommended starts revalidate the selected owned task against fresh context.

### Tests and validation

**254 tests passed across 26 files.** Added 50 cases: 33 in [next-action.test.ts](/Users/sri/Documents/ChatGPT/Harbour/src/lib/next-action.test.ts) and 17 in [next-action.integration.test.ts](/Users/sri/Documents/ChatGPT/Harbour/src/server/next-action.integration.test.ts). One old “work on next” routing assertion moved from daily focus to the new next-action matrix.

| Requested test coverage | Proof |
| --- | --- |
| 1–2 urgent / competing priorities | Strongest urgent task; cumulative overdue/deadline risk; comparison A/C |
| 3–7 15/30/45-minute, split / unsplit | Parametrized 15/30/45/60; minimum useful chunk; integration B |
| 8–11 negative slack / overdue / blocked / blocking | Cumulative slack assertions, status exclusion, dependency weight test |
| 12–14 imminent meeting / empty / full calendar | Pre-buffer clipping, work-hour boundary, zero-capacity tests |
| 15–16 current focus / switching suppression | Investment/project penalties, meaningful-improvement threshold, strong user preference |
| 17–19 mid-day change / late meeting / completion | Unit recalculation; authenticated integration D/E; manual D/E below |
| 20–22 rejection / Why / another | Explicit-context integration, no task-row mutation, exclusion reset |
| 23–24 time zones / DST | India timezone plus both Los Angeles DST transitions; existing time suite |
| 25–26 completed / cancelled exclusion | Status filtering and saved calendar tombstone integration D |
| 27–28 cooldown / user preference | Opt-in/out, quiet hours, focus suppression, dismissal, concurrency, saved switching threshold |

Validation outputs:

- [Full test suite](/private/tmp/nexdo-next-action.qo3lO2/tests.log): passed.
- [Lint](/private/tmp/nexdo-next-action.qo3lO2/lint.log): passed.
- [Type checking](/private/tmp/nexdo-next-action.qo3lO2/typecheck.log): passed.
- [Production Webpack build](/private/tmp/nexdo-next-action.qo3lO2/build-webpack.log): passed compilation, types, prerendering and build traces.
- [Default `npm run build`](/private/tmp/nexdo-next-action.qo3lO2/build.log): Turbopack stayed at optimized compilation without finishing; interrupted after several minutes. It is **not** reported as a pass. The package build command was not silently changed.

Temporary logs are local evidence, not durable CI artifacts. Unit and integration databases are isolated using the repository’s actual migrations. Existing regression suites also cover approval rejection/no mutation, accepted owned changes, provider adapter behavior and rejecting invented LLM facts.

### Manual end-to-end simulation

Ran the actual production build on local port 43219 with a separate migrated SQLite database, a dedicated fixture account, OpenAI disabled, and no connected external accounts. Used the interactive 440 × 956 iPhone frame through the browser UI; did not edit the owner’s real tasks or calendar.

| Scenario | Observed result |
| --- | --- |
| A — “What should I do next?” | Today’s entry point submitted the prompt automatically. Returned “Prepare for my meeting” first, two saved alternatives, 43 usable minutes. Why retained that task. |
| B — “I have 45 minutes. What should I do?” | Returned 42 minutes as wall time advanced, correctly clipped by the upcoming appointment’s buffer, with a 30-minute task. |
| C — “Should I prepare for my meeting or finish the budget?” | Compared exactly those two saved tasks, ranked preparation first; did not include the unrelated admin task or invent a meeting link. |
| D — meeting runs 45 minutes late | Extended only the isolated fixture meeting by exactly 45 minutes. Repeating A returned zero usable minutes and no Start focus action, with calculated deadline risk. |
| E — completion creates time | Reserved the current window with a fixture task, then clicked its completion circle. The proactive budget suggestion appeared automatically with Start focus / Why / Dismiss. |
| Action / context | Proactive Why returned the budget’s real reasons. Clicking Start focus changed only that fixture task and displayed the shared countdown at 29:54. Active focus suppressed the suggestion. The fixture timer was stopped afterward. |
| Final layout / dismissal | Rebuilt after cleanup; final mobile frame showed a single next-action card with 44 available minutes, no duplicate planning card. Dismiss removed the proactive card. |

### Files changed in this implementation

This list excludes unrelated edits already present in the worktree:

- [Policy](/Users/sri/Documents/ChatGPT/Harbour/src/lib/next-action-config.ts), [unit tests](/Users/sri/Documents/ChatGPT/Harbour/src/lib/next-action.test.ts)
- [Contract](/Users/sri/Documents/ChatGPT/Harbour/src/lib/executive-contract.ts), [engine](/Users/sri/Documents/ChatGPT/Harbour/src/lib/executive-recommendations.ts), [existing engine tests](/Users/sri/Documents/ChatGPT/Harbour/src/lib/executive-recommendations.test.ts)
- [Intent](/Users/sri/Documents/ChatGPT/Harbour/src/lib/intent.ts), [shared scoring](/Users/sri/Documents/ChatGPT/Harbour/src/lib/schedule-intelligence.ts), [working windows](/Users/sri/Documents/ChatGPT/Harbour/src/lib/replanning.ts), [focus types](/Users/sri/Documents/ChatGPT/Harbour/src/lib/focus-session.ts)
- [Executive adapter](/Users/sri/Documents/ChatGPT/Harbour/src/server/executive-companion.ts), [integration tests](/Users/sri/Documents/ChatGPT/Harbour/src/server/next-action.integration.test.ts), [context](/Users/sri/Documents/ChatGPT/Harbour/src/server/schedule-intelligence.ts), [assistant](/Users/sri/Documents/ChatGPT/Harbour/src/server/assistant.ts), [conversational agent](/Users/sri/Documents/ChatGPT/Harbour/src/server/conversational-agent.ts)
- [Schedule API](/Users/sri/Documents/ChatGPT/Harbour/src/app/api/schedule-intelligence/route.ts), [task API](/Users/sri/Documents/ChatGPT/Harbour/src/app/api/tasks/[id]/route.ts), [settings API](/Users/sri/Documents/ChatGPT/Harbour/src/app/api/settings/route.ts), [profile API](/Users/sri/Documents/ChatGPT/Harbour/src/app/api/me/route.ts)
- [Settings UI](/Users/sri/Documents/ChatGPT/Harbour/src/app/settings/page.tsx)
- [Today snapshot](/Users/sri/Documents/ChatGPT/Harbour/src/components/today-snapshot.tsx), [voice dock](/Users/sri/Documents/ChatGPT/Harbour/src/components/voice-dock.tsx), [shared focus provider](/Users/sri/Documents/ChatGPT/Harbour/src/components/focus-session.tsx)
- This audit/report document.

### Known limitations and most important next improvement

1. **Most important: durable external-calendar freshness and background delivery.** This engine reads synchronized records. External changes not yet synchronized cannot be known. Stale/unavailable connections warn, reduce confidence and disable recommended focus/proactive actions. Webhook renewal, sync retries and closed-app suggestion delivery require a separate production verification pass.
2. No actual iPhone microphone/Safari background-timer or live OpenAI/Google/Microsoft test was performed here. Browser-frame interaction and provider-adapter regression tests are not substitutes for those release checks.
3. Estimates are not verified remaining work. Partial focus does not automatically decrement task estimates or assume completion. Confidence values are heuristic (.9 fresh / .5 warned), not calibrated probabilities.
4. Context uses saved energy/project preference and active focus. Location, device capability, people blocked and meeting-prep links are not guessed. Comparison matching is intentionally conservative.
5. Day-level context is loaded fresh, not cached; queries are batched rather than per candidate. Large-backlog/large-calendar load testing is still needed. Existing deadline aggregation can be quadratic in the number of distinct deadlines; this change is not a performance certification.
6. Default Turbopack build completion and Railway/CI deployment remain unverified. No deploy, Git commit or push was made for this request.

The OpenAI documentation check reinforced retaining application-owned calculations and schema-validated candidate selection. Structured output constrains shape, not factual correctness; the existing exact-candidate explanation boundary remains in force. [Official Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs).
