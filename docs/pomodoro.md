# Pomodoro

The tomato button in the native iOS bottom navigation opens the Pomodoro dashboard. Overview offers Start Focus Session or Return to Timer; the timer’s back arrow returns to the dashboard. Task creation remains available from Tasks. Setup supports six categories, an optional 120-character name, 1–120 minutes of focus (25 by default), an automatic five-minute break, and completion sounds.

The timer uses absolute deadlines, so leaving the screen, backgrounding, or reopening does not reset it. Pausing freezes remaining time. A late return advances through elapsed focus and break deadlines rather than starting another full break. Stopping focus saves a stopped session; skipping or ending a break completes the session and records only the actual break time. Distraction-free mode keeps the visible focus screen awake; it does not change iOS Focus or notification settings. Timer alerts require the user's notification permission and use local notifications, so they work offline. A notification tap reopens Pomodoro for the matching signed-in account.

Sessions are cached per account in UserDefaults and synchronized through authenticated GET/PUT `/api/pomodoro`. The `PomodoroSession` database table uses a composite account/session key. Revision comparisons prevent delayed retries from replacing newer state. A request must name its expected account so a pending sync cannot write into a newly signed-in account. Database history uses account-scoped cursor pagination in batches of 100. The device loads all pages for complete All Time analytics and retains local history and pending writes. Signing out cancels that account's pending timer notifications.

The SQLite and PostgreSQL migrations both create the session table and index. Railway applies the migration through its existing pre-deploy migration command. No scheduler worker is required for the countdown or local notifications.

Verification: `PomodoroTests` in NexdoCore, `src/server/pomodoro/sessions.integration.test.ts`, and the two `testPomodoro…` simulator tests in MomentUITests cover clock transitions, pauses, restored deadlines, durable history, stale-write protection, ownership, setup, stopping, break completion, and navigation back to setup.

## Dashboard and insights

Overview filters Today, This Week, This Month, and All Time using the device's local calendar and time zone. Focus and break bars sum recorded time by the session start date; pauses are excluded and stopped sessions contribute only their actual focused time. Day charts use three-hour buckets, week/month charts use days, and All Time uses months. Sessions groups all history by day with collapsible groups, completion/stopped/in-progress indicators, and a details sheet. Insights uses a category donut and an independently selectable trend period; tapping or dragging the trend selects a bucket.

Focus Rate is completed focus phases divided by completed or stopped focus phases. An ongoing focus phase is excluded; an active break means its focus phase is already complete. Comparisons use the previous full calendar period. Empty periods show no invented percentages. The design's Time Saved card is replaced with measured Break Time because no counterfactual time-saving baseline exists. About these metrics explains these definitions in the app.

Analytics tests cover midnight and daylight-saving boundaries, period comparisons, stopped/paused time, duplicate revisions, and older records. API tests exercise stable pagination beyond 100 sessions and account isolation. Simulator tests cover all three screens, filters, session details, empty states, and the existing focus flow.
