# Parity: React Native on Android against the SwiftUI app

The SwiftUI app in `../../../ios` is the **reference**. The thing being corrected is the React
Native app **as it renders on Android**. Anything comparing React Native on an iOS simulator is not
parity work; the earlier pass that did so is kept, unused, in
[`rn-ios-superseded/`](rn-ios-superseded).

## Devices

| | Reference | Target |
| --- | --- | --- |
| Device | iPhone 17 Pro (simulator) | Samsung **SM-A055F** (physical, USB) |
| OS | iOS 26.5 | Android 15 |
| Physical | 1206 x 2622 px @3x | **720 x 1600 px** @1.875 (300 dpi) |
| Logical | 402 x 874 pt | **384 x 853 dp** |
| Top inset | 62 pt | **31.5 dp** |

Both apps are signed into the same account, so the data on screen matches.

**Android is 18 dp narrower, and its status bar is half the height.** Captures are stored at 720 px
wide so the two are directly comparable and each file stays well under 500 KB.

### Two things must be set on the phone before any capture

Both were wrong for the whole first pass, and both silently corrupt every figure.

1. **`font_scale` must be 1.0.** The phone was set to **0.9**, and React Native's `Text` honours the
   OS font scale by default, so every Android capture rendered text at 90% of the size the iOS
   Simulator used. This is what the style map's old "Roboto sets 9% narrower than SF Pro" entry was
   actually measuring. Re-measured at 1.0, "Tasks" `.largeTitle` is **87.66 pt wide on iOS and
   88.53 dp on Android** — a 1% difference, not 9%. See the style map §2.

   ```sh
   adb shell settings put system font_scale 1.0
   ```

2. **The dev client's floating "Tools button" must be off.** It draws a grey gear over the content,
   it is baked into every screenshot, and nothing on iOS corresponds to it. Turn it off in the Expo
   dev menu (`adb shell input keyevent 82` → scroll → **Tools button**).

Every figure quoted below was measured after both were fixed. Figures recorded earlier in this file
are not comparable and have been re-measured.

## Tooling

- `mobile/scripts/capture.sh <screen>-<state>` — shoots both platforms at once
  (`PLATFORM=ios|android` for one side only) and shrinks to 720 px.
- `mobile/scripts/diff.py <screen>-<state>` — scales both to a common width, **crops each side by
  its own top inset** so the first content row lines up, and compares only the overlapping height.
  Prints the share of compared pixels whose largest RGB channel differs by more than 16/255, and
  writes a heat map to `diff/`.

  **Why the alignment matters.** iOS reserves 62 pt for the status bar and Android 31.5 dp, and the
  two apps then start drawing at slightly different distances below that. Overlaying from the screen
  top puts every row about 30 px out and lights up the whole screen twice — 35-40% on any populated
  screen whatever the styling is like. Cropping by the declared inset alone still left 6-11 dp, so
  the script now finds the first real content row on each side and aligns there.

  **What the number still cannot separate.** The phone is 853 dp tall and the simulator 874 pt, so
  anything anchored to the bottom — the tab bar above all — sits at a different absolute position and
  counts as a mismatch on every screen. Cumulative spacing drift adds to it: small per-element
  differences accumulate downward, so the lower half of a long screen diverges even where each
  element is individually right. Read the heat map, not just the percentage; a figure is a floor.

## Global fixes

| # | Fix | Where | Status |
| --- | --- | --- | --- |
| 1 | **Top safe-area inset.** Every tab screen drew under the status bar; the wordmark collided with the clock. `contentInsetAdjustmentBehavior` is iOS-only, so Android got nothing. | `src/components/TodayShell.tsx` (`TasksTopBar`) — shared by Today and Tasks, so one change covers both | **done, verified on device** |
| 2 | **Bottom inset.** Every pinned footer rendered *under* the Android gesture-navigation bar — on the task editor the "Create Task" button sat behind the back/home/recents controls and could not be tapped. Six screens had the same hand-rolled footer. | new `src/components/StickyFooter.tsx`, adopted by task/new, task/filters, task/[id], project/new, project/[id]/edit, calendar/event/new | **done, verified on device** |
| 3 | **Header pattern.** React Navigation left-aligns a header title on Android, so a screen with a custom `headerLeft` rendered "CloseNew Task". SwiftUI's `.inline` title is always centred. | new `src/theme/navigation.ts` (`stackHeaderOptions`), adopted by the task, project, calendar and today stacks | **done, verified on device** |
| 4 | **Font mapping re-verified on Android** — see below | `docs/swift-to-rn-style-map.md` §1b, §2 | **done** |
| 5 | **Colour tokens in both appearance modes.** Dark mode is broadly correct. One real fault found and fixed: the segmented picker used opaque `groupedBackground`/`surface`, which renders a black box in dark mode where Swift has translucent system fills. | `src/theme/colors.ts` (`segmentTrack`, `segmentSelected`) + `app/(tabs)/tasks.tsx` | **partly done, verified on device** |
| 6 | **Text losing its last word with no ellipsis.** "Add task" rendered as "Add", "This Week" as "This", on a button and a chip that both had room to spare. Android measures and draws text in two passes and Yoga rounds the measured width onto the pixel grid in between; at this phone's density of **1.875** that rounding lands a fraction short, the draw pass breaks the line at the last space, and the second line falls outside a view sized for one line. `uiautomator dump` still reports the full string, so it reads as a copy bug. | `src/components/Text.tsx` — one device pixel of padding each side, cancelled by an equal negative margin, so the box is wider than the glyph run and the layout is unchanged. Fixes every label at once. Plus `alignSelf: 'stretch'` on full-width control labels (`GradientButton`, `Button`, the project capsule). | **done, verified on device** |
| 8 | **Card stroke invisible in dark mode.** Swift draws `Color.white.opacity(0.8)` on every glass card. A previous pass guessed that down to 0.14 assuming it would read as blown-out on black; measuring the Swift app shows the stroke really is bright — (214,214,215) against a (28,28,30) card, where Android rendered (60,60,62). Now (210,210,210). Affects every glass card, not just sign-in. | `src/theme/colors.ts` (`glassStroke` dark) | **done, verified on device** |
| 7 | **Orphaned "OR" rule on sign-in.** Apple sign-in correctly never renders on Android, but the rule above it did — dividing the form from empty space. | `src/components/AppleSignInButton.tsx` (new `useAppleSignInAvailable`) + `app/(auth)/sign-in.tsx` | **done, verified on device** |

