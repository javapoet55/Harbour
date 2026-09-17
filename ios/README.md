# Nexdo native iPhone client — initial implementation

This is a SwiftUI app, **not a web view or Capacitor wrapper**. The existing Next.js service remains the backend. Do not upload this initial scaffold to TestFlight yet: the release gates below are unresolved.

## Open and build

1. Install full **Xcode 26 or later** with an iOS simulator runtime. Command Line Tools alone cannot compile SwiftUI for iPhone or archive this app.
2. Open `ios/Nexdo.xcodeproj`. Select the `Nexdo` scheme and an iPhone simulator. The minimum deployment target is iOS 17; that is separate from Apple's required build SDK (iOS 26 or later).
3. In Signing & Capabilities, select your Apple Developer team and register/verify `com.pinslots.nexdo` (the identifier requested by the owner). No team or signing credentials are checked in. Local configuration does not register this identifier with Apple.
4. Run on the iPhone 17 Pro Max simulator, then a physical iPhone. Use a dedicated test account on the configured production backend. **Task edits and approved plans modify real server data.** Do not use someone else's account or real calendar for destructive QA.
5. Run the portable core tests: `swift test --package-path ios`. The Xcode app scheme currently contains no UI test target; this package is a separate test suite, not an iOS UI test claim.

The server URL is centralized in `App/NexdoApp.swift`. HTTPS is mandatory; there are no App Transport Security exceptions. Do not put OpenAI keys, Google client secrets, database URLs, or session-signing secrets in the app.

## Implemented path mapping

| Native surface | Existing authenticated server API | Scope |
| --- | --- | --- |
| Account access | `/api/auth/login`, `/api/auth/register`, `/api/auth/verify-email`, `/api/auth/verify-email/resend`, `/api/auth/password-reset/*`, `/api/auth/apple`, `/api/me`, `/api/auth/logout` | Email/password registration with a six-digit emailed verification code (24 hours) before the first session, password reset code (15 minutes), plus native Sign in with Apple; ephemeral cookie session |
| Account deletion | `/api/account` | Permanent database deletion; stored Apple refresh authorization is revoked first |
| Today / Calendar | `/api/agenda?days=3` | Server tasks/events/overdue; account timezone; multi-day event display |
| Tasks | `/api/tasks`, `/api/tasks/[id]` | Search, open/done filter, create, edit title/notes/estimate, complete/restore |
| Ask AI | `/api/assistant` | Explicit OpenAI sharing permission, structured answer sections, follow-up context ID |
| Plan approval | Same assistant endpoint, `confirmActionId` / `rejectActionId` | Separate explicit user actions; planning and ownership checks stay server-side |

No native scheduling algorithm or LLM fact generation is duplicated. Refresh is available via pull-to-refresh and foreground activation. Failure retains the last loaded data rather than substituting demo data. Requests are not automatically retried, particularly mutations whose result might be ambiguous after a timeout. Error messages instruct refresh before retrying. This version does not maintain an offline task cache or background sync.

Native controls provide Dynamic Type, standard navigation/sheets, system light/dark adaptation, labeled buttons, and 44-point task completion targets. These are implementation choices, **not proof of device accessibility or layout validation**.

## Security and privacy boundaries

- URLSession uses an ephemeral session, no disk response cache, standard TLS verification, and refuses redirects. The backend's HTTP-only session cookie is used without a new authentication bypass. Passwords are cleared from the sign-in form after an attempt and never persisted by the client.
- Cold launches require signing in again. Keychain-backed session persistence and biometric unlock are intentionally not implemented yet.
- AI sharing permission is per-session and can be withdrawn. No AI request occurs through this client before opt-in. Withdrawal does not delete data already processed; server retention/deletion must be documented separately.
- No microphone, speech recognition, tracking, contacts, device calendar, or location permission is requested. No analytics SDK is added. Text chat is supported; voice is not yet ported.
- PrivacyInfo.xcprivacy declares linked account identifiers and user content used for app functionality, no tracking, and the app-only UserDefaults reason used for the remembered first name. This is an initial declaration, not an App Store privacy-label audit of backend providers, retention, hosting logs, or future SDKs.

## Required before TestFlight upload

