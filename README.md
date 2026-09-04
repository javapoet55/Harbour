# Harbour

Voice-first personal to-do and calendar. Ask what is coming up, capture tasks in natural language, and keep reminders honest.

This repository is the standalone Harbour app, copied from the `harbor` branch of `javapoet55/home-services-latest`. It has its own SQLite database, auth, and Prisma client.

## Demo

```bash
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

Open http://127.0.0.1:43217 and sign in with:

- Email: `alex@harbor.app`
- Password: `harbor-demo`

Try:

- “What do I have today?”
- “What is coming up during the next three days?”
- “Remind me to call the dentist tomorrow at 9 AM.”
- “Can I finish everything tomorrow?”

Press the microphone on any screen. If the browser has no speech recognition, type the same request. Harbour still reads the answer aloud with the Web Speech API when available.

## What this slice includes

- Email/password session auth
- My Day, Inbox, Calendar, Tasks, Waiting For, Planner, Notifications, Settings
- Deterministic intent engine plus grounded answers from the user’s own data
- Structured conversational agent for multi-action requests, references, clarification, and remembered preferences (with deterministic offline fallback)
- Contextual follow-ups and corrections with superseded proposals, assistant-turn history, dependency validation, and approval-before-write
- Intelligent slot scheduling across calendar availability, deadlines, priority, task dependencies, energy level, learned duration, and working hours
- Debounced full-text task search, smart status/priority/timing filters, guarded bulk updates, and recurring tasks with intervals, weekdays, end dates, occurrence limits, month-end safety, and yearly schedules
- Confirmation before creating, completing, deleting, or rescheduling
- Reminder ticker with push → email → SMS escalation (providers default to mocks)
- Drag a task onto a calendar day
- AI daily planner that recommends without writing until you approve
- Continuous replanning that detects meetings, delays, urgent work, and capacity risk; moves tasks only after approval
- Consent-gated personal predictions for duration, completion, work timing, postponement, reminders, interruptions, overtime, and daily capacity
- Local mock calendar sync with Google/Outlook provider interfaces
- Unit tests for dates, time zones, intents, recurrence, and escalation

## Credentials

Leave provider keys empty for local mocks. See `.env.example` and `docs/architecture.md`.
