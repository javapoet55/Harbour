# Nexdo Task → Action V1

## What ships

Normal contact-oriented tasks gain one compact **Nexdo Action** card in Task Details. The task creation form recognizes phrases such as “Contact Damien at 10 AM,” previews the resulting schedule, and saves that date through the existing task API. Choosing a date explicitly overrides the detected date. Editing an existing task's saved schedule always overrides older time wording in its title.

The action sheet offers Call, Message, Email, a 15-minute reminder, and Dismiss. Opening a reminder only selects the requested channel; it does not contact anyone. Contact access is requested only after choosing a communication channel. Multiple contacts and multiple addresses require selection. A selected contact identifier is remembered for that task on this device.

Calls require a confirmation with the selected number before opening Phone. Messages and email use editable native composers; the user must press Send. Native composer submission does not prove delivery. Opening Phone does not prove that a call connected. Completing the underlying task is a separate, explicit button.

## Files created

- `ios/Sources/NexdoCore/TaskAction.swift`: action types, structured metadata, guarded status transitions, reconciliation, notification planning, and scheduler protocol.
- `ios/Sources/NexdoCore/TaskActionDetector.swift`: deterministic English detector behind a replaceable `TaskActionDetector` protocol.
- `ios/App/TaskActionCoordinator.swift`: account-scoped local persistence, notification routing, snooze/dismiss/approval orchestration, serialized scheduling updates.
- `ios/App/TaskActionNotifications.swift`: UNUserNotificationCenter scheduling and CONTACT_TASK notification actions/delegate.
- `ios/App/TaskActionContacts.swift`: Contacts permission and resolution service; ambiguous matches are returned for selection.
- `ios/App/TaskActionComposers.swift`: native MessageUI wrappers and replaceable email draft service.
- `ios/App/TaskActionView.swift`: compact task card and action/confirmation/composer UI, with accessibility labels and identifiers.
- `ios/Tests/NexdoCoreTests/TaskActionTests.swift`: seven regression tests covering the new core behavior.
- This document.

## Files modified

- `ios/App/NexdoApp.swift`: registers the application notification delegate.
- `ios/App/RootView.swift`: observes published task changes, scopes action state to the signed-in account, routes notification actions, and applies detected dates to new tasks.
- `ios/App/TaskDetailsView.swift`: adds the compact action card.
- `ios/Nexdo.xcodeproj/project.pbxproj`: adds Contacts usage text to Debug and Release configurations.

Existing task API persistence, other reminder systems, task/project navigation, and unrelated work remain in place. No backend migration or deployment is required for this device-local V1.

## Architecture and state

`TaskActionDetector → saved task → TaskActionReconciler → TaskActionCoordinator → TaskActionNotificationScheduler`

Detection returns intent, contact name, preferred channel, optional time, and context. Future intent cases are reserved; only contact/call/message/email/follow-up execute in V1. An LLM detector can implement the same protocol. The scheduler protocol allows a future backend adapter. The email service abstraction owns compose availability and suggested drafts; a future provider implementation must retain explicit approval.

Task snapshots come from the existing AppModel publisher. Deleted/completed/cancelled/non-actionable tasks remove action reminders. A changed date/title creates a new action identity, removing the old notification; the chosen contact is retained only when the contact name and intent are unchanged. Unchanged snapshots preserve snoozes and action state.

The execution gate requires `awaitingApproval → approved → executing`. Notification taps never enter executing. A Phone launch remains executing with an explicitly unverified outcome. A native composer `.sent` callback records completed action submission, not task completion or delivery. Cancelling a composer returns to awaiting approval. Interrupted execution is treated as awaiting approval after a process restart.

Metadata is stored as JSON in Application Support/TaskActions under a SHA-256 account identifier, using atomic writes, iOS file protection, and backup exclusion. Phone numbers/email addresses are resolved into sheet memory rather than stored in action metadata. Action metadata is not synced across devices. Signing out cancels this device's pending action reminders and clears the active action screen; account-local metadata remains available for the next sign-in.

## Permissions and iOS limits

