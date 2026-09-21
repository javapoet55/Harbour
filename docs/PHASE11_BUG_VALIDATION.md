# Phase 11 report validation — 19 September 2026

Reviewed all 20 entries in `nexdo-phase11-backend-bugs.xlsx`, Bugs!A2:K21.
The workbook cites `react-native-migration` at `ec834b8`. This review covers this
checkout's `main` at `0837810` plus the uncommitted fixes below. There is no React
Native/Android source in this checkout, so Android runtime claims are not marked
as reproduced. The original workbook was not modified.

No commits, pushes, deployments, production data writes, or configuration changes
were made. Production configuration checks were read-only and printed presence
and validity results, never credential values.

| ID | Verdict | Evidence and resolution |
| --- | --- | --- |
| 1 | Confirmed setup gap; activation pending | Read-only checks on **Harbour / production** found all three Moments Gmail OAuth variables missing. `emailConfigured()` in `src/server/moments/email.ts` therefore returns false. This is a deliberate 503 configuration guard, not an OAuth fallback bug. Calendar authorization cannot substitute for Gmail consent. Added exact setup steps to `docs/deployment.md`. Google client configuration and Gmail consent still need validation before enabling delivery. The workbook's separate `harbour-onsite` environment was not inspected. |
| 2 | Not a current production bug | `HARBOR_CREDENTIAL_ENCRYPTION_KEY` is present and matches 64 hex characters; `HARBOR_SESSION_SECRET` is present and meets the 32-character minimum. The guards in `src/lib/credentials.ts` and `src/server/session-key.ts` should remain. Do not replace a valid encryption key: existing encrypted tokens depend on it. This result applies to the inspected production environment, not every possible environment. |
| 3 | Setup gap; worker prepared, not activated | Production has automatic scheduling disabled. `listMoments()` advertises that to clients and `schedule()` rejects unattended timed email while disabled. The app is therefore not currently promising unsupported automatic delivery. Added `scripts/moments-worker.mjs` and separate-service instructions. It calls the protected tick every minute. Provisioning the worker, OAuth setup and enabling the flag remain release tasks after review. |
| 4 | Confirmed; fixed | No code previously wrote EXPIRED. Unconfirmed manual deliveries now expire after a **24-hour grace period**, both during the global worker sweep and the owner's Moments refresh (works with email scheduling disabled). Recent/future and already-sent plans are unchanged. Expired records remain visible under Scheduled / Action needed, but stop being active deliveries. The 24-hour policy is a concrete review choice, not a previously specified requirement. |
| 5 | Confirmed; fixed | `runJobs(provider, onlyID)` formerly scoped only the email selection. It now skips the global catalog/expiration sweep and scopes stale-claim recovery and annual creation to the requested plan too. Regression tests verify unrelated stale and annual plans remain untouched. |
| 6 | Backend capability gap; fixed here, Android integration pending | Added `plan` action `opened` for awaiting, manual Messages plans. It retains AWAITING_CONFIRMATION, records “Messages opened; delivery not confirmed,” and never sets sentAt. iOS's existing verified composer outcomes remain intact. Rejections cover automatic email and terminal plans. The RN caller must submit `opened` for an unknown composer outcome; that caller is not available in this checkout. |
| 7 | Confirmed retry gap; fixed | The existing iOS busy guard already blocks simultaneous taps, so ordinary double-tap duplication is overstated. But a request replay after a lost response had no stable key. New List now retains a UUID for its creation attempt; the route validates and passes it to the existing owner-scoped idempotent service. Tests cover replay, cross-user isolation, invalid keys, and old-client compatibility. |
| 8 | Copy ambiguity, not a repeat-algorithm bug; clarified | Weekly staples should reappear even if bought this week. Existing tests explicitly require all items to copy with checked=false. Updated the text to “copy all items into next week’s list, with every item unchecked.” No groceries are silently dropped. |
| 9 | Intentional list-specific sharing; clarified | Share tokens identify an explicitly shared list. Automatically carrying one to the next trip would expose newly added groceries without a new share action. The link remains on the original completed trip by design. Updated the share explanation and added a regression test. Next week's list requires its own link. |
| 10 | Configuration coupling, not inherently an incorrect model; isolated | Sharing OPENAI_MODEL is technically valid but makes wish behavior depend on assistant configuration. Added optional MOMENTS_DRAFT_MODEL, defaulting to gpt-4o-mini, with a test proving the assistant setting no longer overrides it. General assistant configuration is unchanged. |
| 11 | Partly confirmed; fixed editing trap | A historical birthday/anniversary date is valid input: annual occurrence calculation needs the original date (including Feb 29). Blanket past-date rejection would break that use case. Removed past-occasion-date rejection from managed editing, added explanatory editor copy, and retain future-time validation for actual delivery. Failed ordinary autosaves now keep the in-memory edits and error while allowing tab navigation. Active-schedule cancellation still requires confirmation. |
| 12 | Different dates can be legitimate; clarified | The header previously displayed **sendDate**, while Details displayed the **occasion date**. Those may differ when the user deliberately changes the delivery schedule. The header now says **Moment date** and uses the same value as Details. Schedule retains the independent delivery date/time. Existing date-change regression covers synchronization when the occasion date is edited. |
| 13 | Confirmed UI issue; fixed | Save Message now disables for a blank/whitespace-only or over-500-character base message. Existing model/server checks still validate recipient overrides and approval. |
| 14 | Confirmed stale UI state; fixed | Legacy Schedule Wish's disabled state previously depended on Date() without a clock-driven update. A one-second clock now updates it, and tapping submit rechecks the time immediately. The server still independently rejects a past request after network/permission delays. |
| 15 | Confirmed; fixed | The batch reschedule button now says “Reschedule 1 task” and uses “tasks” otherwise. |
| 16 | Confirmed SwiftUI List interaction issue; fixed | Adjacent automatic-style buttons can inherit the row action behavior. Plus and mic now have separate borderless buttons and 44-point frames. UI tests verify plus opens typed-item review without voice, and the mic separately opens Add by Voice. |
| 17 | Confirmed; fixed | Empty states now depend on filtered delivery plans, not on whether any Moments exist. Sent shows “No sent wishes yet”; Scheduled also gets an explicit empty state. |
| 18 | Portability copy issue, not incorrect iOS behavior; updated | Replaced user-facing platform-specific phrases in Moments and shopping voice with “Nexdo does not send Messages automatically,” “Open Settings,” or “your phone’s Settings.” Actual platform availability checks remain unchanged. RN copy still needs the same update in its own repository. |
| 19 | Unused view definitions confirmed; not missing core functionality | Today now intentionally uses `TodayQuickAccess`, which opens `ShoppingHome` and `ImportantMomentsView`. The earlier large cards and directory belong to the superseded layout; restoring them would undo the requested compact design and removal of See all. Repeating tasks remain editable through `TaskDetailsView`'s Repeat menu. Unreachable legacy views are a cleanup candidate, not evidence that these workflows fail. No obsolete screens were reintroduced or blindly ported. |
| 20 | Custom-event wiring gap confirmed; fixed | `FestivalAnalytics.record` previously wrote only OSLog, despite existing fixed event names and calls. It now also forwards those fixed names to the configured Firebase Analytics wrapper, without names, phone numbers, message text, or item data. A WKWebView bridge is not required for native SwiftUI events. The claim “no events ever” is broader than source inspection can establish; live Firebase ingestion and the separate Android SDK/configuration were not verified. |

