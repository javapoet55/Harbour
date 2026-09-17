# SwiftUI to React Native style map

How each SwiftUI modifier in `ios/App/` was translated for the React Native app. Derived while building
the Phase 2 auth screens against the live sign-in screenshot in
[`reference/login_and_auth_page.png`](reference/login_and_auth_page.png), and meant to be reused by
every later phase so the screens stay consistent with one another.

Last updated: 2026-09-17 (Android parity pass, branch `rn-ui-parity`).

> **Read this first.** The pass before this one calibrated against React Native running on an **iOS
> simulator**. That was the wrong target: the app ships on **Android**, and the reference is the
> SwiftUI app. Entries below are being re-verified against a real Android render; anything still
> marked *(iOS-calibrated)* has not been re-checked yet. Superseded iOS-simulator captures are kept
> in `reference/rn-ios-superseded/` and must not be used.

**Phase 2 built this file from a single screenshot. It has now been corrected against both apps
running side by side in one iOS Simulator** (iPhone 17 Pro, iOS 26.5), measured with screenshot
diffs and the accessibility frames both apps report. Entries that changed carry a **Corrected**
note saying what the earlier rule got wrong. Results: [`reference/PARITY.md`](reference/PARITY.md).

---

## 1. The unit scale

**One SwiftUI point = one React Native unit. No conversion factor.**

The screenshot is 828 px wide, taken on a 414 pt iPhone at `@2x`. Measuring known values against it
confirms the identity mapping:

| Swift value | Expected at 2x | Measured in the screenshot |
| --- | --- | --- |
| Card inset `.padding(.horizontal, 28)` | 56 px each side | ~56–60 px |
| `Divider().padding(.leading, 78)` | 156 px from screen edge | ~157 px |
| `SignInFieldIcon` `.frame(width: 46, height: 46)` | 92 px | ~92 px |
| Logo `.frame(width: 116, height: 84)` | 232 x 168 px | ~228 x 170 px |
| Field row `.frame(minHeight: 72)` | 144 px | ~140 px |
| Card `cornerRadius: 28` | 56 px | ~56 px |

So a Swift modifier value is copied into the RN style verbatim. Do not rescale.

---

## 1b. The two devices are not the same size

Measured, not assumed:

| | iOS reference | Android target |
| --- | --- | --- |
| Device | iPhone 17 Pro, iOS 26.5 | Samsung SM-A055F, Android 15 |
| Physical | 1206 x 2622 px | 720 x 1600 px |
| Scale | 3x | 1.875x (300 dpi) |
| **Logical** | **402 x 874 pt** | **384 x 853 dp** |
| Top inset | 62 pt | 31.5 dp |

**Android is 18 dp narrower and its status bar is half the height.** A point value copied from Swift
is still one dp — the unit mapping is 1:1 — but the *space it has to live in* is 4.5% smaller. Fixed
widths, and paddings tuned so content just fits on a 402 pt screen, overflow here. When a label
truncates or wraps on Android and not on iOS, fix the width it was given, not the label.

---

## 2. Fonts

SwiftUI text styles resolve to these sizes at the default Dynamic Type setting. Line heights are the
iOS defaults; React Native needs them stated explicitly. These live in `src/theme/typography.ts` as
`textStyles`, so screens do not hard-code them.

| SwiftUI | `fontSize` | `lineHeight` | `fontWeight` |
| --- | --- | --- | --- |
| `.largeTitle` | 34 | 41 | — |
| `.title2` | 22 | 28 | — |
| `.title3` | 20 | **28** | — |
| `.body` | 17 | **25** | `'400'` |
| `.subheadline` | 15 | **21** | `'400'` |
| `.footnote` | 13 | **20** | `'400'` |
| `.caption2` | 11 | 13 | `'400'` |
| `.system(size: n)` | `n` | round(`n` * 1.2) | from the `weight:` argument |

**Corrected.** The four bold values were previously 25, 22, 20 and 18 — `fontSize * 1.2`, which is
the rule for `.system(size:)` and **not** the rule for a named text style. A named style carries its
own leading, which is larger. The `fontSize` column was already right: the same string rendered by
both apps produces glyphs of identical pixel width and height, so only the line box was wrong.