### Font mapping, re-verified

The previous pass calibrated against an iOS simulator. Re-measured on a real Android render, in
logical units:

| String | iOS (SF Pro) | Android (Roboto) | |
| --- | ---: | ---: | --- |
| "Tasks" `.largeTitle` bold — height | 24.6 pt | 24.0 dp | sizes map **1:1**, keep them |
| "Tasks" — width | 87.7 pt | 80.0 dp | **9% narrower** |
| "Turn intent into action." `.subheadline` — width | 151.9 pt | 136.5 dp | **10% narrower** |

So the `fontSize` values were right and must not be scaled. But Roboto sets ~9% narrower than SF
Pro, and the screen is 4.5% narrower again — together that is the cause of the truncation and
wrapping differences, not any font-size error. Fix the width a label is given, not the label.

## Group 2 — app shell / tab bar

| Element | iOS | Android before | Android after |
| --- | --- | --- | --- |
| Bar background, light | (245, 245, 245) | (255, 255, 255) | **(245, 245, 245)** |
| Bar background, dark | (31, 31, 31) | (28, 28, 30) | **(31, 31, 31)** |
| Selected capsule, light | `nexdoIndigo` @10%, (227, 225, 244), 11dp corner | none | **present, rounded** |
| Selected capsule, dark | (34, 32, 52) | (49, 45, 79) | **(34, 32, 52)** |
| Capsule width | ~85 dp inside a 93 dp item | 35 dp — shrink-wrapped | **~85 dp** |

Two things had to be worked out on the device rather than assumed:

- `tabBarActiveBackgroundColor` paints a view that `tabBarItemStyle` cannot round — a `borderRadius`
  there produced a hard-edged rectangle, and `overflow: 'hidden'` did not reach it either. The
  capsule has to be drawn *inside* a custom `tabBarButton`; that is `src/components/TabBarButton.tsx`.
- Expo Router's `BottomTabItem` marks the focused tab with **`aria-selected`**, not
  `accessibilityState.selected`. Reading the wrong one leaves the capsule permanently hidden with no
  error.

Two more faults found on the second pass, both of which affected **every** tab screen:

- **The capsule shrink-wrapped its icon and label** — 35 dp wide against Swift's 85 dp. `TabBarButton`
  spreads React Navigation's own button style *after* its own, and that style carries
  `alignItems: 'center'`, which overrides the default `stretch` and sizes the capsule to its content.
  `alignSelf: 'stretch'` on the capsule restores it.
- **The dark capsule was guessed, not measured.** It was `rgba(122, 106, 255, 0.22)`. Measuring the
  Swift app gives (34, 32, 52) over a (31, 31, 31) bar, which solves exactly to `nexdoIndigo` at
  **10%** — the *same* value as light mode. A dark appearance does not imply a lighter, stronger
  tint; it is the same colour over a different background.

Remaining: the capsule sits a few dp higher than Swift's and is slightly shorter, because the bar's
content height is driven by React Navigation rather than set outright.

## Group 3 — tasks and projects

Every fault below was found by comparing against the Swift source or a Swift capture, not by
inspection of the React Native code alone.

| Screen | What was wrong | Swift says | Fixed in |
| --- | --- | --- | --- |
| Project detail | Nav title was the literal string **"Project"** | `.navigationTitle(project?.name ?? "No project")` (ProjectsView.swift:258) | `app/project/[id]/index.tsx`, set from the screen because it depends on the loaded project |
| Project detail | The `···` menu sat in the content row | `ToolbarItem(placement: .topBarTrailing)` (`:260`) — a nav-bar item | same |
| Project detail | The `+` was a flat accent circle | `TodayHeaderButton` (`:203`) — the 44pt **gradient** circle | same; `TodayHeaderButton` gained a `disabled` prop for `.disabled(deleting \|\| missing)` (`:204`) |
| Project detail | "Add task" rendered as **"Add"** | `.frame(maxWidth: .infinity)` is on the *label* (`:238`) | global fix 6 |
| Project editor | "Done" was a pinned footer button | `ToolbarItem(placement: .confirmationAction)` (`:149`) | `app/project/new.tsx`, `app/project/[id]/edit.tsx` |
| Project editor | Section headers were uppercased — "PROJECT NAME" | `Section("Project name")`; **iOS 26 no longer uppercases** a `Form` header | `src/components/ProjectEditorForm.tsx` |
| Task filters | Invented "STATUS"/"PRIORITY" sections listing every option — **79.95%** | a `Form` with no section headers and three rows: two collapsed `Picker`s and a `Button` (RootView.swift:1710-1719) | `app/task/filters.tsx`, rebuilt |
| Task filters | "Done" was a footer button; a "Cancel" existed | only `.confirmationAction` "Done" (`:1722`); no Cancel | same |
| Task filters | Inline title | `.navigationTitle` is **not** `.inline` here, so iOS draws a large title | same; drawn as content, since `headerLargeTitle` is iOS-only |
| Task filters | "Earliest due first" was a checkmark row | `Toggle` (`:1718`) — a switch, tinted `.nexdoIndigo` by the root `.tint` (`:46`) | same |
| Tasks list | The **History range** picker and its caption were missing entirely | `if model.taskQuery.date == .all { … }` (`:1669-1681`) | `app/(tabs)/tasks.tsx`; `historyRange` already existed in the store, only the control was absent |
| Task editor | The `→` disappeared when the button was disabled | `if !model.busy { Image("arrow.right") }` (`:2017`) — it tracks *busy*, not *enabled* | `app/task/new.tsx` |
| Task editor | Project row used a `›` disclosure chevron | `Image(systemName: "chevron.down")` (ProjectsView.swift:307) — a menu affordance | `src/components/ProjectAssignmentField.tsx` |

### Uppercase section headers: only some of them were wrong

`ProjectEditorForm` and the filters sheet mirror a real SwiftUI `Form` `Section("…")`, and iOS 26
renders those **as written**. The task editor's "TASK NAME", "NOTES", "PROJECT", "DATE" and
"TIME ESTIMATE" are *not* `Form` sections — they are `TaskEditorLabel(title: "NOTES", …)`, literal
uppercase strings in the Swift source (RootView.swift:1964-1990). Those stay uppercase. The rule is
not "iOS does not uppercase"; it is "read which one Swift wrote".

## The tab bar on pushed screens — fixed

