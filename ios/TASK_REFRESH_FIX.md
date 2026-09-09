# Today creation and task refresh fix

New native tasks send `startAt` using the current instant. The existing create API persists this as the task's start/due date, placing the task in Today in the account timezone. The create response is inserted immediately into both the task store and the loaded agenda, and the task query selects Today and clears conflicting filters. Existing edits omit this default timestamp.

Task reads now have their own loading/error lifecycle and a 15-second request timeout. Task pull-to-refresh and Retry only fetch tasks. Foreground refresh launches calendar, recommendation, and weather reads independently, so their delay/failure cannot keep Tasks spinning or show a generic task-refresh alert. Task errors retain the last list and offer inline Retry. Duplicate reads coalesce; an older read cannot erase a successful save. Same-origin `/login` redirects from legacy deployments are treated as expired sessions without following redirects.

Existing undated tasks are not silently rescheduled. They remain in All until assigned a date in Task Details. New creations get today's date after installing this build.

Validation:
- iOS simulator Debug build succeeded.
- 29 Swift package tests passed (including concurrent Calendar tests already in the workspace). Task tests cover Today creation, account-zone day boundaries, start-time fallback, deadline precedence, and clearing conflicting filters.
- `bash ios/scripts/check-task-refresh.sh` compiles the actual AppModel with a mocked URL transport. It checks independent task completion while optional services stall, retained data/inline retry after failure, deduplication, stale-response protection after creation, timeout cleanup, and safe expired-session redirect handling.
- No authenticated production mutation or physical-iPhone installation was performed in this fix. API persistence must be checked after installing the build on the user's signed-in iPhone.
