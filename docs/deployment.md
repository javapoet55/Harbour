# Deployment

1. Set `HARBOR_DATABASE_URL` to Postgres and run `npx prisma migrate deploy`.
2. Set `HARBOR_SESSION_SECRET` to a long random value.
3. Optionally set SendGrid, Twilio, VAPID, OpenAI, and calendar OAuth client IDs.
4. Point a cron job at `POST /api/notifications` with `{ "action": "tick" }` every minute. Do not rely on an open browser tab.
5. Build with `npm run build` and start with `npm start`.
6. Serve over HTTPS so the Web Speech API, notifications, and secure cookies work.

Harbor can deploy as its own Next.js service. Do not point it at the FSM `home_services` database.