SwiftUI pushes a detail screen *inside* the selected tab's `NavigationStack`, so the tab bar stays.
Every detail route here used to be a sibling of `(tabs)`, so pushing one unmounted the tab navigator
and the bar vanished — on `project-detail` a whole 90 dp band present on one platform and absent on
the other.

Each tab now owns a stack, the way Swift does. Verified on the device: all four tab items are in the
view tree on each of these, and hardware back returns where Swift returns.

| Route | Swift | Was | Now |
| --- | --- | --- | --- |
| `/project/[id]` | `NavigationLink` (ProjectsView.swift:50, 54) | no bar | **bar, back → Projects segment** |
| `/today/attention` | `.navigationDestination` (RootView.swift:1187) | no bar | **bar, back → Today** |
| `/today/schedule-check` | `.navigationDestination` (`:1190`) | no bar | **bar** |
| `/today/overdue` | `.navigationDestination` (`:1193`) | no bar | **bar** |
| `/today/weekly-summary` | `.navigationDestination` (`:1196`) | no bar | **bar** |
| `/today/weekly-tasks` | `NavigationLink` (WeeklySummaryView.swift:104, 110) | no bar | **bar** — a push from a push, found while checking the other five |

**No route path changed.** Route groups in parentheses are stripped from the URL, so the tasks tab is
a group, `(tabs)/(tasks)/`, and `project/[id]/index.tsx` inside it still serves `/project/[id]`.
Using a plain `tasks` directory instead would have rewritten every project path to
`/tasks/project/…`. Today did not need a group: `today` is a real segment either way, so
`(tabs)/today/index.tsx` serves `/today` and its siblings serve `/today/*` as before. Nothing in
`router.push` had to change.

Also checked, because "it doesn't touch these" was the premise of the move:

- **Reminder notification routing** (Phase 8) opens `/action/[id]`, which is a `.sheet` in Swift
  (RootView.swift:59-62) and did not move. Deep-linked `nexdo://action/abc123?preferred=CALL` and got
  the Nexdo Action sheet with its Close button.
- **Deep links** `nexdo://project/unassigned`, `nexdo://today/schedule-check?id=gap`,
  `nexdo://today/weekly-summary`, `nexdo://action/queue` and `nexdo://calendar/conflicts` all resolve
  to the same screens as before. The last two show no tab bar, which is right: both are `.sheet`s in
  Swift (TodayActionsView.swift:213, CalendarView.swift:163).

`src/__tests__/tab-routes.test.ts` pins the file placement, since placement is what decides whether
the bar survives, and a regression would be silent.

## Screen results## Screen results

Only screens with **both** captures can carry a percentage. Android captures exist for two screens
so far; the rest of this table fills in as each group is done.

| Screen | Android vs Swift | Note |
| --- | ---: | --- |
| Action queue | **3.38%** | |
| Needs your attention | **4.10%** | |
| Schedule conflicts | **4.11%** | |
| Overdue | **6.08%** | |
| Schedule check | **6.77%** | |
| Account, My Page | **6.79%** | |
| Project editor | **6.89%** | |
| Free form Text | **9.17%** | |
| Do Now | **9.98%** | |
| Calendar, month | **10.74%** | |
| Add calendar event | **11.76%** | |
| Weekly tasks | **11.80%** | |
| Tasks | **12.01%** | |
| Calendar, week | **12.21%** | |
| Project, unassigned | 12.40% | measured before the tab bar was restored; needs a re-capture |
| Tasks, search open | **12.68%** | |
| Project detail | **13.39%** | from 14.46% |
| Weather forecast | **13.55%** | |
| Projects | **13.71%** | |
| Calendar, Schedule | **13.83%** | |
| Tasks, list | **16.04%** | |
| Task editor | **16.85%** | Swift opens at a detent, already scrolled |
| Ask, answered turn | **17.50%** | |
| Tasks, list scrolled | **17.59%** | scroll offset cannot be matched exactly |
| Task action | **18.26%** | the residue is a data difference: iOS had Contacts denied and shows the permission line, Android never asked |
| Profile and settings | **18.47%** | |
| Today | **20.41%** | from 27.79% |
| Tasks, dark | **21.45%** | |
| Weekly Summary | **23.17%** | |
| Today, 3 days | **24.54%** | |
| Today, 5 days | **24.62%** | |
| Today, action needed | **25.58%** | from 53.13% |
| Ask, suggestions | 36.21% | **detent** — content matches |
| Event details | 59.79% | **presentation** — content matches; see SHARED-REQUESTS |
| Task filters | 68.82% | **detent** — from 79.95% |
| AI consent | 97.65% | **detent** — content matches |
| Reset password | 3.68% | **not re-measured** at font scale 1.0 |
| Sign in, dark | 19.09% | **not re-measured** |
| Sign in | 19.21% | **not re-measured** |
| Sign up | 23.09% | **not re-measured** |
| Sign in, keyboard | n/a | not measurable as a full-screen diff — see below |

**41 screens now have a capture on both platforms.** The four auth rows were measured while the phone
was still at font scale 0.9 and are kept only so the trend is visible; they need a fresh Android
capture at 1.0 before they mean anything.

All figures are content-aligned (see Tooling) and were re-measured together after the alignment
change, so they are comparable with each other but not with anything quoted earlier in the session.

### Segmented picker, measured before and after

| | iOS | Android before | Android after |
| --- | --- | --- | --- |
| Track, dark | (36, 29, 37) | (0, 0, 0) | **(34, 22, 34)** |
| Selected, dark | (98, 91, 102) | (28, 28, 30) | **(100, 92, 103)** |
| Track, light | (238, 231, 237) | (242, 242, 247) | unchanged, already close |

## Swift reference inventory

47 captures in [`ios/`](ios). Auth (20) are re-used from the earlier pass — they are Swift
references and remain valid.

| Group | Screens captured | States |
| --- | --- | --- |
| Auth | sign-in, sign-up, verify-email, reset-password | default, keyboard, error, loading, filled, code-sent, dark — 20 files |
| Today | today (default / 3-days / 5-days), weekly-summary, attention-details, overdue | 6 |
| Tasks and projects | tasks, tasks-list, tasks-list-scrolled, tasks-search, task-filters, task-editor, task-detail*, projects, project-detail, project-editor, project-unassigned | 11 |
| Calendar | calendar (Schedule), calendar-week, calendar-month, calendar-conflicts, calendar-event-editor | 5 |
| Ask | ask, ai-consent | 2 |
| Voice | voice-capture, voice-ask | 2 |
| Account | account, account-settings | 2 |

