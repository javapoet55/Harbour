# Deployment

1. Set `HARBOR_DATABASE_URL` to Postgres. Railway runs `npm run db:migrate:deploy` before each deploy (`preDeployCommand` in `railway.json`); on other hosts run the same command before `npm start`. It applies `prisma/migrations`. The first time it meets a database created with `prisma db push` (tables but no migration history), it first requires an exact schema match, then records the existing migrations as applied instead of recreating tables. If the schemas differ, deployment stops for review.
   - Create schema changes with `npx prisma migrate dev --name <change>` against a local Postgres database, and commit the generated migration. A failed migration stops the deploy before the new code starts.
   - `prisma/sqlite/` holds the separate SQLite schema and migrations used only by tests and the demo seed.
2. Set `HARBOR_SESSION_SECRET` to a long random value.
3. Optionally set SendGrid, Twilio, VAPID, OpenAI, and calendar OAuth client IDs.
   - Set `HARBOR_CREDENTIAL_ENCRYPTION_KEY` to 32 random bytes encoded as 64 hex characters.
   - Register the exact Google and Microsoft callback URLs shown in `.env.example` (replace the local origin in production).
   - Configure a verified `SENDGRID_FROM_EMAIL`, a Twilio sender, and a `VAPID_SUBJECT` contact URI.
   - Sign-up email verification and password reset require `SENDGRID_API_KEY` and a verified `SENDGRID_FROM_EMAIL` in production. Both send a six-digit, one-time code: verification codes expire after 24 hours and reset codes after 15 minutes. Five wrong entries lock a code until a new one is sent.
   - Native Sign in with Apple requires `APPLE_CLIENT_ID=com.pinslots.nexdo`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and the Sign in with Apple `.p8` contents in `APPLE_PRIVATE_KEY`. Keep the private key server-side only.
4. Set `HARBOR_CRON_SECRET`, then point a cron job at `POST /api/notifications` with `Authorization: Bearer <HARBOR_CRON_SECRET>` and `{ "action": "tick" }` every minute. Do not rely on an open browser tab.
   Point a second job at `POST /api/calendar/sync` with the same bearer token every 5–15 minutes. It incrementally syncs every connected calendar and refreshes continuous-replanning proposals.
5. Build with `npm run build` and start with `npm start`.
6. Serve over HTTPS so the Web Speech API, notifications, and secure cookies work.

Harbor can deploy as its own Next.js service. Do not point it at the FSM `home_services` database.

Password sign-in, on web and iOS, requires a verified email for accounts created after 2026-09-15 07:09:15 UTC, when that requirement first deployed. Sign in with Apple and a completed password reset also mark the email verified.

- Migration `20260915071000_email_verification_attempts` adds the code attempt counter and marks accounts created before the cutoff as verified. It runs automatically with the other migrations before each deploy.

- Sign-up no longer starts a session, on web or iOS. The person verifies the emailed code, which signs them in. Password sign-in to an unverified account returns 403 with `code: "EMAIL_NOT_VERIFIED"`, and both clients open their verification screen.
- iOS builds from before the verification screen cannot finish sign-up against this server. Ship the updated iOS build together with this server change.

Native profile photos require the server and database changes as well as the iOS build:

- Apply `8_profile_photo` to add the nullable `User.photo` column.
- Deploy the settings handler that persists `photo` (including `null` for removal) and returns `{ ok: true, profile: { id, photo } }`.
- Deploy `/api/me` with `user.photo` and private, non-cached responses.

An older settings handler returns `{ ok: true }` while ignoring the photo field. The native app intentionally rejects that response when a subsequent profile read cannot confirm the saved picture; rebuilding iOS alone does not resolve this server mismatch.
