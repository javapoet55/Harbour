# Harbor

Voice-first personal to-do and calendar. Ask what is coming up, capture tasks in natural language, and keep reminders honest.

Harbor lives in `apps/harbor` and is **not** a Yarn workspace member, so it never shares the CSAgentIQ FSM database, auth, Prisma client, or Turbo pipeline.

## Demo

```bash
cd apps/harbor
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run db:seed
# Harbor reads HARBOR_DATABASE_URL, not the FSM DATABASE_URL.
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

Press the microphone on any screen. If the browser has no speech recognition, type the same request. Harbor still reads the answer aloud with the Web Speech API when available.

## What this slice includes

- Email/password session auth
- My Day, Inbox, Calendar, Tasks, Waiting For, Planner, Notifications, Settings
- Deterministic intent engine plus grounded answers from the user’s own data
- Confirmation before creating, completing, deleting, or rescheduling
- Reminder ticker with push → email → SMS escalation (providers default to mocks)
- Drag a task onto a calendar day
- AI daily planner that recommends without writing until you approve
- Local mock calendar sync with Google/Outlook provider interfaces
- Unit tests for dates, time zones, intents, recurrence, and escalation

## Credentials

Leave provider keys empty for local mocks. See `.env.example` and `docs/architecture.md`.