- `NSContactsUsageDescription`: “Nexdo uses Contacts to let you choose who to call, message, or email for your tasks. Contact details stay on this device.” Both full and limited contact access are supported. Denial and missing fields show actionable messages.
- Notifications use the system authorization prompt. When denied, the card explains how to enable them and offers Retry reminders in the action sheet.
- Notification content includes the contact name, subject to the user's iOS preview settings. No contact lookup happens in the notification delegate.
- No communication is sent automatically. MessageUI determines whether the message uses SMS or iMessage; Nexdo cannot force iMessage. Mail requires native Mail configuration. Unsupported devices show an unavailable message.
- Phone accepts ordinary formatted numbers. Extensions, pause characters, and vanity numbers are rejected rather than silently converted to a different destination.
- Local notifications are OS-delivered, not a running application timer. Focus/notification settings can suppress or delay presentation. Expanded notifications expose more actions than compact banners.
- V1 schedules the next 48 future actions, reserving headroom for other local notifications. Opening/refreshing Nexdo replenishes the set; overflow is disclosed. Changes made on another device take effect here after this device refreshes its task data.
- Notification scheduling uses the device's local timezone. The underlying date is an absolute instant; a task refresh rebuilds the trigger in the current timezone.
- The existing app uses an ephemeral authentication session. A cold launch may require sign-in before a pending notification can open its action screen. A different account cannot execute the saved action.
- English parsing supports explicit AM/PM, tomorrow, weekdays, morning (9 AM), afternoon (2 PM), and evening/tonight (7 PM). A time without a day that has already passed means tomorrow. Ambiguous/invalid times are not inferred; use the task's schedule controls. The creation form previews the actual saved schedule.

## Automated verification

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swift test --package-path ios
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project ios/Nexdo.xcodeproj -scheme Nexdo -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/nexdo-overdue-verified CODE_SIGNING_ALLOWED=NO build
```

Core regression coverage: all six requested detection examples, context before/after the time, timezone and DST boundaries, midnight/noon and next-day rollover, missing/ambiguous metadata, approval transitions and persistence round-trip, unchanged snapshot identity, rescheduling/contact retention, deletion/completion/cancellation, missing dates, expired reminders, snooze, and dismissal. These exercise the scheduler's desired notification set; OS delivery and Contacts/MessageUI require the device checks below.

## Exact manual test steps

1. Build/run the Nexdo scheme on an iPhone. Sign in. Add a test contact named Damien with a phone number and email address you control. Configure Mail and Messages.
2. Before 10 AM, create **Contact Damien at 10:00 AM.** Confirm the form previews today's 10 AM. For an immediate test, instead use an explicit time two minutes ahead. Save, open Task Details, and confirm one Nexdo Action card and the expected date. Allow notifications.
3. Background Nexdo and lock the phone. At the scheduled time, confirm **Time to contact Damien** appears. Expand the notification to inspect Call, Message, Email, and Remind me later.
4. Tap the notification body. Unlock/sign in if requested. Confirm the action sheet appears and nothing is called/sent. Tap Call, allow Contacts, and confirm **Call Damien?** shows the correct number. First choose Cancel and verify no call. Repeat and approve only with your test number; verify Phone opens. Return to Nexdo and verify it does not claim a connected call or complete the task.
5. Select Message. Confirm the native composer has the selected recipient and an editable body. Cancel and verify no completion. Repeat with **Contact Damien about the roof inspection at [future time]**; confirm useful editable context. Send only to your own test recipient and inspect the submission receipt. Explicitly mark the task complete and confirm it disappears from open tasks.
6. Select Email for a fresh task. Confirm recipient, editable subject/body, and native Send/Cancel. Test Cancel and Save Draft as well as an explicitly approved test send. Confirm neither draft nor cancellation claims a send.
7. Create two Damien contacts. With a new task, verify both are offered and none is silently selected. Give one two phone numbers/emails; verify address selection. Reopen the same task after selecting a contact and verify that person is remembered. Use Choose a different contact to clear the selection.
8. Deny Contacts access; verify helpful guidance and no crash. Test a nonexistent contact, a contact without a phone number, and one without email. Test Mail unconfigured and Messages unavailable on Simulator; verify graceful errors.
9. Schedule a task a few minutes ahead, then edit its schedule to a later time. Verify the original notification does not fire and the new one does. Delete another scheduled task, complete another, and remove the contact-oriented title from another; verify each pending reminder is cancelled.
10. From a due action choose Remind me in 15 minutes. Confirm the card's new reminder time and a notification 15 minutes later. Choose Dismiss on another action and verify no automatic repeat. Reopen manually to act again if desired.
11. Deny Notifications in Settings. Create a future contact task; verify the card explains the setting. Enable Notifications, return to the action sheet, and tap Retry reminders; verify recovery.
12. Terminate Nexdo after scheduling and test notification delivery/cold-launch routing. Sign in to the same account when requested. Verify a different account cannot open the action. Sign out while reminders are pending and verify they are cancelled.
13. Check light/dark mode, large Dynamic Type, VoiceOver labels, and a small device. Confirm the action card does not crowd existing task controls and native composer Cancel/Send remains accessible.

Device communication tests are deliberately manual: running automated real calls or sends would bypass the required per-action user approval.
