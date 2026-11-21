# Web My Day dashboard

The desktop My Day page (`/`, 768px and wider) follows the "Nexdo AI Productivity Dashboard" mockup.
Phone-width browsers keep the existing mobile layout (`src/components/mobile-day.tsx`).

## Where the code lives

| Piece | File |
|---|---|
| Dashboard | `src/components/my-day-dashboard.tsx`, `my-day-dashboard.css` |
| Data loading, task details, mobile layout | `src/components/today-board.tsx` |
| Side menu (account, active item, Nexdo AI card) | `src/components/app-shell.tsx`, end of `src/app/globals.css` |
| Scene art (hero wave, sunrise mountains, lighthouse) | `public/my-day/*.webp`, cropped from the illustration pack |

## Where each part gets its data

No endpoint was added or changed.

| Part | Source |
|---|---|
| Greeting name | `GET /api/me` |
| "N key commitments", Today's Focus | Day snapshot, `GET /api/schedule-intelligence?scope=today` (`commitments`, `appointments`); falls back to today's tasks and events from the agenda |
| Overdue count and list | `GET /api/agenda?days=7` (`overdue`) |
| To Do, In Progress, Completed (7d) | `GET /api/tasks`: INBOX + PLANNED, IN_PROGRESS, and COMPLETED with `completedAt` in the last 7 days |
| Today's Schedule | Snapshot `timeline`; falls back to the agenda |
| Priorities for Today | Today's open tasks from the agenda, critical and high first, then by time (top four) |
| This Week | The agenda's seven days; other weeks via `GET /api/agenda?days=7&from=…` |
| Upcoming (Next 3 Days) | The agenda's next three days |
| Search | Tasks from `GET /api/tasks` (title and notes) and the agenda's events, matched in the browser |
| Weather | `GET /api/weather` with the same fixed location as before (ZIP 94582) |
| Plan label in the side menu | `GET /api/billing` |

## What each control does

- **Ask Nexdo bar** and **Plan my day**: send the text to the existing assistant. On desktop My Day the
  bottom Ask dock stays hidden until a question is asked, then shows the answer with a close button.
- **Schedule an event**: opens the calendar's add form (`/calendar?add=1`). On the web that form
  creates a scheduled task; the web has no calendar-event creation yet.
- **Add a task**: the same Create New Task form as the Tasks page.
- **Focus time**: starts a 25-minute focus session on the top priority for today (or the first overdue
  task). Disabled when there is neither.
- **Plan My Next 3 Days**: opens `/planner`.
- **Stat tiles, View all, day buttons**: open Tasks or Calendar.

## Not in the mockup, or different from it

- The mockup's microphone in the Ask bar is left out (voice entry is hidden on the web).
- The mockup's "Plans & Projects" menu item is the existing "Plans and billing" page.
- The Inbox count badge and the red dots on Notifications are not shown: the web has no unread count
  to drive them.
- The old desktop "Your day, in focus" panel (conflict alerts, "What should I do next?") is no longer
  on the desktop page. It is still on the mobile layout.
- Sign out stays in the side menu.
