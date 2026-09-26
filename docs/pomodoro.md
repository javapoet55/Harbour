# Pomodoro

The tomato button in the native iOS bottom navigation opens Pomodoro. Task creation remains available from Tasks. Setup supports six categories, an optional 120-character name, 1–120 minutes of focus (25 by default), an automatic five-minute break, and completion sounds.

The timer uses absolute deadlines, so leaving the screen, backgrounding, or reopening does not reset it. Pausing freezes remaining time. A late return advances through elapsed focus and break deadlines rather than starting another full break. Stopping focus saves a stopped session; skipping or ending a break completes the session and records only the actual break time. Distraction-free mode keeps the visible focus screen awake; it does not change iOS Focus or notification settings. Timer alerts require the user's notification permission and use local notifications, so they work offline. A notification tap reopens Pomodoro for the matching signed-in account.

Sessions are cached per account in UserDefaults and synchronized through authenticated GET/PUT `/api/pomodoro`. The `PomodoroSession` database table uses a composite account/session key. Revision comparisons prevent delayed retries from replacing newer state. A request must name its expected account so a pending sync cannot write into a newly signed-in account. Database history returns the latest 100 sessions; the device retains its local history and pending writes. Signing out cancels that account's pending timer notifications.

The SQLite and PostgreSQL migrations both create the session table and index. Railway applies the migration through its existing pre-deploy migration command. No scheduler worker is required for the countdown or local notifications.

Verification: `PomodoroTests` in NexdoCore, `src/server/pomodoro/sessions.integration.test.ts`, and the two `testPomodoro…` simulator tests in MomentUITests cover clock transitions, pauses, restored deadlines, durable history, stale-write protection, ownership, setup, stopping, break completion, and navigation back to setup.