### Reference integrity: four of the Swift captures were wrong

A reference that is silently wrong is worse than a missing one, and this set had four. They were
found by hashing every file and looking for duplicates, which is the check that should have been run
from the start — the mismatch percentage does not find them, because two sparse screens can be a
genuine 2% apart.

| File | What was wrong |
| --- | --- |
| `tasks-search-default.png` | byte-identical to `tasks-list-default.png` — the search field was never opened |
| `today-3days.png` / `today-5days.png` | byte-identical — the range segment did not switch |
| `attention-details-default.png` / `overdue-default.png` | byte-identical — the second screen was never pushed |
| `ai-consent-default.png` | captured the **voice** consent alert on `AddTaskByVoiceView`, not `consentView` |
| `calendar-week-default.png` | a duplicate of the Schedule capture — the segment did not switch |
| `calendar-conflicts-default.png` | landed on Ask by Voice |
| `task-detail` | landed on the wrong screen; deleted earlier |

All have been re-shot through the XCUITest driver, and **every capture is now taken only after the
view tree is asserted to be the intended screen** — `Selected` on the segment, the navigation bar's
`identifier`, or a string only that screen shows. `md5` across the set now reports no duplicates.

New references captured in the same pass: `ask-text-default`, `ask-answered-default`,
`calendar-event-details-default`, `calendar-event-editor-filled`, `account-settings-default`, and
dark-mode defaults for `calendar`, `ask`, `account` and `account-settings`.

**A test event was created to reach Event Details, and it could not be removed.** Screen 26 only
exists when the account has a calendar event, and this account had none — "0 calendar commitments
today". The event is **"Parity reference event", Thu 17 Sep 2026, 6:36–7:06 PM**. Neither app can
delete a calendar event: `CalendarView.swift` has no delete action or swipe action, and the React
Native API layer has no delete endpoint for events. It has to be removed from the source calendar by
hand. Captures taken after this point include it — `calendar-dark.png` was shot before, so the two
differ by one row.

### Hand-off to the other machine

Calendar, Ask, Account and Reminders are being done elsewhere from these references. Default states
for Calendar (5), Ask (2) and Account (2) are captured and committed. **Reminders/actions (screens
31 and 32) are not**: both open from a reminder notification, which needs a scheduled local
notification to fire — see "Not captured".

\* `task-detail` was captured but landed on the wrong screen and has been removed; it still needs a
clean capture.

**`tasks-search-default.png` was a second bogus reference** — byte-identical to
`tasks-list-default.png`, so the search state had never actually been captured. It has been replaced
with a real one driven through the XCUITest remote. Worth checking the rest the same way: two of the
first eleven Swift references in this group were wrong, and a wrong reference is worse than a
missing one because nothing flags it.

### Keyboard states cannot be compared as a full-screen diff

The iOS Simulator on this machine will not show the software keyboard: it treats the Mac's keyboard
as a connected hardware one and suppresses it. `defaults write com.apple.iphonesimulator
ConnectHardwareKeyboard -bool false` and restarting Simulator.app did not change it — in this Xcode
the setting is per-device and not reachable from the command line.

So a keyboard-state capture has a keyboard on Android and none on iOS, and the full-screen figure
(37.96% on sign-in) measures that, not the app. What can be compared is the content *above* the
keyboard, which is what the state is for — checking nothing is hidden or displaced. On sign-in that
region matches: the card, the fields and the "Forgot password?" row all sit where Swift puts them.

### Not captured, and why

- **Do Now** (screen 7) — cannot be reached with this account's data. The card only opens when there
  is a recommendation, and the account has 0 tasks scheduled today. Needs a seeded task.
- **Action queue, task action, composers** (screens 8, 31, 32) — reached from a reminder
  notification; not attempted yet.
- **Calendar month view, event details** — the segmented control did not switch; needs a retry.
- **Profile and settings** (screen 30) — push from Account; not attempted yet.
- Loading, empty, error and dark states for the non-auth screens.

## Screen-by-screen review (Windows pass, branch `rn-ui-parity-win`)

Read from the Swift `body` ranges in `docs/IOS_TO_REACT_NATIVE.md` §20 and the iPhone captures in
[`ios/`](ios). The mismatch column was *pending device* on the machine that wrote these rows; it has
now been measured on the phone at font scale 1.0, and an answered Ask turn and a real Event Details
were captured on both sides. The
Mac session or the user captures the Android side and fills it in. Shared-file changes this pass
could not make are listed in [`SHARED-REQUESTS.md`](SHARED-REQUESTS.md).

