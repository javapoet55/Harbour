# Web Daily Plan and Account & Safety

## Daily Plan (My Day)
`src/components/daily-plan.tsx`, mounted under the My Day content (`today-board.tsx`). No server change.
- **Needs attention**: overdue tasks (start, else due date, already past; finished tasks excluded), oldest first, with **Reschedule overdue**.
- **Reschedule overdue**: pick a start time (default one hour ahead, account time zone). Tasks are placed back to back, each for its estimate (at least a minute), through the normal task save (`PATCH /api/tasks/:id` with date and time), so a schedule conflict is asked about as elsewhere. The run stops at the first failure; earlier moves stay saved and the message names the task. Same rules as the phones (`mobile/src/lib/rescheduleAll.ts`).
- **Weekly summary** (`GET /api/weekly-summary`): headline, completed/planned, completion %, overdue, focus time, per-day bars, top accomplishments; previous/next week (Monday to Sunday, never a future week).

## Account & Safety (Settings)
`src/components/account-safety.tsx`, in `src/app/settings/page.tsx`.
- **Change password** (`POST /api/auth/change-password`). Signs out every device, then goes to sign-in.
- **Report a bug** (`POST /api/feedback/bugs`): description only (no screenshot on the web), one id per report so a retry is not a duplicate; lists open reports (`GET /api/feedback/bugs?status=open`).
- **Delete account** (`DELETE /api/account`): permanent, needs the word DELETE typed.
- Already on the web before this change: Export my Nexdo data, Sign out everywhere, calendar connections (Google, Outlook).

## Not built
Closed-reports history, bug screenshots, Gmail/Moments email connection (comes with Moments), reschedule single task from the card (tap the task in My Day instead).

## Tests
`src/lib/daily-plan.test.ts`, `src/lib/account-safety.test.ts` (pure logic, no database).
