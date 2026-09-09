# Native Projects feature

Implemented in the existing Tasks destination. The four-item tab bar and shared focus-session strip remain in use. Tasks/Projects selection survives navigation into a project and back while the Tasks destination stays active.

## Architecture and behavior

- `ProjectsView` uses the shared authenticated `AppModel`, with a responsive two-column grid, single-column accessibility layout, localized case/diacritic-insensitive search, stable sorting, task counts, progress, and No project.
- Project Detail uses the existing NavigationStack, shared task rows, task search/status/priority filters, and existing TaskDetailsView. New tasks inherit the open project's ID.
- The native project editor trims names, validates 1–80 UTF-16 code units, supports Nexdo colors and keyboard submission, prevents duplicate saves, and retains input after errors.
- Project assignment is available in task creation and task details. Unrelated edits preserve it; removing an assignment sends explicit JSON null. Returned task mutations reconcile project counts, task lists and agenda immediately. Request IDs, account checks and revision checks discard obsolete reads.
- Project deletion requires confirmation and explains that tasks move to No project. The backend unassigns tasks and soft-deletes the project in one transaction; task data is retained.
- Loading, pull-to-refresh, empty/search-empty, retry, retained in-memory data after connection failures, and mutation progress are implemented. This is not a persistent offline write queue.
- Cards use adaptive light/dark surfaces, accessible text and progress descriptions, native controls, minimum control targets, and a one-column grid at accessibility text sizes. The existing Reduce Motion behavior is preserved.

## Backend and migration

The existing Prisma Project model and nullable Task.projectId foreign key were reused. Existing unassigned tasks appear under No project; existing valid assignments are preserved rather than erased.

`prisma/migrations/9_project_indexes/migration.sql` adds:

- Project(userId, deletedAt, updatedAt)
- Task(userId, projectId, deletedAt, status)

No tables, tasks, or assignments are removed by the migration. It was exercised against disposable integration-test databases, not production.

Authenticated endpoints:

| Method | Path | Behavior |
| --- | --- | --- |
| GET | /api/projects | Projects with aggregated counts and unassignedTaskCount |
| POST | /api/projects | Create validated name/color; 201 response |
| PATCH | /api/projects/:id | Edit owned active project |
| DELETE | /api/projects/:id | Transactionally unassign tasks and soft-delete project |
| GET | /api/projects/:id/tasks | Return owned active project's tasks |
| POST/PATCH | /api/tasks[/id] | Accept optional nullable projectId |

Every project operation derives ownership from the authenticated session. Foreign or deleted projects return 404. Assignment validation is performed inside the task transaction. Count retrieval uses a project query plus one grouped task query, without per-project queries. Counts include completed tasks and exclude cancelled/soft-deleted tasks.

The existing task PATCH endpoint handles scheduling/status as separate actions. A combined project assignment and scheduling/status action is explicitly rejected instead of silently dropping fields. TaskDetailsView already sends field edits and schedule/status operations separately.

## Changed files for this feature

New:

- `src/server/projects.ts`
- `src/server/projects.integration.test.ts`
- `src/app/api/projects/route.ts`
- `src/app/api/projects/route.integration.test.ts`
- `src/app/api/projects/[id]/route.ts`
- `src/app/api/projects/[id]/tasks/route.ts`
- `prisma/migrations/9_project_indexes/migration.sql`
- `ios/App/ProjectsView.swift`
- `ios/App/ProjectsPreview.swift` (DEBUG-only isolated simulator transport)
- `ios/Sources/NexdoCore/Projects.swift`
- `ios/Tests/NexdoCoreTests/ProjectTests.swift`
- `ios/Tests/AppModelChecks/ProjectChecks.swift`
- `ios/scripts/check-projects.sh`
- `docs/projects-feature.md`

Updated, preserving pre-existing edits:

- `prisma/schema.prisma`
- `src/server/tasks.ts`
- `src/app/api/tasks/route.ts`
- `src/app/api/tasks/[id]/route.ts`
- `src/lib/http.ts`
- `ios/App/NexdoApp.swift`
- `ios/App/RootView.swift`
- `ios/App/TaskDetailsView.swift`
- `ios/Sources/NexdoCore/Models.swift`
- `ios/Sources/NexdoCore/TaskDraft.swift`
- `ios/Sources/NexdoCore/TaskSaveInput.swift`

The workspace contained many unrelated modifications before this task; those were retained.

## Verification

Passed:

- Backend production compilation: `npx next build --webpack` (no deployment).
- `npm run typecheck`.
- 20 backend tests across Projects service/HTTP integration, task-list routes and existing task/reminder regressions. Real task POST/PATCH endpoints were exercised for assign/unassign/preservation and account isolation. Tests use temporary SQLite databases.
- 48 Swift package tests, including search, deterministic sorting, empty results, absent project fields, and assignment patch semantics. Use the Xcode toolchain: `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swift test --package-path ios`.
- Six actual AppModel checks via `bash ios/scripts/check-projects.sh`: failure preservation, stale mutation/read protection, duplicate saves, deletion preserving tasks and agenda, immediate reassignment counts, and rejecting old-account responses.
- Existing task-refresh regression harness: six checks passed via `bash ios/scripts/check-task-refresh.sh`, including stale GET protection, timeouts, retry, and session redirect handling.
- iOS simulator build for both simulator architectures, scheme Nexdo, Debug, signing disabled.

On iPhone 17 Pro Max / iOS 26.5, inspected the Projects list, Project Detail, project editor and task-details integration. Exercised creation with an injected failed first save and successful retry, task creation preselection, moving a task, immediate counts, search, sort, back navigation and retaining the Projects segment. Inspected light/dark appearance and single-column layout at accessibility text sizes, then restored normal text size.

Simulator QA used a DEBUG-only URLProtocol transport, launched with `-projects-design-preview -projects-fail-first-save`. It intercepts every preview request and uses synthetic data; it does not send data to production. The underlying API and database behavior were tested separately. Native navigation-bar actions were not exposed through simulator automation, so editing/deletion were verified through real AppModel and HTTP integration tests rather than a full simulator tap-through. A final manual check of those menu actions on a signed-in device remains appropriate before release.

## Release work still required

The initial implementation was not deployed. Following the user’s later approval, the isolated Projects backend and index migration were deployed successfully as `f24131fe-e6c9-417f-8572-5dd3d656fac8`; see `docs/projects-404-fix.md`. No new environment variables or external services are required. The installed iOS Projects screen can use the endpoints without another rebuild. Normal iOS distribution and the signed-in-device checks described above remain separate from this backend release.
