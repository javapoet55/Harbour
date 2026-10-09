# NexDo Google OAuth verification checklist

Prepared 2026-10-02 from repository inspection and official Google documentation. This is a submission preparation checklist, not approval. No Cloud Console settings were changed. Exact deployed client IDs, project audience and scope sensitivity labels must be checked by the project owner.

## App identity and domains

- [ ] Set the production display name to **NexDo** and upload the NexDo logo.
- [ ] Confirm a monitored support email and developer contact email. Do not infer either from a test user's address.
- [ ] Homepage: https://www.nexdoapp.com/ (verify published ownership and app functionality).
- [ ] Privacy: https://nexdoapp.com/privacy; Terms: https://nexdoapp.com/terms. Confirm public access and actual content. This checkout contains links, not the legal-page sources; automated fetching did not establish availability.
- [ ] Verify `nexdoapp.com` ownership in Search Console using an account associated with the project; configure authorized domains.
- [ ] Check the homepage links directly to privacy and terms and identifies NexDo consistently.

## OAuth client inventory

| Client / integration | Code configuration | Callback or app identifier |
| --- | --- | --- |
| Calendar confidential web client | GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_REDIRECT_URI | Expected production `https://app.nexdoapp.com/api/calendar/oauth/google/callback`; compare exact configured value with Console |
| Development / staging Calendar | Same variables in separate environment; project/client isolation not verified | Local example `http://127.0.0.1:43217/api/calendar/oauth/google/callback`; check staging app-dev.nexdoapp.com configuration |
| Explicit Gmail sender | MOMENTS_GOOGLE_CLIENT_ID, MOMENTS_GOOGLE_CLIENT_SECRET, MOMENTS_GOOGLE_REDIRECT_URI | `/api/moments/email/callback` under configured server origin; confirm exact deployment URI |
| Native iOS / Expo Android | Backend browser authorization, not an independent Calendar SDK scope request | Bundle/package `com.pinslots.nexdo`; app return `nexdo://calendar-connected` |
| Firebase / analytics | Public mobile Firebase config and server analytics service-account configuration | Separate reporting/auth infrastructure; inspect actual Console-generated clients and Android certificate fingerprints |

No actual secret values should appear in submission documents, recordings, logs or source control. Native app return URI is not the Google web client's redirect URI. Do not add a new iOS/Android Calendar OAuth client merely because the app runs on that platform; this implementation uses the confidential backend browser flow.

## Requested scopes and justifications

Calendar authorization requests exactly:

| Scope | Implemented use | Classification / verification |
| --- | --- | --- |
| openid | OpenID account identity via userinfo | Basic identity; confirm Console display |
| email | Identify the connected account | Basic identity; confirm Console display |
| https://www.googleapis.com/auth/calendar.events.owned | events.list/insert/patch/delete on connected primary calendar | Treat as requiring sensitive-scope verification for public launch; record exact current Console Data Access classification |
| https://www.googleapis.com/auth/calendar.calendars.readonly | calendars.get primary ID/display name | Granular metadata-read permission; record exact current Console classification before submission |

The Calendar method documentation establishes authorization coverage but does not provide a definitive sensitivity label for every granular scope. Do not label a scope non-sensitive without Console confirmation. No restricted-scope security assessment is asserted necessary from this audit alone.

Separate explicit email authorization requests `openid email https://www.googleapis.com/auth/gmail.send`. Google lists gmail.send as **Sensitive**. It sends user-authorized Important Moments and scheduled Shopping List emails through messages.send; it does not read the inbox. Include it in project verification if this client uses the same project. Do not add it to Calendar consent. Server analytics uses `https://www.googleapis.com/auth/analytics.readonly` with a service account for reporting, not Calendar end-user authorization.

Submission text for **calendar.events.owned**:

> NexDo displays events from the user's connected primary calendar and uses this schedule to identify available times and scheduling conflicts. When a user requests or approves a scheduled task or appointment, NexDo creates or updates its event; explicit cancellation may delete the linked event. NexDo accesses events on the user's own calendar, not calendar sharing or calendar deletion. Read-only access cannot support these requested changes.

Submission text for **calendar.calendars.readonly**:

