# Project creation 404: deployed backend fix

September 8, 2026

The native app calls `https://harbour-production-f8a0.up.railway.app/api/projects`. A live request with an invalid synthetic session cookie returned HTTP 404, confirming the route is missing (an implemented authenticated route would return JSON 401). No customer credentials were used.

Railway's current successful deployment is `92463cf4-2fec-4b11-95b8-3e55a92eb945`, which contains the earlier Weekly Summary fix but predates Projects. The previous Projects request explicitly prohibited deployment, so its endpoints had only been implemented locally.

Prepared a minimal release in `/private/tmp/nexdo-projects-release`, based on the source snapshot of that deployed version. The exact 10-file runtime change is `docs/releases/projects-endpoint.patch`. It adds project CRUD/list/tasks endpoints, ownership-validated task assignment, validation errors, and two indexes. Existing production behavior outside Projects, including Weekly Summary and schedule intelligence, remains in the release. Unrelated workspace changes are excluded.

Validation completed:

- 17 integration tests passed in the isolated release: Projects service and HTTP contract plus existing task/reminder regressions. These exercise project creation, editing, deletion, nullable task assignment, ownership isolation, invalid input, and count consistency.
- Tests migrated disposable databases only. No production data was changed.
- Local Next.js production build passed, with all three Projects route entries present.
- The patch applies cleanly to the deployed source snapshot.

The index migration reuses the existing Project table and Task.projectId foreign key. It does not delete tasks or change their assignments. Deleting a project through the feature unassigns its tasks transactionally.

The user approved deployment with “deploy now.” Released the isolated patch to Railway project `d346fed0-68ae-4d48-96e3-2916b39f997b`, service `033a6b90-bde7-472a-b6c1-39a5cb2a09ae`, production.

Deployment: `f24131fe-e6c9-417f-8572-5dd3d656fac8` — SUCCESS.
Previous successful deployment: `92463cf4-2fec-4b11-95b8-3e55a92eb945` (rollback reference).

Production startup confirmed `9_project_indexes` applied successfully and the server became ready. Live invalid-session GET and POST `/api/projects`, project-tasks GET, Weekly Summary GET, and schedule-intelligence GET all return JSON 401 (`Sign in required.`), replacing the Projects 404. No authenticated customer records were created or changed by these smoke checks.

The installed iOS app can retry project creation without rebuilding. An authenticated creation in the user's account remains for the user to confirm on their device.