| Screen | State | Mismatch % | Reviewed from reference | Changes made | Shared requests | Remaining gaps |
| --- | --- | ---: | --- | --- | --- | --- |
| Calendar (25) | Schedule, light + dark | **13.83%** | `calendar-default.png`; `CalendarView.swift:72-176`, `:178-196`, `:198-226`, `:239-292`, `:311-347` | Top safe-area inset added (the wordmark drew under the status bar — global fix 1 never reached this tab). Search glyph, range chevron and the filters glyph take `nexdoInk`, not the tint, and the filters glyph is `.body`-sized, not 20. Search field, range button and filters button take their `.background.opacity(0.9/0.8)` fills. Placeholder takes `colors.placeholder`. Clear button gets its 44×44 frame. "Schedule Intelligence" is `.bold`, not semibold. The recommendation regains its `exclamationmark.triangle` label. Available time uses `DurationDisplay.durationLabel` — it printed "463 minutes" where Swift says "7 hours 43 minutes". `intelligenceStatus(allowCreation: true)` was missing entirely and is now built (loading, error + retry, "Create Appointments"). The voice creation circle is the indigo→blue gradient, both glyphs are `.title2`, the card text stack regains its 4pt gap and `minimumScaleFactor(0.8)`. `.subheadline` 20→21 and `.caption2` 14→13 line heights. Retry under a load failure inherits `nexdoSecondary`. The loading line stacks. Disclosure chevron takes the accent. `HStack` gaps corrected to 8. | `CalendarParts.tsx` time-gutter colour and three line heights; `TaskSymbol` outline triangle | SF Rounded; `.ultraThinMaterial`; the range and filters menus are hand-built where Swift uses a native `Menu`; `.safeAreaPadding(.bottom, 16)` on the scroll container is not reproduced |
| Calendar (25) | Week / Month grid | **12.21% / 10.74%** | `CalendarView.swift:348-381` — **no usable capture** | Weekday header row and the date rows are one grid again, so `spacing: mode == .month ? 10 : 0` applies between them; the header cells are a 28pt frame rather than a 28pt line box; selected-day fill corrected to `#2E5C96` (was `#2E5C97`); `dateNavigation` gets its 8pt `HStack` gap | — | `calendar-week-default.png` is a duplicate of the Schedule capture — the segmented control did not switch when it was shot, so Week and Month were reviewed from source only |
| Event details (26) | default | **59.79%**, presentation | `CalendarView.swift:164-180` — **no capture** | Rebuilt as a `Form` on iOS 26: 16pt section inset, 26pt corners, 56pt rows inset 16, 1pt `listSeparator` between rows, and the header is **"Calendar commitment"** in sentence case at `.body`/`.secondaryLabel` inset 32 — it was `CALENDAR COMMITMENT` at 13pt, which is the tell of a pre-iOS-26 port. The sheet takes the elevated palette, and the inline title is centred with Done trailing | — | A bottom-anchored `Modal` stands in for a full sheet with a real navigation bar; no capture exists to check the row heights against |
| Add calendar event (27) | default, light + dark | **11.76%** | `calendar-event-editor-default.png`; `CalendarView.swift:518-588`, `TaskCreationStyle` `RootView.swift:2190-2204` | `TaskCreationStyle.accent` is its own pair of literals (`#3D29C7` / `#B8ADFF`), not the app tint — the whole editor was tinted `nexdoIndigo`, badly wrong in dark mode. `TaskCreationStyle.input` is `.tertiarySystemGroupedBackground` (`#F2F2F7` / `#2C2C2E`), not `groupedBackground`, which is **black** in dark mode. Inputs lose the stroke Swift does not draw. The Starts/Ends rows put the value in a capsule instead of filling the row with grey. The repeat picker is a menu-style accent label, not a filled field. The disabled Create button keeps its arrow and takes `.secondary`, not `nexdoSecondary`. Title field is `.title3`, notes are `.body` at `lineLimit(3...6)`; placeholders take `colors.placeholder` | `TaskSymbol` up/down chevron | Native `DatePicker` and `Picker` (§20 accepts these); whether a sheet should also elevate `TaskCreationStyle`'s own semantic colours is unresolved and was left alone so this pass and the Mac's task editor do not diverge |
| Schedule conflicts (28) | default | **4.11%** | `CalendarView.swift:463-477` — **no capture** (`calendar-conflicts-default.png` landed on Ask by Voice) | Section header sentence case at `.body`/`.secondaryLabel` inset 32; 26pt corners; the list section loses its stroke; row separators are 1pt `listSeparator`; the inline title is centred with Done trailing; the sheet takes the elevated palette; the loading line stacks | — | Hand-built inset-grouped list rather than a `List`; `calendar-conflicts-default.png` needs re-shooting |
| Ask Nexdo, suggestions (23) | default, light + dark | **36.21%**, detent | `ask-default.png`; `AskNexdoView.swift:182-277`, `:58-87`, `:277-310` | **Applied in full** — the three Ask components are this session's by agreement. `AskStyle.ink` and `AskStyle.secondary` are `.label` and `.secondaryLabel`, not the brand colours, which was a light-mode error on the tagline, the suggestion titles, details and chevrons, the question row and the example rows. `.subheadline` 20→21 and `.footnote` 18→20 across all three files. The suggestion and entry card text stacks regain their 3pt and 4pt gaps, both entry labels get `minimumScaleFactor(0.75)`, the example rows become `.body`, the mic glyph `.body`, and the row gap 12→8. The sheet takes the elevated palette, matched by `app/ask/_layout.tsx` on `index` only | none left | Detents: Swift presents this at `.fraction(0.84)` with a drag indicator; Expo Router has no detent API on Android, so it is a full-height modal. The disabled dim where Swift writes no `.opacity` is **derived** (≈0.45) from the style map's measured 0.55→0.25, not measured directly |
| Free form Text (23) | default | **9.17%** | `AskNexdoView.swift:215-230`, `:312-345` — **no capture** | Applied. The field's `lineLimit(4...8)` is 108–192 at a 21pt line box (was a flat 96), and the 1…4 case is 44–108. The placeholder takes `colors.placeholder`. The three composer speech controls are `.body`, as Swift's `composer` carries no `.font`. "Asking Nexdo…" stacks under its spinner. The submit button's disabled opacity is 0.25, not 0.55 | none left | No reference capture for the text page or for an answered turn, so the response cards were reviewed from source alone. **One request was wrong and was not applied as written**: the failure "Retry" stays `.subheadline`, because Swift puts `.font(.subheadline)` on the whole failure `VStack` (`:256`) |
| AI consent (24) | default | **97.65%**, presentation | `AskNexdoView.swift:348-364` — **no capture** | Applied. "Allow sharing with OpenAI" is a content-sized capsule and "Not now" a plain text button, both leading-aligned in the `VStack(alignment: .leading)` — they were full-width blocks. Body text takes `.label`, the footnote `.secondaryLabel`, and the sheet the elevated palette. The same capsule treatment went to "Approve changes" and "Keep my current plan" on the response card | none left | `ai-consent-default.png` is mislabelled: it captures the **voice** consent alert on `AddTaskByVoiceView`, not `consentView`. Screen 24 still needs a capture. `[.medium, .large]` detents have no Android equivalent |
| Account — My Page (29) | default, light + dark | **6.79%** | `account-default.png`; `ProfileView.swift:65-99`, `:104-123` | The sheet takes the elevated palette. The inline title is centred with Close trailing, and Close gains the circular capsule `account-default.png` shows around it. `.title3` line height 25 → **28**. Sign out loses the indigo stroke Swift does not draw, sits on `.background` rather than `surface`, and keeps the label "Sign out" — the "Signing out…" copy was invented | `ProfileParts.tsx`: two glyph sizes, and the card/avatar need the elevated palette | iOS 26 bar-button glass capsule is approximated, not reproduced; Swift's `confirmationDialog` versus a Material alert stays an accepted platform gap |
| Profile and settings (30) | default, light + dark | **18.47%** | `ProfileView.swift:146-270`, `:274-295` — **no capture** | Pushed inside the sheet, so it takes the elevated palette. Back chevron is `.body`-sized (17, was 22) and keeps the tint, dimming rather than turning grey. The App Voice label and glyph take `.label`, not `nexdoInk`, and the percentage gets `tabular-nums` for `.monospacedDigit()`. The consent-state line takes `.label`. "Saving profile photo…" stacks under its spinner. The Save button reads the shared `saving` flag, as Swift does, so a photo upload or a sync also shows "Saving…"; its `HStack` gap is 8. `.subheadline` 20→21 | `SettingsControls.tsx`: six rows, **including the segmented Appearance picker**, which still renders as a tint-filled block where Swift has a system segmented control — the same fault global fix 5 closed on Tasks | No reference capture for this screen at all, in either mode; the large-title nav bar, the slider and the hour pickers were reviewed from source only. Native `Picker`/`Slider`/`DatePicker` remain §20 gaps |
| Action queue (8) | default + empty | pending device | `TodayActionsView.swift:188-220` — **no capture** | The sheet takes the elevated palette. The inline title is centred with Done trailing. Section headers are **"Due now" / "Upcoming"** in sentence case at `.body`/`.secondaryLabel` inset 32 — they were `DUE NOW` / `UPCOMING` at 13pt. 26pt corners, no section stroke, 1pt `listSeparator` rows, 56pt row boxes. The empty state is a 52pt `.secondaryLabel` glyph over a `.label` title, as `ContentUnavailableView` draws it | `TodayActions.tsx`: `NextActionRow` line height and two `.secondary` colours | Never captured on either platform — it is reached from a reminder notification. Hand-built inset-grouped list rather than a `List` |
| Task action (31) | default + unavailable | pending device | `TaskActionView.swift:133-236` — **no capture** | The sheet takes the elevated palette. `.subheadline` 20→21. The channel rows space their `Label` glyph by 6, not 12. "Finding contact…" stacks under its spinner. The contact detail line and the receipt take `.secondaryLabel`, not `nexdoSecondary`. The unavailable state matches `ContentUnavailableView`: a 52pt `.secondaryLabel` glyph, a `.label` title and a `.secondaryLabel` description | — | No capture. The two composers are the system ones on both platforms (§20 screen 32). Swift's `confirmationDialog` before placing a call is a Material alert here |

