# NexDo Google OAuth Audit

Audit date: 2026-10-02. Scope: this repository, including backend, web, Swift iOS, Expo mobile, workers, schemas, tests and documentation. Production Google Console and live grants have not been inspected. Existing unrelated working-tree changes are preserved.

## Executive Summary

Pre-change analysis completed before implementation: the shared Calendar provider requests `openid email https://www.googleapis.com/auth/calendar`. No implemented operation requires full Calendar management. The supported connection flow selects the user's primary calendar. Use `calendar.events.owned` for event reads/writes and `calendar.calendars.readonly` for connection metadata, with `openid email` for account identity. Do not use a read-only event scope: it would break approved writes.

Safety rationale: all discovered Calendar endpoints accept these granular scopes according to Google's method documentation. No calendar deletion, creation, ACL, sharing or ownership calls exist. Existing tokens are not revoked, erased or force-migrated. Scope reduction only changes new authorization requests; it cannot retroactively shrink an existing Google grant. Verification remains a Google Console process.

## Current OAuth Architecture

Web Settings and native Profile initiate the same authenticated backend start route. Native ASWebAuthenticationSession/Expo first obtain a signed five-minute connect token. A signed ten-minute state identifies the NexDo user/provider/native return destination. The server exchanges Google's code, reads identity and primary-calendar metadata, encrypts credentials, then syncs events. Native callback is `nexdo://calendar-connected`; web returns to `/settings`. Credentials remain server-side.

`src/providers/calendar.ts` is the shared authorization, refresh and Calendar API adapter. `src/server/calendar-sync.ts` imports and writes events. Agenda, schedule intelligence, availability, planner, replanner, next-action and Daily Brief consume local imported events. They do not call Google FreeBusy.

## OAuth Clients

| Logical client | Configuration / identifiers | Redirect / role |
| --- | --- | --- |
| Calendar web server | GOOGLE_CALENDAR_CLIENT_ID / SECRET / REDIRECT_URI | Production expected `https://app.nexdoapp.com/api/calendar/oauth/google/callback`; confirm actual Console and deployment values |
| Development Calendar | Same variable names per deployment; actual separation unverified | Example `http://127.0.0.1:43217/api/calendar/oauth/google/callback`; staging host app-dev.nexdoapp.com must use separate development configuration |
| Gmail sender | MOMENTS_GOOGLE_CLIENT_ID / MOMENTS_GOOGLE_CLIENT_SECRET / MOMENTS_GOOGLE_REDIRECT_URI | Explicit separate email integration; discover actual configured redirect in deployment before submission |
| iOS / Expo | Bundle/package `com.pinslots.nexdo` | Uses backend Calendar OAuth browser flow; no separate native Calendar scope list found |
| Firebase / analytics | Public mobile Firebase config; server service-account configuration | Not end-user Calendar OAuth; actual Cloud Console client inventory must be checked |

No client secrets are reproduced here. Logical clients may share a Cloud project/client in deployment; code alone cannot establish their actual separation.

## Current Scopes

Pre-change scope inventory (Google prefixes abbreviated to `https://www.googleapis.com/auth/`):

| Location | Scope | Why / API operation | Required? | Narrower / action |
| --- | --- | --- | --- | --- |
| src/providers/calendar.ts authorization | openid email | userinfo, connected account identity | Yes | Keep |
| Same, authorization + token request | calendar | calendars.get; events.list/insert/patch/delete | Broad scope unnecessary | Replace with events.owned + calendars.readonly |
| Same, refresh | calendar repeated in POST | Token refresh | No scope parameter needed for Google refresh | Omit; preserve original grant |
| src/server/moments/email.ts | openid email gmail.send | Identity and gmail.users.messages.send for explicitly enabled Moments/shopping mail | Yes, separate integration | Keep; never append to Calendar |
| src/server/firebase-engagement.ts | analytics.readonly | Service-account analytics reporting | Separate admin feature | Keep separate from user OAuth |
| iOS Profile / mobile oauthCallbacks | None independently defined | Browser bridge to backend | N/A | Shared canonical Calendar definition |
| CalendarConnection database | No scope field | Encrypted access/refresh tokens only | Historical scopes unknown | Do not assume old tokens are narrow |

No Contacts, Drive, Calendar ACL/settings/calendarList or FreeBusy scopes found in the Calendar authorization path. No incremental scope append found. Google Places uses an API key, not user OAuth.

## Calendar API Operations

All calls are in `src/providers/calendar.ts`.

| HTTP / Google method | Function | Product use | Final minimum permission used |
| --- | --- | --- | --- |
| GET /calendar/v3/calendars/primary — calendars.get | connectCalendar | Stable ID and display name on connect | calendar.calendars.readonly |
| GET /calendar/v3/calendars/{id}/events — events.list | googleProvider.list | Initial, paginated, incremental sync | calendar.events.owned |
| POST /calendar/v3/calendars/{id}/events — events.insert | googleProvider.upsert | Requested scheduled task/local appointment | calendar.events.owned |
| PATCH /calendar/v3/calendars/{id}/events/{eventId} — events.patch | googleProvider.upsert | Reschedule/update linked event | calendar.events.owned |
| DELETE /calendar/v3/calendars/{id}/events/{eventId} — events.delete | googleProvider.remove | Explicit event/task cancellation | calendar.events.owned |
| GET openidconnect.googleapis.com/v1/userinfo | connectCalendar | Account email | openid email |

