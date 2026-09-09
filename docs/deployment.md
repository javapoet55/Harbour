# Deployment

1. Set `HARBOR_DATABASE_URL` to Postgres and run `npx prisma migrate deploy`.
2. Set `HARBOR_SESSION_SECRET` to a long random value.
3. Optionally set SendGrid, Twilio, VAPID, OpenAI, and calendar OAuth client IDs.
   - Set `HARBOR_CREDENTIAL_ENCRYPTION_KEY` to 32 random bytes encoded as 64 hex characters.
   - Register the exact Google and Microsoft callback URLs shown in `.env.example` (replace the local origin in production).
   - Configure a verified `SENDGRID_FROM_EMAIL`, a Twilio sender, and a `VAPID_SUBJECT` contact URI.
   - Password reset requires `SENDGRID_API_KEY` and a verified `SENDGRID_FROM_EMAIL` in production.
   - Native Sign in with Apple requires `APPLE_CLIENT_ID=com.pinslots.nexdo`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and the Sign in with Apple `.p8` contents in `APPLE_PRIVATE_KEY`. Keep the private key server-side only.
4. Set `HARBOR_CRON_SECRET`, then point a cron job at `POST /api/notifications` with `Authorization: Bearer <HARBOR_CRON_SECRET>` and `{ "action": "tick" }` every minute. Do not rely on an open browser tab.
   Point a second job at `POST /api/calendar/sync` with the same bearer token every 5–15 minutes. It incrementally syncs every connected calendar and refreshes continuous-replanning proposals.
5. Build with `npm run build` and start with `npm start`.
6. Serve over HTTPS so the Web Speech API, notifications, and secure cookies work.

Harbor can deploy as its own Next.js service. Do not point it at the FSM `home_services` database.

Native profile photos require the server and database changes as well as the iOS build:

- Apply `8_profile_photo` to add the nullable `User.photo` column.
- Deploy the settings handler that persists `photo` (including `null` for removal) and returns `{ ok: true, profile: { id, photo } }`.
- Deploy `/api/me` with `user.photo` and private, non-cached responses.

An older settings handler returns `{ ok: true }` while ignoring the photo field. The native app intentionally rejects that response when a subsequent profile read cannot confirm the saved picture; rebuilding iOS alone does not resolve this server mismatch.