The error compounds. Every block was 1 to 3pt short, and by the bottom of the sign-in screen the
whole column had drifted 5pt up — on top of the 62pt safe-area error in section 7. Measure a line
height by putting the same string in both apps and comparing the frame heights the accessibility
tree reports; do not derive it.

**Verified on Android: the sizes are right, the typeface is narrower.** Rendering the same strings
on both devices and converting to logical units:

| String | iOS (SF Pro) | Android (Roboto) | |
| --- | ---: | ---: | --- |
| "Tasks", `.largeTitle` bold — height | 24.6 pt | 24.0 dp | sizes map 1:1 |
| "Tasks" — width | 87.7 pt | 80.0 dp | 9% narrower |
| "Turn intent into action.", `.subheadline` — width | 151.9 pt | 136.5 dp | 10% narrower |

So keep the `fontSize` column as it is; do **not** scale it for Android. But expect every run of text
to be about 9% narrower than the Swift screenshot, which changes where lines break. Combined with the
18 dp narrower screen (section 1b), that is the cause of most wrapping differences — and the reason a
block that wraps identically on both cannot be assumed from an iOS capture.

Weights: `.regular` → `'400'`, `.medium` → `'500'`, `.semibold` → `'600'`, `.bold` → `'700'`.
`.title3.bold()` therefore becomes `{ fontSize: 20, lineHeight: 28, fontWeight: '700' }`.

`.monospacedDigit()` → `fontVariant: ['tabular-nums']`.

**`design: .rounded` has no React Native equivalent.** (Still true, and still the largest single
contributor to the residual difference on sign-in, sign-up and verify-email.) SF Rounded is not exposed to apps as a named
family, so `.system(size: 42, weight: .bold, design: .rounded)` renders in the default system face.
This is listed as a visual gap, not silently substituted. If it ever matters enough, the fix is to
bundle a rounded variable font through `expo-font` and set `fontFamily` in one place.

---

## 3. Colours

Brand colours live in `src/theme/colors.ts`, converted from SwiftUI's sRGB component floats with
`round(component * 255)`. Each entry carries the `RootView.swift` line it came from.

`Color.opacity(_:)` on a brand hex becomes `rgba(...)` — use the `withAlpha` helper in
`src/components/SignInBackdrop.tsx` rather than appending hex alpha, which is easy to get wrong.

Dynamic system colours (`.label`, `.secondaryLabel`) are resolved to their standard light and dark
values in the palette, because React Native has no dynamic colour type. That difference is already
flagged as `TODO(phase1-decision)` in `colors.ts`.

**Corrected — an unstyled view does not use a brand colour.** `nexdoInk` and `nexdoSecondary` belong
to the text Swift actually applies them to. Anything Swift leaves unstyled takes an iOS system
colour, and substituting a brand colour is visible:

| SwiftUI | React Native | Why |
| --- | --- | --- |
| `Text("…")` with no `.foregroundStyle` | `colors.label` (black / white) | `Color.primary`, not `nexdoInk` (`#080F2E`). The sign-in "New to Nexdo?" was measurably off. |
| a `TextField` placeholder | `colors.placeholder` (`rgba(60,60,67,0.3)`) | `.placeholderText`. Using `nexdoSecondary` made every placeholder far too dark. |
| a `Form` section header or footer | `colors.secondaryLabel` (`rgba(60,60,67,0.6)`) | `.secondaryLabel`, again not `nexdoSecondary`. |
| a `Form` row separator | `colors.listSeparator` (`#E8E8E8`), **1pt** | Lighter and thicker than `.separator`; it is not a hairline. |

**A sheet raises the dark-mode backgrounds one level.** iOS resolves `.systemBackground` and friends
against an *elevated* trait collection inside a presented sheet, so a dark sheet is `#1C1C1E` where
the root screen is black. Reproduce it with `useTheme({ elevated: true })` from any screen presented
as a modal, and set the Expo Router `contentStyle`/`headerStyle` to match. Missing this made
reset-password in dark mode **86.9%** different; with it, 2.0%.

