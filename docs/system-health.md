# Nexdo System Health

## Repository inspection and architecture

The application is Next.js 16 / React 19 with Node route handlers and Prisma 6. PostgreSQL is used in Railway production; the existing isolated SQLite migration/test harness is retained. Admin access uses a separate email OTP session plus the existing administrator email allowlist. There is no role table. All current admins can read System Health; mutation permission additionally requires their user ID in `NEXDO_HEALTH_OPERATOR_IDS`. Normal app sessions cannot access it.

Discovered monitoring: `src/lib/metrics.ts` has process-local counters/timings; `src/lib/logger.ts` emits structured logs; Firebase Analytics/GA4 supplies engagement, not crash data. These remain in place. The logger now recursively redacts private/secret fields. No OpenTelemetry exporter, Sentry, Crashlytics, or external operations stack was found. This change adds a durable Prisma sink for operations measurements, not an additional hosted monitoring service. Existing local counters are shown separately and never presented as cluster totals.

Discovered integrations: OpenAI text/realtime/transcription/speech/image APIs, Google and Microsoft Calendar/OAuth, Gmail send, SendGrid (including admin sign-in codes), Twilio, Web Push, Apple authentication, GA4, and device-local Contacts. No grocery commerce connector or standalone Gmail-sync worker was found. Task reminders and Moments/festival/annual-email processing use database rows and callable scheduler functions rather than a general queue broker.

## Implementation

