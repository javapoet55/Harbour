# Today: Action Needed + Next Up

## Implementation

The existing Today screen now uses `TodayActionQueue`, a deterministic core presentation model. It selects one due primary action by scheduled time, with task priority as the tie breaker. Other overdue/due actions and actions within the configurable `TodayActionQueue.windowMinutes` (15) appear in Next Up. Later actions are merged into the existing schedule using their effective snooze time. Completed, cancelled, deleted, and dismissed actions are excluded. Duplicate task IDs cannot occupy multiple queue sections.

When actions are imminent, Today shows Daily Briefing (using the existing assistant), retains access to Weekly Summary, shows the primary/Next Up sections, and labels the remaining schedule Later Today. The existing recommendation card prioritizes the primary action. Without imminent actions, the existing summary layout remains. Three- and five-day views retain their normal schedule presentation.

The visible Today screen and View All sheet refresh time-dependent presentation once per minute using SwiftUI TimelineView, as well as immediately when task/action publishers change. Foreground task refresh and notification routing continue through the existing infrastructure. No second-by-second timer or new notification manager was introduced.

## Files

Created:
- `ios/Sources/NexdoCore/TodayActionQueue.swift`
- `ios/App/TodayActionsView.swift` — primary card, compact rows, View All sheet, and snooze menu.
- `ios/Tests/NexdoCoreTests/TodayActionQueueTests.swift`
- This document.

Modified:
- `ios/App/RootView.swift` — integrates the queue into the existing Today screen, filters/merges remaining schedule rows, extends the recommendation card, and preserves other navigation.
- `ios/App/TaskActionCoordinator.swift` — accepts custom snooze dates and remembers resolved contact details in account-scoped session memory.
- `ios/App/TaskActionView.swift` — permits an explicit Today communication button to start the selected existing contact-resolution flow; remembers the selected contact for capability display.
- `ios/Sources/NexdoCore/TaskActionDetector.swift` — recognizes “to confirm/discuss/arrange/review” as task context.

## Notification and communication behavior

Snooze choices are 5, 10, 15, 30, and 60 minutes, plus a custom date/time. They update the existing action snooze timestamp and reuse the existing local notification replacement service. The underlying task schedule is not rewritten by snoozing an action prompt. Dismiss cancels the action prompt and its reminder, not the task.

Known selected contacts expose only channels for which they have an address. Unresolved contacts expose channel choices that enter the existing permission/disambiguation flow. Contact details are held in memory, cleared on account changes, and never guessed or uploaded. The default person icon is used when no contact photo is available.

The Today Call button opens the existing contact lookup and explicit call confirmation. Message and Email open native editable composers through the same services used in Task Details. Queue rows and notification taps open the action screen without starting a communication. Selecting a channel on the primary card is the explicit request to enter that channel's flow; it never approves Send or places a call silently.

No new Info.plist permissions are needed. Existing Contacts and notification permissions apply. iOS decides SMS versus iMessage, Mail must be configured, delivery is not verified, and opening Phone does not prove a connected call. The original task still requires explicit completion. Action reminders remain device-local and are subject to iOS notification settings. Contact permissions and native compose behavior require device testing.

## Tests

Seven new queue tests cover:
- One due primary action.
- The 10:00/10:05/10:10 acceptance order and timed promotion after completion.
- Snooze to Later Today and dismissal without task deletion.
- Oldest-overdue ordering and priority ties.
- Empty state, inclusive 15-minute boundary, and tomorrow exclusion.
- Cross-section duplicate prevention and deleted/completed tasks.
- The acceptance example's email contact/context extraction.

Run:
```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swift test --package-path ios
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project ios/Nexdo.xcodeproj -scheme Nexdo -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/nexdo-overdue-verified CODE_SIGNING_ALLOWED=NO build
```

## Device acceptance checks / remaining verification

1. Create contact tasks at the current time, five minutes ahead, and ten minutes ahead, plus normal tasks later today. Use your own test contacts. Confirm exactly one primary, two Next Up rows, and normal work in Later Today.
2. Tap a primary channel. Verify contact permission/selection, explicit Call confirmation, or editable native compose. Cancel first. Send/call only to a recipient you control after explicit approval.
3. Complete the primary action through a native composer. Confirm the next task remains in Next Up until due, then promotes within the screen's one-minute refresh cadence. Marking the task complete must also remove it immediately.
4. Try each snooze duration and a custom time tomorrow. Confirm immediate queue recalculation, correct Later Today time, no old-time duplicate, and no Today row for the action deferred to tomorrow. Check the replacement notification on device.
5. Dismiss the primary. Confirm the next due action promotes and the dismissed task still exists in Tasks.
6. Tap Next Up → View all, then a row. Confirm Due now/Upcoming grouping and the existing action sheet. Close without communicating; test with multiple overdue tasks and priority ties.
7. Edit or delete a queued task, foreground the app, and open a notification. Confirm the queue reflects the current task state. Switch Today/3 days/5 days and verify existing schedule and report navigation remain available.
8. Check light/dark appearance, large Dynamic Type, VoiceOver, small-screen scrolling, and access above the existing bottom tabs.

No backend work or additional feature implementation is pending for this V1. Physical-device notification delivery, contact permissions, and real communication outcomes remain manual verification steps; automated tests do not send messages or make calls.