## Review and release notes

- Gmail sending remains unavailable until OAuth configuration is supplied and tested.
- The worker is code-ready but not deployed. Keep automatic scheduling disabled until the worker is running reliably.
- The Android port must adopt the new `opened` result contract. No Android code was changed here.
- Review the proposed 24-hour unconfirmed-delivery expiration policy before release.
- No schema/table changes are required for these fixes.
- iOS changes require a rebuilt app. Backend code and the worker remain local until approval.

## Validation

- 70 focused backend tests passed across Moments, shopping and the shopping API route, using isolated test databases and mocked providers.
- TypeScript type checking passed.
- Eight targeted iOS UI regressions passed: empty Sent state, blank-message approval disabling, failed-autosave navigation with retained edits, date/header updates, successful tab autosave, separate typed-add/mic actions, list creation, and birthday schedule/Done navigation.
- Three Swift model tests passed: opened Messages status, copied-versus-sent status, and historical leap-day recurrence.
- Production build passed with `next build --webpack`. The default Turbopack build was blocked by the local environment's compiler-port restriction, not a TypeScript error.
- The final delivery-result change was rechecked with all 21 Moments integration tests and TypeScript.
- Firebase custom event forwarding compiles; live Firebase dashboard ingestion was not exercised.
- No real wishes were sent and no microphone recording was started by the UI tests.
