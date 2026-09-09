# Native Calendar

The Calendar tab opens Schedule. Schedule, Week, and Month use a single CalendarView, NavigationStack, selected date, filters, and loaded agenda. CAL1 and CAL1a are represented by one ScrollView. The shared TodayTopBar stays above that scroll view; the existing tab shell owns the composer and bottom navigation.

## Data and behavior

- Uses AppModel's existing APIClient and `/api/agenda?from=YYYY-MM-DD&days=N` (up to 42 days). Range responses are checked before display. Cancelled or superseded requests cannot replace the selected range. Failed refreshes retain data only for a matching range and show a retry action.
- Leaves Today's agenda range intact. Refreshes Calendar after AppModel updates, including task edits and assistant-approved changes.
- Uses the account timezone, existing ServerDate parsing/event overlap semantics, and Foundation Calendar arithmetic. Weeks start Monday; month grids start Sunday and include adjacent-month dates.
- Tasks appear on their scheduled date and, where different, their deadline date. Completed/cancelled tasks are excluded. Overdue means a due date before today in the account timezone, matching the server's calendar behavior. Recurring tasks use server-provided records; the client does not invent future occurrences.
- Schedule supports Next 3 days, Next 7 days, and This week (the week containing the shared selected date). Task/event and critical-only filters apply across modes. The backlog is the deduplicated set of open unscheduled or overdue tasks.
- Schedule Intelligence uses the existing today's snapshot, appointment count, available minutes, recommendation, and attention items. Its scope remains today even when browsing a different range; the review sheet labels this explicitly. Unavailable intelligence has an explicit fallback.
- Fix my schedule prefills AskNexdoView with the selected date and optimization request. Sending, sharing consent, and plan approval remain in the existing assistant flow.
- Tasks navigate to TaskDetailsView. Calendar events open a read-only native detail sheet with server start/end dates and timezone.
- Reuses the real shared weather and account header. The existing initials avatar and voice-unavailable explanation remain in use.

## Validation — September 7, 2026

- Full unsigned iOS simulator Debug build passed, both with and without the DEBUG preview compilation condition. The final unsigned iPhoneOS Release build also passed.
- All 28 Swift package tests passed, including four added Calendar tests covering account-timezone DST arithmetic, weeks crossing a year boundary, leap years and five/six-row month grids, and separate scheduled/deadline dates.
- Visually inspected Schedule on iPhone 17 Pro Max, Week on iPhone 15 Pro Max, and Month on the smaller QA simulator using debug-only fixture data.
- Simulator interaction verified: select September 15 in Month → Week displays September 14–20 with Tuesday selected → Schedule starts September 15. Fix my schedule opens Ask Nexdo with September 15 in its editable prompt.
- Debug previews require `SWIFT_ACTIVE_COMPILATION_CONDITIONS=DEBUG` and `-calendar-design-preview`; add `-calendar-week` or `-calendar-month` for the initial mode. They do not issue agenda requests or add production seed data.
- Live-account API compatibility, server-backed conflict results, task edits, assistant submissions, VoiceOver, larger accessibility text, and physical-device scrolling still require authenticated/device QA. No production data was mutated, backend deployed, or app uploaded.
