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

## Tooling

- `mobile/scripts/capture.sh <screen>-<state>` — shoots both platforms at once
  (`PLATFORM=ios|android` for one side only) and shrinks to 720 px.
- `mobile/scripts/diff.py <screen>-<state>` — scales both to a common width, **crops each side by
  its own top inset** so the first content row lines up, and compares only the overlapping height.
  Prints the share of compared pixels whose largest RGB channel differs by more than 16/255, and
  writes a heat map to `diff/`.

  **Why the crop matters.** iOS reserves 62 pt for the status bar and Android 31.5 dp. Overlaying
  from the screen top puts every content row about 30 px out, and the heat map lights up the whole
  screen twice over — 35-40% on any populated screen, whatever the styling is like. Content-aligned
  figures are the ones in this file; they are not comparable with the earlier pass's numbers.

## Global fixes

| # | Fix | Where | Status |
| --- | --- | --- | --- |
| 1 | **Top safe-area inset.** Every tab screen drew under the status bar; the wordmark collided with the clock. `contentInsetAdjustmentBehavior` is iOS-only, so Android got nothing. | `src/components/TodayShell.tsx` (`TasksTopBar`) — shared by Today and Tasks, so one change covers both | **done, verified on device** |
| 2 | **Bottom inset.** Every pinned footer rendered *under* the Android gesture-navigation bar — on the task editor the "Create Task" button sat behind the back/home/recents controls and could not be tapped. Six screens had the same hand-rolled footer. | new `src/components/StickyFooter.tsx`, adopted by task/new, task/filters, task/[id], project/new, project/[id]/edit, calendar/event/new | **done, verified on device** |
| 3 | **Header pattern.** React Navigation left-aligns a header title on Android, so a screen with a custom `headerLeft` rendered "CloseNew Task". SwiftUI's `.inline` title is always centred. | new `src/theme/navigation.ts` (`stackHeaderOptions`), adopted by the task, project, calendar and today stacks | **done, verified on device** |
| 4 | **Font mapping re-verified on Android** — see below | `docs/swift-to-rn-style-map.md` §1b, §2 | **done** |
| 5 | **Colour tokens in both appearance modes.** Dark mode is broadly correct. One real fault found and fixed: the segmented picker used opaque `groupedBackground`/`surface`, which renders a black box in dark mode where Swift has translucent system fills. | `src/theme/colors.ts` (`segmentTrack`, `segmentSelected`) + `app/(tabs)/tasks.tsx` | **partly done, verified on device** |
| 6 | Text truncation and wrapping ("Add Manually", "Select Date") | — | root cause identified; no truncation reproduced yet on this device at these widths |
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

## Screen results

Only screens with **both** captures can carry a percentage. Android captures exist for two screens
so far; the rest of this table fills in as each group is done.

| Screen | State | Before | After | Remaining gaps |
| --- | --- | ---: | ---: | --- |
| Today | default, light | — | **32.16%** | global fixes 2, 3, 6 outstanding |
| Tasks | default, light | — | **14.98%** | empty-state glyph (SF Symbol gap), tab-bar selection pill |
| Tasks | default, dark | — | **31.45%** | as above, plus backdrop tint |
| Task editor | default, light | 18.67% | **17.17%** | Swift presents a detent sheet, Android a full page (flow gap, not styling) |
| Sign in | empty, light | 19.23% | **19.13%** | Apple button absent on Android by design — most of what is left |
| Sign in | empty, dark | 18.51% | **18.78%** | as above; card stroke now matches after the fix below |
| Sign up | empty, light | 28.03% | **20.84%** | nav-bar pill (iOS 26); intro wraps to 2 lines not 3 (Roboto is narrower) |
| Reset password | empty, light | — | **3.38%** | essentially a match |

All figures are content-aligned (see Tooling). The status-bar fix is not visible in them because the
crop now removes that offset by design — its effect is that content no longer sits under the clock.

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
| Calendar | calendar, calendar-week, calendar-conflicts, calendar-event-editor | 4 |
| Ask | ask, ai-consent | 2 |
| Voice | voice-capture, voice-ask | 2 |
| Account | account | 1 |

\* `task-detail` was captured but landed on the wrong screen and has been removed; it still needs a
clean capture.

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
[`ios/`](ios). **No device on this machine**, so every row's mismatch % is *pending device* — the
Mac session or the user captures the Android side and fills it in. Shared-file changes this pass
could not make are listed in [`SHARED-REQUESTS.md`](SHARED-REQUESTS.md).

