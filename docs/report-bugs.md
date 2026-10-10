# NexDo Report Bugs

Settings → Report Bugs opens an introduction, issue form, optional screenshot preview, sending state and receipt. Shake is opt-in per signed-in account and is stopped in the background or during reporting. The shake gate has an eight-second debounce. The device preference survives sign-out and is not shared between accounts.

The form sends only its allowlisted diagnostic fields and user-entered description. The screen ID is a static route category, never a task title or URL. Screenshot capture runs only after explicit consent, hides the report overlay, and captures the retained underlying screen. Screens with visible secure text fields refuse capture. Retake asks again; Remove deletes the in-memory image. No screenshot is written to disk by the app. User review is still necessary: screenshots may contain visible personal information. Known credential patterns in descriptions are redacted server-side; arbitrary free text cannot be reliably classified as a secret.

An ambiguous failed submission is immutable: Retry reuses its UUID and original content. A received retry returns the same reference without another report. Closing a draft asks before discarding. Content is kept in memory during failure, not across app termination.

## Backend and release prerequisites

- Apply `20261010120000_bug_reports` using the existing migration workflow. It adds the BugReport relation/outbox to Feedback. `stars = 0` identifies unrated bug reports; existing feedback still requires 1–5 stars at its endpoint. Admin feedback labels zero as Bug report.
- Backend must have the existing `HARBOR_CREDENTIAL_ENCRYPTION_KEY` (32-byte hex), email provider configuration, `HARBOR_CRON_SECRET` and `ADMIN_APP_URL`.
- Update the existing persistent Moments worker along with the backend. It calls `/api/feedback/bug-tick` for delivery and retention, using the existing cron secret. No in-process web timer is used.
- Support mail goes only to `support@nexdoapp.com`. Screenshots are encrypted, not email attachments. Email contains a link through the standalone admin app’s authenticated screenshot proxy; support needs existing admin access. If `ADMIN_APP_URL` is absent, no screenshot link is emailed. No public screenshot URLs are created.
- Screenshot bytes are decoded, limited, re-encoded to JPEG without metadata and encrypted. Screenshot reads expire after seven days even if the worker is down. Worker deletes screenshot bytes after seven days and reports after 90 days. Database backups and support mailbox retention follow the operator's separate retention policy.
- Monitor tick availability and pending deliveries. Delivery uses a five-minute lease and a 15-minute retry delay. Email is at-least-once: a process crash after provider acceptance can produce a duplicate email with the same reference. Stored reports remain idempotent.
- No Jira integration/configuration was found in this repository. No Jira issue creation was introduced or claimed; the existing feedback/email infrastructure is reused.
- Verify one real support delivery in staging and exercise physical-device shake before release. Automated tests use a mock email provider and a deterministic UI submission fixture; they do not send external email.

Authentication is required. Reports are limited to five new reports per account per day and 30 HTTP attempts per hour. API accepts at most 2,000 UTF-16 description units and a bounded request/image. Metadata has a strict allowlist. Do not enable payload logging on these endpoints.

## Validation commands

- `npx vitest run src/server/feedback/bugs.integration.test.ts src/app/api/feedback/route.test.ts src/app/api/feedback/persistence.integration.test.ts`
- `npm run build` (regenerates PostgreSQL Prisma client after isolated SQLite tests)
- `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test --package-path ios --filter bug`
- `xcodebuild -project ios/Nexdo.xcodeproj -scheme Nexdo -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max' -only-testing:NexdoMomentUITests/BugReportUITests test`

Artwork uses the supplied raster atlas unchanged, with native viewport clipping; fonts and controls use SF Pro/SF Symbols. The supplied atlas contains small illustrations, despite larger dimensions printed in its legend. Original separate high-resolution assets would improve enlarged artwork. No screenshot analysis or external image service is used.

## Changed files for this feature

Native app and assets:

