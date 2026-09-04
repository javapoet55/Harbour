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
3. When `OPENAI_API_KEY` is configured, the Responses API returns a strict structured action plan; the deterministic parser remains an offline fallback.
4. Recent assistant proposals and clarification questions are supplied as context, so short follow-ups and corrections can replace an unexecuted proposal. Ownership, dates, status transitions, dependency cycles, and stale task versions remain deterministic checks.

The scheduling engine ranks open work by status, priority, and deadline, uses personalized duration estimates when consented, places dependency prerequisites first, favors early working-hours slots for high-energy work and later slots for low-energy work, and avoids connected-calendar events. Every generated move is a proposal requiring approval.
4. The model receives a bounded, user-scoped snapshot of tasks, projects, recent turns, and explicitly saved preferences. It never receives a database handle.
5. Application code validates every referenced ID, date, project, action count, and required field.
6. Ambiguous requests produce a clarification question. Multi-action writes become one visible proposed change set.
7. Material actions always require confirmation, then execute in a database transaction and are recorded in the activity log.
8. Explicit corrections and durable preferences are saved as bounded `UserMemory` records; secrets and sensitive categories are rejected.

## Personalized predictions

Personalization is disabled by default. After consent, Harbour records explicit work-session durations and later reschedules, then uses robust medians and Bayesian-smoothed rates for category duration, completion, time-of-day, postponement, reminder, overtime, interruption, and capacity estimates. Predictions include sample counts and confidence bands. Categories with fewer than three duration observations retain the user's explicit estimate. Learned telemetry can be erased independently of task records.

## Isolation

Every query includes `userId`. Soft deletes hide cancelled work. External calendar upserts use a `syncKey` so duplicate webhooks cannot create a second row.
