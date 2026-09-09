# Calendar search and missing schedule intelligence endpoint

September 8, 2026

## Changes

- Calendar has a search icon beside its title. Opening it focuses a native text field immediately. Keywords filter event and task titles in the selected Schedule, Week, or Month date range, respecting existing filters. Matching ignores case and accents. Clear, Cancel, and no-match states are provided. Search results in Week and Month cover the displayed range, rather than only the selected date.
- Railway HTTP logs confirmed that native requests to `/api/schedule-intelligence?scope=today` returned 404, including the requests at 7:51 and 7:52 PM. The previous production build did not include that route.
- Deployed an isolated patch based on a source-only snapshot of the running service, downloaded with the user's approval. The patch adds three runtime files: the GET route, its server read model, and schedule analysis. Existing production files and migrations are unchanged. The release patch is saved in `releases/schedule-intelligence-endpoint.patch`.

## Verification

- iOS Debug simulator build passed, including the sample-data preview configuration.
- All 46 Swift tests passed, including keyword case, accent, whitespace, and no-match cases.
- Simulator UI checks verified immediate typing after tapping Search, filtered Schedule and Month results, the no-match message, and Cancel restoring all items.
- Existing server analysis/integration suites: 27 tests passed.
- Isolated production-source patch: 24 tests passed. GET route tests cover authentication, account isolation, the native response contract across UTC midnight, and invalid parameters. The same six GET tests also pass in the main workspace.
- Isolated Next.js production build passed using webpack; Railway's normal Turbopack production build also completed.
- Live invalid-session smoke request now returns JSON HTTP 401 (`Sign in required.`), replacing the missing-route 404. No customer credentials or authenticated customer data were used in this smoke check.
- Production startup reported no pending database migrations and a ready server.

## Release

- Project: `d346fed0-68ae-4d48-96e3-2916b39f997b`
- Service: `033a6b90-bde7-472a-b6c1-39a5cb2a09ae` (Harbour), production
- New deployment: `83a912a4-3435-4308-a3d4-9844d78810e1`
- Previous deployment, if rollback is needed: `40be80fd-1429-49e6-9707-3f87eb34edfa`

The backend endpoint is live. The Calendar search UI requires rebuilding/installing the updated iOS app. An authenticated review on the user's physical device remains to be confirmed.