- [x] Compile the complete iOS app in Xcode. Debug/Release device builds and a simulator build pass with signing disabled; physical-device validation remains outstanding.
- [ ] Verify native sign-in/cookie handling, 401 expiry, logout, and cross-account isolation against the deployed backend.
- [ ] Verify current deployed API contracts match local source. This task does not deploy backend changes or perform real-account API writes.
- [ ] Add a production app icon and confirm the Nexdo name/bundle identifier/branding ownership. No celebrity profile image or fake weather/profile data is included in this client.
- [ ] Publish and link Nexdo's own privacy policy and support page in-app and in App Store Connect. The OpenAI policy link is not a substitute for Nexdo's policy.
- [x] Implement in-app account creation and account deletion. Apple refresh authorization is encrypted at rest and revoked before permanent database deletion; provider configuration and real-account deletion still require production QA.
- [ ] Configure and test SendGrid password-reset delivery plus the Apple team/key variables on the deployed backend. Never put the `.p8` key in the app or repository.
- [ ] Decide initial beta scope: native Google/Microsoft OAuth connection, manual sync, voice input/output, focus timer, notifications, task scheduling fields, and calendar week/month views are **not yet ported**. Existing connected calendar data can be displayed. This is not feature parity with the web app.
- [ ] Test real calendar freshness and errors; add last-sync status before relying on this as a live calendar. Native refresh currently reloads server data, not provider sync.
- [ ] Add iOS UI/integration tests covering consent denied, successful login, task CRUD, DST/multi-day events, follow-up context, rejected/accepted/stale proposals, offline/timeouts, background/foreground, large text, VoiceOver, keyboard, landscape, and small/large iPhones. Verify external calendars remain protected using isolated fixtures.
- [ ] Complete App Store Connect privacy labels, age rating, encryption/export-compliance answers, beta description, feedback/support contacts, and review instructions. Review encryption classification; no unverified exemption is declared here.
- [ ] Supply a dedicated working review account with safe seeded data, a reachable backend, and instructions for AI/calendar features. Never put that password in the repo.
- [ ] Archive Release in Xcode, Validate App, then Distribute App → App Store Connect. Start with internal TestFlight testing. External testing may require Beta App Review. Apple makes the acceptance decision.

## Apple references checked September 6, 2026

- [Required Xcode/iOS SDK versions](https://developer.apple.com/news/upcoming-requirements/?id=02032026a): Xcode 26+ and iOS 26 SDK+ for uploads since April 28, 2026.
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/): app completeness, minimum functionality, privacy policy, third-party AI disclosure/permission, and account deletion where account creation is supported.
- [App Review preparation](https://developer.apple.com/app-store/review/): working review access and data-handling information.

Approval is not guaranteed. This directory is a starting native implementation, not a signed archive, released app, or completed compliance audit.

## Validation performed in this workspace

- Swift 6 core and command-line smoke executable compiled successfully; **6 checks passed** (ISO dates, account timezone, DST boundary, exclusive multi-day event end, HTTPS enforcement, follow-up/rejection encoding).
- Run those checks without Xcode's testing framework: `swift run --package-path ios NexdoCoreChecks`.
- Full Xcode 26.6 (17F113) is now installed. All **9 Swift Testing tests pass** using `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test --package-path ios`.
- Complete Debug/Release iPhone builds and the Debug simulator build passed with signing disabled using the iOS 26.5 SDK. SwiftUI also passed iOS-target typechecking. The project and privacy plist passed `plutil -lint`.
- Installed the iOS 26.5 simulator runtime and installed `com.pinslots.nexdo` on an iPhone 17 Pro Max simulator. Runtime launch validation is still blocked by first-boot `CoreLocationMigrator` data migration (including after one non-erasing restart); do not interpret installation as successful UI execution.
- No valid local code-signing identity was found. Select/add the owner’s Apple account in Xcode Settings → Accounts, choose the appropriate team in Signing & Capabilities, and verify the requested bundle identifier before signing. No Apple account configuration was changed.
- Build logs for this validation session: `/private/tmp/nexdo-ios-target.log`, `/private/tmp/nexdo-ios-release.log`, `/private/tmp/nexdo-ios-simulator.log`. These temporary logs are not release artifacts.
- No real-account login, task mutation, AI request, deployment, signing, archive, or TestFlight upload was performed. Existing web code was not changed, so its earlier test results are not claimed as native validation.
