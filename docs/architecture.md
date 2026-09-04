# Harbor architecture

## Existing repository

The workspace is the CSAgentIQ home-services monorepo:

- Frontend: Next.js admin panel, technician admin, voice console
- Backend: Express API, JWT tenant auth, Prisma/Postgres
- Integrations already present: Twilio, SendGrid, OpenAI, Google Calendar (for technicians), Stripe

Harbor is a **separate product**. It does not reuse the tenant booking schema, campaign engine, or admin session. Those models are multi-tenant FSM records, not a personal life calendar.

## Harbor stack

- Next.js App Router + TypeScript
- Tailwind CSS
- SQLite via Prisma for local/demo (`HARBOR_DATABASE_URL`). Swap that variable to Postgres in production. Never reuse the FSM `DATABASE_URL`.
- Generated Prisma client lives in `src/generated/prisma` so it cannot overwrite the monorepo `@prisma/client`.
- HTTP-only JWT session cookies
- Provider interfaces for email, SMS, push, speech, LLM, and calendars
- In-process reminder ticker (`POST /api/notifications` with `{ "action": "tick" }`) plus a durable row per attempt

## Request path for voice

1. Browser records speech (Web Speech API) or accepts typed text.
2. Transcript is shown and sent to `POST /api/assistant`.
3. `parseIntent` classifies the request.
4. Application services load only that user’s tasks and events.
5. The assistant writes a short spoken answer and a visible summary.
6. Destructive or create actions require confirmation according to user settings.
7. The LLM never receives a database handle and never executes writes.

## Isolation

Every query includes `userId`. Soft deletes hide cancelled work. External calendar upserts use a `syncKey` so duplicate webhooks cannot create a second row.
