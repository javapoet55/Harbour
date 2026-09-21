# Firebase engagement in ADMIN

The `/admin/engagement` report reads aggregate Google Analytics for Firebase data through the Google Analytics Data API. It requires an authenticated ADMIN session before accessing configuration, cache, or Google.

## Verified account mapping

- Firebase project: `nexdoapp-19f07`
- GA4 property: `555023551`
- iOS stream: `15805890673`
- Dedicated Viewer identity: `nexdo-admin-analytics@nexdoapp-19f07.iam.gserviceaccount.com`
- iOS bundle: `com.pinslots.nexdo`
- The GA4 property also receives Android events. Reports default to the iOS platform.

## Activation

1. Enable the Google Analytics Data API in the service account’s Google Cloud project.
2. Create a dedicated service account and grant it **Viewer** access to GA4 property `555023551` in Analytics Admin → Property access management. Firebase project administrator access is unnecessary.
3. Store its JSON credential in the backend hosting secret `GA4_SERVICE_ACCOUNT_JSON`. Never commit it or send it to the client. Follow the organization’s key rotation policy.
4. Set backend `GA4_PROPERTY_ID=555023551`.
5. Optionally set `GA4_STREAM_ID` to an exact numeric app stream ID. When supplied, this replaces the default iOS platform filter.
6. Restart/deploy the backend with the new secrets. Sign in to ADMIN and open Firebase Engagement. Verify the same date range and platform in Google Analytics.

A Google password, Firebase web API key, or `GoogleService-Info.plist` does not authenticate the Data API. No user password is used by this integration. Only the `analytics.readonly` OAuth scope is requested.

## Reporting behavior

The page includes active/new users, sessions, engaged sessions, engagement rate, engagement duration per active user and session, screen views, event counts, daily active users, and the top 20 events, screen classes, and app versions. The existing ADMIN date filter supports up to 366 days. Dates follow the GA4 property time zone. Period unique-user totals come from the period report, not a sum of daily users.

Reports have a bounded five-minute server cache. Google processing latency still applies; this is not a real-time report. Privacy thresholds, sampling, or grouped rows are surfaced in a notice. Missing configuration and API failures show an explicit status, not fabricated zero metrics. Provider errors and credentials are not exposed to the browser.

Analytics device-based users may differ from registered Nexdo accounts. This integration does not expose named individual activity or join analytics identifiers to account records. Screen labels reflect the app’s existing instrumentation; automatically collected screen classes may be less descriptive than product screen names.

## Verification

Run `npx vitest run src/server/firebase-engagement.test.ts src/lib/admin-date-range.test.ts` and `npm run typecheck`.

Live verification remains required after secrets are provisioned: check authorized report loading, date/platform parity with Analytics, logged-out redirects, and access denial for non-admin sessions. Unit tests cover authorization before data access, signed read-only authentication, filters, mapping, cache reauthorization, missing configuration, and sanitized provider failures.

## Activation verified — September 20, 2026

The dedicated service account has property-level Viewer access, the Google Analytics Data API is enabled, and all three GA4 settings are configured in Railway Harbour production. A live batch request returned HTTP 200 for all five reports using iOS stream `15805890673`. The credential was transmitted via stdin, not command arguments or source files.

The external report link selects `nexdoai@gmail.com` and opens GA4 directly. Previously the Firebase link used the browser’s default Google account, which could produce a project permission error. Google console access remains separate from ADMIN’s server-side reporting connection.