## Group 4 — Today

| Screen | Android vs Swift | Note |
| --- | ---: | --- |
| Needs your attention | **4.10%** | a match; the tab bar is now present on both |
| Overdue | **6.08%** | a match |
| Do Now | **9.98%** | first capture on either platform |
| Weather forecast | **13.55%** | first capture on either platform |
| Today, default | **20.41%** | was 27.79% before the Weekly Summary card was fixed |
| Weekly Summary | **23.17%** | cumulative drift down a long screen |
| Today, 3 days | **24.54%** | |
| Today, 5 days | **24.62%** | |

### The Weekly Summary card was solid white where Swift draws glass

Three faults in one card, all from RootView.swift:1072-1088:

| | Swift | Android before |
| --- | --- | --- |
| Fill | `.ultraThinMaterial` — measured (238, 237, 241) with the lavender backdrop showing through | `colors.surface`, flat **(255, 255, 255)** |
| Stroke | `.stroke(Color.nexdoIndigo.opacity(0.12))` | present, but invisible against the opaque fill |
| Icon | `.background(NexdoTheme.gradient, …)` — magenta → indigo → blue | a flat `nexdoIndigo` square |

`.ultraThinMaterial` is on the accepted-gaps list, but **it is not actually a gap in this codebase**:
`GlassCard` has reproduced it with `expo-blur` since the auth screens, and nothing else had reached
for it. It now takes an optional `stroke` and `shadow` so a card that is not an auth card can use it —
the auth cards stroke `Color.white.opacity(0.8)` and carry a shadow, this one strokes indigo at 12%
and carries none. The Android card now measures (241, 241, 243) against Swift's (238, 237, 241).

Worth re-reading the rest of the accepted-gaps list the same way: a gap that was true when it was
written may have been closed by a later phase.

## The reminder screens, and the data it took to reach them

Screens 8, 31 and 32 had never been captured on either platform, because they only exist when the
account has a **contact-shaped task** — `DeterministicTaskActionDetector` matches a title like
"Call Damien" (TaskActionDetector.swift:6-33) and schedules a local notification at the task's time.

Three things had to be true first, and the first was a real fault in the test setup rather than the
app: **notifications were disabled for the app on the phone** (`dumpsys notification` reported
`importance=NONE`), so no reminder could ever have fired. After
`pm grant … POST_NOTIFICATIONS`, the reminder fired on time.

Neither app can set a task's *time* — Swift's picker is `displayedComponents: .date`
(RootView.swift:2040) and Android's is date-only too, which is correct parity — so a task created for
today is scheduled at the current time and its reminder fires immediately.

| Screen | Android vs Swift | How it was reached |
| --- | ---: | --- |
| Action queue (8) | **3.38%** | "View all" on the Next up card, which needs a *second* action |
| Task action (31) | **18.26%** | a channel button on the action card |
| Today, action needed | **25.58%** | one contact-shaped task |

Screen 32 — the message and email composers — is the system composer on both platforms and is
already recorded as a §20 gap; it is not a screen this app draws.

### Faults the reminder captures exposed

| Fault | Swift | Android before |
| --- | --- | --- |
| The Action Needed card was flat white with an opaque fill | `ActionGlass`: `.ultraThinMaterial` + `nexdoIndigo` 22% stroke (TodayActionsView.swift:48-54) | `colors.surface` |
| "Remind me later" and "Dismiss" were **outlined** | `.buttonStyle(.bordered)` is a **filled** tinted capsule, measured (206, 202, 241) over a (238, 238, 241) card — the tint at 18% | a hairline border |
| The Daily Briefing row was an opaque card | `.ultraThinMaterial` (RootView.swift:1070) | `colors.surface` |
| "Remind me in 15 minutes" and "Dismiss" were indigo | `.foregroundStyle(Color.nexdoInk)` on the whole view (TaskActionView.swift:209); the buttons carry no `.buttonStyle`, so the label is ink — iOS (0, 0, 22) | the tint, (61, 41, 240) |

`.buttonStyle(.bordered)` is worth remembering: in SwiftUI it **fills**, and reading it as "bordered
= outline" is a natural mistake that had been made twice.

### A gradient stroke cannot be reproduced on a glass card

