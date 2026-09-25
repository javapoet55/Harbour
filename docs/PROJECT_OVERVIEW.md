# Nexdo project overview

Last updated: 2026-09-15

Nexdo is an AI-assisted personal to-do and calendar app. People capture tasks in plain language or by voice, see their day alongside their real calendar, get a suggested next action, and receive reminders by push, email, or SMS.

The codebase started as "Harbor" / "Harbour", so those names still appear in package names, environment variables (`HARBOR_*`), cookies (`harbor_session`), and older docs. The product name is **Nexdo**.

This repository contains:

- **Web app and API**: Next.js (App Router, TypeScript), deployed on Railway.
- **Native iPhone app**: SwiftUI in `ios/`, using the same API.
- **Database**: PostgreSQL through Prisma.

---

## 1. Repository layout

| Path | What it holds |
| --- | --- |
| `src/app/` | Web pages (`page.tsx`) and API routes (`api/**/route.ts`) |
| `src/components/` | Web UI components (Today board, calendar, task browser, voice dock, landing and pricing pages) |
| `src/server/` | Server-side features: auth, tasks, calendar sync, assistant, planner, reminders, voice tools |
| `src/lib/` | Shared logic without database access: time zones, recurrence, schedule intelligence, intent parsing, credentials, HTTP errors |
| `src/providers/` | Outside services: email (SendGrid), SMS (Twilio), web push, Google and Microsoft calendars |
| `src/generated/prisma` | Generated Prisma client (not committed) |
| `src/middleware.ts` | Redirects signed-out visitors to `/login`, except public pages |
| `prisma/schema.prisma` | Production PostgreSQL schema |
| `prisma/migrations/` | PostgreSQL migrations, applied automatically before each Railway deploy |
| `prisma/deploy-migrations.mjs` | Migration runner used by Railway's pre-deploy step |
| `prisma/sqlite/` | Separate SQLite schema and migrations, used only by tests and the demo seed |
| `prisma/seed.ts` | Demo data (SQLite only) |
| `ios/` | Native SwiftUI iPhone app, shared Swift package `NexdoCore`, and checks |
| `public/` | Static files, including the web push service worker `sw.js` and app icons |
| `docs/` | Feature notes, audits, API and deployment docs |
| `design-references/` | iPhone design screenshots |
| `railway.json` | Railway build, pre-deploy, and start configuration |

---

## 2. Tech stack

| Area | Technology |
| --- | --- |
| Web framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4, custom CSS |
| Database | PostgreSQL (production and local development), Prisma 6 |
| Auth | Email/password with bcrypt, HTTP-only signed JWT session cookie (`jose`), Sign in with Apple |
| Validation | Zod |
| AI | OpenAI: `gpt-5.4-mini` (assistant, configurable with `OPENAI_MODEL`), `gpt-realtime-2.1` (live voice), `gpt-4o-mini-transcribe` and `gpt-live-transcribe` (transcription), `gpt-4o-mini-tts` (spoken replies) |
| Email | SendGrid |
| SMS | Twilio (optional) |
| Push | Web Push with VAPID keys (`web-push`) |
| Calendars | Google Calendar API, Microsoft Graph (Outlook) |
| Weather | Open-Meteo (no key needed) |
| Tests | Vitest (49 test files) |
| Hosting | Railway (app service and Postgres service) |
| iPhone | SwiftUI, iOS 17+, Swift 6 |

---

## 3. Running locally

Requirements: Node.js 22, a local PostgreSQL server.

```bash
npm install
createdb harbour
cp .env.example .env
```

In `.env`, set at least:

```
HARBOR_DATABASE_URL="postgresql://<you>@localhost:5432/harbour"
HARBOR_SESSION_SECRET="<long random string, e.g. openssl rand -hex 32>"
```

Then:

```bash
npm run db:migrate:deploy   # create tables through the migrations
npm run dev                 # http://127.0.0.1:43217
```

