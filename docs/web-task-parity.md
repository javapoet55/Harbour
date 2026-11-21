# Web Tasks: parity with the iPhone app

The signed-in web app (`src/`, served at app.nexdoapp.com) is being brought in line with the iPhone app
(`ios/`). This file tracks the Tasks module: what the phone does, what the web does, and what is left.

Reference sources on the phone: `ios/App/RootView.swift` (`TasksView`, `TaskEditor`),
`ios/App/TaskDetailsView.swift`, `ios/App/ProjectsView.swift`, and `ios/Sources/NexdoCore/`
(`TaskQuery`, `TaskDisplayOrder`, `TaskCreationSpacing`, `TaskSaveInput`, `Projects`). The Android port
in `mobile/` was used as the TypeScript reference for the shared logic.

## Where the web code lives

| Piece | File |
|---|---|
| Tasks page | `src/app/tasks/page.tsx` → `src/components/tasks-screen.tsx` |
| Folders tab, folder detail, folder editor | `src/components/task-folders.tsx` |
| Create New Task | `src/components/task-create-sheet.tsx` |
| Folder picker | `src/components/folder-select.tsx` |
| Task Details | `TaskDetailSheet` in `src/components/today-board.tsx` (shared with My Day) |
| Filtering, counts, sections, search | `src/lib/task-query.ts` (port of `TaskQuery.swift`) |
| Order, spacing, icons, labels, folders | `src/lib/task-list.ts` |
| Styles | `src/components/tasks-screen.css` |

No server changes were needed. The web uses the same endpoints as the phone: `GET/POST /api/tasks`,
`PATCH /api/tasks/[id]`, `GET/POST /api/projects`, `PATCH/DELETE /api/projects/[id]`.

## Feature comparison

| Feature on the phone | Web before | Web now |
|---|---|---|
| "Tasks — Turn intent into action." header, filter and search buttons | Different header, always-on search | Same |
| Tasks / Folders switch | Missing | Same |
| Add by Voice / Add Manually cards | One "Add a task" link | Add Manually only. Add by Voice is hidden on the web (see "Left to do") |
| Today / Tomorrow / This Week / All pills with counts | Pills without counts, different order | Same, counts from the same pass as the list |
| All: history range (All time, Last 2 weeks, This Month, Last Month) | Missing | Same |
| Day sections (Today, Yesterday, Tomorrow, date, Unscheduled) with item counts | Flat list | Same |
| Row: icon read from the title, time · estimate, folder name | Title, due label, minutes | Same |
| Complete from the row, restore a completed task | Complete only | Complete and restore |
| Search across all dates and statuses; closing restores the filters | Server search within the current filters | Same as the phone |
| Filters: Status (Open, Completed, All), Priority, Earliest due first, Reset | Status, Priority, When | Same as the phone |
| Manual order within a day, kept on the device per account | Missing | Drag a row, or use the up/down buttons; kept in the browser per account |
| Create New Task: name, notes, folder, Today / Tomorrow / Select Date, 15/30/45/60 or custom estimate | Name, date, time, fixed 30 minutes | Same as the phone, including the 15-minute spacing around existing tasks |
| Task Details: folder | Missing | Added |
| Task Details: Mark incomplete | Missing | Added |
| Task Details: smart reminder label (Bill, Expires, Renewal…) | Missing | Added |
| Task Details: estimate shows the task's real value | Showed 15 min for any value not in the list | Fixed |
| Task Details: title, priority, estimate, schedule, repeat, important reminders, steps, notes, focus session, Start task, research card | Present | Unchanged |
| Folders: grid with Open/Done counts and progress, search, four sorts | Missing | Same |
| Folders: New Folder, Edit Folder (name, six colours), Delete folder (tasks move to No Named Folder) | Missing | Same |
| Folder detail: tasks, search, status and priority filter, add a task into the folder | Missing | Same |
| No Named Folder | Missing | Same |

## Left to do

- **Add by Voice.** The phone runs a live voice session that creates the task (`AddTaskByVoiceView`,
  `/api/realtime/task-session`). The web has no live voice transport yet, so the Add by Voice card and
  the voice button in Create New Task are hidden. This belongs with the web real-time voice work.
- **Moments in the task list.** The phone shows birthdays and other Moments as all-day rows on their
  day. The web has no Moments module yet; add the rows when it is built.
- **Nexdo Action card** (call, message or email a contact from a task: `TaskActionCard`,
  `DeterministicTaskActionDetector`). It depends on the phone's contacts and composers. A web version
  needs a product decision (for example `tel:` and `mailto:` links).
- **Time read from the title when creating** ("Call Ana at 4 PM"). On the phone this comes from the
  same detector as the Action card, so it is deferred with it.

## Web-only behaviour that changed

- The old Tasks page had "Select tasks" with bulk actions (complete, start, waiting, priority, energy,
  cancel). The phone has no bulk actions, so the new page does not either. The Inbox and Waiting For
  pages still use the old list (`src/components/task-browser.tsx`) and keep bulk actions.
- Task Details now sends the schedule update only when the date, time or estimate changed. It used to
  resend the schedule on every save.