Not used: events.get/update/move, calendarList.*, calendars.insert/update/delete, freebusy.query, ACL.*, settings.*, watch/channels. Only event deletion is implemented. Primary calendars may contain both NexDo-created and externally created events. There is no secondary-calendar picker or NexDo-created-calendar flow. Manually provisioned non-owned secondary connections would need separate analysis before reconnecting with owned-only scopes.

## Feature → API → Scope Mapping

| Flow | Path / operation | Reduced scopes compatible? |
| --- | --- | --- |
| 1 Connect | start → code exchange → userinfo + calendars.get | Yes, identity + metadata |
| 2 Initial sync | syncConnection → events.list, -30/+365 day window | Yes, owned events |
| 3 Incremental/background sync | events.list syncToken; 410 restarts initial window | Yes |
| 4 Calendar display | CalendarEvent local rows → agenda/UI | Yes |
| 5 Daily Brief | schedule-intelligence local schedule | Yes |
| 6 Conflicts | local overlap/buffer/workload analysis | Yes; no FreeBusy permission |
| 7 Next action | next-action/assistant local schedule | Yes |
| 8 Available time | availability/planner and voice find_free_time, local events | Yes |
| 9 Create event | explicit local event/task → pushEventToExternal/pushTaskToExternal → insert | Yes |
| 10 Reschedule | task/local-event edits → patch linked external ID | Yes; not all voice editing paths supported |
| 11 Delete/cancel | explicit task/event deletion → events.delete | Yes; never calendars.delete |
| 12 Voice create | voice tools create_calendar_event → local write → insert | Yes; confirmation is primarily prompt-enforced, see risks |
| 13 Ask AI create | assistant intent/approval → task scheduling → insert | Yes; respects existing autonomy/confirmation behavior |
| 14 Reminders | local reminders; scheduled changes write via same provider | Yes |
| 15 Reconnect | same explicit start/callback and upsert | Yes; preserve refresh token when exchange omits replacement |
| 16 Refresh | server refresh_token grant | Yes; refresh does not narrow existing grant |
| 17 Permission revoked | invalid_grant/401/permission403 → connection error | Yes; UI reconnect, no automatic consent loop |

## Scope Problems Found

The full `calendar` scope directly explains the consent text about editing, sharing and deleting calendars. The unverified-app warning is separate: project audience/testing status, branding and sensitive-scope verification must be resolved in Google Console. Narrowing code does not itself remove that warning.

## Recommended Least-Privilege Scopes

- `openid` and `email`: identify the connected account via userinfo.
- `https://www.googleapis.com/auth/calendar.events.owned`: read and modify events on the connected primary calendar, including existing events. Does not authorize calendar deletion or sharing.
- `https://www.googleapis.com/auth/calendar.calendars.readonly`: retrieve the primary calendar ID/name; events-only scopes do not authorize calendars.get.

Rejected alternatives: `calendar.events.readonly` breaks writes; `calendar.app.created` does not grant access to the existing primary calendar; `calendar.events` unnecessarily extends to non-owned calendars; FreeBusy adds no capability used by this implementation.

