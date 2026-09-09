# Calendar intelligence and bottom navigation fix

The native model invalidated schedule intelligence after task saves but did not reload it, and Calendar loaded only its agenda. Optional-service failures were discarded with `try?`, leaving the same unavailable card for loading, errors, and an invalidated result.

Changes:
- Calendar requests analysis independently on entry and pull-to-refresh; its card and conflict sheet provide loading/error/retry states.
- Concurrent analysis callers share one request. Analysis no longer depends on other optional requests completing.
- Task saves, completion, and approved assistant changes invalidate obsolete analysis and request an updated review.
- Failed reads preserve the last successful review with an explicit freshness warning. Responses from previous dates, edits, or sessions cannot replace current analysis; expired authentication resets the session.
- Calendar’s scroll viewport clips at its allocated bounds, and the bottom controls have a background extending through the home-indicator safe area.

Validation:
- Existing Xcode project Debug simulator build passed, iOS 26.5 SDK, iOS 17 deployment target unchanged.
- Five native mocked regression scenarios passed: concurrent refresh/loading; failure and retry; outdated server dates; save-triggered reload/obsolete response rejection; logout cleanup.
- Existing task-refresh (six scenarios) and voice-to-task (two groups) checks passed.
- Inspected the Calendar development fixture on iPhone 17 Pro Max: rows no longer draw below the bottom navigation, and the initial card offers a schedule review. The fixture does not fetch live analysis.
- `git diff --check` passed.

Production check: an unauthenticated GET to the configured intelligence URL returns HTTP 307 to `/login?scope=today`. This confirms the authentication redirect, not the authenticated endpoint response. No customer login, live analysis response, production deployment, or real task mutation was performed. Authenticated verification remains necessary.

Run the regression checks with `bash ios/scripts/check-intelligence.sh`.
