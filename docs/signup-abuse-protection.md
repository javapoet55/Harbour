# NEXDO SIGNUP ABUSE PROTECTION AUDIT

Date: 2026-09-30. Scope: Harbour application/backend, native Swift app, Expo mobile app. The separate nexgo-website marketing repository is not the signup backend.

## Initial audit (before implementation)

| Capability | Initial status | Evidence |
| --- | --- | --- |
| Signup UI | DONE | `src/app/signup/page.tsx`, `ios/App/RootView.swift`, `mobile/app/(auth)/sign-up.tsx` |
| Signup API | DONE | `POST /api/auth/register` |
| Auth services | DONE | `account-auth.ts`, `auth.ts`, `session.ts`; Apple sign-in verifies an Apple identity |
| Basic email validation | PARTIAL | Zod validation existed but lowercased the complete address |
| Existing OTP | DONE | bcrypt-hashed six-digit codes, 24-hour verification expiry, five atomic attempts, one-time claim |
| OTP resend | PARTIAL | Three sends/15 minutes counted from tokens; no atomic reservation or server cooldown |
| Account models | DONE | User.emailVerifiedAt, EmailVerificationToken, PasswordResetToken; no new account-status enum needed |
| Trial provisioning | MISSING / not a current feature | Billing API stores a selected plan; it explicitly says checkout needs a payment provider |
| AI/voice allowances | PARTIAL | Voice reports 100 minutes/month via `voice/usage.ts`; no signup credit balance or grant ledger |
| Rate limiting | PARTIAL | Admin-specific database audit counters; customer signup had no shared IP limiter |
| Bot protection | MISSING | No Turnstile/equivalent in customer signup |
| IP/session/device controls | PARTIAL | Signed session cookie; no signup abuse controls or device fingerprinting |
| Security logging | PARTIAL | Existing redacted logger and health telemetry reusable |
| Disposable detection | MISSING | No checks |
| Verification provider | MISSING | No mailbox/domain risk provider |
| Reusable middleware | PARTIAL | Middleware bypasses APIs; `currentUser`/`requireUser` are the actual API boundary |

Original flow: web/native form → registerAccount → pending User + preference → existing email provider sends OTP → verifyEmail claims code and sets emailVerifiedAt → route writes session. Login already rejected unverified accounts. However currentUser did not independently require verification, so a preexisting session was insufficiently constrained.

## Final status

| Area | Result |
| --- | --- |
| Existing OTP | PRESERVED; strengthened context binding, resend serialization, expiry recheck |
| Email syntax | IMPLEMENTED; trim, ASCII/lowercase domain, preserve local part and plus tags |
| Disposable email | IMPLEMENTED; local maintained-list snapshot, subdomain matching, optional extra domains |
| Domain/MX | IMPLEMENTED; null MX invalid; absent MX permits A/AAAA fallback; timeout UNKNOWN |
| External verification | IMPLEMENTED, OPTIONAL; Kickbox adapter behind EmailVerificationProvider |
| Turnstile | IMPLEMENTED; required in production, server validation of success/action/hostname, bounded timeout |
| Signup rate limiting | IMPLEMENTED; atomic database counters, 5 attempts per IP/15 minutes |
| OTP rate limiting | IMPROVED; 3 sends/email/purpose/15 minutes, 60-second cooldown, IP throttle, existing 5 attempts/code |
| Enumeration | IMPROVED; matching signup response/status without existing profile IDs, neutral resend/reset |
| AI/voice protection | IMPLEMENTED; currentUser rejects unverified/deleted accounts, protecting requireUser-based APIs |
| Promotion protection | IMPLEMENTED FOUNDATION; idempotent eligibility claim after verification; no invented bonus or trial |
| Observability | IMPLEMENTED; existing redacted logger, HMAC references, safe operational outcomes |
| Tests | PASS; see validation and limitations below |

No new OTP system was introduced. Apple sign-in remains a separate existing verified-identity flow; it does not acquire a signup bonus. No credit-granted event is emitted because this repository does not grant a signup credit balance.

## Security decisions and second review