---

## 4. Layout

| SwiftUI | React Native |
| --- | --- |
| `VStack(spacing: n)` | `flexDirection: 'column', gap: n` |
| `HStack(spacing: n)` | `flexDirection: 'row', alignItems: 'center', gap: n` |
| `VStack(spacing: 0)` + `.padding(.top, n)` on children | per-child `marginTop: n` (what the auth screens use) |
| `.padding(.horizontal, n)` | `paddingHorizontal: n` |
| `.frame(minHeight: n)` | `minHeight: n` |
| `.frame(maxWidth: .infinity)` | `width: '100%'` or `flex: 1`, depending on the axis |
| `.frame(maxWidth: 560).frame(maxWidth: .infinity)` | `{ width: '100%', maxWidth: 560, alignSelf: 'center' }` |
| `Spacer(minLength: n)` at the top of a scroll view | `<View style={{ height: n }} />` |
| `VStack(alignment: .leading)` | `alignItems: 'stretch'` with default left-aligned text |
| `Divider()` | `View` of `StyleSheet.hairlineWidth` in `colors.separator` |
| `Divider().padding(.leading, 78)` | that view with `marginLeft: 78` |

`.padding(.top, n)` applied to a child inside a zero-spacing `VStack` is a **margin on that child**,
not padding on the stack. Translating it as stack padding shifts every sibling.

**`.frame(maxWidth: .infinity)` is not `width: '100%'` when the caller adds a horizontal margin.**
A percentage width resolves against the parent, and the margin is then added on top, so the child
overflows. The Apple button came out 402pt wide inside a 346pt column. Use
`alignSelf: 'stretch'`, which is what the SwiftUI modifier actually means.

**Flexbox cannot size a wrapped `Text` to its longest line.** SwiftUI does: a centred `Label` whose
title wraps is a tight block in the middle of its parent. A shrinking flex child is measured at its
max-content width and then clamped to what is available, so the row always fills the width and the
block reads as left-aligned. `onTextLayout` does not rescue it — React Native reports each line's
*layout* width, which is the container width, not the ink width, so feeding it back only widens the
row and changes where the text wraps. `SymbolLabel` documents the limitation; the sign-in assurance
line sits 14pt left of where Swift centres it.

**Match an SF Symbol's advance, or the text wraps somewhere else.** A `Label`'s title gets
`available - iconAdvance - spacing`. Ionicons glyphs are not the same width as SF Symbols, so set
`iconSize + spacing` to the figure measured off the Swift app (21pt for `checkmark.shield` at
`.footnote`), not to whatever looks right. Two points of error moved a line break.

---

## 5. Materials, gradients and shadows

| SwiftUI | React Native |
| --- | --- |
| `.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: r))` | `GlassCard`: a translucent `colors.glassFill` behind an `expo-blur` `BlurView` |
| `.overlay(RoundedRectangle(...).stroke(Color.white.opacity(0.8)))` | absolutely-positioned `View` with `borderWidth: StyleSheet.hairlineWidth`. **Use the literal 0.8 in dark mode too** — measured (214,214,215) on a (28,28,30) card. Guessing it down "because white on black looks blown out" loses the edge entirely. |
| `LinearGradient(colors:, startPoint: .leading, endPoint: .trailing)` | `expo-linear-gradient` with `start={{x:0,y:0.5}} end={{x:1,y:0.5}}` |
| `startPoint: .topLeading, endPoint: .bottomTrailing` | `start={{x:0,y:0}} end={{x:1,y:1}}` |
| `startPoint: .top, endPoint: .bottom` | `start={{x:0.5,y:0}} end={{x:0.5,y:1}}` |
| `Text(...).foregroundStyle(LinearGradient(...))` | `GradientText`: a gradient masked by the text (`@react-native-masked-view/masked-view`) |
| `.shadow(color: c, radius: r, y: dy)` | `{ shadowColor: c, shadowOpacity: 1, shadowRadius: r / 2, shadowOffset: { width: 0, height: dy } }` on iOS; `elevation` on Android |
| `RoundedRectangle(style: .continuous)` | `borderRadius` (a plain circular corner — RN has no continuous curve) |
| `Circle().frame(width: d)` | `{ width: d, height: d, borderRadius: d / 2 }` |
| `.offset(x:y:)` on a shape in a `ZStack` | `position: 'absolute'` with `left: stackW/2 - d/2 + x` — **the ZStack's box, not the parent's** (see below) |