- Admin app `/health` page (the separate `admin/` app; the main app's old `/admin/health` redirects there): overview, incidents, KPI cards, API/voice trends and expandable sections for AI, voice, integrations, jobs, database, iOS, security, errors/traces, rules, and audit history.
- `/api/admin/health`: uncached reads and operator-only mutations, for the admin app's bearer session plus `X-Admin-Client` secret only.
- `/api/internal/health-tick`: cron-secret-protected alert evaluation and event retention. No third-party notification service is activated.
- `HealthEvent`: route-template/provider/job measurements. Query/header/body/user-content fields deliberately do not exist.
- `HealthIncident`: one active incident per breached rule, with acknowledge/investigate/resolve transitions and owner ID.
- `HealthRule`: configurable threshold, minimum sample size, and enabled flag.
- `HealthAudit`: transactional incident/rule changes and admin OTP login entries (when health enabled). Database triggers prohibit UPDATE/DELETE and PostgreSQL TRUNCATE. Database owners can still change schema/triggers: this is not a cryptographic or external tamper-proof archive.
- Route wrappers establish server-generated trace IDs in AsyncLocalStorage and return `X-Request-ID`. Provider and scheduler/job measurements share backend context. This is backend correlation, not full distributed tracing: iOS and database query spans do not yet participate.
- Named outbound adapters use `observedFetch`. This preserves the existing provider calls without patching global fetch. Provider errors are fixed codes; exception text, prompts, tokens, calendar/email bodies, voice audio and URL parameters are never stored.
- Provider usage extraction reads a bounded JSON response clone (256 KiB, one second maximum); it retains only model and numeric usage. Streaming/audio/image usage stays unavailable. Ordinary requests wait at most 200 ms for the telemetry write; at most 50 writes are outstanding per process. Drops/write failures can make telemetry incomplete. Existing local counters expose telemetry writes/failures. There is no historical backfill.

## Available measurements and limits

API/provider: request counts, requests/minute, nearest-rank P50/P95/P99, success, timeout/429/4xx/5xx/auth-failure counts, last success/failure, endpoint/model/feature breakdowns, and sanitized failure trace drill-downs. Route duration ends when the handler returns, not when streamed delivery completes. Voice metrics here cover backend API calls, not the subsequent WebRTC conversation.

AI: reported text input/output/total tokens and estimated USD cost where an exact model price is configured. Coverage counts are displayed. Estimates exclude unreported usage, audio/images and cached-token discounts. Fallback decisions are not yet instrumented.

Jobs: real Moments and reminder state counts, due automatic Moments queue depth/oldest creation time, latest scheduler execution status/duration/trace, failed/uncertain Moments IDs and retry counts, and new per-delivery traces. No queue broker/dead-letter queue is invented. A successful scheduler tick is not proof every delivery succeeded. Updated timestamps are labeled as state changes, not precise failure times.

Database: current SELECT 1 connectivity/latency; PostgreSQL database connections, server max connections, database size, cumulative rollbacks and deadlocks where statistics access is available. Rollbacks are not all failures; per-database connection counts are not server-wide pool saturation. Query distributions, slow queries, capacity, replication and backups need infrastructure telemetry.

Voice usage receipts: cumulative client-reported minutes for records updated in the selected interval, explicitly not exact minutes spoken during it. Active/successful/failed sessions, today totals, disconnect/reconnect/audio events, speech-to-speech timings, and voice cost remain unavailable.

Security: authentication endpoint failures, including OTP/password-reset HTTP errors; admin OTP success audit records; incident/rule audit. No historical reconstruction or unrelated account/plan/feature-flag mutations were added. Unique affected users, explicit lockout/revocation events, suspicious-spike baselines and request-anomaly detection need additional events.

iOS: typed adapter seam for a future selected crash/performance provider. Production version/adoption/crash/hang/launch/device statistics remain unavailable; a version in the Xcode project is not proof of the installed production version.

Uptime requires an independent outside-in probe. The dashboard cannot establish downtime while the whole application or database is unreachable. No artificial uptime/crash-free/voice-session success numbers are shown.

## Health and alerts

Status uses at least five observations in the most recent 15 minutes. No recent samples = Unknown. At least 50% failed requests = Down; at least 5% failures or observed 429 = Degraded. An unknown component keeps the aggregate from claiming Healthy. Dashboard range does not expand the current-status freshness window.

Rule evaluation uses the most recent hour with configurable minimum sample sizes:

| Rule | Initial threshold | Severity |
|---|---:|---|
| API 5xx rate | 5%, 20 requests | SEV-2 |
| API P95 | 2000 ms, 20 requests | SEV-4 |
| OpenAI request failures | 10%, 10 requests | SEV-2 |
| Voice API failures | 10%, 10 requests | SEV-2 |
| Authentication API 5xx rate | 50%, 10 requests | SEV-1 |
| External integration failure rate | 10%, 20 requests | SEV-4 |
| Database unavailable | 1 failed probe | SEV-1 |
| Due automatic Moments backlog | 100 | SEV-2 |
| Moments heartbeat age | 15 minutes | SEV-2 |

A scheduler with no previously recorded heartbeat is Unknown, not assumed stopped. Incidents remain open until an operator resolves them; no automatic resolution is implied. Creation is idempotent while active; a persistent breach can open a new incident after resolution. Missing telemetry does not trigger false recovery. If storage is unavailable, durable incident creation is impossible; use an external Railway/database availability monitor for that failure mode.

Event reads cap at 20,000 newest observations; the dashboard warns about truncation, and alert evaluation refuses truncated windows. At higher volume replace the bounded read with database-side time-bucket rollups/export to the selected monitoring service before relying on alerts. Audit/incident UI lists are bounded to 100 most recent rows; the database retains full history. Retention deletes HealthEvent rows older than 31 days on successful cron evaluation, never audit records.

The notification interface is extensible; no email/SMS/Slack/PagerDuty alert is sent by this implementation. No vendor was selected for operations alerts. Cost/crash anomaly rules are deferred until their underlying telemetry/baselines exist.

## Deployment and manual setup

1. Deploy the application with the new PostgreSQL migration. Railway's existing pre-deploy command runs `npm run db:migrate:deploy`. Do not run SQLite tests against production.
2. Set `NEXDO_HEALTH_ENABLED=true` after the migration is applied.
3. Set `NEXDO_HEALTH_OPERATOR_IDS` to comma-separated existing administrator user IDs. These IDs do not grant admin access themselves; OTP/allowlist checks still apply. Empty means all admins are read-only.
4. Optional `NEXDO_AI_PRICES_JSON`: exact model keys mapped to numeric `input` and `output` USD per million tokens. Maintain these against your provider contract. No credentials belong in this variable.
5. Reuse `HARBOR_CRON_SECRET`. Configure Railway's scheduler or your existing trusted scheduler to POST `/api/internal/health-tick` every minute with the Bearer secret. Keep the secret out of URLs/logs. This evaluates alerts; it does not start reminder or Moments delivery processing.
6. Keep the existing reminder/Moments scheduler jobs configured. `MOMENTS_SCHEDULER_ENABLED=true` is required for its existing tick route. Confirm a heartbeat appears after an actual tick.
7. Verify admin and ordinary-user access separately, make measured requests, and inspect traces. Test with an operator and a read-only admin. Do not use real customer content for fault tests.
8. Configure external uptime checks, Railway database backup verification, crash/performance telemetry and notification channels separately when selected. No infrastructure settings or production deployment were changed by this implementation.

## Validation

New unit/API/integration tests exercise missing/stale telemetry, state/percentile/rate calculations, threshold sample gates, normal-user and operator denial, CSRF, safe API errors, recursive redaction, provider transparency, numeric usage extraction, actual SQLite metric reads, audited incident transitions, idempotent incident creation, and database-enforced append-only audit records. Frontend render checks cover loading and empty states.

The full existing suite has 10 pre-existing failures across executive-companion, executive-readiness, next-action, harbor and schedule-intelligence tests. These same 10 failures were reproduced using an isolated clean `git archive HEAD` checkout. No unrelated scheduling/conversation behavior was changed to hide them. See the final task report for current totals and build checks.

## File inventory

The `src/app/admin/**`, `src/components/admin/**` and `src/app/api/admin/auth/route.ts` files listed here were later removed from the main app; the dashboard now lives in the `admin/` app.

Added:

- `docs/system-health.md`
- `prisma/migrations/20260921000000_system_health/migration.sql`
- `prisma/sqlite/migrations/20260921000000_system_health/migration.sql`
- `src/app/admin/(portal)/health/loading.tsx`
- `src/app/admin/(portal)/health/page.tsx`
- `src/app/api/admin/health/route.test.ts`
- `src/app/api/admin/health/route.ts`
- `src/app/api/internal/health-tick/route.ts`
- `src/components/admin/health/dashboard.test.ts`
- `src/components/admin/health/dashboard.tsx`
- `src/server/health/access.test.ts`
- `src/server/health/access.ts`
- `src/server/health/health.integration.test.ts`
- `src/server/health/health.test.ts`
- `src/server/health/metrics.ts`
- `src/server/health/redaction.ts`
- `src/server/health/service.ts`
- `src/server/health/telemetry.ts`

Modified:

- `.env.example`
- `next-env.d.ts`
- `prisma/schema.prisma`
- `prisma/sqlite/schema.prisma`
- `src/app/admin/admin.css`
- `src/app/admin/login/page.tsx`
- `src/app/api/account/route.ts`
- `src/app/api/admin/auth/route.ts`
- `src/app/api/admin/insights/route.ts`
- `src/app/api/agenda/route.ts`
- `src/app/api/assistant/route.ts`
- `src/app/api/auth/apple/route.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/logout/route.ts`
- `src/app/api/auth/password-reset/confirm/route.ts`
- `src/app/api/auth/password-reset/request/route.ts`
- `src/app/api/auth/register/route.ts`
- `src/app/api/auth/verify-email/resend/route.ts`
- `src/app/api/auth/verify-email/route.ts`
- `src/app/api/availability/route.ts`
- `src/app/api/billing/route.ts`
- `src/app/api/calendar/connections/route.ts`
- `src/app/api/calendar/events/route.ts`
- `src/app/api/calendar/events/[id]/route.ts`
- `src/app/api/calendar/oauth/[provider]/callback/route.ts`
- `src/app/api/calendar/oauth/[provider]/connect-token/route.ts`
- `src/app/api/calendar/oauth/[provider]/start/route.ts`
- `src/app/api/calendar/sync/route.ts`
- `src/app/api/export/route.ts`
- `src/app/api/import/route.ts`
- `src/app/api/insights/route.ts`
- `src/app/api/me/route.ts`
- `src/app/api/moments/[id]/card/route.ts`
- `src/app/api/moments/email/callback/route.ts`
- `src/app/api/moments/route.ts`
- `src/app/api/moments/tick/route.ts`
- `src/app/api/notifications/route.ts`
- `src/app/api/planner/replan/route.ts`
- `src/app/api/planner/route.ts`
- `src/app/api/projects/[id]/route.ts`
- `src/app/api/projects/[id]/tasks/route.ts`
- `src/app/api/projects/route.ts`
- `src/app/api/protected-time/route.ts`
- `src/app/api/push-subscriptions/route.ts`
- `src/app/api/realtime/task-session/route.ts`
- `src/app/api/realtime/tool/route.ts`
- `src/app/api/realtime/transcription-session/route.ts`
- `src/app/api/schedule-intelligence/route.ts`
- `src/app/api/settings/route.ts`
- `src/app/api/shopping/image/route.ts`
- `src/app/api/shopping/route.ts`
- `src/app/api/speech/route.ts`
- `src/app/api/tasks/[id]/route.ts`
- `src/app/api/tasks/bulk/route.ts`
- `src/app/api/tasks/route.ts`
- `src/app/api/transcribe/route.ts`
- `src/app/api/voice/usage/route.ts`
- `src/app/api/weather/route.ts`
- `src/app/api/weekly-summary/route.ts`
- `src/components/admin/admin-shell.tsx`
- `src/lib/firebase-bridge.test.ts`
- `src/lib/logger.ts`
- `src/providers/admin-email.ts`
- `src/providers/calendar.ts`
- `src/providers/index.ts`
- `src/server/admin-insights.ts`
- `src/server/admin-otp.ts`
- `src/server/apple-auth.ts`
- `src/server/conversational-agent.ts`
- `src/server/firebase-engagement.ts`
- `src/server/module-conversation.ts`
- `src/server/moments/email.ts`
- `src/server/moments/greeting-card.ts`
- `src/server/moments/service.ts`
- `src/server/reminders.ts`
- `src/server/shopping/alternatives.ts`

The logo changes in the login page, shared shell, and admin stylesheet were already requested in the preceding task and are preserved. The Firebase bridge test edit only replaces pre-existing explicit `any` types so lint succeeds; it changes no application behavior.

Final validation results:
- New System Health suite: 22/22 passing across five test files.
- Full suite: 539 passing, 10 failing (all 10 reproduced unchanged on the clean committed baseline).
- Production frontend/API build: `npm run build -- --webpack` passed. The initial Turbopack invocation stalled in this environment and was stopped; the standard webpack build completed.
- `npm run typecheck`: passed.
- `npm run lint`: no errors; one existing unused-variable warning in `public/firebase-bridge.js`.
- `git diff --check`: passed.
- PostgreSQL Prisma client regenerated after SQLite tests. Production migrations and a live Railway rollout have not been performed.

## AI, Voice and Security coverage (September 23)

These sections now show recorded request counts for the selected window, recent
15-minute counts and last activity. Coverage distinguishes no activity, inactive
traffic, low traffic and sufficient measurements; the five-sample health threshold
is unchanged. Voice and Security detail tables use the same measured status as
the overview. Security failures include admin sign-in (`/api/admin/session`) as well as app auth routes.
Uninstrumented device session and security metrics are described under coverage
rather than presented as empty KPI grids. Voice API success is not audio-session
success. No synthetic requests or credentials are generated to turn badges green.
