# Admin login — password mode

Email OTP is temporarily disabled at `/api/admin/auth`. The admin page accepts an existing Nexdo email and password for an allowlisted, verified, non-deleted account. No email is sent. Ordinary account cookies still do not grant admin access.

Password attempts are limited to five per account in 15 minutes using the database. Successful authentication creates a separate revocable, hashed admin session with an eight-hour lifetime in the existing AdminLoginToken table. Same-origin POST validation and secure HttpOnly cookies remain required. No migration is needed.

The older OTP service remains available internally for a future reviewed reactivation, but its request/verify actions are not exposed by the login route.

# Previous OTP configuration (inactive)

Open `/admin/login`, enter an authorized administrator's existing account email, and enter the six-digit code delivered by Hostinger. Ordinary account/password/Apple sessions cannot authorize admin pages or APIs.

Codes expire after 10 minutes, allow five attempts, and can be redeemed once. A resend invalidates older unused codes; requests are limited to one per minute and three per 15 minutes per account, using database-backed limits. Verification is bound to the requesting browser's HttpOnly challenge cookie. Neither codes nor session secrets are stored in plaintext or returned by the API.

The separate HttpOnly, SameSite=Strict admin session cookie has no persistent expiry. Server-side sessions expire absolutely after eight hours. Browser session restore may preserve session cookies; use the portal's Sign out to revoke a session immediately. Every new sign-in requires a new emailed code. Navigating between dashboard pages does not require another code.

## Deployment

- Apply the included `20260920000000_admin_email_otp` migration. The normal Railway migration deployment command includes it. SQLite has an equivalent migration for local tests.
- Configure `HOSTINGER_MAIL_API_KEY` and `NEXDO_ADMIN_FROM_EMAIL` in the Harbour service. The key must have access to that Hostinger mailbox and permission to send. The sender is resolved and verified against Hostinger’s authenticated mailbox directory before sending, with display name NEXDO. Admin OTPs never fall back to SendGrid or a mock delivery. Other application email continues using its existing provider. Store the API key only as a server secret; do not commit it.
- Existing administrator emails in `src/server/admin-allowlist.ts` are preserved. Add existing account emails through comma-separated `NEXDO_ADMIN_EMAILS` if needed. This change does not provision accounts or grant new administrators access.
- The admin API accepts only same-origin browser POSTs. Deploy behind a proxy that preserves the public request origin.

Validation: `npx vitest run src/server/admin-otp.integration.test.ts src/server/admin-auth.test.ts`, `npm run typecheck`, and targeted ESLint. Tests use an isolated SQLite database and mocked delivery; real email delivery must be checked with the deployed Hostinger configuration.
