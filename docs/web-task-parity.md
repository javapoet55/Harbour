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
| Add by Voice / Add Manually cards | One "Add a task" link | Same cards. Add by Voice opens the web Ask AI voice dock (see "Left to do") |
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
  `/api/realtime/task-session`). The web has no live voice transport yet, so the card opens the existing
  Ask AI voice dock. This belongs with the web real-time voice work.
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

## Tests

`src/lib/task-query.test.ts` (41 cases, ported from the Android suite) and `src/lib/task-list.test.ts`
(19 cases) cover the filtering, counting, sectioning, ordering, spacing and folder logic.
