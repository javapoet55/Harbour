# Weekly Shopping List email

The native iPhone Shopping List → Share List → Weekly email to store manager screen saves an explicit automatic-send authorization. Default: Saturday 10 AM in the device's IANA timezone; weekday, time, recipient and timezone are editable. Saving requires connected Gmail. This is direct backend execution; no model/API key is used.

## Deployment

1. Apply `20261002190000_shopping_email` through the existing migration deployment. Both PostgreSQL and SQLite migrations are provided.
2. Configure the existing `MOMENTS_GOOGLE_CLIENT_ID`, `MOMENTS_GOOGLE_CLIENT_SECRET`, `MOMENTS_GOOGLE_REDIRECT_URI`, credential encryption and session signing settings. The existing verified Gmail OAuth connection is shared with Important Moments; no credentials are returned to the phone.
3. Set `SHOPPING_EMAIL_ENABLED=true` in the API service only when ready to enable the feature.
4. Redeploy the persistent `scripts/moments-worker.mjs` service with its existing `MOMENTS_API_BASE_URL` and matching `HARBOR_CRON_SECRET`. It now POSTs `/api/shopping/email-tick` each cycle independently of whether Moments scheduling is enabled. Do not rely on a timer inside the web server.
5. Ship the updated native iOS or Expo app. Both expose Schedule email directly on an active Shopping List. Expo also supports Gmail connection, preview, pause, and recent status.
6. Connect Gmail in the new screen and explicitly save a schedule. Enabling the server flag alone never creates schedules or sends a message.

Each tick queues every due schedule, then sends up to five emails at a time and stops starting new sends after 20 seconds, so it finishes within the worker's 55-second request timeout. Remaining emails go out on the next tick, about a minute later. Additional workers increase throughput; claims protect against duplicate execution. Queue delay means this is a target start time, not exact-second delivery. Check worker HTTP status logs and recent runs in the app.

## Semantics

- Sends only unchecked items from a snapshot at the due time, including quantities, sizes and notes. No attachments or view-only link are sent.
- A completed weekly trip transfers its schedule to the newly generated list. Manually copying a list does not copy the authorization.
- Empty/completed lists are skipped. Runs missed by over 24 hours are skipped instead of sending stale groceries.
- Local weekly calculation respects daylight saving; nonexistent local times are skipped that week.
- Definitive provider rate limits retry after five minutes, up to three attempts. Pending retries retain the original snapshot.
- Ambiguous provider errors or abandoned sends are marked uncertain, never automatically resubmitted. User must check Gmail Sent mail. A repeated Message-ID alone is not an idempotency guarantee.
- Pausing cancels pending sends. Pause/edit returns a conflict if a send is already underway; submitted mail cannot be recalled.
- Expired email access pauses the schedule. Reconnect and explicitly save to resume.
- “Sent” means Gmail accepted the message, not inbox delivery, reading or store/order confirmation.
- Recent status/history is displayed in-app; this version does not send push delivery notifications.
- The existing Gmail connection can be revoked in Important Moments settings; this also removes access for Shopping List email.

## Validation

Run `npx vitest run src/server/shopping/email.test.ts src/server/shopping/shopping.test.ts` and `npm run typecheck`. Tests use an isolated SQLite database and a mocked email provider, never real recipients. Before production activation, test a real connected account with an explicitly authorized test recipient, verify worker operation and check the Gmail Sent folder. Build and test the native app with Xcode.