Open the app at **http://127.0.0.1:43217** (not `localhost`), because the session cookie and OAuth redirect URLs use that address.

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` | Generate the Prisma client and start the dev server on port 43217 |
| `npm run build` / `npm start` | Production build and start |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Vitest (uses a temporary SQLite database; never touches your Postgres) |
| `npm run db:migrate:deploy` | Apply PostgreSQL migrations |
| `npm run db:generate` | Regenerate the Prisma client for Postgres |
| `npx prisma migrate dev --name <change>` | Create a new migration after editing `prisma/schema.prisma` |

Notes:

- Restart `npm run dev` after Prisma schema changes or after running tests, since the tests regenerate the Prisma client for SQLite. Run `npm run db:generate` afterwards to switch it back.
- With empty provider keys, email, SMS, and push are faked locally. In production they fail instead of faking.
- The demo seed (`npm run db:seed`) only writes to a SQLite file and refuses Postgres. To get the demo account into Postgres, seed SQLite and use `prisma/import-sqlite-to-postgres.ts`.

---

## 4. Production and deployment

- **Host:** Railway, deploying the `user-auth-flow` branch.
- **Public URL:** `https://app.nexdoapp.com` (custom domain; the Railway hostname `https://harbour-production-f8a0.up.railway.app` still serves the same deployment)
- **Build:** `npm run build`
- **Pre-deploy:** `npm run db:migrate:deploy` applies pending migrations. The first time it finds a database created without migration history, it records the `20260914000000_init` baseline as already applied. A failed migration stops the deploy and keeps the previous version running.
- **Start:** `npm run start:railway`

### Scheduled jobs (not set up yet)

Two endpoints are meant to be called on a schedule with `Authorization: Bearer <HARBOR_CRON_SECRET>`:

| Endpoint | Body | Frequency | Purpose |
| --- | --- | --- | --- |
| `POST /api/notifications` | `{ "action": "tick" }` | Every minute | Sends due reminders |
| `POST /api/calendar/sync` | none | Every 5–15 minutes | Syncs connected calendars for all users and refreshes replanning proposals |

Until these jobs exist, reminders only send when someone clicks **Run reminder ticker** on the Notifications page, and calendars only sync when someone presses **Sync**. A Railway cron service running `curl` against these endpoints is the simplest setup.

See also [deployment.md](deployment.md).

---

