# Swift reference captures

This folder holds the reference captures that the React Native port is compared against. The
earlier passes are documented in [`PARITY.md`](PARITY.md). This file indexes the **second capture
pass**, which followed the `origin/main` merges that added Important Moments, Shopping Lists and the
calendar connections, and simplified the Today focus and attention sections (`63d9542`).

The screen inventory these captures back is in `docs/IOS_TO_REACT_NATIVE.md` §20, under "New Swift
screens after the migration baseline".

A **third pass** (Phase 11 Run D) covers the screens that `e13730b` (smart life reminders and shopping
intelligence) and `987a90e` (shopping polish) changed or added. See
[Run D: smart reminders and shopping intelligence](#run-d-smart-reminders-and-shopping-intelligence).

A **fourth pass** (Phase 12) covers everything new or changed on the iPhone between `8c36d98` and
`dcb8310`: the Wellness shell, Pomodoro, Calorie Tracker, the Ask AI cards and Daily Brief, Help,
Feedback, account security, Event Details, the task agent, Moments and Shopping. See
[Phase 12](#phase-12-wellness-ask-ai-account-tasks-moments-and-shopping).

A **fifth pass** (Phase 13) covers what `1938c7c..origin/main` changed: bug reporting, the calendar
connection onboarding and Apple (device) calendars, Moments in Calendar and Tasks, the follow-up
preparation, Settings, Today, Tasks, the dark Wellness chooser and small Shopping changes. See
[Phase 13](#phase-13-bug-reports-calendar-connection-device-calendars-today-tasks-and-shopping).

A **sixth pass** (Phase 14) covers `3b7e5c2..35c86e3`: the first-install introduction, the redesigned
sign-up, the dark Wellness modules, Ask AI, Account and Settings. See
[Phase 14](#phase-14-install-introduction-sign-up-dark-wellness-ask-ai-and-settings).

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
| `shopping-detail-default`, `shopping-detail-empty`, `shopping-detail-checked`, `shopping-detail-typing`, `shopping-detail-options-menu`, `shopping-detail-dark`, `shopping-complete-trip-dialog` | **Superseded by Run D** (`e13730b`, `987a90e`). Shopping Detail was redesigned: see the Run D "Shopping Detail" rows. |
| `shopping-review-items`, `shopping-review-items-dark`, `shopping-review-items-error-empty-name` | **No longer reachable** (`987a90e`). `ShoppingBatchReview` was deleted: typed quick add (`ShoppingViews.swift:374-387`) and Add by Voice (`ShoppingVoice.swift`) now append the parsed items straight to the list. |

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
| List detail | **Superseded** — see Run D. The second-pass captures (`shopping-detail-default`, `-empty`, `-checked`, `-typing`, `-options-menu`, `-dark`, `shopping-complete-trip-dialog`) show the old layout: "N remaining · N items" with a progress bar, circle checkboxes, per-category sections with "Add item", ⋯ → **Edit** (delete and reorder), and an inline **Complete Shopping Trip** row. None of that exists any more. |
| Item editor | `shopping-item-editor`, `shopping-item-editor-scrolled`, `shopping-item-editor-category-menu`, `shopping-item-editor-dark`, `shopping-item-editor-error-empty-name` |
| Add by Voice | `shopping-voice-ready`, `shopping-voice-listening`, `shopping-voice-stopped`, `shopping-voice-dark` |
| Review Items | **No longer reachable** — `shopping-review-items`, `shopping-review-items-dark`, `shopping-review-items-error-empty-name` |
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
11. **The Quick Access tile row on Today** (`TodayQuickAccess.swift:41-97`): three equal glass tiles (Weekly / Moments / Shopping), each with a gradient icon tile, a title and a one-line status ("3 upcoming", "1 item · Fri").
12. **The attention row on Today:** the old inline "Needs your attention" list is now one tappable row, with an orange triangle, "Needs attention" and a count ("1 overdue task"), that opens the sheet.

## Test data

Everything created for these captures is on the demo account and named `Parity …`, except where noted:

- **Moment "Parity Birthday"**, recipient Kate Bell (a simulator sample contact), 25 Oct 2026, with a scheduled wish "Confirmation required · Messages" for 25 Oct 2026 8:00 AM.
- **List "Parity Shopping List"**, with the items bananas (checked), Parity milk, eggs and loaf of bread. Its share link was created and then revoked.
- **Moment "Parity Custom"** (type Custom, recipient "Parity", 28 Sep 2026). Its wish was approved with the text "Parity wish: have a wonderful day!" and was **not** scheduled.
- **Task "Parity overdue task"**, dated 10 Aug 2026. It exists so that the attention sheet has content.
- From the first pass: calendar event "Parity reference event" (17 Sep), and the tasks "Call Damien" and "Email Priya".
- AI consent was granted on iOS for the Ask captures, then withdrawn.

## Run D: smart reminders and shopping intelligence

The third capture pass. It covers what `e13730b` ("Add smart reminders and shopping intelligence")
changed or added on the iPhone, plus the Shopping changes from `987a90e` ("Polish iOS shopping
experience"), which landed right after it and rebuilt the same screen. **Line numbers are as of
`98eddfb`** (the Swift sources are unchanged from `987a90e`). The `e13730b` diff has different line
numbers for `ShoppingViews.swift`, so cite the ones below.

### How they were taken

The settings are the same as the first two passes: iPhone 17 Pro simulator, iOS 26.5, Dynamic Type
`large`, a Debug build of the Swift app only, `PLATFORM=ios ./scripts/capture.sh <name>`, and
`xcrun simctl ui <device> appearance dark` for the dark variants. The XCUITest driver ran from a
temporary file that was not committed. It attached to the running app (`activate()`) and dumped the
view tree before each capture, and every capture was checked against that dump.

- **Account:** the same demo account as the second pass (jsriramk@gmail.com), with live server data.
  Its display name is now **John**, so the captures show "John" where the second pass showed "Sri".
- **Transient states:** the Item Alternatives loading state lasts about two seconds. For
  `shopping-alternatives-loading` and `-loading-dark`, the simulator was screenshotted in a loop while
  the star was tapped. The frame showing the spinner was kept and resized as `capture.sh` does.
- **Size:** `shopping-completion`, `shopping-alternatives`, `tasks-life-reminders` and
  `tasks-life-reminders-week` are 520–635 KB, over the 500 KB budget. `capture.sh` forbids palette
  quantisation, so they were kept as they are.

### Captures

| Area | Captures |
| --- | --- |
| Tasks tab with life reminders | `tasks-life-reminders`, `tasks-life-reminders-week`, `tasks-life-reminders-week-dark` |
| Task Details, reminder label | `task-details-life-reminder-expires`, `task-details-life-reminder-expires-dark`, `task-details-life-reminder-return`, `task-details-life-reminder-bill`, `task-details-life-reminder-renewal` |
| Account, Real-time Voice card | `account-voice-usage`, `account-voice-usage-dark` |
| Shopping Detail (redesigned) | `shopping-detail-redesign`, `shopping-detail-redesign-dark`, `shopping-detail-redesign-scrolled`, `shopping-detail-redesign-typing`, `shopping-detail-redesign-category-filter`, `shopping-detail-redesign-category-filter-dark`, `shopping-detail-redesign-options-menu`, `shopping-detail-redesign-empty`, `shopping-detail-redesign-empty-dark`, `shopping-detail-after-replace` |
| AI Powered Recommendations | `shopping-ai-recommendations-sheet`, `shopping-ai-recommendations-sheet-dark` |
| Complete Shopping | `shopping-complete-dialog`, `shopping-completion`, `shopping-completion-dark` |
| Item Alternatives | `shopping-alternatives-loading`, `shopping-alternatives-loading-dark`, `shopping-alternatives`, `shopping-alternatives-dark`, `shopping-alternatives-tip`, `shopping-alternatives-tip-dark` |

### Screen inventory

This table has the same columns as the §20 inventory in `docs/IOS_TO_REACT_NATIVE.md`.

| Built | Screen | Swift `body` | Presentation | Entry point | Reference PNGs |
| --- | --- | --- | --- | --- | --- |
| [x] | Tasks tab, **changed**: life-reminder tasks | `RootView.swift:1626` (`TasksView`); row `taskCard` `:1860-1890`. **The row has no life-reminder badge.** The badge `e13730b` added is in `TaskRow` (`:1551`, badge `:1601-1603`), and nothing instantiates `TaskRow` | Tab (Tasks) | Tab bar | `tasks-life-reminders`, `tasks-life-reminders-week`, `tasks-life-reminders-week-dark` |
| [x] | Task Details, **changed**: smart-reminder label | `TaskDetailsView.swift:3`; header `:94-108`, label `:98-102` | `.sheet(item: $editing)` (`RootView.swift:1709`) → `TaskEditor` (`:1914`) → `TaskDetailsView` (`:1939`) | Tap a task row | `task-details-life-reminder-expires`, `-expires-dark`, `-return`, `-bill`, `-renewal` |
| [x] | Account, **changed**: Real-time Voice card | `ProfileView.swift:60-99` (`AccountView`); card `:101-132`, placed at `:77`, loaded by `.task` `:97` | `.sheet` (`RootView.swift:1181`, `:1708`) | Avatar, "Open account for …" (`RootView.swift:1348`) | `account-voice-usage`, `account-voice-usage-dark` |
| [x] | Shopping Detail, **redesigned** | `ShoppingViews.swift:207-400` (`ShoppingDetail`); `body` `:230-311` | Push (`ShoppingViews.swift:16`, `:107`, `:134`) | A list on My Lists; after Create List | `shopping-detail-redesign*`, `shopping-detail-after-replace` |
| [x] | Shopping Recommendations | `AskNexdoView.swift:97` with `shoppingContext` (`ShoppingRecommendationContext`, `:89-95`) | `.sheet` (`ShoppingViews.swift:299`) | **AI Powered Recommendations** (`:321-328`) | `shopping-ai-recommendations-sheet`, `-dark` |
| [x] | Complete Shopping confirmation | `ShoppingViews.swift:308-310` | `confirmationDialog` | **Complete Shopping** (`:314`), only when `list.remaining > 0` | `shopping-complete-dialog` |
| [x] | Shopping trip completed | `ShoppingViews.swift:411-480` (`ShoppingCompletionView`); summary model `:402-409`; `completeTrip()` `:353-364` | `.fullScreenCover(item:)` (`:304-306`), with `MomentConfetti` (`:468`) | "Complete Shopping" | `shopping-completion`, `shopping-completion-dark` |
| [x] | Item Alternatives | `ShoppingViews.swift:511-609` (`ShoppingAlternativesView`) | `.sheet(item: $alternativesFor)`, detent `.large`, drag indicator (`:300-303`) | Star on a grocery row (`:638-639`) | `shopping-alternatives-loading`, `-loading-dark`, `shopping-alternatives`, `-dark`, `shopping-alternatives-tip`, `-tip-dark` |

### Element table

Every element Run D has to port, with its Swift source. The paths are relative to `ios/`.

**Life reminders (Tasks, Task Details)**

| Element | Swift source | Notes |
| --- | --- | --- |
| `lifeReminderType` → label mapping | `Sources/NexdoCore/Models.swift:62-73` (`lifeReminderLabel`) | `returnItem` Return, `bill` Bill, `expiration` Expires, `maintenance` Maintenance, `subscription` Subscription, `renewal` Renewal, `general` Reminder; anything else is `nil` |
| New task fields | `Sources/NexdoCore/Models.swift:57-60` | `reminderAt`, `lifeReminderType`, `lifeReminderConfidence`, `originalUserText` |
| Task Details label | `App/TaskDetailsView.swift:98-102` | `Label(label, systemImage: "sparkles")`, `.caption.weight(.semibold)`, magenta, between "TASK DETAILS" and the title. VoiceOver reads "Smart reminder: <label>" |
| Tasks row badge (dead code) | `App/RootView.swift:1601-1603` in `TaskRow` (`:1551`) | Uppercased label, `sparkles`, magenta `TaskBadge` (`:2129`). **Not rendered anywhere**, because `TaskRow` has no caller |
| Live Tasks row | `App/RootView.swift:1860-1890` (`taskCard`) | Title, clock subtitle and `TaskCategoryBadge` (`TaskCategoryBadge.swift:4`). No reminder badge |
| Server classification | `src/lib/life-reminders.ts:71-79` (`classify`), `:101-164` (`parseLifeReminder`), applied in `src/app/api/tasks/route.ts` | A recognised reminder becomes a 5-minute task and skips the schedule-conflict check |

**Real-time Voice card (Account)**

| Element | Swift source | Notes |
| --- | --- | --- |
| Card | `App/ProfileView.swift:101-132` | `.profileCard()` (`:168`). Placed under the name and email (`:77`) |
| Icon, title, total | `:107-116` | `waveform.circle.fill` in a 44 pt gradient circle, "Real-time Voice", "Monthly usage", used minutes in `.title3.bold()` indigo |
| Progress bar | `:117-120` | `ProgressView(value: usage.progress)`, blue tint, scaled ×1.8 vertically. VoiceOver reads "<used> used out of <limit> minutes this month" |
| Used / remaining row | `:121-125` | "N min used" … "N min remaining" |
| Month / limit row | `:126-130` | `calendar` label "<Month> · updated today" … "<limit> min / month" |
| Minute formatting | `:134-139` (`voiceMinutes`) | `0` → "0 min", under 60 s → "<1 min", under 10 min → one decimal ("8.2 min"), otherwise rounded |
| Month label | `:141-144`, formatter `:175` | Parses `yyyy-MM` in UTC. With no data: "This month · updated today" |
| Data | `Sources/NexdoCore/Models.swift:23-30` (`VoiceUsage`); `App/NexdoApp.swift:529-539` (`refreshVoiceUsage`, `recordVoiceUsage`) | `GET /api/voice/usage` when Account opens. `POST` every 15 s of active voice (`App/AddTaskByVoiceView.swift`). Limit 100 min (`src/server/voice/usage.ts:3`) |

**Shopping Detail**

| Element | Swift source | Notes |
| --- | --- | --- |
| Header | `App/ShoppingViews.swift:233-234` | Cart tile (`shoppingIcon`, `:30`), title `.title2.bold()`, subtitle **"N added · M items"** (N is the number checked). The progress bar is gone |
| Quick-add bar | `:235-256` | One rounded card (radius 18, `secondarySystemGroupedBackground`, 10 % indigo stroke, shadow). **+** on the left (36 pt blue-tint circle): with an empty field it **focuses the field**, otherwise it adds. The field says "Add an item (e.g. eggs, milk, bread)" (`shopping-quick-add`). Mic on the right |
| Suggestions | `:257-260` | Up to three matches from a fixed list while typing |
| Quick add | `:374-387` | Parses on the server and **appends straight to the list** (no Review Items). An empty parse shows "No items found. Type an item and try again." |
| Category filter chips | `:261-269`, chip `:388-396`, labels `:397-399` | Horizontal scroll: "All (N)" and then one chip per category present, "Dairy" / "Meat" shortened. The selected chip is solid blue with white text, the others 6 % indigo |
| Item list | `:271-278` | A single section (no per-category sections), filtered by the chip. **Swipe to delete** (`:275`, `delete` `:343`). Reorder was removed |
| Grocery row | `:612-642` (`GroceryRow`) | **Square** checkbox (`checkmark.square.fill` blue / `square`), artwork, name (semibold, struck through when checked), amount line, notes (one line), **blue star** on the right that opens Item Alternatives |
| Empty state | `:279` | `ContentUnavailableView` "Nothing on the list yet" / "Add items above or dictate a few groceries." |
| Save error | `:280` | Red message with **Retry Save** and **Discard local edits and reload** |
| Sticky action bar | `:284`, `:312-331` | `safeAreaInset(edge: .bottom)` on `.ultraThinMaterial` with a divider on top. **Complete Shopping** (gradient, `checkmark.circle.fill`, `shopping-complete-trip`) and **AI Powered Recommendations** (outlined, indigo, `sparkles`, `shopping-ai-recommendations`). Both are disabled while `store.busy` |
| ⋯ menu | `:287-292` | List settings (disabled when completed), Copy list, **Uncheck all** (only when not completed), Delete list. **Edit is gone** |
| Complete confirmation | `:308-310` | "Complete with N items remaining?" / "The unchecked items will remain in your shopping history." → **Complete Shopping**. Skipped when nothing is unchecked (`:314`) |
| Completion screen | `:411-480` | Tree badge, "Great job for saving a branch on a tree!", "Completed", the list name, a metrics card (Purchased / Total items / Saved, and Saved only when some remain), a message, **Done** (closes the list) and **View Next Shopping List** (for a weekly list) or **Use This List Again** (opens Copy list). Confetti unless Reduce Motion is on |
| Editing a completed list | `:365-373` | Saving a completed list creates a **new** list instead (new id, `completedAt` cleared) |
| Replace / add from alternatives | `:344-352` | Replace keeps the original id and checked state. Add appends. The alternative's `detail` becomes the item's notes (`Sources/NexdoCore/ShoppingList.swift:44-46`) |

**AI Powered Recommendations sheet**

| Element | Swift source | Notes |
| --- | --- | --- |
| Context | `App/AskNexdoView.swift:89-95` | The list name and item names are sent with the request, with an instruction not to change anything without approval |
| Title | `:195` | "Shopping Recommendations" |
| Intro card | `:325-344` | Gradient `sparkles` tile, "Plan a smarter cart", the list name, a description, and a green shield: "Suggestions only—your list changes after you approve them." |
| Prompt field and button | `:402`, `:415-418` | "Ask about this shopping list…", **Get Recommendations** (disabled until there is text) |
| Suggested prompts | `:309-316`, icons `:318-323` | Four shopping prompts, each with an icon (basket, fork and knife, dollar sign, number) |
| Submit | `:469-473` | The context is prepended as "Customer request: …" |

**Item Alternatives sheet**

| Element | Swift source | Notes |
| --- | --- | --- |
| Loading | `App/ShoppingViews.swift:525` | `ProgressView("Finding useful alternatives…")` on a plain sheet, without the gradient backdrop |
| Error | `:526-528` | "Couldn’t load alternatives" / `wifi.exclamationmark` / **Try Again**. Only reachable when signed out: `ShoppingStore.alternatives` (`App/ShoppingStore.swift:36-42`) turns every other failure into the local fallback |
| Original card | `:559-571` | Artwork, name, amount, an "Original Item" capsule and a blue star |
| Heading | `:533-536` | "AI Recommended Alternatives" / "Practical swaps based on the item in your list." |
| Alternative rows | `:537-544`, row `:572-588` | Artwork, name, green `leaf.fill` reason, a two-line detail, and a **Replace** outline pill. The selected row shows a solid **Selected** pill. The first row is preselected (`:605`) |
| Nexdo Tip | `:545-549` | `sparkles`, "Nexdo Tip" and the tip text, on an 8 % blue card |
| Action bar | `:589-600` | Sticky on `.ultraThinMaterial`: **Replace with Selected Item** (gradient; disabled and 50 % opacity with no selection) and **Add to Cart Instead** (text) |
| Close | `:556` | `xmark`, "Close alternatives" |
| Data | `App/ShoppingStore.swift:36-42`; `Sources/NexdoCore/ShoppingList.swift:33-75`; server `src/server/shopping/alternatives.ts`, `service.ts:12-15` | The server returns 3–5 alternatives (OpenAI, or a curated set for chicken, milk and rice, or Organic / Store-brand / Family-size). The client's local fallback always returns 3–5 as well |

### Not captured

| Screen or state | Why |
| --- | --- |
| Tasks row with a RETURN / BILL / EXPIRES badge | **Not rendered.** The badge is only in the dead `TaskRow` (`RootView.swift:1601-1603`). The live row (`:1860-1890`) has none, so `tasks-life-reminders*` show the rows as they really look |
| Real-time Voice card at zero | The account had 8.2 min used in September, and there is no zero state separate from real data. At zero, or before `/api/voice/usage` answers, the card shows "0 min", an empty bar, "0 min used", "100 min remaining" and "<Month> · updated today" ("This month · updated today" with no data yet), from `ProfileView.swift:102-106`, `:134-144` |
| Item Alternatives, no alternatives | **Does not exist.** The server schema requires 3–5 (`alternatives.ts:10-14`), and both fallbacks return at least 3. There is no empty-list branch in the view |
| Item Alternatives, error | Only reachable when the session has expired (see above). Source: `ShoppingViews.swift:526-528` |
| AI Powered Recommendations, disabled | The button is disabled only while `store.busy` (`ShoppingViews.swift:327`), a save lasting a fraction of a second. The enabled state is in every Shopping Detail capture |
| Recommendations answer | Not sent, because it is a paid AI call. The sheet is captured before a prompt is entered |
| Add by Voice (Shopping), after `987a90e` | Out of scope for this pass. `987a90e` removed its review step (items are added straight away), so `shopping-voice-stopped` is out of date |

### Swift behaviour to know before porting

1. **No Tasks badge on the iPhone.** Port the Task Details label. Porting the Tasks-row badge would add something the iPhone does not show. Whether it should show is a question for the Swift side.
2. **"passport expires in March" is not a reminder.** With no day it is not recognised: the reminder-language regex has `\bexpire\b`, which "expires" does not match (`src/lib/life-reminders.ts:105`). With a date ("Remind me my passport expires on March 14") it is classified **Renewal**, not Expires, because `passport`, `registration` and `license` are checked before `expire` (`:76-77`). EXPIRES needs something like "Remind me the laptop warranty expires on …".
3. **"pay the electric bill by the 30th"** becomes the title "Pay the electric bill by" with no due date. `cleanTitle` strips "the 30th" (`:92`), and no date parser handles a bare "the 30th". The task is dated at creation time.
4. **Far-future reminders are hard to find.** A reminder dated 14 Mar 2027 does not appear under Today / Tomorrow / This Week, and the History range only offers past periods.

### Global patterns introduced by Run D

These continue the list in "Global patterns introduced by these screens" above.

13. **A sticky bottom action bar:** `safeAreaInset(edge: .bottom, spacing: 0)` holding the buttons on `.ultraThinMaterial`, with a half-opacity `Divider` along the top edge. It is used by Shopping Detail (`ShoppingViews.swift:312-331`) and Item Alternatives (`:589-600`). The content scrolls underneath it.
14. **Filter chips with counts:** capsules reading "Label (N)", solid `nexdoBlue` with white text when selected, 6 % indigo otherwise, in a horizontal scroll with no indicators (`ShoppingViews.swift:388-396`).
15. **The raised input or list card:** `secondarySystemGroupedBackground`, a continuous corner radius of 18–20, a 1 pt stroke of 10 % indigo, and on the quick-add bar a soft shadow. It is used by the quick-add bar (`:252-256`), the Original Item card (`:569-570`) and the alternatives list (`:543-544`).
16. **`AskNexdoView` with a context** (`shoppingContext`, `AskNexdoView.swift:89-95`, `:195`, `:224`, `:309-344`): the Ask screen reused for one feature, with its own title, intro card, prompts and button label. Expect more features to use it the same way.
17. **The full-screen celebration:** `ShoppingCompletionView` reuses `MomentConfetti` (pattern from `moment-schedule-success`) as a `.fullScreenCover`, with a metrics card and two stacked full-width buttons.

### Test data

On the demo account:

- **Tasks**, created from the New Task editor: "Remind me to return the jacket by Friday" (saved as "Return the jacket by Friday", Return), "Remind me to pay the electric bill by the 30th" ("Pay the electric bill by", Bill), "Remind me the laptop warranty expires on September 26" ("The laptop warranty", Expires, 26 Sep 2026), and "Remind me my passport expires on September 26" ("Passport", Renewal, 26 Sep 2026). Two earlier attempts dated 14 Mar 2027 ("The laptop warranty", "Passport") were probably also created, but the Tasks tab cannot show them. "The laptop warranty" (26 Sep) was completed by mistake and restored with "Save anyway" at its original time.
- **List "Parity Run D List"** (not weekly): whole milk, eggs (checked), bananas (checked), chicken breast, loaf bread, paper towels, frozen peas, and rice, which was **replaced with Brown rice** from Item Alternatives. The trip is **completed**.
- Three alternatives requests (whole milk, chicken breast, rice), answered by the AI path.

## Phase 12: Wellness, Ask AI, account, Tasks, Moments and Shopping

The fourth capture pass. It covers every iPhone screen that is new or changed in
`git diff 8c36d98 HEAD -- ios/` (HEAD `dcb8310`). The screen inventory, the endpoint table, the
unmounted views and the Swift bugs are in `docs/IOS_TO_REACT_NATIVE.md` §22. **Line numbers are as of
`dcb8310`.**

### How they were taken

The settings are the same as the earlier passes: iPhone 17 Pro simulator, iOS 26.5, Dynamic Type
`large`, a Debug build of the Swift app only (so `https://app-dev.nexdoapp.com`),
`PLATFORM=ios ./scripts/capture.sh <name>`, and `xcrun simctl ui <device> appearance dark` for dark
variants. Differences from Run D:

- **Device:** the earlier iPhone 17 Pro simulator no longer existed. A new one was created with the
  same device type and runtime (`com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro`, iOS 26.5,
  23F77).
- **Account:** a different account from the earlier passes. The display name is **visakan**
  (visakan@apzzo.com), so the captures show "Hi visakan" where Run D showed "John". The account has
  Google Calendar and Gmail connected, which made `account-settings-calendar-connected` and the
  weekly-email screen possible.
- **Driver:** the same kind of scratchpad XCUITest (not committed). It attached to the running app,
  and before each capture it dumped the view tree and refused the capture unless the text that
  identifies the screen was present.
- **Transient states** (`shopping-alternatives-v2-loading`, `shopping-photo-identify-loading`,
  `shopping-recommendations-v2-loading`, `ask-ai-cards-loading`): the simulator was screenshotted
  in a loop while the button was tapped, and the frame showing the spinner was resized exactly as
  `capture.sh` does.
- **Size:** the new screens are mostly full-bleed gradients and illustrations, and 117 of the 180
  captures came out of `capture.sh` over the 500 KB budget (largest 951 KB, 91.8 MB in total).
  Palette quantisation is still forbidden, so those 117 were instead **resized to half their pixel
  dimensions (360 px wide)** with `sips`: no colour reduction and no format change. All 180 are now
  under 500 KB, 40.2 MB in total. The other 63 are at the usual 720 px. Small text was checked
  against the full-size originals (chart axis ticks, grey footnotes, captions) and is still
  readable, so none was kept at full size. Compare a 360 px capture at half the scale of a 720 px
  one.
- **Dark mode** was captured for shared components only: the Wellness shell, the module guide, Ask AI,
  Account, Feedback, Event Details, Manage Moments and Today.

`-v2` marks a new capture of a screen that already has a reference from an earlier pass. The older
capture is kept and is superseded by the `-v2` one.

### Captures

| Area | Captures |
| --- | --- |
| Wellness | `wellness-chooser`, `wellness-chooser-scrolled`, `wellness-chooser-dark` |
| Module guides | `module-guide-shopping`, `module-guide-shopping-scrolled`, `module-guide-shopping-dark`, `module-guide-calories`, `module-guide-pomodoro`, `module-guide-moments` |
| Pomodoro | `pomodoro-dashboard-empty`, `pomodoro-dashboard`, `pomodoro-sessions-empty`, `pomodoro-sessions`, `pomodoro-insights-empty`, `pomodoro-insights`, `pomodoro-options-menu`, `pomodoro-about-metrics`, `pomodoro-setup`, `pomodoro-setup-filled`, `pomodoro-focus-running`, `pomodoro-focus-paused`, `pomodoro-history-sheet`, `pomodoro-session-detail`, `pomodoro-break`, `pomodoro-complete`, `pomodoro-stop-confirm`, `pomodoro-stopped` |
| Calorie Tracker | `calorie-create-agent`, `calorie-create-agent-scrolled`, `calorie-setup-time`, `calorie-setup-time-scrolled`, `calorie-setup-goals`, `calorie-setup-goals-scrolled`, `calorie-setup-confirm`, `calorie-setup-confirm-scrolled`, `calorie-dashboard-empty`, `calorie-dashboard-empty-scrolled`, `calorie-dashboard-week-empty`, `calorie-dashboard-month-empty`, `calorie-dashboard`, `calorie-dashboard-week`, `calorie-dashboard-month`, `calorie-food-log-empty`, `calorie-food-log`, `calorie-add-food`, `calorie-add-food-filled`, `calorie-insights`, `calorie-insights-scrolled`, `calorie-recommendations` |
| Ask AI and Daily Brief | `ask-ai-cards`, `ask-ai-cards-dark`, `ask-ai-cards-loading`, `daily-brief`, `daily-brief-scrolled`, `brief-top3`, `brief-due-risks`, `brief-find-time`, `brief-section-detail`, `brief-section-detail-menu`, `brief-section-detail-risks`, `brief-section-detail-next-move`, `brief-section-detail-tasks`, `brief-section-detail-tasks-scrolled` |
| Account, Help, Feedback, password | `account-v2`, `account-v2-dark`, `account-settings-calendar-connected`, `help`, `help-topic-expanded`, `help-category-tasks`, `help-search-results`, `help-search-empty`, `help-bottom`, `feedback-empty`, `feedback-empty-dark`, `feedback-filled`, `feedback-thanks`, `change-password`, `change-password-error-mismatch`, `change-password-confirm` |
| Calendar and Event Details | `calendar-v2`, `calendar-v2-collapsed-days`, `event-details`, `event-details-dark`, `event-details-scrolled`, `event-details-menu`, `event-details-completed`, `event-details-added-to-tasks`, `event-delete-confirm`, `event-edit` |
| Today | `today-v2`, `today-v2-dark`, `today-action-card-contact`, `today-action-card-business`, `today-action-queue` |
| Tasks and actions | `tasks-v2-empty`, `tasks-search`, `tasks-search-results`, `tasks-search-empty`, `tasks-search-keyboard`, `task-details-v2`, `task-details-v2-scrolled`, `task-agent-location`, `task-agent-results`, `task-agent-results-reviews`, `task-agent-results-services`, `task-agent-results-scrolled-1`, `task-agent-results-scrolled-2`, `task-agent-outreach-draft`, `task-action-error-no-contact`, `task-action-contact-details` |
| Moments | `moments-date-filter-today-empty`, `moments-date-filter-tomorrow`, `moments-date-filter-this-week`, `moments-date-filter-later-scrolled`, `moments-scheduled-v2`, `moments-manage-tabs-scheduled-empty`, `moments-manage-tabs-scheduled`, `moments-manage-tabs-scheduled-dark`, `moments-manage-tabs-need-review`, `moments-manage-tabs-ready`, `moment-create-v2`, `moment-create-v2-filled`, `moment-manage-v2-contacts`, `moment-manage-v2-message`, `moment-manage-v2-message-scrolled`, `moment-manage-v2-message-saved`, `moment-manage-v2-schedule`, `moment-manage-v2-schedule-delivery`, `moment-connect-section`, `moment-caller-id-sheet`, `moment-calling-guide`, `moment-calling-guide-scrolled`, `moment-schedule-review-v2`, `moment-send-now-confirm`, `moment-schedule-success-v2` |
| Choose Festivals (added in Run B; missed by the pass) | `festivals-v2`, `festivals-v2-scrolled`, `festivals-v2-bottom`, `festivals-v2-region-india`, `festivals-v2-region-india-scrolled`, `festivals-v2-region-india-dark` |
| Shopping: lists and stores | `shopping-lists-v2`, `shopping-new-list-v2`, `shopping-list-settings-store`, `shopping-list-settings-store-filled`, `shopping-stores-empty`, `shopping-stores-results`, `shopping-store-hours-empty`, `shopping-store-hours`, `shopping-detail-store-empty`, `shopping-detail-store`, `shopping-detail-offer-badges`, `shopping-detail-options-menu-v2` |
| Shopping: offers | `shopping-offers-available`, `shopping-offers-matching-empty`, `shopping-offers-alternatives`, `shopping-offers-store-menu`, `shopping-offers-item`, `shopping-offer-detail`, `shopping-offer-detail-selected` |
| Shopping: alternatives | `shopping-alternatives-v2-loading`, `shopping-alternatives-v2`, `shopping-alternatives-v2-scrolled`, `shopping-alternatives-why`, `shopping-alternatives-goal-picker`, `shopping-alternatives-goal-picker-selected`, `shopping-alternatives-filtered`, `shopping-alternative-details`, `shopping-alternative-details-scrolled`, `shopping-alternative-details-bottom`, `shopping-alternatives-replace-confirm`, `shopping-alternatives-replaced` |
| Shopping: item, photo identification | `shopping-item-editor-v2`, `shopping-item-editor-v2-scrolled`, `shopping-photo-identify-consent`, `shopping-photo-identify-loading`, `shopping-photo-identify-filled` |
| Shopping: sharing, weekly email, recommendations | `shopping-share-list-v2`, `shopping-share-list-v2-link`, `shopping-weekly-email`, `shopping-weekly-email-scrolled`, `shopping-weekly-email-bottom`, `shopping-recommendations-v2`, `shopping-recommendations-v2-filled`, `shopping-recommendations-v2-loading`, `shopping-recommendations-v2-answer` |

### Superseded by this pass

| Earlier capture | Now |
| --- | --- |
| `today-default`, `today-3days`, `today-5days`, `today-dark` | `today-v2`, `today-v2-dark`: Quick Access is one Weekly Summary button; the Wellness button sits in the tab bar |
| `shopping-lists-default`, `shopping-new-list*` | `shopping-lists-v2`, `shopping-new-list-v2` ("Create List & Add Store") |
| `shopping-alternatives*` (Run D) | `shopping-alternatives-v2*` and the details, goal and replace captures |
| `shopping-item-editor*`, `shopping-share-list*` | `shopping-item-editor-v2*`, `shopping-share-list-v2*` |
| `shopping-detail-redesign-options-menu` | `shopping-detail-options-menu-v2` |
| `moment-create-*`, `moment-manage-*` (four tabs), `moment-manage-schedule-confirm`, `moment-schedule-success` | the `moment-create-v2*`, `moment-manage-v2-*`, `moment-schedule-review-v2` and `moment-schedule-success-v2` captures. Manage Moment has three tabs now |
| `moments-festivals`, `moments-festivals-india`, `moments-festivals-region-menu`, `moments-festivals-dark` | the `festivals-v2*` captures: Choose Festivals is a hero, region cards and a festival list now, not a region menu |
| `moments-default`, `moments-scheduled`, `moments-manage-list` | `moments-date-filter-*`, `moments-scheduled-v2`, `moments-manage-tabs-*` |
| `account-default` | `account-v2` |
| `account-settings-calendars-empty` | still current for an account with no calendar; `account-settings-calendar-connected` adds the connected state |

### Not captured

| Screen or state | Why |
| --- | --- |
| Calorie "All Set" page, verified phone, daily calls | Turning calls on needs an SMS code to a real phone and makes Twilio call it. Setup was finished with **Save without calls**, which goes straight to the dashboard. The disabled **Turn On Daily Calls** is in `calorie-setup-confirm-scrolled` |
| Connect me on the day: verified number, toggle on, **Connect now** | Verifying makes Twilio call a real number, and Connect now only appears on the day. The unverified state and the caller-ID sheet are captured |
| Send now, after confirming | It sends a real email from the connected Gmail and opens Messages. The confirmation sheet is captured |
| Weekly email, saved schedule | Saving schedules real weekly emails to a store manager. The form is captured, not submitted |
| Change password, server error | Submitting needs the real current password to be wrong for certain, and success signs the account out. The mismatch error and the confirmation are captured |
| Task agent: business chosen, Messages draft sent | Choosing a business changes the real task and Messages would contact a real business |
| Item Alternatives, error | Only on a server failure. Source: `ShoppingAlternativesView.swift:26-91` |
| Stores Near You, no results | A nonsense area still returns stores (see §22 "For the team", "Stores Near You ignores an unknown area"); a nonsense store name was not tried to completion |
| Daily Brief section with **Call / Message** opening Messages | Needs a real contact on the task; the Nexdo Action screen's no-contact error is captured instead |
| Share sheet, store logo | The system share sheet is not Nexdo UI. Safeway returned no logo, so `shopping-lists-v2` shows the cart fallback |
| Pomodoro from a notification | Same `PomodoroView` as the captured timer, presented from `RootView.swift:219-223` |
| Unmounted views | Listed in §22; not built |
| Choose Festivals, empty or error | **Does not exist.** The festivals are a fixed list in the view (`MomentEditor.swift:310-316`); nothing loads, so there is nothing to fail or be empty |

### Global patterns introduced by Phase 12

These continue the list above (1–17).

18. **Full-screen module shells.** Wellness, Ask AI and each Wellness module open as
    `.fullScreenCover`, not as pushes or tabs, so the tab bar is hidden inside them and each has its
    own close or back button.
19. **The module guide before every module** ("How It Works", three numbered illustrated steps, a
    green tagline card, **Got it!** and **Back to Home**), `WellnessModuleGuide.swift:63-101`. It is
    shown every time, not once.
20. **Illustration packs.** Screens draw their art from one sprite sheet per feature
    (`wellness-menu-pack`, `module-guide-pack`, `calorie-design-pack`, `daily-brief-pack`,
    `brief-detail-pack`, `alternatives-design-pack`, `moment-calling-pack`, `nutrition-detail-pack`)
    cut by `CGRect`. The RN port needs either the same sheets with crop rectangles or pre-cut images.
21. **The brief card list**: an icon tile, a bold title with a count bubble, two lines of grey text
    and a chevron, on white cards. It is used by the Daily Brief pages, and section detail repeats it
    with task cards.
22. **Segmented pills with a count**: "Today (0)", "Scheduled (1)", "Available (2)", "All (6)". The
    selected pill is filled (gradient in Moments, indigo in Shopping), and the row scrolls
    horizontally. It is used by Moments date filters, Manage Moments, offers and alternatives.
23. **Inline expanding cards**: Help questions, the task agent's business rows and the outreach
    draft expand in place with a chevron instead of pushing a screen.
24. **AI consent before AI calls**: Shopping recommendations, photo identification and the Ask AI
    cards all ask for OpenAI sharing first; photo identification uses its own alert ("Identify this
    photo with AI?"). Consent is per session and can be withdrawn in Settings.
25. **A sticky bottom action bar** (pattern 13) now also appears on Task Details (**Save changes** /
    **Mark complete**), Item Alternatives and the Calorie setup steps.
26. **Wellness screens ignore dark mode** (§22 "For the team", "Wellness has no dark mode"). Decided in
    the Phase 12 prep: the RN chooser and guides keep Swift's fixed LIGHT design in both themes, without
    Swift's unreadable text, and a test enforces it (`mobile/docs/android-polish.md` §23). Moments and
    Shopping, inside the same cover, follow the theme.

### Test data

On the account above, all named `Parity …` except where noted:

- **List "Parity Weekly Groceries"** (Safeway, 145 Jackson St, San Francisco): 2% milk
  (**replaced with Lactose-free milk** from Item Alternatives), whole wheat bread (offer **The Rustik
  Oven Bread** chosen), bananas, eggs, chicken breast, and **Parity mango** (from photo
  identification). Its share link was created and then revoked. No weekly email was saved.
- **Moment "Parity Birthday"** (6 Oct 2026, yearly), recipient **Parity Kate**, +1 415 555 0100
  (a fictional 555 number) and parity@example.com. Wish approved and **scheduled for 6 Oct 2026
  8:00 AM, Messages, manual send**. Nothing was sent.
- **Calendar event "Parity appointment"** (5 Oct 2026, 1:27–1:57 PM, "Parity Clinic, 145 Jackson
  St"); marked complete, then incomplete. **Add to Tasks** created the task "Parity appointment".
- **Food log entry "Parity oatmeal with banana"**, 350 kcal, breakfast, 5 Oct 2026. Calorie Tracker
  was set up with **Save without calls** (8:00 PM, goal 2,000 kcal), so nutrition settings now exist.
- **Pomodoro sessions "Parity focus"**: one completed 5-minute session with a break, and one stopped
  after a few seconds.
- **Feedback "Parity test feedback"** (4 stars, "Parity reference capture. Please delete.") in the
  server's feedback table.
- Not named Parity: one task agent search for **Electrician · 94109** on the existing task "Call
  electrician" (no business chosen, nothing sent). That task was **completed by mistake and restored**
  at once with its original date. A Google Calendar sync was triggered once. AI consent was granted
  for the Ask AI and Shopping captures, then withdrawn in Settings. The simulator's Photos library
  has a mango image (`grocery-mango` from the app's assets), and the simulator has Contacts and
  notification permission.

## Phase 13: bug reports, calendar connection, device calendars, Today, Tasks and Shopping

The fifth capture pass. It covers every iPhone screen that is new or changed in
`git diff 1938c7c origin/main -- ios/` (branch `rn-phase-13` at `82a92df`). The screen inventory, the
endpoint table, the native requirements, the unmounted views and the Swift bugs are in
`docs/IOS_TO_REACT_NATIVE.md` §23. **Line numbers are as of `82a92df`.**

### How they were taken

The settings are the same as Phase 12: the iPhone 17 Pro simulator (`3E8DBBD7-…`, iOS 26.5, 23F77),
Dynamic Type `large`, a Debug build of the Swift app only (`https://app-dev.nexdoapp.com`). Differences:

- **No session.** The simulator's installed app was signed out and the visakan password is not on this
  Mac, so this pass captured only what the Debug preview harnesses and the sign-in screen reach:
  `-bug-report-preview` (with `-bug-failure`), `-bug-capture-preview`, `-calendar-connect-preview`,
  `-calendar-design-preview` (with `-calendar-month -calendar-stress-preview`), `-today-design-preview`,
  `-task-design-preview`, `-shopping-design-preview` (with `-shopping-offers-preview`),
  `-wellness-design-preview`, `-pomodoro-design-preview`, `-ask-design-preview`. The signed-in screens
  were captured in a second run the same day (see "The signed-in run" below).
- **Driver:** four scratch XCUITest classes (`Phase13Captures{,B,C,D}.swift`, dropped into
  `ios/Tests/MomentUITests/`, which the project picks up as a synchronized folder, then deleted before
  the commit). Each test launches a harness, waits for the text that identifies the screen, and attaches
  `app.screenshot()` as an `XCTAttachment` named after the capture. The attachments were exported with
  `xcrun xcresulttool export attachments --path <run>.xcresult --output-path <dir>` and renamed from
  `manifest.json`. A copy of the driver is kept with the session notes so the signed-in half can be run
  by signing in on the simulator and re-running the same classes.
- **Dark variants** came from the app's own `-nexdo.appearance night` launch argument (the
  `AppAppearance` storage key), not `simctl ui … appearance`.
- **Resizing:** PIL is not installed on this Mac, so `capture.sh`'s shrink step was replaced by
  `sips --resampleWidth 720`; the 37 captures still over the 500 KB budget were resampled to 360 px wide
  with `sips`, as in Phase 12 (no palette reduction). All 50 are under 500 KB (10.8 MB in total).
- **The bug report's success state** comes from the DEBUG `BugReportPreview` harness
  (`ios/App/BugReportView.swift:213-235`): its `submitOverride` waits 4 s and answers the fixed reference
  `BR-134902`; with `-bug-failure` the first attempt throws `URLError(.notConnectedToInternet)`, which
  gives the error-and-retry state. **No report was posted to the server** and nothing reached support.
- **The Apple calendar permission** was granted to the Debug app on the simulator (Allow Full Access)
  for the connection flow; the simulator's own calendars (Calendar, Birthdays, India Holidays) are what
  `apple-calendars` shows.

`-v3` marks a new capture of a screen that already has a `-v2` (Phase 12) or earlier reference; the
older captures are kept and superseded.

### The signed-in run

The second run attached to the already running, signed-in app. The app keeps its session only in memory
(`ios/App/NexdoApp.swift:140`), so the driver must never call `launch()`: every test uses
`XCUIApplication(bundleIdentifier: "com.pinslots.nexdo").activate()`, and `xcodebuild test-without-building`
was checked to leave the running process alone (same pid before and after a run). Each test starts with a
"home" routine that taps any hittable Done / Close / Cancel or back button until the tab bar is hittable, then
goes to Today. Dark variants were produced by `xcrun simctl ui … appearance dark` plus `TEST_RUNNER_DARK=1`
(the runner reads `DARK` and suffixes the attachment names); the simulator was put back to light afterwards.
The host Mac is in Asia/Kolkata, so "today" was Monday 12 Oct for the app and the server; the Do Now
not-working-day state came from switching **Monday** off under Settings → Working days, capturing, and
switching it back on (`settings-working-days` shows the restored row). Do Now first asks for OpenAI sharing
("Allow and find my next task"); that consent was granted for the captures and withdrawn in Settings at the end
(`Withdraw AI permission`). The driver file is `Phase13Live.swift` in the session notes.

### Captures

| Area | Captures |
| --- | --- |
| Bug report | `bug-report-intro`, `-intro-dark`, `-form-empty`, `-form-keyboard`, `-form-filled`, `-form-dark`, `-screenshot-consent`, `-form-screenshot`, `-original-screen-preview`, `-form-diagnostics`, `-discard-confirm`, `-sending`, `-error-network`, `-success`, `-success-copied` |
| Calendar connection | `calendar-connect-hub`, `-hub-apple-connected`, `-hub-live` (Google and Apple connected), `-google`, `-google-bottom`, `-google-connected`, `-google-connected-scrolled`, `-microsoft`, `-apple`, `-apple-permission` (the iOS prompt), `-apple-connected`, `-help` |
| Apple calendars | `apple-calendars`, `apple-calendars-one-hidden`, `calendar-apple-calendars-sheet` (from the Calendar filters menu) |
| Calendar tab and Event Details | `calendar-v3`, `calendar-v3-dark`, `calendar-v3-live`, `calendar-filters-menu`, `calendar-month-device-events`, `-scrolled`, `-dark`, `calendar-moment-row`, `-dark` (6 Oct: "Parity Birthday" beside Google Calendar events), `calendar-moment-row-opened` (the Moment's Manage screen, reached through `moments.route`), `calendar-device-event-row` (20 Oct: the simulator's "Dussehra" and a Moment), `event-details-apple-device`, `-dark`, `event-details-apple-device-live` |
| Today and Do Now | `today-v3-attention-card`, `-dark`, `today-attention-sheet-v3`, `do-now-v3`, `-scrolled`, `-dark`, `-scrolled-dark`, `do-now-not-working-day`, `-scrolled` |
| Tasks | `tasks-v3-items`, `tasks-v3-moment-row`, `-dark` (the All filter with "Parity Sunday · All day · Birthday · Moment"), `tasks-creation-spacing` |
| Nexdo Action and Follow-up preparation | `task-action-prepare-card`, `task-action-prepare-card-saved`, `follow-up-preparation-new`, `-filled`, `-filled-scrolled`, `-saved`, `follow-up-record-outcome`, `follow-up-result-menu`, `follow-up-record-resolved`, `follow-up-outcome-history`, `task-details-followup-history-button`, `follow-up-history-completed`, `-scrolled` |
| Account, Change password, Settings | `account-v3`, `-dark`, `change-password-v3`, `password-reset-from-change-password`, `settings-v3`, `settings-v3-scrolled-1`…`-4`, `settings-v3-dark`, `settings-v3-scrolled-1-dark`…`-3-dark`, `settings-working-days` |
| Wellness, Pomodoro, Ask AI | `wellness-chooser-v3`, `-dark`, `-dark-scrolled`, `pomodoro-setup-personal-work`, `ask-ai-cards-v3` |
| Shopping | `shopping-list-settings-logo-button`, `shopping-store-logo-editor`, `-error-no-image`, `shopping-offers-price-breakdown`, `shopping-offer-detail-price-breakdown`, `shopping-store-hours-v3` |
| Sign-in | `password-reset-error-invalid-email` (the global alert over the sign-in screen; see §23 For the team) |

### Superseded by this pass

| Earlier capture | Now |
| --- | --- |
| `calendar-v2`, `calendar-v2-collapsed-days` | `calendar-v3`, `-dark` (gear button in the header; dark accents) |
| `today-v2`, `today-v2-dark`, `today-attention-row`, `today-attention-sheet-*` | `today-v3-attention-card`, `-dark`, `today-attention-sheet-v3` (the attention card inside the intelligence card; three schedule items) |
| `tasks-v2-empty` (header counts) | `tasks-v3-items` ("items", not "tasks") |
| `wellness-chooser`, `-scrolled`, `-dark` | `wellness-chooser-v3`, `-dark`, `-dark-scrolled` (a real dark design; the Phase 12 `-dark` showed the forced-light one) |
| `ask-ai-cards` | `ask-ai-cards-v3` (spacing only) |
| `shopping-list-settings-store`, `-filled` | still current for the fields; `shopping-list-settings-logo-button` adds the logo control |
| `shopping-offers-*`, `shopping-offer-detail*` | still current for the layout; the `-price-breakdown` captures show the new price rows |
| `account-settings-calendar-connected` | `settings-v3-scrolled-3` (Google Calendar row with the provider icon, the Apple Calendar card, Connect Calendar) |
| `account-v2`, `-dark` | `account-v3`, `-dark` (Report Bugs row; new row order) |
| `change-password` | `change-password-v3` (Forgot password? section) |

### Not captured

| Screen or state | Why |
| --- | --- |
| Settings: the "Deleting account…" overlay and the "Couldn’t delete account" alert | Only during a real deletion. The confirmation dialog is unchanged from Phase 7 |
| Apple calendars: no calendars / all hidden / access denied | The simulator has three calendars and access was granted; the strings are in `AppleCalendarService.swift:96-97`, `:118-119` |
| Calendar connection: Microsoft connected, "Needs reconnecting", a cancelled or failed OAuth sign-in | Google is the only connected provider on the account; the other states need a real sign-in. The connected Google page (with **Connect another account**) is captured |
| Tasks: a reordered list | The XCUITest long-press drag (`press(forDuration:thenDragTo:)`, 1.2–2 s, slow and default velocity, by element and by coordinate) never started SwiftUI's `.draggable` session on iOS 26, so the order did not change. The list and its "items" counts are in `tasks-v3-items`; the behaviour is in §23 |
| Add by Voice: microphone denied ("Open Settings") | XCTest's built-in interruption handler allowed the microphone prompt before a custom monitor could deny it, and `simctl privacy revoke/reset microphone` did not survive the test installer's reinstall. The state is one line of text plus a button (`AddTaskByVoiceView.swift:97-104`) |
| Bug report over a real screen (shake, screen tags), "Bug reporting is not available on this server yet.", "Your session has expired…" | Need a session; the messages are in `Sources/NexdoCore/BugReport.swift:54-69` |
| Apple calendars: no calendars / all hidden / access denied | The simulator has three calendars and access was granted; the strings are in `AppleCalendarService.swift:96-97`, `:118-119` |
| Store Logo: an image chosen or pasted | The simulator pasteboard and Photos were left untouched; the no-image error is captured |
| Discard confirmation with **Keep Report** | On iOS 26 the dialog anchored to the × is a popover showing only **Discard Report**; Keep Report is the implicit tap-outside |
| Crashlytics, PermissionAccess, TaskCreationSpacing, TaskDisplayOrder, MomentSchedule | No UI of their own |

### Global patterns introduced by Phase 13

These continue the Phase 12 list (18–26).

27. **A report that can open over anything.** The bug report is presented by UIKit over the topmost
    controller, not by a SwiftUI route; it carries the current screen tag, blocks swipe-dismiss, and
    keeps a frozen copy of the first submission so Retry never files twice. RN needs a root-level modal
    plus a "current screen" tag, not a pushed route.
28. **Onboarding pages with a progress capsule and three numbered, illustrated steps** (the calendar
    provider pages), fixed light over a tinted gradient, one black-or-blue capsule action, a "Need help?"
    toolbar link and a small "Learn more" text link. Same family as the Wellness module guides (pattern 19).
29. **Device data merged into server lists.** Device calendar events and Moments are projected into the
    Calendar and Tasks lists with their own `source`, icon and detail line, are read-only there, and route
    back to their owner on tap. The RN port should keep them out of the task cache and the server's
    revision/idempotency machinery.
30. **The Wellness chooser follows dark mode.** Pattern 26 ("Wellness screens ignore dark mode") is
    superseded for the chooser: it now has a dark design (black gradient, system card surfaces, a moon
    glyph instead of art, per-module dark accents). The module guides are unchanged and still fixed light.
31. **Local-only ordering and state.** The task display order, the Apple calendar selection and the
    shake-to-report toggle live on the device per signed-in user (`UserDefaults` / `@AppStorage`), never on
    the server, and are reset or re-keyed on sign-out.

### Test data

The first run created nothing (one `POST /api/auth/password-reset/request` for `parity@invalid`, rejected with
400). The signed-in run left this on the account, for deletion later:

- **Tasks:** `Follow up with Parity Bank` ×3, all completed on 12 Oct (the driver re-created the task on three
  retries before it learned to skip creation; the one scheduled 1:36 PM carries the saved preparation "Parity
  claim status", the checklist step "Parity reference 123", an Unresolved outcome "Parity: waiting for the
  adjuster" and a Resolved outcome "Parity: resolved"); `Parity follow up with insurance company` (completed by a
  mis-tap, no action: the detector needs the title to start with the verb) and `Parity follow up with the
  bank` (open, 12 Oct 12:22 PM, no action, same reason).
- **Settings:** Monday was switched off and back on under Working days; OpenAI sharing was allowed for Do Now and
  withdrawn afterwards; nothing else was saved (each Settings visit left through "Save settings and go back").
- **Nothing was sent:** no call, message, email or calendar write; the Nexdo Action screen was only opened.
- The Moments, shopping list and calendar data are Phase 12's (`Parity Birthday` on 6 Oct, `Parity Sunday`,
  `Parity Birth Year` on 20 Oct, the `Parity Weekly Groceries` Safeway list). Safari was opened once by a link
  on the Store Hours page and left in the background. The session is still signed in.

## Phase 14: install introduction, sign-up, dark Wellness, Ask AI and Settings

The sixth capture pass. It covers the iPhone screens new or changed in `git log 3b7e5c2..origin/develop -- ios/`
(branch `rn-phase-14` at `35c86e3`). The inventory, endpoints, native requirements, unmounted views and Swift
bugs are in `docs/IOS_TO_REACT_NATIVE.md` §24. **Line numbers are as of `35c86e3`.**

### How they were taken

- The iPhone 17 Pro simulator (`3E8DBBD7-…`, iOS 26.5), a Debug build against `https://app-dev.nexdoapp.com`,
  and the visakan account, signed in once and never relaunched.
- **Signed out:** a scratch XCUITest driver (not committed) launched with `-reset-install-introduction` for
  the introduction, sign-up and reset sheets.
- **Signed in:** the driver attached with `activate()` and tapped by screen coordinates, with a screenshot
  checked before every tap. Calorie Tracker, Pomodoro, Moments, Shopping and Settings are full-screen covers
  that the UI-test tree does not see, so tapping by label hits the hidden screen underneath. That is how the
  daily call was paused by mistake (restored; see §24 "Account state").
- **Dark:** `xcrun simctl ui … appearance dark` (the app's Appearance is System).
- **Resizing:** `sips --resampleWidth 720`. All 56 captures are under 500 KB.

### Captures

| Area | Captures |
| --- | --- |
| Install introduction | `install-intro-1`…`-4` (forced light) |
| Sign-up and reset | `sign-up-v4`, `-scrolled`, `-keyboard`, `-filled`, `-passwords-mismatch`, `sign-up-existing-account-alert`, `password-reset-from-sign-up`, `password-reset-v4` |
| Today and task editor | `today-v4-empty-schedule`, `-dark`, `task-editor-v4-from-today`, `-dark` |
| Wellness and guides | `wellness-chooser-v4`, `-dark`, `module-guide-calories-v4`, `-scrolled`, `module-guide-pomodoro-v4`, `module-guide-moments-v4`, `module-guide-shopping-v4` |
| Calorie Tracker | `calorie-dashboard-v4`, `-dark`, `-scrolled-dark`, `calorie-setup-confirm-v4-dark` |
| Pomodoro | `pomodoro-dashboard-v4-empty-dark`, `-month-dark`, `pomodoro-setup-v4-dark` |
| Moments | `moments-v4-dark`, `moments-settings-v4`, `-dark`, `-scrolled-dark`, `manage-moments-v4-scheduled-empty-dark`, `-need-review-dark`, `manage-moment-v4-contacts-dark`, `-message-dark`, `-schedule-dark`, `moment-editor-v4-create-dark` |
| Shopping | `shopping-lists-v4-dark`, `shopping-list-detail-v4-dark`, `shopping-list-settings-v4-dark`, `shopping-store-finder-v4-logos-dark` |
| Ask AI | `ask-ai-landing-v4`, `-dark`, `-keyboard-focus-dark` |
| Account and Settings | `account-v4`, `-dark`, `change-password-v4`, `settings-v4-dark`, `settings-v4-scrolled-1-dark`…`-4-dark`, `settings-v4-scrolled-4` |

### Not captured

| Screen or state | Why |
| --- | --- |
| Calendar: Connect your calendar sheet | Shows only with zero calendar connections; the account has Google connected and was not disconnected |
| App Store review sheet | System UI; needs a Friday after 17:00 local time, a seeded schedule and a relaunch (which signs out) |
| Add / Ask by Voice: Start listening, interrupted, fresh reopen | Opening voice starts a live realtime session; not done under the no-call rule |
| Password reset: unregistered-email error | Dropped when the pass was narrowed to signed-in screens; the 404 text is in §24 |
| Sign-up and introduction in dark | Signed-out only; the simulator was kept signed in. The introduction is forced light |
| Shopping Store Logo editor in dark | Opening it from List Settings risked a save; the light editor is in Phase 13 |
| Moments "Connect me on the day" guide | No visible change (still forced light) |

### Test data

Nothing was created. The existing Phase 12/13 items were used (`Parity Birthday`, `Parity Sunday`, `Parity
Birth Year`, `Parity Weekly Groceries`). One account change happened by mistake and was reverted (§24,
"Account state"): the daily food call was paused and turned back on at 8:00 PM with the same phone.
