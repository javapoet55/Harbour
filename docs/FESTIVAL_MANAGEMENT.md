# Festival management implementation

## Scope and screens

Festival-only management entered through **Manage Moments** in the Upcoming summary card. A single festival opens directly; multiple festivals show a selector. Existing birthday, anniversary and custom-moment editing remains unchanged.

The native Manage Moment screen has a shared identity card, active toggle, overflow menu, four indigo tabs and the existing application tab bar. Tab switching retains one observable model. Back warns about unsaved edits.

- **Details:** name, date, read-only Festival type, manual recurrence explanation, opt-in catalog dates, preparation reminder, friendly time-zone picker, source, Save and confirmed Delete.
- **Contacts:** selected count, initials, masked addresses, native multiple-contact picker, explicit address choice, manual entry, selection and removal. Limited picker access never requires uploading an address book.
- **Wish Message:** shared draft, four tones, manual editing, regeneration confirmation, opt-in AI, offline fallback, per-recipient overrides, explicit Save Message approval, image configuration and labeled local preview variations.
- **Schedule:** future date/time in selected IANA zone, per-recipient channel and explicit email automation, reminder default on, confirmation summary, saved-plan status links with existing reschedule/cancel/composer actions.

No Messages/SMS delivery is automatic. Existing native composer records successful submission only after Apple's callback. Copy/share remains an immediate manual flow through Review Wish, not a scheduled delivery.

## Files and architecture

New files:

- `ios/App/ManageFestivalView.swift`: entry, four tabs, recipient editor, confirmations.
- `ios/App/ManageFestivalModel.swift`: shared edit state, validation, persistence, approvals, provider calls, retry keys, scheduling.
- `ios/App/FestivalServices.swift`: contact adapter, contact validation, mock image provider, protected image storage, fixed-name diagnostic events.
- `ios/Sources/NexdoCore/FestivalManagement.swift`: settings/recipient/catalog/image contracts and pure validation.
- `ios/Tests/NexdoCoreTests/FestivalManagementTests.swift`.
- `src/server/moments/festival.ts`: authenticated group mutation, deletion, catalog-date handling.
- `src/server/moments/festival.integration.test.ts`.
- SQLite migration `prisma/migrations/202609170001_festival_management/migration.sql`.
- PostgreSQL additive migration `prisma/postgres/festival-management.sql`.

Modified existing Moments view/store/preview, core ImportantMoment model, UI test suite, both Prisma schemas, Moments API route and service. Earlier uncommitted Moments work is retained. Xcode project changes observed during the session are preserved.

## Models and persistence

Reuses ImportantMoment, WishDraft and DeliveryPlan; does not introduce duplicate delivery tables. Each recipient remains an ImportantMoment row. A durable shared group ID and festival settings JSON associate recipient rows. `ImportantMoment.festivalSettings` is a new TEXT column defaulting to `{}`. Old responses without it remain readable by iOS.

Settings persist base message, overrides, tone, context, manual-edit flag, approval timestamp, image metadata, preparation reminder, catalog mode, recipient choices and contact identifiers. Photos are local PNG previews in Application Support, complete file protection, excluded from backup. Selected contact data is uploaded only after Save.

Deletion cancels pending plans and removes unsent drafts and composition/contact metadata. A disabled tombstone retains immutable sent/copied/shared/uncertain delivery history. “Delete all Important Moments data” remains the existing separate privacy action.

Editing with active schedules requires confirmation to cancel them. Disabling preserves contacts and composition. Re-enabling does not silently reinstate cancelled schedules. A send already claimed by the provider blocks mutation.

## API contract

All operations use authenticated `POST /api/moments`, JSON `{operation,input}`.

- `festivalSave`: IDs belonging to the authenticated user; festival title/date/IANA zone/yearly/active; recipient IDs/keys/names/selected addresses/selection; validated settings; explicit `cancelSchedules`. Atomic database transaction updates group and cancels pending plans after confirmation.
- `festivalDelete`: `{ids:[...]}`. Festival-only, ownership checked; pending jobs cancelled; sent history retained.
- `festivalCatalog`: returns `{entries:[{id,name,dates:[YYYY-MM-DD],sourceURL}]}`.
- `generate`: reuses text generation; optional `festivalName` and `shared` minimize personal data in shared greetings.
- Existing `approve`, `schedule`, `plan`, `connectEmail` remain in use.