## 5. Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `HARBOR_DATABASE_URL` | Yes | PostgreSQL connection URL |
| `HARBOR_SESSION_SECRET` | Yes in production | Signs session cookies. Production refuses values shorter than 32 characters or the development default. |
| `HARBOR_CREDENTIAL_ENCRYPTION_KEY` | Yes in production | 64 hex characters. Encrypts stored Google, Microsoft, and Apple tokens. Changing or losing it breaks existing connections. |
| `HARBOR_CRON_SECRET` | For scheduled jobs | Bearer token for the reminder and calendar sync jobs |
| `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME` | For email | Verification codes, reset codes, email reminders. The sender must be verified in SendGrid. |
| `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI` | For Google Calendar | OAuth web client. The redirect URI must match Google Cloud exactly. |
| `MICROSOFT_CALENDAR_CLIENT_ID`, `MICROSOFT_CALENDAR_CLIENT_SECRET`, `MICROSOFT_CALENDAR_REDIRECT_URI` | For Outlook | OAuth app registration |
| `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | For Sign in with Apple | `.p8` key contents stay server-side only |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | For AI and voice | Without a key, the assistant falls back to a built-in parser and voice features are unavailable |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | For web push | Generate once with `npx web-push generate-vapid-keys`. Changing them invalidates existing browser subscriptions. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | For SMS (optional) | SMS reminders |
| `NEXT_PUBLIC_APP_NAME` | No | Display name |

---

## 6. Database

Production uses PostgreSQL with migrations in `prisma/migrations/`. Tests use SQLite with a mirror schema in `prisma/sqlite/`. When changing the schema, update both `prisma/schema.prisma` and `prisma/sqlite/schema.prisma`, and add a migration for each.

Tables, grouped by area:

| Area | Tables |
| --- | --- |
| Accounts | `User`, `UserPreference`, `AuthIdentity` (Apple), `EmailVerificationToken`, `PasswordResetToken` |
| Tasks | `Task`, `Subtask`, `TaskList`, `Project`, `Category`, `Tag`, `TaskTag`, `TaskDependency`, `RecurrenceRule`, `TaskWorkSession` |
| Calendar | `CalendarConnection`, `CalendarEvent` |
| Reminders | `Reminder`, `NotificationAttempt`, `PushSubscription` |
| AI and voice | `AssistantAction`, `VoiceSession`, `VoiceTranscript`, `UserMemory` |
| Important Moments | `ImportantMoment`, `WishDraft`, `DeliveryPlan`, `MomentEmailAccount`, `GreetingCardImage` (finished card images, `bytea`) |
| Audit | `ActivityLog` |

Every query is scoped by `userId`. Deleted tasks and events are soft-deleted (`deletedAt`). `UserMemory` also stores small per-user settings such as the selected billing plan and focus state.

---

## 7. Web app pages

| Area | Pages |
| --- | --- |
| Public (no login) | `/welcome` (landing), `/pricing`, `/features/ai-assistant`, `/login`, `/signup`, `/verify-email`, `/reset-password` |
| Main app | `/` (My Day), `/inbox`, `/calendar`, `/tasks`, `/waiting` (Waiting For), `/planner` (AI Daily Planner), `/insights` (Personal Insights), `/notifications` (Notification Center), `/billing` (Plans and billing), `/import-export`, `/settings` |
| Not in the sidebar | `/voice`, `/onboarding` ("Let Nexdo fit your day"), `/mobile-preview` (iPhone layout preview) |

The public list lives in `src/middleware.ts`. Any other page redirects signed-out visitors to `/login`.

---

## 8. API

All routes require the session cookie except the auth routes, the OAuth callbacks, and the scheduled-job routes when called with the cron secret.

| Area | Routes |
| --- | --- |
| Auth | `POST /api/auth/register`, `/login`, `/logout`, `/verify-email`, `/verify-email/resend`, `/password-reset/request`, `/password-reset/confirm`, `/apple` |
| Account | `GET /api/me`, `PATCH /api/settings`, `DELETE /api/account`, `GET /api/export`, `POST /api/import` |
| Tasks | `GET/POST /api/tasks`, `PATCH /api/tasks/[id]` (edits, completes, cancels, reschedules), `PATCH /api/tasks/bulk` |
| Projects | `GET/POST /api/projects`, `PATCH/DELETE /api/projects/[id]`, `GET /api/projects/[id]/tasks` |
| Day and schedule | `GET /api/agenda`, `POST /api/availability`, `GET/POST /api/schedule-intelligence`, `GET/POST /api/protected-time`, `GET /api/weekly-summary`, `GET /api/weather` |
| Planning | `GET /api/planner`, `GET/POST /api/planner/replan`, `GET/DELETE /api/insights` |
| Assistant and voice | `POST /api/assistant`, `/api/speech`, `/api/transcribe`, `/api/realtime/task-session`, `/api/realtime/transcription-session`, `/api/realtime/tool` |
| Calendar | `GET/PATCH/DELETE /api/calendar/connections`, `POST /api/calendar/events`, `PATCH/DELETE /api/calendar/events/[id]`, `POST /api/calendar/sync`, `GET /api/calendar/oauth/[provider]/start`, `GET /api/calendar/oauth/[provider]/callback` |
| Important Moments | `GET/POST/DELETE /api/moments` (operations such as `save`, `generate`, `approve`, `schedule`, `greetingArtwork`, `greetingCardSave`), `GET/PUT/DELETE /api/moments/[id]/card`, `GET /api/moments/email/callback`, `POST /api/moments/tick` |
| Notifications | `GET/POST /api/notifications` (`tick`, `ack`, `test`), `GET/POST/DELETE /api/push-subscriptions` |
| Billing | `GET/POST /api/billing` |

Errors are returned as `{ "error": "<message>" }`, sometimes with a `code` such as `EMAIL_NOT_VERIFIED` or `SCHEDULE_WARNING`. See `src/lib/http.ts`.

---

## 9. Features

### Accounts and sign-in
- Email/password sign-up with a 6-digit emailed verification code. Codes expire after 24 hours, lock after 5 wrong tries, and a new code cancels the old one.
- Password sign-in is blocked for unverified accounts (`403 EMAIL_NOT_VERIFIED`) on web and iOS. Verifying the code signs the person in.
- Password reset with a 6-digit code that expires after 15 minutes, with the same 5-try lock. A completed reset also marks the email verified.
- At most 3 codes per account every 15 minutes for each code type.
- Sign in with Apple (iOS). Apple-verified emails count as verified.
- Account deletion revokes the stored Apple authorization first.

### Tasks and projects
- Tasks with priority, energy level, duration, due date, start time, notes, subtasks, tags, categories, dependencies, and recurrence (intervals, weekdays, end dates, occurrence limits, month-end safety, yearly).
- Projects with task counts and assignment.
- Search, filters, bulk updates, Waiting For and Inbox views.

### Calendar
- Google Calendar and Outlook connections through OAuth. Tokens are stored encrypted and refreshed automatically.
- Sync imports the primary calendar from 30 days back to a year ahead, including edits, deletions, and all-day events.
- Scheduled tasks are written to the connected calendar when "Allow Nexdo writes" is on. Deleted or cancelled tasks remove their event.
- Events created in Nexdo (the calendar screen, repeating events, and voice) are written to the same calendar tasks use: the default calendar if it accepts writes, otherwise the first connected calendar that does. Each repeat occurrence becomes its own provider event. `PATCH /api/calendar/events/[id]` and `DELETE /api/calendar/events/[id]` send edits and deletions to the stored provider event (`CalendarEvent.pushedConnectionId` / `pushedExternalId`). Sync skips these events when they come back from the provider, so they are not imported twice.
- A calendar write never blocks the save. Every event response carries `calendarPush` (`status`: `pushed`, `removed`, `not_connected`, `failed` or `partial`, plus `total`, `succeeded`, `calendarName`), a `message` to show, and a `warnings` entry when the write failed. Retrying a repeating event with the same `requestId` writes only the occurrences still missing. No invitations are sent.
- Client captions that still describe the old read-only behaviour must change: `ios/App/ProfileView.swift:370` and `mobile/src/lib/calendarConnections.ts` (`READ_ONLY_CAPTION`, on the React Native branch). The toggle label and its confirmation (`NexdoApp.swift:324`, `writesMessage`) mention only tasks and should name events as well.

### AI assistant and voice
- Ask Nexdo answers questions about tasks and schedule, and proposes changes (create, complete, reschedule, delete) that need approval before anything is saved. Without OpenAI it falls back to a built-in parser.
- Live voice conversations and voice task capture use OpenAI realtime sessions. Spoken replies use text-to-speech.
- AI data sharing requires consent in the apps.

### Planning and schedule intelligence
- AI Daily Planner recommends a plan without writing until approved.
- Continuous replanning detects meetings, delays, urgent work, and capacity risks, and proposes moves that need approval.
- Schedule intelligence finds conflicts, workload problems, and missing buffers, and suggests the next action.
- Protected time proposes focus blocks.
- Personalized predictions (opt-in) learn durations, completion, timing, and postponement patterns. Learned data can be erased.

### Reminders and notifications
- Reminders escalate from push to email to SMS and record every attempt.
- Notification Center has buttons to enable push and test push, email, and SMS.
- Morning and evening summary preferences.

### Important Moments
- Birthdays, anniversaries, festivals and get-well wishes with AI-drafted messages that the user approves before anything is sent. Email goes out from the user's connected Gmail; Messages, copy and share stay manual.
- Greeting cards: the app composes the card (AI artwork plus greeting and signature) and uploads the finished JPEG or PNG with `PUT /api/moments/[id]/card` (raw image body, or JSON `{ "data": "<base64>" }`; 1.5 MB at most). `GET` on the same path returns the current card and `DELETE` removes it; the moments list carries each moment's `card` metadata. Cards are stored in the database because Railway's filesystem is not persistent.
- An email delivery references the card saved when it was scheduled (`DeliveryPlan.cardId`). Saving the card again repoints deliveries that have not started sending, and deleting it takes it off them; a delivery already sending or sent keeps its image. The automatic email is then `multipart/related`: a text and an HTML alternative, plus the image. The HTML uses the wish layout (`src/server/email/wish-template.ts`), not the account-email template: the card first, the wish, the signature and a small "Sent with Nexdo" line, with no logo or support address. Without a card the email stays plain text. Messages, copy and share never include the card.

### Other
- Weekly summary of completed and planned work.
- Weather on Today (Open-Meteo).
- Plans and billing lets people choose Free, Pro, or Max, but **no payment provider is connected**. The choice is only saved.
- Import tasks (JSON, up to 500) and export all tasks, projects, and preferences as JSON.

---

## 10. iPhone app (`ios/`)

- SwiftUI app with four tabs: Today, Tasks, Ask AI, Calendar, plus sign-in, account, and reminder action screens (about 32 unique screens).
- `ios/Sources/NexdoCore/` holds shared logic and the API client. `ios/App/` holds the screens and app state (`AppModel`).
- The production API URL is hardcoded in `ios/App/NexdoApp.swift` and `ios/App/ProfileView.swift`.
- Building requires full Xcode 26+. The package smoke checks run without Xcode: `swift run --package-path ios NexdoCoreChecks`. The email verification checks run with `bash ios/scripts/check-email-verification.sh`.
- Not yet on TestFlight.

A React Native (Expo) replacement is planned. See [IOS_TO_REACT_NATIVE.md](IOS_TO_REACT_NATIVE.md).

---

## 11. Testing

- `npm test` runs Vitest against a fresh temporary SQLite database created from `prisma/sqlite/migrations`.
- Two tests in `src/server/executive-readiness.integration.test.ts` (assistant follow-up context and legacy approval replay) were already failing before the September 2026 auth work.
- Calendar and provider tests use recorded responses. No automated test runs against live Google, Microsoft, SendGrid, or Apple.
- iOS: see section 10. The other `ios/scripts/check-*.sh` scripts do not compile on a Mac without Xcode, because `AppModel` uses UIKit.

---

## 12. Known gaps and follow-ups

| Area | Gap |
| --- | --- |
| Operations | Scheduled reminder and calendar sync jobs are not set up (section 4). |
| Calendar | Moving a task's event in Google updates only the imported event, not the task. The next edit in Nexdo writes the old time back. |
| Calendar | A task and its own calendar event both appear in the web Today and Upcoming lists. |
| Calendar | Removing a task's time leaves its old event in Google. |
| Calendar | A failed token refresh does not mark the connection `status = error`. |
| Calendar | Disconnecting does not revoke Nexdo's access at Google. |
| Calendar | Only the primary calendar syncs. Microsoft Outlook is untested against the live service. |
| Calendar | Changes made in Google or Outlook to an event created in Nexdo are not pulled back; the next Nexdo edit overwrites them. An event deleted in the provider is written again on the next Nexdo edit. |
| Calendar | Neither app has event edit or delete screens yet; `PATCH/DELETE /api/calendar/events/[id]` are server-only so far. Event edits skip the schedule-conflict check. |
| Calendar | A repeating event is written as individual provider events, not a provider recurring series, so it cannot be edited as a series in Google. |
| Google OAuth | The Google Cloud app is in Testing mode: listed test users only, and connections expire after 7 days. Public launch needs Google verification (own domain, privacy policy, demo video). |
| Accounts | New web accounts default to `America/Los_Angeles` instead of the browser's time zone. The iOS app syncs the device time zone on sign-in. |
| Accounts | Failed email sends still count toward the 3-codes-per-15-minutes limit, and a blocked resend looks like a success. |
| Email | `support@pgrentalapp.com` is single-sender verified. Domain authentication (SPF/DKIM) in SendGrid is recommended to avoid spam folders. |
| Security | No HSTS header is sent. HTTPS depends on Railway's redirect. |
| Errors | Unhandled server errors log only the error type, not the message. |
| Billing | No payment provider. |
| Docs | [architecture.md](architecture.md) still describes the old home-services monorepo and SQLite setup. |

---

## 13. Other docs

| Doc | Topic |
| --- | --- |
| [deployment.md](deployment.md) | Deployment steps and production requirements |
| [api.md](api.md) | Older API summary |
| [security.md](security.md) | Data handling and token encryption |
| [architecture.md](architecture.md) | Assistant request path and predictions (partly outdated) |
| [next-action-engine.md](next-action-engine.md) | Next action engine |
| [projects-feature.md](projects-feature.md) | Projects |
| [TODAY_ACTION_QUEUE.md](TODAY_ACTION_QUEUE.md), [TASK_TO_ACTION_V1.md](TASK_TO_ACTION_V1.md) | Today action queue and task actions |
| [WEEKLY_SUMMARY_INTERACTIONS.md](WEEKLY_SUMMARY_INTERACTIONS.md) | Weekly summary |
| [executive-companion-production-readiness.md](executive-companion-production-readiness.md) | Production readiness audit |
| [IOS_TO_REACT_NATIVE.md](IOS_TO_REACT_NATIVE.md) | SwiftUI to React Native migration plan |
| `ios/README.md` | iPhone app build and release gates |
