# Important Moments — implementation and release handoff

Implemented September 16, 2026. No real emails/messages were sent during verification. Backend deployed to Harbour production on September 16, 2026 after explicit approval. Provider authorization and App Store release remain separate steps.

## What is implemented

- Today entry/card and Important Moment commitment count; dedicated Upcoming, Scheduled and Sent history, search/type/delivery filters, source/date labels, manual creation/editing, disable/snooze actions.
- Review Wish: editable 500-character draft, Warm/Personal/Short/Fun tones, optional personal context, explicit AI opt-in, regenerate, approve. Generation falls back to deterministic templates when AI is unavailable. Offline server errors retain the loaded screen and explain retry; there is no queued offline mutation.
- Choose Delivery: native Messages composer, Gmail, clipboard and native sharing. Messages results are recorded only on `.sent`; cancellation/failure are separate. Copied and Shared are not treated as Sent.
- Full email approval sheet shows sender, recipient, subject and exact approved body before submission.
- Schedule/confirmation/edit/cancel: UTC instants, IANA zones, recipient validation, future-time validation, one-hour reminders, yearly rules, notification permission recovery. Changes to a claimed send are rejected. Delivery snapshots are immutable: cancel and re-review to change the recipient/body.
- Yearly confirmed Messages wishes create next year's reminder plan; annual email delivery reuses the explicitly approved content and recipient. Feb 29 uses Feb 28 in non-leap years and preserves the original annual anchor. A nonexistent DST anniversary time requires review instead of guessing a time.
- Selected birthday import uses Apple's contact picker, avoiding bulk address-book access. Calendar import asks for full EventKit permission, then reads only the selected calendar and offers recurring birthday/anniversary title candidates for confirmation. Festival catalog requires explicit region/festival/date/recipient choices and never infers identity.
- Separate least-privilege Gmail OAuth (`openid email gmail.send`), AES-GCM-encrypted refresh credentials using the existing credential helper, reconnect errors, disconnect/revocation, account/data deletion integration.
- Durable delivery rows, optimistic atomic claims, request-id replay protection, immutable approved message snapshots, provider response IDs, bounded throttling retries (1/2/4 minutes, at most four attempts), and audit timestamps. Ambiguous network/provider failures and abandoned claims become UNCERTAIN, never automatically retried. Gmail has no send idempotency guarantee; a deterministic Message-ID is not represented as such.

## Architecture and files

| Area | Files |
| --- | --- |
| Portable models/date rules | `ios/Sources/NexdoCore/ImportantMoment.swift` |
| Repository/API orchestration, local notification replacement, owner-scoped routes, OAuth | `ios/App/ImportantMomentsStore.swift` |
| Today entry, list/review/delivery/schedule/confirmation/history UI | `ios/App/ImportantMomentsView.swift` |
| Manual editor, selected-contact/calendar import, explicit festival catalog | `ios/App/MomentEditor.swift` |
| Existing integration points | `ios/App/RootView.swift`, `NexdoApp.swift`, `TaskActionCoordinator.swift`, `TaskActionNotifications.swift` |
| Backend rules/storage/jobs | `src/server/moments/domain.ts`, `service.ts` |
| Gmail adapter and OAuth | `src/server/moments/email.ts` |
| API handlers | `src/app/api/moments/route.ts`, `email/callback/route.ts`, `tick/route.ts`, `src/app/api/account/route.ts` |
| Schema/migrations | Both Prisma schemas; `prisma/migrations/10_important_moments/migration.sql` (SQLite); `prisma/postgres/important-moments.sql` (Postgres) |
| Tests and isolated UI fixtures | `src/server/moments/moments.integration.test.ts`, `ios/Tests/NexdoCoreTests/ImportantMomentTests.swift`, `ios/Tests/MomentUITests/MomentUITests.swift`, `ios/App/ImportantMomentsPreview.swift` |
| Project configuration | Xcode project and shared Nexdo scheme; `.env.example` |

SwiftUI depends on the observable store, not Gmail/OpenAI/database implementations. The store reuses the app's authenticated APIClient. Native composer wrappers are reused. The server email provider is injected for tests; notification authorization is injectable. DEBUG previews intercept every API request with URLProtocol and are excluded from Release. No new analytics SDK: backend lifecycle events use existing metadata-free logging, without names, message bodies or recipient addresses.

## Database changes

New models: ImportantMoment, WishDraft, DeliveryPlan, MomentEmailAccount. All user data cascades on account deletion. ImportantMoment has a unique `(userId, sourceKey)` key; delivery plans have a unique idempotency key and a `(status, nextAttemptAt)` worker index.