Schedule retries use deterministic UUIDs derived from group, recipient, approved version, time and channel. Server idempotency and serialized parent-row claims reject a second active wish even through a different draft. Partial multi-recipient scheduling reports the number saved; retry preserves successful plans.

## Catalog configuration

Set `FESTIVAL_CATALOG_JSON` to a vetted array matching the catalog contract. Do **not** copy mockup festival dates into the official catalog. No unverified Diwali dates are supplied.

Opted-in catalog festivals take the next configured date. When it changes, pending schedules are cancelled and a review notice is retained; sent history is untouched. Catalog dates refresh when the Moments API is read and when the delivery worker runs. No external official calendar feed or periodic catalog-import job is included; operators must maintain verified entries. When unavailable the UI explains manual date management.

Manual annual dates use the existing recurrence logic, but the UI explains that festivals such as Diwali move. New festival deliveries are one occurrence only and require next-year review.

## Provider configuration and production readiness

### Text

Uses existing backend `OPENAI_API_KEY` and optional `OPENAI_MODEL`. AI is opt-in. Only festival, tone and entered context are used for shared drafts; no addresses or whole contact records. Without the provider/network, an editable deterministic festival draft is available. Saving approval does not send anything.

### Images — preview only

There was no production image-generation integration in this application. `FestivalImageGenerationService` accepts festival/style/aspect/prompt and returns variations; Swift task cancellation handles cancelled requests. `MockFestivalImageService` generates three local PNG illustration previews, explicitly labeled **Mock preview**. It is not generative AI and is not advertised as production-ready.

The screen supports style/aspect/prompt selection, loading, cancellation, selection, regeneration and protected preview storage. Provider errors are displayed. The include-image control is disabled, and both scheduling validation and the backend reject unsupported attachments.

Production integration must implement authenticated generation submission/status/cancel, safe prompt policy, variation retrieval, owner-scoped asset storage/deletion and attachment IDs. Replace the injected mock service, add server asset ownership/format/size validation, Gmail MIME attachment support, and Messages composer attachment support before enabling inclusion. No provider secrets or signed image URLs belong in app logs. The core compatibility gate bounds JPEG/PNG to 5 MB; production must additionally validate actual encoding and channel-specific limits.

### Email / notifications

Uses existing connected Gmail OAuth and durable DeliveryPlan worker. Requires existing Gmail credentials, valid connected account, `MOMENTS_SCHEDULER_ENABLED=true`, and the protected `/api/moments/tick` job. Exact-time email does not rely on iOS execution. This change does not configure production Gmail or the worker.

Local preparation and delivery reminders reuse existing owner-scoped notification service and cold-start route handling. The iOS pending-notification limit still applies. Existing plan deep links open the correct confirmation/status screen; preparation reminders open festival management. Failed email status is shown on refresh and in saved-plan links; a new server push failure-notification channel is not implemented.

## iOS capabilities

No new entitlements, Info.plist permissions or background modes. Reuses Contacts picker, existing notification authorization and URL callback scheme. No full-address-book permission is requested just to use the system picker. When full permission exists, saved identifiers/addresses are checked; with limited/picker-only access, users can reselect modified/deleted contacts or enter manual details. Background contact monitoring is not implemented.

## Analytics

No external analytics framework exists in the inspected native app. A small OSLog adapter records fixed event names only. No message, prompt, address, contact record, URL or credential payload is logged. Existing backend delivery events continue to record outcomes. This is local diagnostics, not an analytics ingestion service; the entire suggested event taxonomy is not wired to an external vendor.

## Verification commands

```sh
npm test -- src/server/moments
npm run typecheck
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swift test --package-path ios
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swift test --package-path ios --filter 'festival|moment|wish'
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild build -project ios/Nexdo.xcodeproj -scheme Nexdo -destination 'platform=iOS Simulator,id=192FA31B-A654-4D51-AC37-B9FA7100A33F' -derivedDataPath /tmp/nexdo-moments-build CODE_SIGNING_ALLOWED=NO
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild test -project ios/Nexdo.xcodeproj -scheme Nexdo -destination 'platform=iOS Simulator,id=192FA31B-A654-4D51-AC37-B9FA7100A33F' -derivedDataPath /tmp/nexdo-moments-build -only-testing:NexdoMomentUITests CODE_SIGNING_ALLOWED=NO
```