- New signup checks run on the server even when the API is called without the UI. Frontend values cannot disable them.
- Turnstile tokens are single-use at Cloudflare. Action must be `signup`; hostname must match an explicit server allowlist. No client IP is sent to Cloudflare. Missing production keys, invalid challenge, or provider network failure do not create an account.
- Native signup opens a first-party security-check page using the existing browser authentication APIs; only the public bot token returns through a fixed `nexdo://signup-challenge` callback. Random state binds the callback to the initiating app. No passwords/emails are sent through that page or callback.
- OTP activation additionally requires a server HMAC proof delivered to the original signup or password-authenticated pending login. The proof binds the account and password hash. It prevents a person from accidentally activating an attacker-pre-registered password using only a received code. Duplicate signup returns an indistinguishable random proof, not the existing account's proof. Sign in with the original password or use password reset to recover a pending account.
- Web proofs are stored in sessionStorage, not URLs. Native proofs stay in navigation state. They are not full authenticated sessions and cannot bypass OTP. Log redaction covers proofs and bot tokens.
- Password reset retains the existing ownership OTP, invalidates older verification tokens, and records activation eligibility in the same transaction. Reset chooses the new password, so it cannot activate an attacker's chosen password.
- OTP redemption and eligibility commit together. Atomic attempt increments, usedAt/expiry checks and transactional claims protect brute force and replay. Resend locks the user row before invalidating/creating codes.
- Rate-limit state uses the existing primary database, not process memory. Atomic update predicates prevent concurrent over-allocation across instances. Database failures return a friendly 503, never an unlimited fallback. No Redis dependency is needed.
- Trust only a SINGLE-IP header overwritten by the ingress. Production fails closed without one. Reject forwarding lists; do not blindly trust caller-supplied X-Forwarded-For. IPv6 addresses are canonicalized/grouped by /64. Deployment must prevent direct origin access that can spoof the configured header.
- Shared IPs are not permanently blocked or denied promotion; several signups are allowed and rate limits expire. No device fingerprint is collected.
- Promotion eligibility is separate from account eligibility. Known Gmail dot/plus aliases share a hashed claim, but remain distinct accounts. No arbitrary corporate local parts are rewritten. Claims survive account deletion; session-secret rotation does not change claim keys when the dedicated stable abuse secret is configured.
- DNS and optional mailbox-provider errors become UNKNOWN/CHALLENGE and still require inbox OTP. Only definitive invalid/disposable results reject. Provider exception bodies, URLs and secrets are never logged.
- Existing verified login is retained, including historic lowercased email lookup and admin allowlist behavior. Unverified accounts can no longer use an old session to call authenticated APIs.

## Database changes

Additive migration `20260930000000_signup_abuse` in both PostgreSQL and SQLite migration directories:

- AuthRateBucket: HMAC key, count, expiration, expiration index.
- SignupPromotionClaim: HMAC mailbox-family key, claiming user ID, creation timestamp. Intentionally no cascading relation, so deleting an account does not reset introductory eligibility.
- No changes to User or OTP schema and no backfill automatically marks anyone verified.
- Existing UserMemory holds one immutable `signup:promotion-eligibility` record per verified account.
- Health maintenance removes rate buckets expired more than one day ago. If health maintenance is not enabled, schedule the same deletion separately. Promotion claims require a documented security retention policy; do not purge them as ordinary account data if lifetime promotion prevention is desired.

## Configuration

New environment variables (blank examples only, no actual secrets committed):

- `TURNSTILE_SITE_KEY`: public key, served at runtime to web/native clients.
- `TURNSTILE_SECRET_KEY`: secret; production refuses Cloudflare's standard dummy secrets.
- `TURNSTILE_HOSTNAMES`: comma-separated hostnames serving signup and the native challenge page, without scheme/path.
- `AUTH_TRUSTED_IP_HEADER`: ingress-overwritten single-IP header; configure and test at the actual production proxy.
- `SIGNUP_ABUSE_SECRET`: stable cryptographically random secret, minimum 32 characters. Store in the deployment secret manager; coordinate rotation because it keys limits, proofs and promotion claims.
- `EMAIL_VERIFICATION_PROVIDER`: blank (local checks + OTP), or `kickbox`.
- `EMAIL_VERIFICATION_API_KEY`: optional provider key. Only the address is submitted for verification.
- `DISPOSABLE_EMAIL_DOMAINS`: optional comma-separated additional blocked domains.

Development/test: with NODE_ENV != production and no Turnstile secret, challenge is skipped explicitly. To test the real widget, use Cloudflare development keys and permitted development hostname. Production has no bypass flag. Tests mock DNS/HTTP, use an isolated migrated SQLite database, and never send real OTP emails.

## API changes

New: `GET /api/auth/signup-config` (public site key/required boolean only), `/signup-challenge` web page.

Modified:

- `POST /api/auth/register`: bot/risk/IP checks; neutral response now includes email, verificationProof, emailVerificationRequired, emailSent, message; no private existing-account ID/name. Accepts turnstileToken.
- `POST /api/auth/login`: password-authenticated unverified response includes verificationProof. Verified login behavior unchanged.
- `POST /api/auth/verify-email`: accepts verificationProof with existing email/code; IP limit.
- `POST /api/auth/verify-email/resend`: durable send/cooldown/IP limits, serialized code replacement.
- `POST /api/auth/password-reset/request` and `/confirm`: IP/send protections and activation consistency.
- Authenticated APIs inherit verification enforcement via currentUser/requireUser.

## Dependencies and sources

No new runtime npm or Swift dependencies. Node DNS/crypto/fetch, existing Prisma, existing iOS ASWebAuthenticationSession and Expo WebBrowser/Crypto are reused.

Vendored 9,189-domain snapshot from https://github.com/disposable-email-domains/disposable-email-domains, downloaded 2026-09-30; license in `src/server/signup/DISPOSABLE-LICENSE.txt`. JSON SHA-256: `6fb291ca7185fb87e5058efdb4974877e74eea0c207433d78fe388b5cba90fb7`. Review/update regularly; a static list cannot identify every newly created disposable service.

