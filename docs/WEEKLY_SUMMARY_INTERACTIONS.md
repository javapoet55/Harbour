# Weekly Summary interactions — September 9, 2026

## Changes

- Completed and overdue metric cards push a task list in the existing navigation stack. The list opens on the tapped metric and also offers Planned, Completed, and Overdue filters. Task rows open the existing TaskDetailsView. The app's bottom navigation is retained.
- `/api/weekly-summary` now includes `taskGroups` containing the same planned, completed, and overdue task sets used to calculate the metrics. The query remains authenticated and account-scoped. Details include the editable task fields, subtasks, and recurrence so opening an older task does not depend on the current Tasks cache.
- Returning from a task list or accomplishment keeps the selected summary week.
- Replaced the report's lazy vertical stack with a regular stack. Removed the chart's geometry/gesture overlay; the chart does not hit-test. Accessible day buttons below it select daily values without intercepting report swipes. The chart keeps a fixed height, and the navigation bar is explicitly visible.

## Metric semantics

No cohort/count rules changed. Planned uses startAt, falling back to dueAt, within the selected account-local Monday–Sunday week. Completed is the subset completed in that week before the report cutoff. Overdue is the subset due before the cutoff without a completion before that cutoff. The cutoff is now for the current week and the next Monday boundary for earlier weeks.

Historical results reflect the available task records: later scheduling edits, deletion, and missing historical state cannot be reconstructed. A task counted as overdue in an earlier week can now be completed; the list explains this and displays its current recorded status. Lists use the report snapshot until the user refreshes the report.

## Validation

- 16 targeted Vitest checks pass: weekly rules and authenticated route tests, including task-list/count agreement, selected-week membership, isolation from another account, overdue tasks completed later, and empty weeks.
- Four Swift WeeklySummaryTests pass: account timezone, week/DST boundaries, task-group decoding, and backward compatibility with older servers.
- TypeScript typecheck passes. Debug iOS simulator build passes with signing disabled.
- Interactive simulator verification was attempted but is not established: the simulator initially displayed a black screen and did not respond to Home. A non-erasing restart restored Home and installation of the new build succeeded, but app launch then stalled with a black screen and no Nexdo process running. The stalled launch command was stopped. Scrolling, back/tab navigation, and metric/detail navigation still need runtime confirmation on a functioning simulator or device.

## Local reproduction

Launch a Debug build with `-weekly-summary-preview` for an isolated in-memory sample account (3 completed of 8, 5 overdue). Open Weekly Summary from Today. Swipe starting on the chart to reach Top accomplishments and the planning button; verify Back and all bottom tabs remain responsive. Tap Completed and Overdue, compare list counts, open a task, and return. Select a previous week before opening details and confirm that week remains selected on return. Repeat with large text and a smaller iPhone.

All requests from this preview transport remain local; unimplemented operations return an error. Release builds exclude the preview.

Follow-up: the Debug configuration was missing the `DEBUG` compilation condition. This is now corrected. On September 9 the isolated fixture launched, both metric drilldowns displayed the expected 3/5 counts, task details opened/closed, and back navigation worked. Full scrolling verification is still incomplete; see `KEYBOARD_TIMEOUT_DIAGNOSIS.md`.

## Rollout

The backend update and a new iOS build are both required for task drilldowns. Deploy the additive backend change first. No database migration is required. An older backend still decodes, but task drilldowns show an unavailable state rather than inventing a list from cached tasks. Nothing was deployed or published in this task.

## September 9 footer visibility correction

Removed the visible metrics-explanation disclosure at the user's request. Moved the planning action into a reserved footer with wrapping text for Dynamic Type. Simulator verification showed that an inset alone still overlapped the custom tabs, so the shared tab shell now allocates a separate vertical layout row for its existing tab bar and focus strip. Navigation content has the remaining viewport instead of relying on propagation of an outer safe-area inset.

The Debug simulator build passed. On the iPhone 17 Pro Max simulator, the complete planning button was visible above the tabs, and tapping it opened Ask Nexdo with the selected summary and following week's dates. No AI request was submitted. These layout changes require a new iOS build only; they add no backend requirement beyond the earlier task-drilldown change.