**Apply the appropriate schema before deploying the new routes.** The repository's migration history is SQLite; do not apply its DATETIME migration to PostgreSQL. For the production PostgreSQL database, review/apply `prisma/postgres/important-moments.sql` using the existing deployment process after a backup. Then generate the PostgreSQL Prisma client and build. On September 16, 2026, the additive PostgreSQL migration was applied transactionally to Harbour production after verifying that all four new tables were absent. Existing tables/data were unchanged. Backend deployment completed after explicit approval: Railway deployment 7c6d94a9-b9c4-4f0b-ba21-f1c262297fb1. Tests apply SQLite migrations only to new isolated test databases.

## API contract

Every regular route uses the existing authenticated session cookie and checks user ownership. No client-supplied user ID is trusted.

| Method / endpoint | Contract |
| --- | --- |
| GET `/api/moments` | `{moments:[...drafts/plans,nextOccurrence], emailAccount:{email,status}|null, emailConfigured, automaticEmailEnabled}`; credentials never returned |
| POST `/api/moments` | `{operation, input?, id?}` dispatcher; operations below |
| DELETE `/api/moments` | Revoke email access and delete the user's moments/drafts/plans/email credentials; refuses active sends |
| GET `/api/moments/email/callback` | Validate signed, expiring OAuth state, exchange code, save encrypted refresh token; redirects to `nexdo://moments-email?status=connected|error` |
| POST `/api/moments/tick` | Worker only: `Authorization: Bearer <HARBOR_CRON_SECRET>`; no user-session fallback; `{processed}` |

POST operations:

- `save`: `input` = type (birthday/anniversary/festival/custom), title, firstName, phone, email, occurrenceDate (`YYYY-MM-DD`), timeZoneID, yearly, source, sourceKey. Optional envelope `id` updates an owned moment. Active deliveries must be cancelled before imported contact/body/date changes.
- `generate`: momentID, tone, personalContext, aiConsent -> `{draft,usedAI}`. Only approved first name, type, tone and context go to AI.
- `approve`: id (draft), body, approved:true -> `{draft}`. Draft state becomes READY.
- `schedule`: draftID, channel (email/messages/copy/share), recipient, scheduledAtUTC (ISO offset/Z), timeZoneID, automaticDelivery, reminderOffset (0/60), repeatYearly, idempotencyKey (UUID), sendNow (default false), approved:true -> `{plan}`. Replayed keys return the original plan; a draft can be claimed for only one active delivery. Automatic email requires connection and enabled worker; native SMS never permits automaticDelivery.
- `plan`: id, action (cancel/sent/failed/copied/shared/reschedule/retry/sendNow), optional scheduledAtUTC/timeZoneID. Sent is accepted from native Messages only, never client-reported email success. `sendNow` requires the explicit email approval UI.
- `visibility`: id, enabled, optional snoozedUntil; automatic plans must be cancelled first.
- `connectEmail`: -> `{url}` for ASWebAuthenticationSession.
- `disconnectEmail`: revoke provider authorization, cancel pending automatic jobs, remove credentials.

Errors: 400 invalid input/transition, 401 unauthenticated, 404 unowned/missing object, 409 stale/claimed/reconnect, 413 oversized request, 502 revocation/provider failure, 503 configuration disabled. Body is `{error}`. Native UI preserves errors and retry/reconnect paths.

## Configuration and permissions

- `MOMENTS_GOOGLE_CLIENT_ID`, `MOMENTS_GOOGLE_CLIENT_SECRET`, `MOMENTS_GOOGLE_REDIRECT_URI=https://<backend>/api/moments/email/callback`.
- Existing `HARBOR_CREDENTIAL_ENCRYPTION_KEY`, `HARBOR_SESSION_SECRET`, `HARBOR_CRON_SECRET`.
- Optional existing `OPENAI_API_KEY` and `OPENAI_MODEL` (defaults to gpt-4o-mini). No AI request without per-screen opt-in.
- Set `MOMENTS_SCHEDULER_ENABLED=true` **only after** a reliable external worker invokes the tick endpoint every minute. The UI disables scheduling auto-send otherwise. Delivery timing follows worker cadence/provider availability, not an exact-to-the-second guarantee.
- Enable Gmail API and configure/verify its OAuth consent screen for the send scope. Calendar OAuth credentials/scopes are intentionally separate. Gmail is the connected provider implemented here; Outlook is not implemented.
- Added `NSCalendarsFullAccessUsageDescription`; updated Contacts purpose text to describe explicitly saved recipient data. Existing notification permission and `nexdo` URL scheme are reused. No background-mode entitlement is needed for server email delivery.
- Review App Store privacy labels and the public privacy policy for saved recipient information and third-party AI sharing. Existing privacy manifest already covers names, email, phone and user content.

## Known limits / release gates