Swift strokes the Action Needed card with `NexdoTheme.gradient` at 1.5pt
(TodayActionsView.swift:130). The usual React Native workaround is a `LinearGradient` *behind* the
card with 1.5 of padding, which is what `ActionCardRing` does — and it cannot be used here, because
the card is glass and the blur samples the gradient straight through, turning the whole card blue.
That was measured, not assumed: the diff went from 32% to 65% when it was tried. A gradient stroke
needs a mask over the card, not a fill behind it. The solid `nexdoIndigo` border stays as the
approximation, and this is now a recorded gap.

### Weekly tasks had a hardcoded title

`.navigationTitle("\(filter.rawValue) tasks")` (WeeklySummaryView.swift:307) — "Completed tasks",
"Overdue tasks". The route declared a static `title: 'Tasks'`, so every filter showed the same word.
Now set from the screen, which is where the filter lives.

### Still uncaptured in this group

Both now have captures on both platforms. `schedule-check` needed a schedule-gap attention item,
which the account did not have; creating a contact task that overlapped the test calendar event
produced a **CONFLICT** attention row — "Call Damien at 6:16 PM overlaps Parity reference event" —
which is exactly that item. No overlapping events had to be created on the web app.

### Three of those figures measure presentation, not styling

`ask-default` (36.21%), `ai-consent` (97.65%) and `event-details` (59.79%) are all cases where the
two platforms put the same content in a different container, so almost every row is displaced and the
number says nothing about the styling.

| Screen | iOS | Android |
| --- | --- | --- |
| Ask suggestions | `.fraction(0.84)` detent over the tab behind it | full-height modal |
| AI consent | `[.medium, .large]` detent, bottom-anchored over the dimmed page | full-height page from the top |
| Event details | a large sheet covering most of the screen | a bottom-anchored `Modal` about 45% tall |

The first two are the recorded detent gap. The third is not — Android could present Event Details at
full height like the app's other sheets and would then be comparable. That is a request for the
session that owns `app/(tabs)/calendar.tsx`; it is in SHARED-REQUESTS.md.

Read these three from the captures, not the percentage. Compare `ai-consent-default.png` side by side
and the content lines up: title, body, the privacy link, the footnote, a content-sized capsule and a
plain "Not now" — every fix the Windows session made from source is confirmed by the reference.

## Flows

Not started. Each §20 row needs its presentation checked (tab vs push vs sheet vs full-screen), the
close affordance, what dismisses it and where it returns to.

## Flows

| Flow | Result |
| --- | --- |
| Account sheet — open from the Today avatar | matches: modal sheet on both |
| Account — sign out confirmation | **gap, accepted**: Swift shows a `confirmationDialog` popover, Android a Material alert. Both are the native idiom for the platform. |
| Sign out — return to sign-in | **broken, see below** |
| Task editor — presentation | **gap**: Swift is a `.sheet` at a detent, Android is a full-height page. Expo Router has no detent API; the plan doc already records this as accepted. |
| Task editor — close affordance | fixed: "Close" now sits left of a centred title (was "CloseNew Task") |

## Functional bugs noticed, not fixed

- **`[["tasks"]]: No queryFn was passed as an option`** — a warning toast on both platforms,
  including on the signed-out screen where no tasks query should be running. Pre-existing on
  `react-native-migration`; not introduced by the parity work.
- **Sign out did not leave the Today screen** (fixed separately in `2709b84`): the gate read the
  `me` query, which `queryClient.clear()` destroys, so neither route guard matched.
- **Signing out from the Account sheet leaves the sheet on screen.** The profile clears, but the
  sheet stays up and its close button then logs *"The action 'GO_BACK' was not handled by any
  navigator"* — the route guard has already unmounted the navigator that owned the modal. The sheet
  has to be dismissed before the guard flips. Not fixed here: the sign-out call lives in
  `src/query/useAuth.ts`, which this pass does not touch.

## Run B — Moments

Phase 11 Run B, built on Windows from the Swift source and the second-pass iOS captures
(`ios/moments-*`, `ios/moment-*`, `ios/festival-*`, `ios/wish-*`, `ios/review-wish-*`,
`ios/schedule-wish-*`, `ios/greeting-card-*`). **No Android capture has been taken yet**: this
machine has no device attached, so every row below is "built, awaiting device capture". The Android
side of each capture pair goes in `android/` under the same name once a build with the three new
native modules is on the phone.

