# Admin login — email code

The admin portal (the `admin/` app) signs administrators in with a six-digit code sent by email. There is no password on the admin app.

## Who can sign in

Administrators come **only** from `NEXDO_ADMIN_EMAILS` (required): a comma-separated list, trimmed and compared case-insensitively. There are no built-in admins; if the variable is unset or empty, nobody can sign in. Each address must also belong to an existing, non-deleted Nexdo account. `emailVerifiedAt` is not required: receiving and entering the code proves control of the inbox. Removing an address from the list ends its sessions at the next request.

## Flow

1. The admin enters their email; the admin app calls `POST /api/admin/session` with `{ "action": "request", "email" }`.
2. The backend always answers `200 { "ok": true, "message": "If this email can sign in to Nexdo Admin, a 6-digit code is on its way." }`, whether or not the address is allowed. A code is emailed only to allowed accounts, and delivery happens after the response so timing does not reveal the difference.
3. The admin enters the code; the admin app calls `{ "action": "verify", "email", "code" }` and receives `{ token, expiresAt, user }`. The admin app keeps the token only in its `__Host-nexdo_admin` cookie.

Both actions require the admin app's `X-Admin-Client` secret and forward the browser's IP as `X-Admin-Client-IP`.

## Codes

- Six digits, stored only as a bcrypt hash, valid for 10 minutes, single use.
- Five wrong entries lock the code; request a new one.
- A new request invalidates every older unused code for that account.
- If SendGrid is not configured or rejects the message, no usable code exists (fail closed, no development mock).
- Sessions are revocable and expire after eight hours.

## Limits and audit

Counted in `HealthAudit` over a sliding 15 minutes, for every address whether allowed or not:

| Limit | Value |
|---|---|
| Code requests per email | 3 |
| Code requests per IP | 10 |
| Code attempts per IP | 20 |

Exceeding one returns `429`. Audit actions: `ADMIN_CODE_REQUESTED`, `ADMIN_LOGIN`, `ADMIN_LOGIN_FAILED`, `ADMIN_RATE_LIMITED` (plus `ADMIN_LOGOUT`). Emails and IPs appear only as HMAC-SHA256 digests keyed with `HARBOR_SESSION_SECRET`. Codes and addresses are never logged.

## Logs

Every code request writes exactly one `admin_code_request` line with its `outcome`, and nothing identifying:

| outcome | Meaning |
|---|---|
| `sent` | SendGrid accepted the email. |
| `not_allowed` | The address is not in `NEXDO_ADMIN_EMAILS`. |
| `no_account` | Allowed, but no Nexdo account uses the address. |
| `deleted_account` | Allowed, but the account is deleted. |
| `rate_limited_email` / `rate_limited_ip` | Blocked by a request limit. |
| `send_failed` | Not delivered: `providerStatus` is SendGrid's HTTP status, or `errorCode` is `not_configured`, `sender_not_configured`, `TIMEOUT` or a network code such as `ECONNRESET`. Logged as a warning. |

The send runs after the response through Next's `after()`, which keeps it alive on the Node server until it finishes. For `sent` and `send_failed`, the line appears once SendGrid answers. At startup each server logs `admin_allowlist_loaded` with the number of addresses parsed from `NEXDO_ADMIN_EMAILS` (a warning when it is 0).

## Email

Sent through SendGrid with the shared template (`src/server/email/template.ts`, `adminSignInMessage` in `messages.ts`), like verify-email and reset-password. The sender address is `NEXDO_ADMIN_FROM_EMAIL` if set, otherwise `EMAIL_FROM_ADDRESS` (then `SENDGRID_FROM_EMAIL`); the sender name is `EMAIL_FROM_NAME`. The email contains no links, not even the support address.

## Configuration

- Backend: `NEXDO_ADMIN_EMAILS` (required), `SENDGRID_API_KEY`, `EMAIL_FROM_ADDRESS` (or `SENDGRID_FROM_EMAIL`), optional `NEXDO_ADMIN_FROM_EMAIL`, `EMAIL_FROM_NAME`, `ADMIN_API_SECRETS`, `HARBOR_SESSION_SECRET`.
- Admin app: `BACKEND_URL`, `ADMIN_API_SECRET`.
- No migration is needed.

## Original cookie portal

The backend's original `/admin` pages and `POST /api/admin/auth` still sign in with email and password until that portal is removed. They use the same `NEXDO_ADMIN_EMAILS` allowlist.
