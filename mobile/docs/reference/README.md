# Swift reference captures

This folder holds the reference captures that the React Native port is compared against. The
earlier passes are documented in [`PARITY.md`](PARITY.md). This file indexes the **second capture
pass**, which followed the `origin/main` merges that added Important Moments, Shopping Lists and the
calendar connections, and simplified the Today focus and attention sections (`63d9542`).

The screen inventory these captures back is in `docs/IOS_TO_REACT_NATIVE.md` §20, under "New Swift
screens after the migration baseline".

## How they were taken

These settings are the same as the first pass:

- **Device:** iPhone 17 Pro simulator, iOS 26.5.
- **Text size:** Dynamic Type `large` (font scale 1.0).
- **Build:** the Swift app only, a Debug build from `ios/Nexdo.xcodeproj`. The React Native app was not run on the simulator.
- **Capture:** `PLATFORM=ios ./scripts/capture.sh <name>` writes `ios/<name>.png` at 720 px wide.
- **Dark variants:** `xcrun simctl ui <device> appearance dark`.
- **Navigation:** an XCUITest driver that runs from files in the scratchpad (not committed). Each capture first checked the view tree for text that identifies the screen, and was refused if it did not match. The Settings page never goes idle, so XCUITest cannot dump it; the `account-settings-*` captures were checked by screenshot instead.
- **Account:** the demo account, with live server data. Test data created for these captures is
  named `Parity …` (see "Test data" below).

Naming follows the first pass: `<screen>-<state>[-dark]`. Validation states are named
`-error-<cause>`.

## Superseded captures

These first-pass captures show screens that `63d9542` changed:

| Capture | Status |
| --- | --- |
| `today-default`, `today-3days`, `today-5days` | **Replaced in place.** The new captures show the simplified "Your day, in focus" card, the Quick Access tiles and the "Needs attention" row. |
| `today-action-needed` | **Still current.** Corrected in UI-parity pass 2: 63d9542 removed the inline "Needs your attention" list, not this card. `TodayActionsView` (the pink "Action Needed" card) is still rendered on the Today range, now after the intelligence card (`RootView.swift:1098-1100`). The list it was confused with is superseded by `today-attention-row`. |
| `attention-details-default` | **Superseded** by `today-attention-sheet-half` and `today-attention-sheet-full`. "Needs attention" is now a `.sheet` with medium and large detents (`RootView.swift:1188-1191`, `TodayAttentionSheet`). The pushed `attentionDetails` view (`RootView.swift:1217`) has no caller left. |
| `ask-default`, `account-default` | Re-shot, because the content under them changed. The layout did not change. |

`schedule-check-default` and `overdue-default` are **no longer reachable** (corrected in UI-parity pass 2).
The attention sheet does not push them: it pushes its own inline `List` for a schedule check
(`TodayAttentionSheet.swift:66-74`) and never opens `OverdueTasksView`. Their only remaining callers are
the dead `attentionDetails` and two `navigationDestination`s whose state nothing sets
(`RootView.swift:1193-1198`). The captures stay as a record; the RN routes stay registered, uncalled.

## Index