- `ios/App/BugReportView.swift` — five states, consent/preview/actions, adaptive layout, DEBUG test fixtures.
- `ios/App/BugReportCoordinator.swift` — account-scoped shake preference, debounce, original-screen capture, lifecycle and route identifiers.
- `ios/Sources/NexdoCore/BugReport.swift` — allowlisted transport types, draft/immutable retry state, shake gate.
- `ios/App/NexdoApp.swift` — authenticated submission method.
- `ios/Nexdo-Info.plist` — motion-purpose description.
- `ios/App/ProfileView.swift` — Report Bugs entry above Change password.
- `ios/App/RootView.swift` — lifecycle, route tags and test entry points. Concurrent Today-screen changes in this shared file were preserved.
- `ios/App/WellnessChooserView.swift` — module screen identifiers.
- `ios/Media.xcassets/bug-report-pack.imageset/Contents.json`
- `ios/Media.xcassets/bug-report-pack.imageset/pack.png`
- `ios/Tests/NexdoCoreTests/BugReportTests.swift`
- `ios/Tests/MomentUITests/BugReportUITests.swift`

Backend, admin and storage:

- `src/server/feedback/bugs.ts` — validation, redaction, encryption, idempotent persistence, delivery outbox and retention.
- `src/server/feedback/bugs.integration.test.ts`
- `src/app/api/feedback/bugs/route.ts` — authenticated bounded submission endpoint.
- `src/app/api/feedback/bug-tick/route.ts` — authenticated delivery/retention worker endpoint.
- `src/app/api/admin/feedback/bugs/[id]/screenshot/route.ts` — access-controlled screenshot read.
- `src/app/api/admin/feedback/route.ts` — exclude expired bug reports even before cleanup runs.
- `admin/src/app/api/admin/feedback/bugs/[id]/screenshot/route.ts` — admin-session screenshot proxy.
- `admin/src/app/api/admin/feedback/bugs/[id]/screenshot/route.test.ts`
- `admin/src/app/(portal)/feedback/page.tsx` — unrated bug-report label.
- `prisma/schema.prisma`
- `prisma/sqlite/schema.prisma`
- `prisma/migrations/20261010120000_bug_reports/migration.sql`
- `prisma/sqlite/migrations/20261010120000_bug_reports/migration.sql`
- `scripts/moments-worker.mjs` — delivery and retention tick.
- `package.json` and `package-lock.json` — explicit Sharp dependency.
- `docs/report-bugs.md` — implementation, rollout and validation report.

Unrelated concurrent changes to `ios/App/TodayAttentionSheet.swift` were preserved and are not part of this feature.

## Validation results (October 10, 2026)

- Backend/feedback/admin API regression suite: **28 passed**, using isolated SQLite migrations. Includes auth, strict validation, consent, invalid/oversized body, encrypted screenshot access/expiry, retention, rate limits, failed persistence, concurrent retry and reference uniqueness.
- Admin screenshot proxy: **3 passed**; admin TypeScript check passed.
- Swift draft/consent/retry/shake tests: **3 passed**.
- iPhone 17 Pro Max: five-screen UI flow passed, including failure/retry and reference-copy/Done.
- Smaller iPhone simulator: five-screen flow, real original-screen capture/retake, and accessibility layout tests passed. Dark Mode was explicitly enabled in a subsequent passing test; screenshots visually inspected.
- iOS simulator build: passed. Backend TypeScript check: passed. Backend production build: passed using `next build --webpack`; the default Turbopack build stalled and was stopped. Existing framework/deprecation warnings remain.
- Worker JavaScript syntax check and `git diff --check`: passed.

No production deployment or production database migration was performed. Live support-inbox delivery, backup/mailbox retention policy, a PostgreSQL migration rehearsal, physical-device shake sensitivity and manual VoiceOver navigation remain release checks. No Jira integration was available to test. Automated delivery uses a mock provider, and UI submission uses a deterministic fixture; original-screen capture separately uses the real coordinator.
