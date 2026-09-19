# Recurring tasks and shopping lists

Today includes a Recurring Tasks card below Important Moments. See all opens repeating tasks and shopping lists. General tasks reuse the existing recurrence engine; completing an occurrence creates its successor. New repeating tasks support daily, weekly, monthly and yearly schedules.

Shopping lists support scratch/copy creation, weekly dates, categorized items, quantities, pack sizes, notes, completion, editing, swipe deletion and within-category reordering. Complete Shopping Trip retains history and creates exactly one next weekly list, with copied items unchecked. Missed weeks advance to the next future occurrence on the same weekday. Weekly list generation is completion-driven, not a background job.

The microphone opens a consent-based continuous WebRTC transcription session using the existing authenticated transcription endpoint. Multiple speech turns accumulate until pause/review, with a five-minute session limit. Backgrounding or closing ends recording. Grocery parsing is deterministic and does not make another AI request. Common quantities, fractions and sizes are extracted; every result can be corrected before adding. Unrecognized products remain editable in Other. Live provider audio still needs a physical-device smoke test.

## Backend

Authenticated GET/POST `/api/shopping` supports create, save, delete, complete, share, revoke and parse. Lists belong to the signed-in account. Revisions protect against stale writes; item replacement and completion are transactional. No production seed data is added.

Sharing text uses the native share sheet. Explicitly creating a share link enables a read-only `/shared/shopping/[token]` page. Anyone with that random link can read the list until revoked or deleted. It shows current saved contents; no contacts are uploaded and nothing is sent automatically.

Additive migrations create ShoppingList and ShoppingItem tables in PostgreSQL and the local SQLite test schema. Deploy using the repository's `npm run db:migrate:deploy` release procedure before shipping the new iOS client.

## Verification

- Shopping service integration tests: parsing, owner isolation, stale-write rejection, weekly rollover, explicit sharing/revocation and cascade deletion.
- Existing bounded recurring-task completion integration test.
- Swift model/transcript unit tests, including multiple utterances, duplicate finals and out-of-order final delivery.
- Simulator UI tests use a local URLProtocol fixture: item check-off/edit, copy last list and typed transcript review. No live microphone/provider requests or messages are sent by these tests.
- Production backend compiled with `next build --webpack`; sandbox blocked Turbopack's local worker port.

Release validation (2026-09-17): full backend suite 437 passed / 10 failed; unchanged main reproduces the same 10 failures. Native suite 120 passed / 1 overdue-task failure; verified against unchanged main. Shopping tests pass (5 backend, 4 Swift unit tests, 3 simulator UI flows). Live microphone/provider audio remains a device smoke-test item.

## Continuous voice connection fix

Production rejected the original `gpt-live-transcribe` + `server_vad` session with HTTP 400: turn detection is not supported for that model. The transcription-session endpoint now uses `gpt-4o-transcribe`, retaining automatic pause detection and the existing multi-turn transcript events. A production credential-only probe confirmed HTTP 200 with this configuration; no user audio was sent. iOS preserves useful backend/network error messages and explains that the voice consent switch must be enabled. This server fix also benefits existing app builds.

## Item image attachments

The Item editor supports Photos, camera capture, an editable AI description and Generate with AI, preview, replacement and removal. Save commits the attachment; Cancel discards the editor draft. Attached images take precedence over the bundled AI grocery illustrations and colorful fallbacks. Images are normalized to JPEG thumbnails (maximum 480px / 67KB); re-rendering removes camera EXIF/location metadata. The selected photo is synced to the owner's list, never sent to the image-generation provider. AI receives only the item name and optional description after explicit consent. Generation is limited to six attempts per user per hour per server instance with a concurrent-request guard.

`POST /api/shopping/image` returns artwork for preview without saving it. A nullable `ShoppingItem.imageData` column persists thumbnails across copies and weekly rollover. The new PostgreSQL/SQLite migrations add this column. Explicit JSON null removes an image; an omitted field preserves images from older clients. List requests are capped at 4MB. Text/link sharing remains text-only for attached photos.