- The four new production database tables and backend routes are deployed. Production Gmail credentials, OAuth consent verification and the scheduled worker are not configured by this task. Native alone cannot enable automatic email.
- There is no native APNs delivery pipeline in this repository. One-hour/Messages reminders are local. Background automatic-email success/failure/reconnect push alerts are not implemented; current status appears when Nexdo refreshes. Do not advertise those remote push alerts yet.
- iOS permits a limited pending-notification budget. The app reserves space for existing task notifications and reports when later wish reminders need refresh. Reopen the app to replenish recurring reminders. Cross-device offline cancellation cannot withdraw an already delivered local alert; opening it rechecks the authenticated plan.
- Contacts/calendar imports are explicit, reviewed snapshots, not continuous background synchronization. Reimport selected contacts to update their details; cancel active wishes before updating. Deleted contact/calendar records do not silently change an approved recipient snapshot. Automatic source-change/deletion monitoring remains future work.
- Festival dates are user-confirmed; moving religious/lunar calendars are not guessed. The catalog creates individual recipient moments, not bulk contact groups. Group campaigns and automatic moving-festival date feeds remain future work.
- No offline write queue; failure is visible and the user can retry. No tracking SDK is added, and not every requested UI analytics event is instrumented.
- Provider acceptance means sent/submitted, not read or recipient delivery. Gmail may not reveal the outcome after connection interruption: check Sent mail before a new send. UNCERTAIN plans intentionally have no retry button.
- Native Messages send/cancel/failure outcomes, live OAuth reconnect, VoiceOver, large text, dark mode, iPhone 15 Pro Max/smaller devices and cold-start notification taps still require device QA. Simulator fixtures do not establish live provider delivery.

## Verification

Commands used:

```sh
npm test -- src/server/moments/moments.integration.test.ts
npm run typecheck
npm run lint -- src/server/moments src/app/api/moments
npm run build -- --webpack
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test --package-path ios
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test --package-path ios --filter 'moment|wishResults'
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild test -project ios/Nexdo.xcodeproj -scheme Nexdo -destination 'platform=iOS Simulator,id=192FA31B-A654-4D51-AC37-B9FA7100A33F' -derivedDataPath /tmp/nexdo-moments-build -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO
```

Focused verification: 15 backend tests, 3 native core tests and all 8 simulator UI tests passed. Backend type checking and scoped ESLint passed. Debug simulator and unsigned Release device builds passed; the production web build passed with webpack.

New backend tests cover persistence, duplicate import detection, AI success/fallback, approval/date/recipient safety, cross-account access, cancellation, simultaneous claims, provider response IDs, bounded retries, ambiguous/crashed delivery handling, yearly native-confirmation plans and idempotent replay. Native core tests cover leap dates, recipient timezone/day boundaries, DST dates and distinct copied/sent semantics. Simulator UI tests use an isolated in-memory backend and never send real messages.

Broader regression runs: 386 backend tests passed and 10 failed in five **unchanged** scheduling/executive files. The same 10 failures were reproduced from a separate clean archive of main. Swift core: 102 passed, one unchanged `overdueListUsesDeadlinesAndExcludesFinishedWork` failed; that failure also reproduces on clean main. These are existing regression gates, not a claim that the whole repository is green. Default Turbopack build stalled; the webpack production build succeeded.

## Manual QA before release

1. Migrate/deploy to staging; configure test Gmail OAuth and minute worker. Confirm configuration-disabled UI before enabling.
2. Create one moment; import only a chosen contact/calendar candidate; deny/limit/revoke permissions; confirm no bulk uploads. Verify duplicate reimport and missing contact birthday.
3. Generate with AI disabled/enabled/unavailable; edit, approve, go back, regenerate; validate the exact approved body is used.
4. Send/cancel/fail Messages on a physical iPhone. Confirm cancellation is not sent. Copy/share must remain distinct.
5. Send email to an owner-controlled test recipient after final approval. Revoke OAuth, reconnect, retry a confirmed failure. Simulate throttling and ambiguous timeouts without duplicate delivery.
6. Schedule both channels, terminate the app, execute server tick twice, reopen from a notification. Test wrong-account, cancelled and duplicate taps.
7. Edit/cancel before claiming; reject changes during sending; test annual leap dates/DST/user travel and account sign-out/deletion.
8. Validate Today counts, search, scheduled filters and sent history; check small screen, accessibility text, keyboard, VoiceOver and dark mode. Recheck Tasks/Calendar/Ask AI.

Provider references: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send and https://developer.apple.com/documentation/messageui/mfmessagecomposeviewcontroller.

## Production deployment verification — September 16, 2026

Railway Harbour production deployment `7c6d94a9-b9c4-4f0b-ba21-f1c262297fb1` reached SUCCESS. Public `/login` returned 200; unauthenticated `/api/moments` returned 401 with “Sign in required.” instead of the previous 404. The deployed Prisma client successfully queried all four new tables. No user account was impersonated and no real messages were sent. Signed-in device verification remains with the user. Gmail authorization and the scheduled worker remain unconfigured.
