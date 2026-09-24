# NexDo task agents — Phase 1

## Implemented scope
New manual, voice, conversational-agent, and recurring tasks receive a conservative, deterministic English intent category and score: SELF, PROCUREMENT, RESEARCH, LOGISTICS, ERRAND. Scores are rule strengths, not calibrated model probabilities. The classifier is independent of search and action execution.

Only explicit discovery/comparison requests for supported local services create a TaskAgentRun. Personal actions (call, message, pay, pick up) remain plain tasks. General gift buying, insurance-policy comparisons, passport renewal, and other non-local workflows are classified but remain ordinary tasks in this phase. Existing eligible tasks show a Find businesses button; pressing it creates a run without duplicating the task or resetting an existing run. No historic tasks are automatically searched.

Supported services: sprinkler/irrigation repair, plumbing, electrical repair, painting, dentistry, cleaning, auto repair, landscaping, roofing, HVAC repair, pest control, locksmiths, veterinary clinics, moving companies, insurance brokers.

A leak/emergency raises task priority and uses a five-minute research target; flexible work uses a 48-hour target. These are queue priorities/targets, not guaranteed provider response times. The worker starts as soon as required input is ready. Location comes from profile city/country; no GPS request. Missing location and urgency are asked one at a time. One optional preferences card captures budget and constraints (or lets the user skip). Unverified requirements are explicitly shown as unverified, never silently claimed satisfied.

## User flow
Task details on web and iOS show the run card, one question at a time, plan details, pause/cancel/retry, a sourced shortlist of up to five, ranking reasons, and editable copyable outreach drafts. The user sends drafts themselves. There are no sending, booking, payment, reply-tracking, or automatic task-completion tools. The final state is READY_FOR_REVIEW, not “Waiting for replies.”

Google results come from Google Places API (New) Text Search; Yelp Places is an optional second source. Places details supply business location, ratings and a limited selection of attributed reviews. Emergency/24-hour advertising and open-now evidence rank first for urgent work; actual response times are unknown. Quality ranking combines reported ratings and review-count evidence. Quote prices, licenses, weekend/pet-safe requirements and service areas must be confirmed by the user. Budget and constraints are included in drafts; listings are candidates, not verified compliant contractors.

## Durable execution
TaskAgentRun is owned through its task. API ownership checks, versioned compare-and-set writes, a 90-second worker lease, three-attempt cap, 15-second provider timeouts, and persisted steps support recovery without duplicate workers. Cancellation invalidates late writes, including when a search is already in flight. An in-flight provider request may finish, but cannot publish results after stop. Changing task title/notes invalidates and reclassifies research. Task completion/deletion stops active work on the next checkpoint.

State flow: NEEDS_INPUT → QUEUED → RUNNING → READY_FOR_REVIEW / NO_RESULTS / FAILED / BLOCKED. Active runs can pause or cancel; paused/failed/blocked runs may resume/retry. Draft edits are separate from task completion. This phase restarts provider searches on resume rather than reusing partial results. No budgets are interpreted as spend authorization.

POST /api/tasks/:id/agent performs controls; GET returns current intent/run. Next.js after() starts newly queued work after the response. The existing authenticated /api/internal/health-tick drains up to three queued/stale runs on every cron call, so research can recover while the app is closed. Ensure that scheduled health-tick continues running in production.

## Activation
The database migration is 20260923000000_task_agents (PostgreSQL + isolated SQLite tests).
Railway Harbour production needs:
- GOOGLE_PLACES_API_KEY: backend-only Google Places API (New) access.
- YELP_API_KEY: optional Yelp Places access.
- NEXDO_AGENT_ENABLED=true after the Places key is installed and a real search is verified.

The integration uses Google Places directly, not SerpApi or Custom Search. No provider account was created or purchased. Keys are never sent to clients. Only service and the user-selected city/ZIP are used as search queries. Raw task notes are not sent to search providers. Provider data is treated as untrusted text, never executable instructions. Drafts include task title and the user's constraints for review.

Google Places search and detail access were verified live with the supplied backend key. Yelp is optional; absent Yelp is shown explicitly. Missing Google configuration yields BLOCKED without consuming search attempts. Rebuild the iPhone app to see native agent cards.

## Validation
Automated coverage includes intent over-trigger prevention, urgency, profile location, task ownership, invalidated edits, five-result cap/deduplication, grounded drafts, partial outages, missing configuration, cancellation race, concurrent workers, stale-lease recovery, Google/Yelp response adapters, and existing task/voice regressions. iOS Simulator build validates native UI and API models.

## Fallbacks, location and outbound consent
Unsupported procurement/research services (for example tutoring) stay normal tasks with a visible explanation on web and iOS. Rule scores below 0.9 never create an agent run. Ambiguous/conditional requests and services mentioned only in notes cannot authorize local research. These scores are conservative rule strengths, not GPT probabilities.

Every run requires explicit city/ZIP confirmation before searching, including when a profile city is available and when resuming a legacy run without confirmation. A profile city is a suggestion, not proof of the current search area. Agent research does not read weather defaults or GPS. iOS weather's San Ramon default is a separate feature, not an agent location source. Missing city prompts for one; a saved city can be confirmed or replaced for this run.

Phase 1 has no outbound call, message, email, booking or payment action. It sends only the confirmed search area and service query to search providers, never user contact details to businesses. Draft copying is not sending. Any future business-contact capability must require an explicit confirmation of the recipient, channel, exact content, and details to share immediately before the action; task classification is never contact consent. Store privacy disclosures must distinguish search-provider queries from business outreach and reflect actual platform behavior.

## Places data and attribution
Google search returns up to 20 candidates; ranking selects up to five. Only Google place IDs and user-owned drafts persist for Google candidates. Names, addresses, ratings, coordinates, reviews and provider attributions are loaded fresh when a shortlist is opened; they are not saved in resultsJson. Generic drafts avoid persisting Google business names. Clients stop polling completed shortlists. Fresh detail requests use an explicit field mask, including reviews (a billable Places field). Reviews are Google's limited relevance-ordered selection, not an exhaustive feedback dataset. Every displayed review includes author attribution and a direct Google Maps source link. Results show Google Maps attribution and any supplied third-party attribution.
