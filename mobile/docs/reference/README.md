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