Official references checked: [scope overview](https://developers.google.com/workspace/calendar/api/auth), [calendars.get](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/get), [events.list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), [events.insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [events.patch](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch), [events.delete](https://developers.google.com/workspace/calendar/api/v3/reference/events/delete).

## Security Findings

Before changes: signed state had expiry/provider/user validation but no browser binding/random nonce. Callback exposed arbitrary provider exception text in redirect queries. Reconnect could overwrite a stored refresh token with null. Google refresh unnecessarily resubmitted requested scopes.

Credential storage uses AES-256-GCM with a production encryption key; production session signing requires a sufficiently long secret. Legacy plaintext credential reads remain supported: migrate legacy records and backups under a separately reviewed operation. Calendar DTOs select non-secret fields. Telemetry uses an allowlist and provider service names; no token forwarding to analytics or LLM prompts was found in inspected paths. Calendar content can enter assistant context and must be disclosed. Existing logger redaction is defense in depth, not justification to log token responses.

Signature scans of tracked files and git history found no Google private client secret, Google access/refresh token or private-key signature. This is not an exhaustive secret certification. An older production-readiness document advises reviewing previously exposed credentials; resolve that historical advisory with the owner. Do not rotate automatically. Public Firebase mobile config is not a private OAuth client secret.

## Changes Implemented

Implemented in the shared Calendar provider: canonical granular scopes; no Google scope parameter during token refresh; returned-scope validation before persistence; encrypted-token preservation on reconnect; reject a new connection without a refresh token; secure configured redirect validation; sanitized token errors. Calendar start/callback now use a random signed-state ID and a short-lived HttpOnly SameSite=Lax browser-binding cookie, clear it after callback, and suppress raw error details in redirects. Cookies are Secure in production. No-store/no-referrer headers reduce exposure.

No database migration, live grant revocation, production deployment or Google Console mutation occurred. Existing Microsoft behavior is regression-tested; its token error descriptions are also sanitized. Google authorization codes remain provider-single-use; this patch does not introduce a server-side single-use state store. Concurrent flows for the same provider in one browser replace the pending cookie; restart the older flow if necessary.

## Existing User Migration

Valid existing access/refresh tokens continue working. New requested scopes do not strip old permissions. No bulk disconnect/revoke. To actually remove prior broad grants, users can revoke NexDo in Google Account connections, then reconnect explicitly. This may also revoke Gmail if clients share a Google project/grant; inventory deployment first. Revoked/expired grants should show reconnect; transient outages/quota failures must not cause repeated consent. A connect attempt already in flight when state-cookie protection is deployed may need restarting once.

## Google Verification Requirements

See google-oauth-verification.md and the demo script. Public production use requires Console verification for sensitive scopes; exact final per-scope sensitivity should be confirmed in Console Data Access. Do not represent code changes as Google approval.

## Manual Google Cloud Console Steps

Inventory production/development clients and redirect URIs, verify nexdoapp.com ownership, configure NexDo identity/legal links, enable Calendar API, replace broad Calendar Data Access scope with the two granular scopes, and submit the complete justified scope set with an English demo. Keep Gmail sender permissions separate and justified.

## Privacy/Disclosure Findings

The checkout links to https://nexdoapp.com/privacy and https://nexdoapp.com/terms; no authoritative legal-page source is present here. Live policy content has not been verified. Human review must confirm event title, description, location, times, calendar/account metadata, storage, AI processing, retention and deletion disclosures, plus Google's applicable Limited Use statement. Imported data is stored until removed; exact retention/backups are not established by code.

Disconnect deletes local imported calendar events/connection and clears preferences; it does not revoke Google grants, delete external events or necessarily delete derived tasks. Account deletion cascades local data; Calendar Google grants are not explicitly revoked (Gmail has a separate revocation path). Explain Google Account third-party access removal. Do not promise remote deletion or immediate backup erasure.

## Tests Performed

PASS: 135 tests across 11 files using mocked Google APIs and a disposable SQLite database. Suites: calendar-oauth, oauth-state, start/callback/connect-token routes, calendar-sync-auth, calendar-sync-batching, event-calendar-writeback, executive-readiness, voice/tools, and credentials. Coverage includes exact requested scopes, partial consent rejection, reconnect refresh preservation, refresh without rescoping, encrypted storage, callback cookie mismatch and denial, signed-state expiry/purpose/provider checks, revoked/insufficient permissions, event reads/create/patch/delete, sync pagination/batching, approval workflows and transient provider failures.

PASS: scoped ESLint for all edited/new TypeScript files; `npm run typecheck`; `git diff --check`. No real Google user calendar was modified. Automated mocks establish code regression coverage, not real Google consent/grant verification. Production Prisma client regenerated after isolated SQLite tests.

## Remaining Risks

Console settings, real consent language, live primary-calendar end-to-end behavior, token expiry in Google Testing mode, privacy publication and production secret inventory need operator checks. Voice confirmation is partly a model instruction rather than a durable server approval receipt; this audit preserves existing behavior and does not certify all agentic actions as server-enforced approvals. Existing grant scope is not persisted. Write-back failures report an unsynced result; connection reconnect status is classified during sync (write errors do not themselves always update that status). Separate Gmail OAuth state has signed expiry but lacks the Calendar browser binding added here. Disconnect versus revoke semantics need clear user disclosure.

## Production Launch Checklist

- [x] Run automated regression checks and review the isolated diff.
- [ ] Verify public policies and exact Google data/AI disclosures.
- [ ] Confirm Cloud clients, audience, domains and exact callbacks.
- [ ] Test new and legacy account connect/refresh/revoke on staging with a test calendar.
- [ ] Record real confirmation/create/reschedule/disconnect demo; no simulated success.
- [ ] Submit Google verification and wait for approval as applicable.
- [ ] Deploy reviewed backend change; monitor connection errors without logging credentials.


## Changed files

- `src/providers/calendar.ts`
- `src/providers/calendar-oauth.test.ts` (new)
- `src/server/oauth-state.ts`
- `src/server/oauth-state.test.ts` (new)
- `src/app/api/calendar/oauth/[provider]/start/route.ts` and `route.test.ts`
- `src/app/api/calendar/oauth/[provider]/callback/route.ts` and `route.test.ts`
- `src/server/calendar-sync-auth.integration.test.ts`
- This audit, `google-oauth-verification.md`, and `google-oauth-verification-video-script.md`.

Other modified/untracked files were already present and are not part of this audit's changes.
