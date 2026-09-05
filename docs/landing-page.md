# Harbour public landing page

## Local review

Open `http://127.0.0.1:43217/welcome` with the existing dev server running.
This is an additive public route. The authenticated dashboard stays at `/`.
Other protected routes retain their existing middleware behavior. All account
CTAs go to login; no signup or billing system is implied.

Local review only. Do not push or deploy until approved.

## Research and direction (September 5, 2026)

- [Todoist features](https://www.todoist.com/features): simple capture and focused task views informed short, outcome-oriented copy.
- [Motion AI Task Manager](https://www.usemotion.com/features/ai-task-manager): demonstrating scheduling informed the interactive sample plan.
- [Sunsama](https://www.sunsama.com/): intentional daily planning informed the calm, personal positioning.
- [Webflow 2026 trends](https://webflow.com/blog/web-design-trends-2026): distinctive typography, concise storytelling, and intentional interactions informed the design.

No competitor artwork, testimonials, or copy reused. Dark maritime ink, cobalt
actions, green accents, editorial serif emphasis, and HTML sample UI create the
brand system without heavy decorative 3D or generic AI gradients. Styles are
route-scoped; no dependencies or external assets added.

## Source-grounded claims

| Benefit | Implementation inspected |
| --- | --- |
| Contextual conversation and approval before material AI writes | `src/server/conversational-agent.ts` |
| Capacity-aware scheduling | `src/server/planner.ts` |
| Proposed replanning | `src/server/replanner.ts` |
| Combined briefing and ranked focus | `src/server/briefing.ts`, `src/lib/focus-ranking.ts` |
| Consent-gated statistical personalization | `src/server/predictions.ts` |
| Task details and 25-minute focus | `src/components/today-board.tsx` |
| Configured calendar integrations | `src/server/calendar-sync.ts` |
| Configured OpenAI speech | `src/app/api/speech/route.ts` |

Provider-dependent features are qualified in the FAQs. No invented adoption
figures, quotes, pricing, trial terms, compliance certifications, or native-app claims.

## Walkthrough and privacy

Three deterministic sample stories adapt the visible answer, plan, explanation,
and CTA to focus, replanning, or briefing. Typed prompts select a matching sample
locally; unsupported prompts explain the limits instead of claiming to answer.
Simulated approval changes component state only and can be reset. Nothing is
persisted. Explicitly labeled as a sample, not the actual AI agent. No microphone
permission, analytics, account access, or AI request is made.

## Review checklist

- Public `/welcome` responds without authentication; `/tasks` stays protected.
- TypeScript, ESLint, production build, and automated tests.
- Before publishing, review desktop and 440px layouts, keyboard focus, prompt
  routing, the three stories, approval/reset, FAQs, login links, and reduced motion.
- Browser interaction and physical-device QA were not requested for this change.

The earlier Tasks redesign remains separate from this landing-page commit.

Validation: 57 tests, TypeScript, and ESLint passed. The standard Turbopack
production build encountered a local process/port restriction; the alternate
`npm run build -- --webpack` production build succeeded without changing scripts.