> During connection, NexDo reads the primary calendar's stable identifier and display name with calendars.get. This identifies the calendar used for synchronization and event writes. NexDo does not modify calendar metadata, sharing or ownership. A read-only metadata permission is sufficient.

These describe intended supported actions, not a claim that every AI action has a separate server approval receipt. Verify the actual demonstrated confirmation path. Do not claim full secondary/shared calendar support, external booking, invitations, email inbox access, or Google calendar deletion.

## Console actions

1. Inventory clients/projects across production and development; ensure redirects and secrets are environment-specific. Keep test clients separate from production.
2. Enable Google Calendar API in the production project. Confirm redirect URI exact matches (scheme, host, port, path). Code rejects insecure non-local redirects and credential/query/fragment-bearing URIs.
3. Configure Branding, Audience, contact details and verified domain; confirm the production external audience is appropriate.
4. In Data Access, remove the full `https://www.googleapis.com/auth/calendar` from the app's requested scope inventory and add the two granular scopes above. Preserve separately justified Gmail scopes if applicable.
5. Review existing published scopes and code requests together. Console removal does not narrow users' existing refresh tokens.
6. Complete the sensitivity classifications/justifications shown by Console. Provide the English demo, showing the real consent screen and client ID (not secret).
7. Submit branding/data access verification as prompted; answer Google's requests. Do not promise the unverified warning disappears before approval.
8. Test fresh consent, selective denial, reconnect, restart/refresh, revoked access, create, reschedule and event-only deletion with a designated test account. Test iOS browser cookie continuity.
9. Plan deployment separately after review. No schema migration is required for this patch. Monitor sanitized errors and reconnect status.

## Temporary "still reviewing" notice

While verification is pending, Google shows "Google hasn't verified this app" and users must tap Advanced → Go to Nexdo (unsafe). Setting `GOOGLE_OAUTH_UNVERIFIED_NOTICE=true` on the Railway API service shows a NexDo page explaining that step before Google's screen, for both Google Calendar (`/api/calendar/oauth/google/start`) and Gmail (`/api/moments/email/start`, which `connectURL()` returns while the flag is on). Every client opens these server URLs, so no app release is needed. Any other value, or no variable, keeps the previous behaviour exactly.

After Google approves verification, delete the Railway variable. No code change or new build is needed; Railway applies the variable change when it redeploys the service. Later, remove `src/server/oauth-notice.ts`, the `/api/moments/email/start` route and the flag checks.

## Existing users and rollout

No forced disconnect. Existing tokens retain their previously authorized grant and continue to refresh. To truly narrow old access, explain a voluntary Google Account revocation and reconnect. Check whether Gmail shares the grant/project before revoking: revocation may affect other authorizations. Keep NexDo data; do not delete external calendars or events as migration cleanup. Signed state now binds to an initiating-browser cookie; users with a pre-deployment OAuth flow in progress must start it again. Only explicit connect/reconnect requests prompt for consent.

## Privacy and technical disclosures requiring human review

- Account email, calendar ID/name and event titles/descriptions/locations/start/end/all-day/deletion status are read; event data is persisted for sync and schedule features.
- Explain schedule data used in AI assistance and the actual third-party processing path. No token fields were found passed to LLM prompts; event content is different from credentials and still requires disclosure.
- Establish retention periods, backup retention, deletion timing and whether derived tasks survive disconnect. Do not invent these periods.
- Calendar disconnect removes the local connection/imported events; Google Account access removal revokes the grant. Account deletion removes local cascaded records but does not explicitly revoke the Calendar grant or delete external events.
- Review Google's applicable API Services User Data Policy/Limited Use disclosure with the legal/privacy owner. Ensure public policy and actual processing agree before submission.
- Review the separate Gmail state/consent flow and legacy plaintext credential migration as follow-up security work; they are not silently changed by this Calendar patch.

References: [Calendar scope definitions](https://developers.google.com/workspace/calendar/api/auth), [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), [Gmail scope classification](https://developers.google.com/workspace/gmail/api/auth/scopes), [Google API user data policy](https://developers.google.com/terms/api-services-user-data-policy).
