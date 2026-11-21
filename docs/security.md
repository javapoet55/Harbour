# Security and privacy

- Passwords are bcrypt hashes. Sessions are server-side records named by a signed, HTTP-only cookie; see [Browser security](#browser-security).
- Assistant answers come only from the authenticated user’s rows.
- Harbor does not store raw audio in this MVP. Transcripts can be deleted by resetting the demo database; production should honor `transcriptRetentionDays`.
- Provider tokens for Google/Outlook are encrypted with AES-256-GCM using `HARBOR_CREDENTIAL_ENCRYPTION_KEY` before being stored on `CalendarConnection`.
- Logs record intent names, reminder statuses, and sync counts — not task notes, tokens, or audio.
- Quiet hours and confirmation settings are user-controlled.
- Personalized prediction telemetry is opt-in. Models use only activity at or after the latest consent timestamp, expose sample sizes, and can be erased without deleting tasks.
- Production reminder-ticker requests require the `HARBOR_CRON_SECRET` bearer token.
- Never overwrite an external calendar event unless the connection is `writeEnabled` and the user confirmed the change.

## Browser security

What protects a signed-in browser, and where each piece lives. The same rules apply to the admin app (`admin/`) unless noted.

### Session cookie

`harbor_session` is `HttpOnly` (page scripts cannot read it), `Secure` wherever `NODE_ENV` is `production` (every Railway environment) and `SameSite=Lax` (`src/server/session.ts`). It is Lax rather than Strict because the Google and Outlook OAuth callbacks return as top-level navigations from another site and must still be signed in. The admin cookie `__Host-nexdo_admin` is `HttpOnly`, `Secure`, `SameSite=Strict` and pinned to its host.

### Cross-site request forgery

Every `POST`, `PUT`, `PATCH` and `DELETE` is checked in `src/middleware.ts` before any route runs (`src/lib/csrf.ts`). A write is accepted when the browser reports it as same-origin (`Sec-Fetch-Site`), or its `Origin` is this app's own host, `APP_URL`, or an entry in `CSRF_TRUSTED_ORIGINS`. Anything else gets `403` with `code: "CROSS_SITE_REQUEST"` and a `csrf.blocked` log line. Sibling subdomains (`www.`, `admin.`, `app-dev.`) are refused too; `SameSite` cookies alone would trust them.

Requests with neither header are not browser pages: the iOS and Android apps, the cron workers and Twilio's webhooks. They pass this check and are authenticated as before. No `GET` endpoint changes data; keep it that way, because reads are never checked.

The admin app checks `Origin` in each of its own mutating routes (`admin/src/server/request.ts`), and Next checks it for the one server action.

### Content Security Policy

Each page response carries a policy with a fresh nonce (`src/lib/csp.ts`, set in `src/middleware.ts`). Scripts run only if they carry the nonce or are loaded by one that does; inline event handlers, `javascript:` links, `eval`, foreign scripts, foreign form targets and `<base>` rewrites are blocked, and pages may only call back to Nexdo itself. Cloudflare Turnstile (sign-up bot check) is the only third party allowed. A nonce requires every page to render per request, so the root layout reads `x-nonce` and no page is prebuilt.

User and AI text is only ever rendered as React text, which React escapes. `dangerouslySetInnerHTML`, `innerHTML`, `eval` and friends are forbidden by ESLint (`react/no-danger`) and by `src/lib/no-raw-html.test.ts`. The policy is the second lock if that rule is ever broken.

Adding a third-party script, frame, font or API call from the browser means adding its host to `src/lib/csp.ts`; otherwise the browser blocks it. `CSP_REPORT_ONLY=true` switches the policy to report-only (violations appear in the browser console, nothing is blocked) for a cautious first rollout.

Zod is told not to probe for `eval` in the browser (`src/lib/zod-csp.ts`); import that file next to any new client-side schema.

### Framing

`X-Frame-Options: SAMEORIGIN` on every response (`next.config.ts`) and `frame-ancestors 'self'` in the policy: only Nexdo's own pages may embed Nexdo (`/mobile-preview` does). The admin app refuses all framing (`DENY`, `frame-ancestors 'none'`).

Also sent everywhere: `X-Content-Type-Options: nosniff`, `Strict-Transport-Security` (two years), a `Permissions-Policy` limiting microphone, camera and location to Nexdo's own pages, and `Referrer-Policy: strict-origin-when-cross-origin` on pages. Headers in `next.config.ts` replace the same header set by a route, so `Referrer-Policy` and the policy are not set there for `/api`: the OAuth routes send stricter values of their own.

### Sessions

Each sign-in creates a `UserSession` row; the cookie names it (`src/server/session-store.ts`).

- **Idle expiry.** A session unused for 7 days ends (`SESSION_IDLE_TIMEOUT_HOURS`). Activity is recorded at most once every five minutes.
- **Absolute expiry.** Every session ends 14 days after sign-in (`SESSION_MAX_AGE_DAYS`), as before.
- **Remember me.** The web login page sends `remember: false` when the box is unticked. That sign-in gets a cookie with no expiry date, which the browser drops when it closes, and its session ends within a day. Clients that send nothing (the phone apps) are remembered as before.
- **Sign out** deletes the row, so a copied cookie stops working at once.
- **Sign out everywhere** (`POST /api/auth/logout-everywhere`, Settings → Security on the web) ends every session of the account, including admin sessions. A password change or reset does the same automatically.
- The phone apps use the same sessions and the same limits.

Cookies issued before this existed carry no session id. They keep working until their own 14-day expiry, so the upgrade signs nobody out, and are refused once the account signs out everywhere or changes its password (`User.sessionsRevokedAt`). The fallback in `src/server/auth.ts` can be deleted 14 days after this reaches production.

Admin sessions last 8 hours at most and end after 60 idle minutes (`ADMIN_SESSION_IDLE_MINUTES`). The admin sidebar has its own "Sign out everywhere".

### Dependencies

`.github/dependabot.yml` opens weekly update pull requests for the web app, the admin app, the mobile app and the workflows, and `.github/workflows/dependency-audit.yml` fails when a production dependency of the web, admin or phone app has a known high or critical vulnerability (`node scripts/audit-production.mjs` runs the same check locally). An advisory that cannot be fixed yet and does not affect the running app is recorded with its reason and a review date in `.github/audit-accepted.json`. Dependabot *alerts* are a repository setting: GitHub → Settings → Advanced Security → enable "Dependency graph", "Dependabot alerts" and "Dependabot security updates".

### Penetration test

See [security-pentest-brief.md](security-pentest-brief.md) for the scope to hand an outside tester.

## Sign-in attempt limits

`POST /api/auth/login` counts every attempt before the password is checked (`limitLogin` in `src/server/signup/abuse.ts`, the same durable `AuthRateBucket` store as signup and codes):

- **Per account:** 10 attempts per 15 minutes, keyed on the trimmed, lower-cased email. A correct password clears the count, so a real customer never builds it up. An email with no account is counted the same way, so the 429 does not reveal whether an account exists.
- **Per address:** 60 attempts per 15 minutes from one address (wide on purpose: offices and mobile carriers share addresses). Needs `AUTH_TRUSTED_IP_HEADER`; without a readable address only the account limit applies.
- Over a limit the answer is `429 Too many attempts. Please try again later.` and no password is checked.
- **Trade-off:** someone who knows a customer's email can use up that account's 10 attempts and make real sign-ins wait up to 15 minutes. That is the usual price of an account limit; the alternative (no limit) lets passwords be guessed without end.
- **If the limiter cannot run** (`SIGNUP_ABUSE_SECRET` missing, the database unavailable, no readable address) sign-in is not blocked, because that would lock every customer out. It logs `login_rate_limiter_unavailable` at error level: alert on it. Both variables are set on Develop; confirm them on Stage and Production before promoting.
- Limits are `LOGIN_LIMITS` in `abuse.ts`. Not covered: Sign in with Apple (token based), the admin app (email code, its own limits), and change-password (needs a live session).

## Prisma's `deepmerge-ts` and `effect` advisories (fixed without Prisma 7)

`npm audit` flagged `deepmerge-ts` (< 8.0.0) and `effect` (<= 3.22.0), reached through `prisma > @prisma/config`, which showed up as four high findings (those two, `@prisma/config` and `prisma`). The root `package.json` now has `overrides` forcing `effect` 3.22.5 and `deepmerge-ts` 8.0.2, so the Prisma 6.19.3 command line stays and the audit is clean. The two entries were removed from `.github/audit-accepted.json`.

`@prisma/config` only calls `deepmerge-ts` (`deepmerge`) and `effect` while reading a `prisma.config.ts`; this project configures Prisma in `package.json#prisma`, so the build does not reach that code, and a direct load of a `prisma.config.ts` through `@prisma/config` works with both overrides. Remove the overrides when Prisma 7 is adopted (its own dependencies are patched). If a future Prisma 6 release pins an incompatible range, `npm install` will say so.
