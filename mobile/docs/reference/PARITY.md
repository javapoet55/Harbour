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

## Group 2 — app shell / tab bar

| Element | iOS | Android before | Android after |
| --- | --- | --- | --- |
| Bar background | (245, 245, 245) | (255, 255, 255) | **(245, 245, 245)** |
| Selected capsule | `nexdoIndigo` @10%, (227, 225, 244), 11dp corner | none | **present, rounded** |

Two things had to be worked out on the device rather than assumed:

- `tabBarActiveBackgroundColor` paints a view that `tabBarItemStyle` cannot round — a `borderRadius`
  there produced a hard-edged rectangle, and `overflow: 'hidden'` did not reach it either. The
  capsule has to be drawn *inside* a custom `tabBarButton`; that is `src/components/TabBarButton.tsx`.
- Expo Router's `BottomTabItem` marks the focused tab with **`aria-selected`**, not
  `accessibilityState.selected`. Reading the wrong one leaves the capsule permanently hidden with no
  error.

Remaining: the capsule sits a few dp higher than Swift's and is slightly shorter, because the bar's
content height is driven by React Navigation rather than set outright.

## Screen results

Only screens with **both** captures can carry a percentage. Android captures exist for two screens
so far; the rest of this table fills in as each group is done.

| Screen | State | Before | After | Remaining gaps |
| --- | --- | ---: | ---: | --- |
| Reset password | empty, light | — | **3.68%** | essentially a match |
| Tasks | default, light | — | **13.54%** | empty-state glyph (SF Symbol gap); cumulative drift below the fold |
| Task editor | default, light | 18.67% | **17.02%** | Swift presents a detent sheet, Android a full page |
| Sign in | empty, dark | — | **19.09%** | Apple button absent on Android by design |
| Sign in | empty, light | — | **19.21%** | as above |
| Sign up | empty, light | — | **23.09%** | nav-bar pill (iOS 26); intro wraps 2 lines not 3 (Roboto) |
| Tasks | default, dark | — | **28.49%** | as above, plus backdrop tint |
| Today | default, light | — | **33.12%** | longest screen, so most affected by drift and by the height difference |
| Sign in | keyboard, email focused | — | n/a | not measurable as a full-screen diff — see below; content above the keyboard matches |

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

### Hand-off to the other machine

Calendar, Ask, Account and Reminders are being done elsewhere from these references. Default states
for Calendar (5), Ask (2) and Account (2) are captured and committed. **Reminders/actions (screens
31 and 32) are not**: both open from a reminder notification, which needs a scheduled local
notification to fire — see "Not captured".

\* `task-detail` was captured but landed on the wrong screen and has been removed; it still needs a
clean capture.

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
