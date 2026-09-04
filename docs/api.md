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
| PATCH | `/api/tasks/bulk` | Update up to 100 owned tasks by status, priority, energy, or project |
| POST | `/api/assistant` | `{ transcript, confirmActionId? }` |
| GET | `/api/planner` | Tomorrow’s recommended plan |
| GET/POST | `/api/planner/replan` | Preview or approve continuous replanning changes |
| GET/DELETE | `/api/insights` | Consent-gated personalized predictions or telemetry erasure |
| GET/POST | `/api/notifications` | History; `{ action: tick \| ack \| test }` |
| POST | `/api/calendar/sync` | Idempotent external sync; cron bearer auth syncs all users and refreshes replans |
| GET/PATCH/DELETE | `/api/calendar/connections` | List, configure, or disconnect OAuth calendars |
| GET | `/api/calendar/oauth/:provider/start` | Start Google or Microsoft OAuth |
| GET | `/api/calendar/oauth/:provider/callback` | Complete calendar OAuth |
| GET/POST/DELETE | `/api/push-subscriptions` | Configure Web Push for the current device |
| PATCH | `/api/settings` | Time zone and preferences |