Tests use isolated SQLite and URLProtocol fixtures; no real messages, email or AI requests. Coverage includes DST gap/fold, catalog bounds, masking/deduplication, approval/provider gates, draft serialization, fallback and image compatibility, backend ownership/disable/delete/history/idempotency/catalog cancellation, plus existing worker/OAuth-failure behaviors and native UI regressions. Production attachment and provider tests are deferred with those integrations.

## Manual QA checklist

- Open Upcoming → Manage Moments with zero, one and multiple festivals.
- Edit each tab; switch tabs and confirm edits remain. Back must offer discard.
- Add multiple contacts with multiple addresses; verify explicit address selection, duplicates, manual entry and removal.
- Validate blank/long names, invalid addresses, no selected contacts, past dates and unavailable catalog dates.
- Edit base message and overrides; regenerate prompts before overwriting manual text; verify Save Message never sends.
- Generate/cancel/select/delete mock image previews; verify mock label and disabled inclusion.
- Enable email only with connected account and worker; Messages always says confirmation required.
- Confirm schedule; double tap/retry; verify one active plan per recipient.
- Disable or delete with pending schedules; verify cancellation and retained sent history.
- Open local notification from terminated app; confirm correct wish and native Messages Send/Cancel/Fail behavior.
- Test larger accessibility text, VoiceOver, keyboard, app background/return, limited Contacts permission and denied notifications on a real iPhone.
- Apply migration and deploy updated backend before using the new save/catalog/delete operations against production.

## Test results (2026-09-16)

- iOS simulator build: passed.
- Backend Moments integration: **21 passed**, including six new festival tests.
- Focused Swift Moments/festival tests: **11 passed**.
- Full Swift core suite: **110 passed, 1 pre-existing failure**. `overdueListUsesDeadlinesAndExcludesFinishedWork` expects `older,recent`; the current `OverdueTasks` implementation explicitly prioritizes scheduled start and returns `older,scheduledOnly`. No overdue-task behavior was changed by this feature.
- Moments UI suite: **16 tests passed across the regression run and focused reruns**. Coverage includes existing delivery flows, four-tab state retention, confirmation alerts, mock image selection, approval/scheduling and all four visual tabs. Initial action-sheet failures were fixed with explicit alerts. Final layout run: `/tmp/manage-festival-layout-final.log` (**TEST SUCCEEDED**). Scheduling/confirmation run: `/tmp/manage-festival-ui-final.log` (**TEST SUCCEEDED**).
- TypeScript typecheck and whitespace/diff check: passed.

Initial `swift test` using the system toolchain lacked the `Testing` module; rerunning via the configured Xcode toolchain executed the suite successfully apart from the unrelated expectation above.

No production deployment, real message/email send, commit or push was performed for this request.

## Greeting cards

The Wish Message tab now opens a full greeting-card editor. It composes AI artwork with native, editable greeting text and an optional signature (80 characters). Text is typeset on device for readability; the signature and greeting are not sent to the artwork provider. The card can be shared through the iOS share sheet as a rendered image. Use This Card applies the selected artwork; Save Message persists greeting/signature metadata in the existing festivalSettings JSON. Artwork remains in protected local storage; it does not sync across devices. Once the app uploads the finished card (`PUT /api/moments/[id]/card`), automatic email deliveries include it inline; see the Important Moments section of `docs/PROJECT_OVERVIEW.md`. Messages, copy and share remain text-only.

Authenticated `POST /api/moments`, operation `greetingArtwork`, accepts `momentID`, `festival`, `style`, `aspect`, `prompt`, and `aiConsent:true`. It verifies ownership, limits concurrent/per-hour generation per user per instance, calls OpenAI Images, and returns JPEG base64. Configure server-side `OPENAI_API_KEY`; optional `OPENAI_IMAGE_MODEL` defaults to `gpt-image-1.5`. Provider errors are shown rather than replaced by mock artwork. Production generation requires deployment of this backend version and provider image-model access. No new database migration is required. Preview launch arguments use fixture art only for simulator tests. Provider billing quotas remain the cross-instance spending limit.

API implementation reference: https://developers.openai.com/api/docs/guides/image-generation