## Web-only decisions (Nov 20, 2026)

These apply to the web app only, not to the phone apps:

- Inbox, Waiting For, Notifications, Plans and billing, AI Planner, Insights and Import and export are
  hidden from the side menu and the mobile More menu. The pages still open by address.
- Tasks sits above Calendar in the side menu. The plan label under the account name is not shown.
- The side menu carries a "download Mobile App" prompt with the QR code from the nexdoapp.com hero
  (`public/nexdo-hero-tracked-qr.png`, copied from the marketing site's `assets/`). It is the hero's
  tracked code, so scans from the web app are counted together with scans from the marketing hero.
- The microphone in the Ask Nexdo bar and its "Voice is …" line are hidden (`SHOW_MIC` in
  `src/components/voice-dock.tsx`).
- The "Install Nexdo" banner is hidden (`src/components/install-prompt.tsx`).
- The Tasks card is centred on wide screens.

## Tests

`src/lib/task-query.test.ts` (41 cases, ported from the Android suite) and `src/lib/task-list.test.ts`
(19 cases) cover the filtering, counting, sectioning, ordering, spacing and folder logic.

## Tasks dashboard redesign (Nov 21, 2026)

The Tasks page was redesigned to the "Tasks" mockup. Illustrations in `public/tasks/` are cut from
the Nexdo Tasks UI asset pack using the pack's own transparency.

| Part | What it does | Data |
|---|---|---|
| Five counts | Total open, Overdue, To Do, In Progress, Completed (7d) | `GET /api/tasks`, `taskStats` |
| Tasks / Folders / Notes | Notes is new; Folders unchanged | `GET /api/notes` |
| List / Cards / Board | Board groups by To Do, In Progress, Waiting, Completed (7d) | in the browser |
| Add a task bar | Enter adds a 30-minute task today, spaced around existing tasks; the sliders open the full form; the sparkle sends the text to Ask Nexdo | `POST /api/tasks` |
| Chips and filters | All Tasks, Today, Tomorrow, This Week, High Priority, More Filters (status, priority); Sort by Due Date, Priority, Title or My Order (drag) | `taskSections` |
| Sections | Overdue, Today, Tomorrow, This Week (next 7 days), Later, Unscheduled, Completed; each collapses | in the browser |
| Task Insights | Monday-to-Sunday progress (completed of completed + open dated this week) and completions per day | `weeklyProgress` |
| Quick Add → Reminder | A five-minute reminder task that notifies at its time, saved like a voice reminder | `POST /api/tasks` with `reminder: true` (new) |
| Quick Add → Event | A calendar event, pushed to a connected calendar | `POST /api/calendar/events` |
| Quick Add → Note | A note, listed under the Notes tab, editable and deletable | `/api/notes` (new) |
| Focus Timer | The phones' Pomodoro: category, name, 5–120 minutes, auto 5-minute break, sound, pause, stop, history (Today / Week / Month / All Time) | `GET/PUT /api/pomodoro`, same session records as the phones |

Server changes: the `Note` table (migration `20261121000000_notes`), `GET/POST /api/notes`,
`PATCH/DELETE /api/notes/[id]`, notes in the account export, and `reminder: true` on `POST /api/tasks`.

The Pomodoro rules (`src/lib/pomodoro.ts`, `pomodoro-analytics.ts`) are the Android port's, with its
tests. The timer runs in the browser and keeps the phones' cache key (`nexdo.pomodoro.v1.<account>`),
so sessions sync both ways with the phone apps. "Distraction-free mode" uses the browser's screen
wake lock where available. The web has no background notifications for the timer; the chime plays
when the page is open.

## Reminder calls (Nov 21, 2026)

Quick Add → Reminder has a **Remind me by** choice: Pop-up, Email and Call (any combination, at least one).

- **Call**: at the reminder time Nexdo phones the user's verified number from the Twilio voice number and reads
  the reminder title and notes (Polly voice). Press 1 to hear it again, 2 to mark it done. A voicemail gets the
  message after the beep. A missed or busy call is retried once, 5 minutes later.
- The number is the one verified by the check-in code call (`/api/nutrition/phone`) or a verified caller ID.
  The sheet verifies it inline when needed.
- Data: `Task.notifyCall` and the `ReminderCall` table (one row per reminder time and attempt).
- Scheduling: `POST /api/reminder-calls/tick` (cron secret) every minute from `scripts/moments-worker.mjs`,
  which now also runs the pop-up/email reminder tick (`POST /api/notifications {action:"tick"}`). Before this,
  nothing called that tick with the cron secret, so the browser's attempts got 401 and scheduled pop-up/email
  reminders were not sent. Reminders that are more than 2 hours overdue and were never attempted are marked
  `EXPIRED` instead of being sent late.
- Twilio webhooks: `/api/reminder-calls/{twiml,gather,status}`, signature-checked like the Moments calls.
- Switch: set `REMINDER_CALLS_ENABLED=false` to turn calls off; otherwise they are on wherever Twilio is configured.
- Pop-up and Email choices are stored on `Task.notifyPush` / `Task.notifyEmail` and now narrow the account-wide
  notification settings for that reminder.