| Area | Captures |
| --- | --- |
| Today | `today-default`, `today-3days`, `today-5days`, `today-dark`, `today-scrolled-1`, `today-attention-row` |
| Needs attention | `today-attention`, `today-attention-sheet-half`, `today-attention-sheet-full`, `today-attention-sheet-dark`, `today-reschedule-all`, `today-reschedule-all-dark` |
| Important Moments, list | `moments-default`, `moments-default-scrolled`, `moments-default-dark`, `moments-empty`, `moments-scheduled`, `moments-scheduled-dark`, `moments-sent-empty`, `moments-filter-menu`, `moments-search-keyboard`, `moments-manage-list`, `moments-manage-list-dark` |
| Moments settings | `moments-settings`, `moments-settings-scrolled`, `moments-settings-dark`, `moments-settings-contact-alert`, `moments-calendar-import-empty`, `moments-festivals`, `moments-festivals-india`, `moments-festivals-region-menu`, `moments-festivals-dark` |
| Create Moment | `moment-create-default`, `moment-create-dark`, `moment-create-type-menu`, `moment-create-date-picker`, `moment-create-contact-picker`, `moment-create-filled`, `moment-create-filled-scrolled`, `moment-create-error-empty-title`, `moment-create-past-date-before-save`, `moment-add-recipient-error-empty` |
| Manage Moment: Details | `moment-manage-details`, `moment-manage-details-scrolled`, `moment-manage-details-dark`, `moment-manage-options-menu`, `moment-manage-saved-notice`, `moment-manage-discard-dialog`, `moment-manage-error-past-date` |
| Manage Moment: Contacts | `moment-manage-contacts` |
| Manage Moment: Wish Message | `moment-manage-wish`, `moment-manage-wish-scrolled`, `moment-manage-wish-saved`, `moment-manage-wish-error-empty`, `greeting-card-editor`, `greeting-card-editor-scrolled` |
| Manage Moment: Schedule | `moment-manage-schedule`, `moment-manage-schedule-scrolled`, `moment-manage-schedule-dark`, `moment-manage-schedule-channel-menu`, `moment-manage-schedule-error-unsaved-message`, `moment-manage-schedule-confirm`, `moment-manage-schedule-saving`, `moment-manage-schedule-scheduled` |
| Schedule confirmed | `moment-schedule-success` |
| Festival moments | `festival-manage-details`, `festival-manage-details-dark`, `festival-manage-contacts`, `festival-manage-wish`, `festival-manage-schedule` |
| Custom moment wish flow | `moments-upcoming-row-needs-review`, `review-wish-default`, `review-wish-scrolled`, `review-wish-personalize`, `review-wish-dark`, `review-wish-error-empty`, `wish-delivery-default`, `wish-delivery-schedule-option`, `wish-delivery-dark`, `schedule-wish-default`, `schedule-wish-scrolled`, `schedule-wish-dark` |
| Wish details | `wish-details`, `wish-details-scrolled`, `wish-details-dark`, `wish-edit-schedule`, `wish-cancel-dialog` |
| My Lists | `shopping-lists-default`, `shopping-lists-dark` |
| New List | `shopping-new-list`, `shopping-new-list-filled`, `shopping-new-list-use-last`, `shopping-new-list-dark`, `shopping-new-list-error-empty-name` |
| List detail | `shopping-detail-default`, `shopping-detail-empty`, `shopping-detail-checked`, `shopping-detail-typing`, `shopping-detail-options-menu`, `shopping-detail-dark`, `shopping-complete-trip-dialog` |
| Item editor | `shopping-item-editor`, `shopping-item-editor-scrolled`, `shopping-item-editor-category-menu`, `shopping-item-editor-dark`, `shopping-item-editor-error-empty-name` |
| Add by Voice | `shopping-voice-ready`, `shopping-voice-listening`, `shopping-voice-stopped`, `shopping-voice-dark` |
| Review Items | `shopping-review-items`, `shopping-review-items-dark`, `shopping-review-items-error-empty-name` |
| List Settings | `shopping-list-settings`, `shopping-list-settings-dark`, `shopping-list-settings-error-empty-name` |
| Share List | `shopping-share-list`, `shopping-share-list-link`, `shopping-share-list-dark`, `shopping-share-sheet-text` |
| Ask AI | `ask-default`, `ask-text-dark` (plus the first pass's `ask-text-default`, `ask-dark`, `ask-answered-default`) |
| Account → Calendars | `account-default`, `account-settings-default`, `account-settings-calendars-empty`, `account-settings-calendars-dark`, `account-settings-calendar-connecting`, `account-settings-calendar-error-cancelled` |

## Not captured

| Screen or state | Why |
| --- | --- |
| Recurring Tasks hub, New Recurring Task (`ShoppingViews.swift:38-76`) | **Unreachable.** The only links to them are in `ShoppingTodayContent` and `QuickAccessDirectory`, and nothing creates either view. |
| Today Shopping card (`ShoppingTodayCard`, `ShoppingViews.swift:3-37`) | **Unreachable.** It is defined but never instantiated. The Today screen reaches Shopping through the Quick Access tile. |
| Quick Access directory (`QuickAccessDirectory`, `TodayQuickAccess.swift:98-113`) | **Unreachable.** It is private and never instantiated. |
| My Lists, empty (`ContentUnavailableView` "Your next trip starts here") | Capturing it would mean deleting the account's real lists. The `-shopping-design-preview` harness always seeds one list. |
| Account → Calendar: connected list, Disconnect dialog, "Add my scheduled tasks here" toggle, "Connect another calendar" | The demo account has no calendar connected. Connecting one means signing in to Google, which could not be done here. The empty state, the "Connecting…" state and the cancelled-sign-in error are captured. The rest has to be ported from `ProfileView.swift:288-331`. |
| Moment confetti, mid-animation | It is a transient animation. Only the "Saving…" state and the settled "Schedule confirmed" screen were captured. |
| Schedule Wish, past date | `DatePicker(in: Date()...)` does not allow a past date to be picked, so there is no error state to show. The button's `date <= Date()` guard is not re-evaluated as time passes (see the report). |
| Greeting card generation result | Not triggered, because each generation is a paid AI call. The editor is captured before generation. |

## Global patterns introduced by these screens

These are new since `PARITY.md`, and more than one screen uses each of them:

1. **`MomentSegments`** (`ImportantMomentsView.swift:615-629`) is a gradient segmented control: the selected segment is filled with the indigo→magenta brand gradient and white text, inside a pale capsule. It is used for Upcoming / Scheduled / Sent. It is not the system segmented `Picker`.
2. **The Manage Moment step tabs** (`ManageFestivalView.swift:120`): Details / Contacts / Wish Message / Schedule, drawn as a solid indigo pill on the selected step. Changing tab **auto-saves** when there are unsaved edits, and a failed save keeps you on the current tab.
3. **The header summary card** (`ManageFestivalView.swift:100-119`, `identity`): an icon tile, the title, the send date, and an **Active** toggle, on the glass card.
4. **`MomentCard`** (`ImportantMomentsView.swift:4-11`): the glass card used for every card in Moments and in the Shopping hub.
5. **`MomentPrimary`** (`ImportantMomentsView.swift:12-16`): a full-width gradient capsule button. A validation error appears as inline magenta text directly under it (`moment-manage-wish-error-empty`, `moment-manage-schedule-error-unsaved-message`), not as an alert.
6. **Large section titles inside the content** (for example "Wish Message" and "Schedule" in Manage Moment), with the navigation title kept `.inline`.
7. **Two-step confirmation for committing actions:** Schedule Wish opens a "Review schedule" sheet with Confirm Schedule (`ManageFestivalView.swift:183-215`). Complete Trip, Delete list, Cancel wish and Disable moment each use a `confirmationDialog`.
8. **`Form` sheets with large titles and Cancel/Save in the toolbar:** Add Contact, Review Items, List Settings (Save only, no Cancel), Share List, and Item. Save is **disabled** while a required field is empty, which is how validation shows on every Shopping editor.
9. **A keyboard accessory "Done"** (`ToolbarItemGroup(placement: .keyboard)`, `MomentEditor.swift:106-109`) on the Moment editors. Tapping outside the field does not dismiss the keyboard.
10. **The iOS 26 floating glass sheet at the medium detent:** "Needs attention" and "Reschedule all" open at `.medium` as an inset, rounded, translucent card, and expand to `.large`.
11. **The Quick Access tile row on Today** (`TodayQuickAccess.swift:41-97`): three equal glass tiles (Weekly / Moments / Shopping), each with a gradient icon tile, a title and a one-line status ("3 upcoming", "1 items · Fri").
12. **The attention row on Today:** the old inline "Needs your attention" list is now one tappable row, with an orange triangle, "Needs attention" and a count ("1 overdue task"), that opens the sheet.

## Test data

Everything created for these captures is on the demo account and named `Parity …`, except where noted:

- **Moment "Parity Birthday"**, recipient Kate Bell (a simulator sample contact), 25 Oct 2026, with a scheduled wish "Confirmation required · Messages" for 25 Oct 2026 8:00 AM.
- **List "Parity Shopping List"**, with the items bananas (checked), Parity milk, eggs and loaf of bread. Its share link was created and then revoked.
- **Moment "Parity Custom"** (type Custom, recipient "Parity", 28 Sep 2026). Its wish was approved with the text "Parity wish: have a wonderful day!" and was **not** scheduled.
- **Task "Parity overdue task"**, dated 10 Aug 2026. It exists so that the attention sheet has content.
- From the first pass: calendar event "Parity reference event" (17 Sep), and the tasks "Call Damien" and "Email Priya".
- AI consent was granted on iOS for the Ask captures, then withdrawn.
