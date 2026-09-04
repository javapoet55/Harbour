# Harbor API

All routes except `/api/auth/login` require the `harbor_session` cookie.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Email/password sign-in |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/me` | Current user and preferences |
| GET | `/api/agenda?days=3` | Tasks, events, overdue, waiting, unscheduled |
| GET/POST | `/api/tasks` | List or create a task |
| PATCH | `/api/tasks/:id` | Complete, cancel, reschedule |
| POST | `/api/assistant` | `{ transcript, confirmActionId? }` |
| GET | `/api/planner` | Tomorrow’s recommended plan |
| GET/POST | `/api/notifications` | History; `{ action: tick \| ack \| test }` |
| POST | `/api/calendar/sync` | Idempotent external sync |
| PATCH | `/api/settings` | Time zone and preferences |
