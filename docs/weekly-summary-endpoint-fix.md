# Weekly Summary 404 and week boundaries

September 8, 2026

Production HTTP logs confirmed the iPhone's Weekly Summary requests returned 404 on deployment `83a912a4-3435-4308-a3d4-9844d78810e1`. The endpoint existed locally but was not deployed.

Added the authenticated GET route and weekly-summary read model to the isolated production-source release used for the earlier schedule intelligence fix. Existing production files and migrations remain unchanged. The exact two-file patch is in `releases/weekly-summary-endpoint.patch`.

The server now normalizes every valid selected date to the Monday of its week. Results contain seven dates through Sunday, using account-local midnight boundaries and an exclusive next-Monday cutoff. Invalid dates and future weeks return HTTP 400. Responses are private and not cached. The native app already uses Monday starts; added a regression test for late Sunday and the next Monday.

Validation:
- 14 backend tests passed in both the workspace and isolated production-source release: Monday/Sunday boundaries, year rollover, timezone handling, account isolation, invalid/future dates, and authentication.
- 3 native WeeklySummaryTests passed, including daylight-saving and Sunday/Monday boundary checks.
- Local production build passed with the new route included.
- Railway production build and health check passed.
- Live invalid-session request returns JSON 401 (`Sign in required.`), rather than the previous 404. No customer credentials or authenticated customer data were used in this smoke check.

Deployment: `92463cf4-2fec-4b11-95b8-3e55a92eb945`, Harbour production, project `d346fed0-68ae-4d48-96e3-2916b39f997b`, service `033a6b90-bde7-472a-b6c1-39a5cb2a09ae`.

Previous deployment for rollback: `83a912a4-3435-4308-a3d4-9844d78810e1`.

This is a backend fix. The installed iPhone app can retry without rebuilding. Its authenticated live summary remains to be confirmed on the user's device.
