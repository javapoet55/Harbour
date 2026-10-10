# Daily morning email

Settings → Notifications → **Daily morning email · 6:00 a.m.** controls the existing `morningSummary` preference. The master `emailEnabled` preference must also be enabled. Existing saved preferences are preserved. The recipient is the current profile email, and the schedule uses the profile’s IANA time zone, including daylight-saving changes.

Deploy the backend and redeploy the persistent `node scripts/moments-worker.mjs` service. Its existing `MOMENTS_API_BASE_URL` must point to that environment’s backend and `HARBOR_CRON_SECRET` must match. No migration or new secret is needed. Configure the existing SendGrid provider (`SENDGRID_API_KEY` and `EMAIL_FROM_ADDRESS`, or its supported sender fallback) on the backend.

The worker calls protected `POST /api/notifications/morning-tick` on startup and every minute, independently of calendar, shopping and Moments work. Delivery begins on the first tick at or after 06:00 local time. Missed ticks can catch up until 07:00; older briefings are not sent. The email uses the same factual briefing builder as the app: today’s commitments, tasks, conflicts/attention items and a recommended next step. It uses server-synced calendars; device-only Apple Calendar events are not available to the server.

A durable `UserMemory` runtime record keyed by `morning-summary:YYYY-MM-DD` atomically claims each account’s daily delivery, including across worker replicas. These runtime records are excluded from conversational memory. Explicit provider rejections retry after five minutes, at most three attempts. Network-ambiguous or interrupted sends are not replayed automatically because the provider may already have accepted them. SendGrid does not guarantee exactly-once delivery. Worker logs report aggregate sent/skipped/failed counts without recipient addresses or message contents; inspect this record’s status when investigating missing delivery.

Validation: `npm test -- src/server/morning-summary.test.ts` covers local time/DST, content, preferences, deleted accounts, concurrency, retries and endpoint authentication. Run `npm run db:generate` after the SQLite tests to restore the production Prisma client.
