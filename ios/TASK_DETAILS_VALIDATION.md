# Native Task Details

Implemented September 7, 2026, using the existing Nexdo Xcode project and deployment/signing settings.

## Implementation

- The entire Tasks card, including its chevron and completion icon, opens one large native sheet. X dismisses it without replacing task query/filter state. Existing Today editor entry points also use the new editor; creation keeps its existing screen.
- Fixed header and bottom actions surround one scrolling surface. Shared Nexdo colors/gradients, outlined controls, native menus/date/time pickers, accessible row toggles, expanding multiline notes, and keyboard focus scrolling reproduce the references.
- An edit buffer loads the selected task's title, priority, estimate, energy, shorter-session flag, critical reminders, schedule, recurrence, steps, and notes. Blank titles and invalid estimates are rejected. Pending step text is included on save; the existing 50-step limit is enforced.
- Save and completion use the shared AppModel/APIClient and update the task store in place. Completion saves pending edits first. Duplicate submissions are blocked; errors retain the editor and entered values. Scheduling uses a separate PATCH because the existing endpoint's scheduling branch returns before processing other fields.
- Unchanged recurrence and steps are omitted to preserve complex recurrence settings and completed step records. Changed steps follow the existing server's replace-all semantics; step completion is not exposed because that endpoint does not support it. Relation edits are reconciled by retrieving the canonical task from the existing task list endpoint.
- Focus uses the existing server start/finish contract with one AppModel session, a shared banner, and automatic finish at its deadline. Finishing records no time past that deadline. No new notification or networking framework was added.

## Reused APIs and components

- GET `/api/tasks`: selected task data and canonical relations.
- PATCH `/api/tasks/[id]`: details, recurrence, steps, critical reminders, schedule, start, complete/restore, and focus start/finish.
- Scheduling continues to invoke the server's existing reminder scheduling and calendar synchronization.
- Existing NexdoTask, AppModel, APIClient, ServerDate, TaskQuery, SwiftUI sheet/navigation pattern, Nexdo color tokens, and gradient theme.

## Validation actually performed

- Debug iOS simulator build and unsigned Release iOS device build succeeded in Xcode 26.6 with the iOS 26.5 SDK. An isolated snapshot build excludes concurrent Ask AI changes.
- 21 Swift package tests passed, including six new tests for decoding editor fields, preserving unchanged relations, split schedule payloads/DST instants, explicit recurrence removal, input validation, and no-op drafts.
- Installed and opened the native debug fixture build on iPhone 17 Pro Max, iPhone 15 Pro Max, and iPhone SE (3rd generation), all iOS 26.5.
- iPhone 17 Pro Max: opened the sheet from the card, edited title/priority/estimate/energy, toggled shorter sessions and reminders, opened native date/time pickers, selected a date and recurrence, added a step, edited notes, and observed focus-driven scrolling and the persistent footer.
- An unauthenticated fixture save failed with a readable error; dismissal of the alert preserved all edited values. Closing the sheet returned to the previous Today task filter.
- iPhone 15 Pro Max and iPhone SE: inspected sheet layout. Also inspected accessibility-extra-large Dynamic Type on SE: metadata/footer stack vertically; restored its text size afterward.
- Read accessibility trees: header order, labeled fields/menu values, native switch semantics, completion/save/close actions. Reduce Motion gates explicit editor animations in code.
- Card and chevron share one Button in code. A separate coordinate tap on the chevron could not be exercised because computer-use coordinate actions failed; the card's accessibility action was exercised successfully.

## Remaining validation and limitations

- No dedicated test-account credentials were supplied. Authenticated login, successful save/completion/start/focus, server persistence, reminder delivery, and deployed API compatibility remain unverified. The preview fixture is not a backend success simulation.
- Scheduling and details cannot be atomic with the current endpoint. A schedule failure after a successful detail save explicitly reports partial success and retains edits for retry.
- Full spoken VoiceOver navigation, live Reduce Motion switching, physical devices, and all keyboard/landscape combinations remain unverified.
- The native focus state is session-scoped like the existing native authentication state; app termination does not restore its banner. The existing backend remains authoritative for recorded focus segments.
- The current server does not expose schedule removal or individual step-completion updates through this editor's update contract, so the screen does not invent those mutations.