Implementation references:
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- https://developers.cloudflare.com/turnstile/get-started/mobile-implementation/
- https://github.com/kickboxio/kickbox-node
- https://docs.expo.dev/versions/v57.0.0/sdk/webbrowser/

## Files changed

Backend: `src/server/signup/{abuse,email-risk,promotion}.ts`, disposable JSON/license and tests; `src/server/account-auth.ts`, `auth.ts`, `admin-otp.ts`, `health/{redaction,service}.ts`; `src/lib/http.ts`; the auth routes listed above; both Prisma schemas/migrations; `.env.example`.

Web: `src/components/signup-bot-check.tsx`, `src/app/signup-challenge/page.tsx`, signup/login/verify-email pages, public route entry in `src/middleware.ts`.

iOS: `ios/App/{NexdoApp,RootView}.swift`, `ios/Sources/NexdoCore/{APIClient,EmailVerification}.swift`.

Expo: auth screens; `src/api/{client,index,types}.ts`, `src/query/useAuth.ts`, `src/lib/{oauthCallbacks,signupChallenge}.ts` and signup challenge/form tests.

Existing backend fixtures in account-auth, executive-readiness, next-action, and settings tests now explicitly represent verified authenticated users or advance the resend cooldown while retaining original assertions.

Unrelated preexisting support-chat, nutrition, wellness, marketing-chrome, package and layout changes were preserved; they are not part of this security implementation.

## Validation and limits

- Full backend suite: 117 files, 972 tests passed, including original auth/signup and new email, bot, concurrency, OTP replay, context-binding, duplicate, resource-gate and promotion tests.
- Final focused security/auth rerun: 82 tests passed; the final context-enumeration check also passed (12 integration tests).
- Web/backend typecheck passed. ESLint passed with five preexisting warnings, no errors.
- Production Next.js build passed outside the restricted compiler sandbox.
- Expo typecheck passed; 31 focused authentication/challenge tests passed.
- Full iOS simulator build passed; 261 Swift core tests passed using the full Xcode toolchain. The separate historical `check-email-verification.sh` harness is stale (missing unrelated PomodoroStore/AppModel dependencies); it did not pass and was not weakened. The full app build validates compilation, not a real-device challenge/OTP journey.
- Production PostgreSQL migration/concurrency, real Turnstile/email provider delivery and iOS/Android on-device callback behavior still require staging verification. Automated integration tests use SQLite and mocked HTTP.
- Timing differences from email delivery cannot be completely removed by neutral response bodies. Edge/WAF controls and bot enforcement reduce probing; no claim of perfect non-enumerability.
- Verified attackers with multiple real inboxes are not completely prevented. Gmail alias claims are a conservative promotion foundation, not a universal person identity system.
- Existing monthly voice numbers are usage reporting, not a secure server-metered billing ledger. This change blocks unverified access; it does not claim to implement paid billing or enforce all costs for verified users. Any future bonus must atomically consume the promotion claim rather than grant on registration.

## Deployment checklist

No production migration, app release or backend deployment was performed for this task. Configure staging first. Missing security configuration intentionally prevents new signup, so do not deploy this backend alone to production.

- [ ] Create a Cloudflare Turnstile site for the actual app/backend web hostname(s).
- [ ] Configure TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY and TURNSTILE_HOSTNAMES.
- [ ] Generate/store stable SIGNUP_ABUSE_SECRET (at least 32 random characters).
- [ ] Configure AUTH_TRUSTED_IP_HEADER and verify the ingress overwrites it; block direct-origin spoofing. Test IPv4/IPv6 and shared-network users.
- [ ] Optional: create a Kickbox account and configure EMAIL_VERIFICATION_PROVIDER=kickbox and EMAIL_VERIFICATION_API_KEY. Otherwise keep both blank.
- [ ] Apply `npm run db:migrate:deploy` against the production PostgreSQL database using the normal Railway pre-deploy migration process. Do not use db:push/reset in production.
- [ ] Enable daily expired AuthRateBucket cleanup (health maintenance or equivalent). Set log/claim retention policy and review disposable-domain snapshot updates.
- [ ] Release updated iOS/Android clients with bot/context support before enforcing this backend for mobile signup. Older clients can still sign into verified accounts but cannot finish protected signup/verification; communicate an update requirement. There is no insecure legacy bypass.
- [ ] Deploy backend and web frontend together after configuration/migrations; the public site key is read at runtime.
- [ ] Test real signup on web/iOS/Android; verify challenge refresh, cancellation and Wi-Fi/mobile transitions.
- [ ] Verify real OTP success, failure, cooldown, expired/reused codes, and password-reset recovery.
- [ ] Confirm no session, AI access, voice session or promotion marker before verification; confirm one eligibility marker afterward and no duplicate after retry/reverification/login.
- [ ] Check duplicate signup responses, shared-IP signups, provider outage fallbacks, database failure, and spoofed ingress headers.
- [ ] Confirm security logs contain no raw email/IP, password, OTP, verification proof, bot token or provider key.
