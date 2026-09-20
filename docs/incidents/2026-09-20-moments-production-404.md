# Moments production 404 — September 20, 2026

## Cause

Railway Harbour production deployed the `user-auth-flow` branch, commit `2de649783072b11de2f07f7b3a54fcf8d75b5fa7`, at 14:56 UTC. That commit does not contain `src/app/api/moments/route.ts`. Requests to `/api/moments` therefore returned Next.js HTML 404 pages, before authentication or Moments database logic ran. The iOS client correctly reported the HTTP failure.

The `/login` health check succeeded because the older branch still contained that page. A healthy login page alone does not establish mobile API compatibility.

## Recovery

Corrected the Railway service source to `javapoet55/Harbour`, branch `main`, and triggered a deployment from source (`ec9f5164-9bf2-4b17-8d58-23bb15d1d2fe`, commit `11f1f2e9ee21540fde9ae31938268e7958150ab1`). No data deletion or mobile code change was needed.

## Verification

- Confirmed the failed deployment commit has no Moments route.
- 27 Moments unit tests passed.
- 31 Moments and Festival database integration tests passed against an isolated temporary database.
- Production should return JSON 401 for a signed-out `/api/moments` request, not HTML 404. Signed-in requests should return the Moments snapshot.

Keep feature-branch deployments on a separate Railway service/environment; production should track `main`.

Live recovery check: both `/api/moments` and `/api/shopping` returned HTTP 401 with JSON `Sign in required.` for unauthenticated requests after deployment, confirming the missing routes are restored. A signed-in phone refresh remains the user-session verification step.