SwiftUI's shadow `radius` is roughly twice the CSS/RN blur radius for a similar result, hence `r / 2`.

### `GeometryReader` + `ZStack` does not mean "fill the screen"

**Corrected, and it was the single largest error in the backdrop.** In

```swift
GeometryReader { geometry in ZStack { Circle().frame(width: d).offset(x: dx, y: dy) ... } }
```

neither view fills the reader unless you say so. A `ZStack` sizes to its **largest child**, and a
`GeometryReader` pins its content **top-leading**. So each circle is centred on a box of the largest
diameter sitting at (0, 0), and `.offset` moves it from there:

```js
left = largestDiameter / 2 - size / 2 + dx   // not containerWidth / 2
```

Centring on the screen instead put all three `SignInBackdrop` circles hundreds of points out.
The accessibility frame the Swift app reports for that `ZStack` confirms it exactly.

Two more rules that follow:

- **`geometry.size` is the container's size, not the window's.** Use the view's own `onLayout`, not
  `useWindowDimensions`. On a sheet they are different, and the third circle lands far off.
- **`.ignoresSafeArea()` puts the reader under the navigation bar.** React Native lays a screen out
  *below* an opaque header, so a backdrop measured there is short by the header. This is still open:
  the sheet backdrops sit about 10pt low.

### Translucency and gradients are composited in linear light

SwiftUI composites `.opacity()` and interpolates gradient stops in **linear light**; React Native's
`opacity` and `CAGradientLayer` work in gamma-encoded sRGB. Two consequences:

- **Expand gradient stops yourself.** `linearGradientStops()` in `src/theme/compositing.ts`
  interpolates in linear light and hands React Native many closely spaced stops, which removes the
  ~20/255 mid-segment error between two saturated brand colours.
- **`linearOpacity()`** reproduces `color.opacity(a)` over a known background the way SwiftUI does.

**`.disabled()` dims on top of your own `.opacity()`, and they multiply.** Swift writes
`.opacity(0.55)` on the sign-in button, but the rendered result matches an effective **0.25** —
measured against both a white and a black background — because SwiftUI dims a disabled control as
well. At 0.25 a plain gamma blend matches, so the React Native side is simply
`style={{ opacity: 0.25 }}`. Taking the 0.55 in the source at face value gives a button about twice
too strong, which is obvious in dark mode.

---

## 6. Controls

| SwiftUI | React Native |
| --- | --- |
| `Button { } label: { }` with `.buttonStyle(.plain)` | `Pressable` with `accessibilityRole="button"` |
| `.disabled(x)` + `.opacity(x ? 1 : 0.55)` | `disabled` prop, `accessibilityState={{ disabled }}`, and `opacity: 0.25` — **not** 0.55; see section 5 |
| `TextField` / `SecureField` | `TextInput`, with `secureTextEntry` for the latter |
| `.textContentType(.username)` | `textContentType="username"` plus `autoComplete="email"` for Android |
| `.textContentType(.password)` / `.newPassword` | `textContentType` + `autoComplete="current-password"` / `"new-password"` |
| `.textContentType(.oneTimeCode)` | `textContentType="oneTimeCode"` + `autoComplete="one-time-code"` |
| `.keyboardType(.emailAddress)` / `.numberPad` | `keyboardType="email-address"` / `"number-pad"` |
| `.textInputAutocapitalization(.never)` | `autoCapitalize="none"` |
| `.autocorrectionDisabled()` | `autoCorrect={false}` |
| `.submitLabel(.next)` / `.go` | `returnKeyType="next"` / `"go"` |
| `@FocusState` + `.onSubmit { focusedField = .x }` | a `TextInput` ref and `onSubmitEditing={() => ref?.focus()}` with `submitBehavior="submit"` |
| `focusedField = nil` while submitting | `Keyboard.dismiss()` — without it the keyboard covers the button and the loading state is never visible |
| `.accessibilityLabel(...)` | `accessibilityLabel` |
| `.accessibilityHidden(true)` | `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"` |
| `TimelineView(.periodic(from: .now, by: 1))` | `setInterval` in a `useEffect`, cleared on unmount |