| Screen | State | Mismatch % | Reviewed from reference | Changes made | Shared requests | Remaining gaps |
| --- | --- | ---: | --- | --- | --- | --- |
| Calendar (25) | Schedule, light + dark | pending device | `calendar-default.png`; `CalendarView.swift:72-176`, `:178-196`, `:198-226`, `:239-292`, `:311-347` | Top safe-area inset added (the wordmark drew under the status bar — global fix 1 never reached this tab). Search glyph, range chevron and the filters glyph take `nexdoInk`, not the tint, and the filters glyph is `.body`-sized, not 20. Search field, range button and filters button take their `.background.opacity(0.9/0.8)` fills. Placeholder takes `colors.placeholder`. Clear button gets its 44×44 frame. "Schedule Intelligence" is `.bold`, not semibold. The recommendation regains its `exclamationmark.triangle` label. Available time uses `DurationDisplay.durationLabel` — it printed "463 minutes" where Swift says "7 hours 43 minutes". `intelligenceStatus(allowCreation: true)` was missing entirely and is now built (loading, error + retry, "Create Appointments"). The voice creation circle is the indigo→blue gradient, both glyphs are `.title2`, the card text stack regains its 4pt gap and `minimumScaleFactor(0.8)`. `.subheadline` 20→21 and `.caption2` 14→13 line heights. Retry under a load failure inherits `nexdoSecondary`. The loading line stacks. Disclosure chevron takes the accent. `HStack` gaps corrected to 8. | `CalendarParts.tsx` time-gutter colour and three line heights; `TaskSymbol` outline triangle | SF Rounded; `.ultraThinMaterial`; the range and filters menus are hand-built where Swift uses a native `Menu`; `.safeAreaPadding(.bottom, 16)` on the scroll container is not reproduced |
| Calendar (25) | Week / Month grid | pending device | `CalendarView.swift:348-381` — **no usable capture** | Weekday header row and the date rows are one grid again, so `spacing: mode == .month ? 10 : 0` applies between them; the header cells are a 28pt frame rather than a 28pt line box; selected-day fill corrected to `#2E5C96` (was `#2E5C97`); `dateNavigation` gets its 8pt `HStack` gap | — | `calendar-week-default.png` is a duplicate of the Schedule capture — the segmented control did not switch when it was shot, so Week and Month were reviewed from source only |
| Event details (26) | default | pending device | `CalendarView.swift:164-180` — **no capture** | Rebuilt as a `Form` on iOS 26: 16pt section inset, 26pt corners, 56pt rows inset 16, 1pt `listSeparator` between rows, and the header is **"Calendar commitment"** in sentence case at `.body`/`.secondaryLabel` inset 32 — it was `CALENDAR COMMITMENT` at 13pt, which is the tell of a pre-iOS-26 port. The sheet takes the elevated palette, and the inline title is centred with Done trailing | — | A bottom-anchored `Modal` stands in for a full sheet with a real navigation bar; no capture exists to check the row heights against |
| Add calendar event (27) | default, light + dark | pending device | `calendar-event-editor-default.png`; `CalendarView.swift:518-588`, `TaskCreationStyle` `RootView.swift:2190-2204` | `TaskCreationStyle.accent` is its own pair of literals (`#3D29C7` / `#B8ADFF`), not the app tint — the whole editor was tinted `nexdoIndigo`, badly wrong in dark mode. `TaskCreationStyle.input` is `.tertiarySystemGroupedBackground` (`#F2F2F7` / `#2C2C2E`), not `groupedBackground`, which is **black** in dark mode. Inputs lose the stroke Swift does not draw. The Starts/Ends rows put the value in a capsule instead of filling the row with grey. The repeat picker is a menu-style accent label, not a filled field. The disabled Create button keeps its arrow and takes `.secondary`, not `nexdoSecondary`. Title field is `.title3`, notes are `.body` at `lineLimit(3...6)`; placeholders take `colors.placeholder` | `TaskSymbol` up/down chevron | Native `DatePicker` and `Picker` (§20 accepts these); whether a sheet should also elevate `TaskCreationStyle`'s own semantic colours is unresolved and was left alone so this pass and the Mac's task editor do not diverge |
| Schedule conflicts (28) | default | pending device | `CalendarView.swift:463-477` — **no capture** (`calendar-conflicts-default.png` landed on Ask by Voice) | Section header sentence case at `.body`/`.secondaryLabel` inset 32; 26pt corners; the list section loses its stroke; row separators are 1pt `listSeparator`; the inline title is centred with Done trailing; the sheet takes the elevated palette; the loading line stacks | — | Hand-built inset-grouped list rather than a `List`; `calendar-conflicts-default.png` needs re-shooting |
| Ask Nexdo, suggestions (23) | default, light + dark | pending device | `ask-default.png`; `AskNexdoView.swift:182-277`, `:58-87`, `:277-310` | **Applied in full** — the three Ask components are this session's by agreement. `AskStyle.ink` and `AskStyle.secondary` are `.label` and `.secondaryLabel`, not the brand colours, which was a light-mode error on the tagline, the suggestion titles, details and chevrons, the question row and the example rows. `.subheadline` 20→21 and `.footnote` 18→20 across all three files. The suggestion and entry card text stacks regain their 3pt and 4pt gaps, both entry labels get `minimumScaleFactor(0.75)`, the example rows become `.body`, the mic glyph `.body`, and the row gap 12→8. The sheet takes the elevated palette, matched by `app/ask/_layout.tsx` on `index` only | none left | Detents: Swift presents this at `.fraction(0.84)` with a drag indicator; Expo Router has no detent API on Android, so it is a full-height modal. The disabled dim where Swift writes no `.opacity` is **derived** (≈0.45) from the style map's measured 0.55→0.25, not measured directly |
| Free form Text (23) | default | pending device | `AskNexdoView.swift:215-230`, `:312-345` — **no capture** | Applied. The field's `lineLimit(4...8)` is 108–192 at a 21pt line box (was a flat 96), and the 1…4 case is 44–108. The placeholder takes `colors.placeholder`. The three composer speech controls are `.body`, as Swift's `composer` carries no `.font`. "Asking Nexdo…" stacks under its spinner. The submit button's disabled opacity is 0.25, not 0.55 | none left | No reference capture for the text page or for an answered turn, so the response cards were reviewed from source alone. **One request was wrong and was not applied as written**: the failure "Retry" stays `.subheadline`, because Swift puts `.font(.subheadline)` on the whole failure `VStack` (`:256`) |
| AI consent (24) | default | pending device | `AskNexdoView.swift:348-364` — **no capture** | Applied. "Allow sharing with OpenAI" is a content-sized capsule and "Not now" a plain text button, both leading-aligned in the `VStack(alignment: .leading)` — they were full-width blocks. Body text takes `.label`, the footnote `.secondaryLabel`, and the sheet the elevated palette. The same capsule treatment went to "Approve changes" and "Keep my current plan" on the response card | none left | `ai-consent-default.png` is mislabelled: it captures the **voice** consent alert on `AddTaskByVoiceView`, not `consentView`. Screen 24 still needs a capture. `[.medium, .large]` detents have no Android equivalent |
| Account — My Page (29) | default, light + dark | pending device | `account-default.png`; `ProfileView.swift:65-99`, `:104-123` | The sheet takes the elevated palette. The inline title is centred with Close trailing, and Close gains the circular capsule `account-default.png` shows around it. `.title3` line height 25 → **28**. Sign out loses the indigo stroke Swift does not draw, sits on `.background` rather than `surface`, and keeps the label "Sign out" — the "Signing out…" copy was invented | `ProfileParts.tsx`: two glyph sizes, and the card/avatar need the elevated palette | iOS 26 bar-button glass capsule is approximated, not reproduced; Swift's `confirmationDialog` versus a Material alert stays an accepted platform gap |
| Profile and settings (30) | default, light + dark | pending device | `ProfileView.swift:146-270`, `:274-295` — **no capture** | Pushed inside the sheet, so it takes the elevated palette. Back chevron is `.body`-sized (17, was 22) and keeps the tint, dimming rather than turning grey. The App Voice label and glyph take `.label`, not `nexdoInk`, and the percentage gets `tabular-nums` for `.monospacedDigit()`. The consent-state line takes `.label`. "Saving profile photo…" stacks under its spinner. The Save button reads the shared `saving` flag, as Swift does, so a photo upload or a sync also shows "Saving…"; its `HStack` gap is 8. `.subheadline` 20→21 | `SettingsControls.tsx`: six rows, **including the segmented Appearance picker**, which still renders as a tint-filled block where Swift has a system segmented control — the same fault global fix 5 closed on Tasks | No reference capture for this screen at all, in either mode; the large-title nav bar, the slider and the hour pickers were reviewed from source only. Native `Picker`/`Slider`/`DatePicker` remain §20 gaps |
| Action queue (8) | default + empty | pending device | `TodayActionsView.swift:188-220` — **no capture** | The sheet takes the elevated palette. The inline title is centred with Done trailing. Section headers are **"Due now" / "Upcoming"** in sentence case at `.body`/`.secondaryLabel` inset 32 — they were `DUE NOW` / `UPCOMING` at 13pt. 26pt corners, no section stroke, 1pt `listSeparator` rows, 56pt row boxes. The empty state is a 52pt `.secondaryLabel` glyph over a `.label` title, as `ContentUnavailableView` draws it | `TodayActions.tsx`: `NextActionRow` line height and two `.secondary` colours | Never captured on either platform — it is reached from a reminder notification. Hand-built inset-grouped list rather than a `List` |
| Task action (31) | default + unavailable | pending device | `TaskActionView.swift:133-236` — **no capture** | The sheet takes the elevated palette. `.subheadline` 20→21. The channel rows space their `Label` glyph by 6, not 12. "Finding contact…" stacks under its spinner. The contact detail line and the receipt take `.secondaryLabel`, not `nexdoSecondary`. The unavailable state matches `ContentUnavailableView`: a 52pt `.secondaryLabel` glyph, a `.label` title and a `.secondaryLabel` description | — | No capture. The two composers are the system ones on both platforms (§20 screen 32). Swift's `confirmationDialog` before placing a call is a Material alert here |

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
