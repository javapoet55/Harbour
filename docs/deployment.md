# Deployment

1. Set `HARBOR_DATABASE_URL` to Postgres and run `npx prisma migrate deploy`.
2. Set `HARBOR_SESSION_SECRET` to a long random value.
3. Optionally set SendGrid, Twilio, VAPID, OpenAI, and calendar OAuth client IDs.
   - Set `HARBOR_CREDENTIAL_ENCRYPTION_KEY` to 32 random bytes encoded as 64 hex characters.
   - Register the exact Google and Microsoft callback URLs shown in `.env.example` (replace the local origin in production).
   - Configure a verified `SENDGRID_FROM_EMAIL`, a Twilio sender, and a `VAPID_SUBJECT` contact URI.
4. Set `HARBOR_CRON_SECRET`, then point a cron job at `POST /api/notifications` with `Authorization: Bearer <HARBOR_CRON_SECRET>` and `{ "action": "tick" }` every minute. Do not rely on an open browser tab.
   Point a second job at `POST /api/calendar/sync` with the same bearer token every 5–15 minutes. It incrementally syncs every connected calendar and refreshes continuous-replanning proposals.
5. Build with `npm run build` and start with `npm start`.
6. Serve over HTTPS so the Web Speech API, notifications, and secure cookies work.

Harbor can deploy as its own Next.js service. Do not point it at the FSM `home_services` database.