**SF Symbols** have no React Native equivalent. `@expo/vector-icons` is used, mapped in
`src/components/SignInFieldIcon.tsx`:

| SF Symbol | Ionicons |
| --- | --- |
| `envelope` | `mail-outline` |
| `lock` | `lock-closed-outline` |
| `person` | `person-outline` |
| `checkmark.shield` | `shield-checkmark-outline` |
| `envelope.badge` | `mail-unread-outline` |
| `number` | `keypad-outline` |
| `eye` / `eye.slash` | `eye-outline` / `eye-off-outline` |

Ionicons has no weight axis, so `.font(.title3.weight(.medium))` on a symbol only carries the size.

---

## 7. Screen scaffolding and presentation

| SwiftUI | Expo Router / React Native |
| --- | --- |
| `ZStack { Color(.systemBackground).ignoresSafeArea(); Backdrop(); ScrollView { ... } }` | `AuthScreen` |
| `.sheet(isPresented:)` | `presentation: 'modal'` on the `Stack.Screen` |
| `.navigationDestination(item:)` | `router.push(...)` onto the same stack |
| `NavigationStack { }` + `.navigationTitle(_).navigationBarTitleDisplayMode(.inline)` | `headerShown: true, title: ...` |
| `.toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") } }` | `headerLeft` rendering a Cancel `Pressable` |
| `.navigationBarTitleDisplayMode(.inline)` | `headerTitleAlign: 'center'` — **required on Android**, see below |
| a bar pinned to the bottom of a sheet | `StickyFooter`, which adds `useSafeAreaInsets().bottom` — see below |
| `.scrollDismissesKeyboard(.interactively)` | `keyboardDismissMode="on-drag"` (the closest available) |
| keyboard avoidance (automatic in SwiftUI) | explicit `KeyboardAvoidingView`, `behavior="padding"` on iOS |
| a `ScrollView` inside `ZStack { ….ignoresSafeArea() }` | `contentInsetAdjustmentBehavior="always"` — see below |
| `Form { Section { } header: { } footer: { } }` | hand-built inset-grouped list, **iOS 26 metrics** — see below |

### The safe area is a content inset on the scroll view, not padding

**Corrected, and it was the largest error on sign-in.** A SwiftUI `ScrollView` insets its content by
the safe area while still drawing under it. React Native's `ScrollView` does nothing by default, so
the whole column started 62pt too high with the logo under the Dynamic Island.

`contentInsetAdjustmentBehavior="always"` is the `UIScrollView` behaviour that matches, and it uses
the screen's own safe area, so it is correct both at the root and under a navigation header. Do not
use `useSafeAreaInsets()` for this: with Expo Router the provider reports *window* insets, so a
screen under a header would be inset twice.

### A SwiftUI `Form` on iOS 26

**Corrected.** The Phase 2 metrics were pre-iOS 26. Measured off the Swift app:

| | Phase 2 assumed | iOS 26 actual |
| --- | --- | --- |
| Section outer inset | 20pt | **16pt** |
| Section corner radius | 10pt | **26pt** |
| Row height | 44pt | **56pt** (74pt for a row holding a 44pt button) |
| Row inset | 16pt | 16pt |
| Header case | uppercased | **sentence case** |
| Header font | `.footnote` | **`.body`** |
| Header / footer inset | 36pt from the screen | **32pt** (16 section + 16 row) |
| Footer font | `.footnote` | **`.subheadline`** |
| First section below the bar | — | **35pt** |