| Screen | Swift `body` | React Native | iOS captures | Status |
| --- | --- | --- | --- | --- |
| Important Moments | `ImportantMomentsView.swift:208-307` | `app/moments/index.tsx` | `moments-default`, `-scrolled`, `-dark`, `-empty`, `-scheduled`, `-scheduled-dark`, `-sent-empty`, `-filter-menu`, `-search-keyboard`, `-upcoming-row-needs-review` | built, awaiting device capture |
| Manage Moments | `ManageFestivalView.swift:3-44` | `app/moments/manage-list.tsx` | `moments-manage-list`, `-dark` | built, awaiting device capture |
| Create / Edit Moment | `MomentEditor.swift:5-171` | `app/moments/editor.tsx`, `import-editor.tsx`, `src/features/moments/MomentEditorView.tsx` | `moment-create-*` | built, awaiting device capture |
| Manage Moment, 4 steps | `ManageFestivalView.swift:45-220`, `ManageFestivalModel.swift:4-233` | `app/moments/manage.tsx`, `src/features/moments/ManageMomentView.tsx`, `manageModel.ts` | `moment-manage-*`, `festival-manage-*` | built, awaiting device capture |
| Add Contact | `ManageFestivalView.swift:221-225` | `ManualRecipientSheet` in `ManageMomentView.tsx` | `moment-add-recipient-error-empty` | built, awaiting device capture |
| Choose delivery address | `ManageFestivalView.swift:217` | `ManageMomentView.tsx` | not captured | built |
| Personalize | `ManageFestivalView.swift:216` | `ManageMomentView.tsx` | `review-wish-personalize` (Review Wish's disclosure; the sheet itself is not captured) | built |
| Review schedule | `ManageFestivalView.swift:183-215` | `ManageMomentView.tsx` | `moment-manage-schedule-confirm` | built, awaiting device capture |
| Schedule confirmed + confetti | `ManageFestivalView.swift:227-261`, `MomentConfetti.swift:10-54` | `ScheduleSuccess` in `ManageMomentView.tsx`, `MomentConfetti` in `components.tsx` | `moment-schedule-success` | built, awaiting device capture |
| Greeting Card editor | `FestivalServices.swift:103-187` | `src/features/moments/GreetingCard.tsx` | `greeting-card-editor`, `-scrolled` | built, awaiting device capture |
| Review Wish | `ImportantMomentsView.swift:309-373` | `app/moments/review.tsx` | `review-wish-*` | built, awaiting device capture |
| Choose Delivery | `ImportantMomentsView.swift:374-436` | `app/moments/delivery.tsx` | `wish-delivery-*` | built, awaiting device capture |
| Confirm email | `ImportantMomentsView.swift:596-613` | `src/features/moments/WishEmailConfirmation.tsx` | not captured (needs Gmail) | built from source |
| Schedule Wish | `ImportantMomentsView.swift:447-494` | `app/moments/schedule-wish.tsx` | `schedule-wish-*` | built, awaiting device capture |
| Wish details, Edit Schedule, cancel | `ImportantMomentsView.swift:495-551` | `app/moments/wish.tsx` | `wish-details*`, `wish-edit-schedule`, `wish-cancel-dialog` | built, awaiting device capture |
| Moments Settings | `MomentEditor.swift:205-245` | `app/moments/settings.tsx` | `moments-settings*` | built, awaiting device capture |
| Calendar Moments | `MomentEditor.swift:288-310` | `app/moments/calendar-import.tsx` | `moments-calendar-import-empty` | built, awaiting device capture |
| Choose Festivals | `MomentEditor.swift:311-322` | `app/moments/festivals.tsx` | `moments-festivals*` | built, awaiting device capture |
| Notification route | `ImportantMomentsView.swift:563-594`, `ImportantMomentsStore.swift:12-17, :83-88` | `src/features/moments/useMomentsLifecycle.ts`, `app/moments/index.tsx` (`routed`) | not captured (needs a delivered notification) | built from source |

### How the global patterns were translated

| # | Pattern | React Native |
| --- | --- | --- |
| 1 | `MomentSegments` | `MomentSegments` in `components.tsx`: the brand gradient behind the selected segment, indigo text on the rest, over `glassFill`. Choose Delivery's "When" keeps the SYSTEM segmented control (`SettingsSegments`), because Swift uses `.pickerStyle(.segmented)` there. |
| 2 | Step tabs with auto-save | `ManageMomentView` → `model.changeTab`: a dirty moment saves first and moves only on success; a 409 "Existing schedules" asks "Save changes to scheduled wishes?" and keeps the pending tab. |
| 3 | Header summary card | The identity `MomentCard` with the `Switch` and "Active"/"Inactive". |
| 4 | `MomentCard` | `GlassCard` at 22pt with a `nexdoIndigo` 18% stroke, or a gradient fill. |
| 5 | `MomentPrimary` + inline error | `MomentPrimary`; the model's error renders as red text below the step content. |
| 6 | In-content section titles | `largeTitle` / `title` / `title2` bold `Text`s; the navigation title stays centred and inline. |
| 7 | Two-step confirmations | Review schedule is a sheet; Cancel wish, Disable moment, Delete Moment, Discard and Delete all are `Alert.alert`s, the accepted platform substitute for `confirmationDialog`. |
| 8 | Form sheets | `MomentSheet` (a full-height page sheet) with the large title in the content and the toolbar buttons in the bar; Add Contact's "Add recipient" is disabled while required fields are empty. |
| 9 | Keyboard "Done" | `KeyboardDoneBar`, a bar pinned to the top of the keyboard, since Android has no accessory view. |

## Run C — Shopping

Phase 11 Run C, built on Windows from the Swift source and the second-pass iOS captures
(`ios/shopping-*`). As for Run B, **no Android capture has been taken yet**; each row is "built,
awaiting device capture" until a build with the camera permission and Run B's modules is on the phone.

| Screen | Swift `body` | React Native | iOS captures | Status |
| --- | --- | --- | --- | --- |
| My Lists | `ShoppingViews.swift:78-138` | `app/shopping/index.tsx` | `shopping-lists-default`, `-dark`; empty state not captured (ported from source) | built, awaiting device capture |
| New List | `ShoppingViews.swift:143-205` | `NewListSheet` in `src/features/shopping/sheets.tsx` | `shopping-new-list`, `-filled`, `-use-last`, `-dark`, `-error-empty-name` | built, awaiting device capture |
| List detail | `ShoppingViews.swift:206-295, :335-402` | `app/shopping/[id].tsx`, `components.tsx` | `shopping-detail-default`, `-empty`, `-checked`, `-typing`, `-options-menu`, `-dark`, `shopping-complete-trip-dialog` | built, awaiting device capture |
| Item | `ShoppingItemEditor.swift:5-111` | `src/features/shopping/ItemEditorSheet.tsx` | `shopping-item-editor`, `-scrolled`, `-category-menu`, `-dark`, `-error-empty-name` | built, awaiting device capture |
| Add by Voice | `ShoppingVoice.swift:77-127` | `src/features/shopping/VoiceSheet.tsx` | `shopping-voice-ready`, `-listening`, `-stopped`, `-dark` | built, awaiting device capture |
| Review Items | `ShoppingViews.swift:296-304` | `ReviewItemsSheet` in `sheets.tsx` | `shopping-review-items`, `-dark`, `-error-empty-name` | built, awaiting device capture |
| List Settings | `ShoppingViews.swift:305-315` | `ListSettingsSheet` in `sheets.tsx` | `shopping-list-settings`, `-dark`, `-error-empty-name` | built, awaiting device capture |
| Share List | `ShoppingViews.swift:316-332` | `ShareListSheet` in `sheets.tsx` | `shopping-share-list`, `-link`, `-dark`, `shopping-share-sheet-text` | built, awaiting device capture |

### Patterns reused from Run B

| # | Pattern | Here |
| --- | --- | --- |
| 4 | `MomentCard` | My Lists' cards, New List's choices and name card, Add by Voice's review cards |
| 5 | `MomentPrimary` | "Create List" / "Creating…", "Review Items" / "Organizing…", "Add N Items" |
| 7 | Two-step confirmations | Complete trip and Delete list are `Alert.alert`s with Swift's titles and message |
| 8 | Form sheets, Save disabled while required fields are empty | Item (Cancel/Save), Review Items (Cancel), List Settings (Save only), Share List; New List's "Create List" |

### Differences to check on the device

- The detail screen is Swift's inset-grouped `List` drawn with Run B's `FormSection`s over the Today
  backdrop; the header row sits outside the first section, as Swift clears its background.
- Swipe-to-delete and drag-to-reorder are replaced by an **Edit** mode (delete button and up/down
  arrows); see the README's Known differences.