Uppercasing the header is the tell that a port was written against an older iOS.

### Two Android-only faults every stack and sheet had

**A header title is left-aligned on Android.** React Navigation follows the Material convention, so a
screen with a custom `headerLeft` renders the button and the title jammed together — the task editor
read "CloseNew Task". SwiftUI's `.inline` title is always centred, so
`headerTitleAlign: 'center'` is what matches on both. Spread `stackHeaderOptions(theme, background)`
from `src/theme/navigation.ts` rather than repeating the header block; four stacks were missing it.

**A pinned footer sits under the gesture-navigation bar.** SwiftUI keeps a bottom bar inside the safe
area; React Native does not, and on a gesture-nav Android phone the button renders *behind* the
back/home/recents controls and cannot be tapped — "Create Task" on the task editor was unreachable,
not merely misplaced. Six screens had the same hand-rolled footer; they now share
`StickyFooter`, which adds `useSafeAreaInsets().bottom` to its padding. This is a functional bug as
much as a visual one, so check it on any new screen with a pinned action.

### The tab bar's selected capsule

Swift marks the selected tab with a rounded capsule of `nexdoIndigo` at 10%. Two traps:

- **`tabBarActiveBackgroundColor` cannot be rounded.** It paints a view outside the one
  `tabBarItemStyle` styles, so `borderRadius` there gives a hard-edged rectangle and
  `overflow: 'hidden'` does not reach it. Draw the capsule inside a custom `tabBarButton`.
- **Focus arrives as `aria-selected`,** not `accessibilityState.selected`, from Expo Router's
  `BottomTabItem`. Reading the wrong one hides the capsule silently, with nothing in the logs.

### Navigation bar buttons

iOS 26 draws a native bar button inside a glass capsule. A custom `headerLeft` in Expo Router is
plain text and gets no capsule, so Swift's `Cancel` and the React Native one do not match. Unclosed;
it needs either a native bar button or the capsule rebuilt by hand.
| `.alert(title, isPresented:)` | `Alert.alert(title, message, [{ text: 'OK' }])` |

Note that `PasswordResetView` is a `Form`, so it deliberately does **not** use the backdrop or the
glass card. Not every auth screen shares the same visual language.

---

## 8. Storage

| Swift | React Native |
| --- | --- |
| `UserDefaults.standard` | `@react-native-async-storage/async-storage`, reusing the same key string |
| `@AppStorage("key")` | the same, wrapped in a Zustand store that hydrates on launch |

Keys are kept byte-identical to the Swift ones (for example `nexdo.lastSignedInFirstName`) so a value
means the same thing in both apps.


---

## 9. What is still different, and why

Carried over from the Phase 2 report and confirmed in this pass:

- **SF Rounded** (`design: .rounded`) is not available to third-party apps.
- **`.ultraThinMaterial`** is approximated with `expo-blur`. The fill was re-tuned against the Swift
  render and now agrees within a few units; it is no longer the visible difference it was.
- **Continuous corner curves** versus circular ones.
- **SF Symbols** versus Ionicons, with no weight axis.
- **Shadow rendering.**
- **Interactive keyboard dismissal** versus `on-drag`.

Found in this pass and not closed:

- **Wide-gamut linear compositing.** Matching the effective opacity and pre-interpolating gradient
  stops gets the disabled buttons within about 3/255 at the ends, but SwiftUI composites in the
  display's linear wide-gamut space and React Native cannot be pushed the last step.
- **iOS 26 navigation bar button capsules** (above).
- **Sheet backdrops sit about 10pt low**, because `.ignoresSafeArea()` extends SwiftUI's
  `GeometryReader` under the navigation bar and React Native lays the screen out below it.
- **A centred, wrapped `Label` cannot shrink-wrap** in flexbox (section 4).

Closed that had been listed as a gap:

- **The `.ultraThinMaterial` stand-in** was 5 to 14 units too light across the card; retuning
  `glassFill` brought it to within 2 to 7.
