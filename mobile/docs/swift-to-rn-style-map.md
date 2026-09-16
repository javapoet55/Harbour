# SwiftUI to React Native style map

How each SwiftUI modifier in `ios/App/` was translated for the React Native app. Derived while building
the Phase 2 auth screens against the live sign-in screenshot in
[`reference/login_and_auth_page.png`](reference/login_and_auth_page.png), and meant to be reused by
every later phase so the screens stay consistent with one another.

Last updated: 2026-09-16 (Phase 2).

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

## 2. Fonts

SwiftUI text styles resolve to these sizes at the default Dynamic Type setting. Line heights are the
iOS defaults; React Native needs them stated explicitly.

| SwiftUI | `fontSize` | `lineHeight` | `fontWeight` |
| --- | --- | --- | --- |
| `.largeTitle` | 34 | 41 | — |
| `.title2` | 22 | 28 | — |
| `.title3` | 20 | 25 | — |
| `.body` | 17 | 22 | `'400'` |
| `.subheadline` | 15 | 20 | `'400'` |
| `.footnote` | 13 | 18 | `'400'` |
| `.caption2` | 11 | 13 | `'400'` |
| `.system(size: n)` | `n` | round(`n` * 1.2) | from the `weight:` argument |

Weights: `.regular` → `'400'`, `.medium` → `'500'`, `.semibold` → `'600'`, `.bold` → `'700'`.
`.title3.bold()` therefore becomes `{ fontSize: 20, lineHeight: 25, fontWeight: '700' }`.

`.monospacedDigit()` → `fontVariant: ['tabular-nums']`.

**`design: .rounded` has no React Native equivalent.** SF Rounded is not exposed to apps as a named
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

---

## 5. Materials, gradients and shadows

| SwiftUI | React Native |
| --- | --- |
| `.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: r))` | `GlassCard`: a translucent `colors.glassFill` behind an `expo-blur` `BlurView` |
| `.overlay(RoundedRectangle(...).stroke(Color.white.opacity(0.8)))` | absolutely-positioned `View` with `borderWidth: StyleSheet.hairlineWidth` |
| `LinearGradient(colors:, startPoint: .leading, endPoint: .trailing)` | `expo-linear-gradient` with `start={{x:0,y:0.5}} end={{x:1,y:0.5}}` |
| `startPoint: .topLeading, endPoint: .bottomTrailing` | `start={{x:0,y:0}} end={{x:1,y:1}}` |
| `startPoint: .top, endPoint: .bottom` | `start={{x:0.5,y:0}} end={{x:0.5,y:1}}` |
| `Text(...).foregroundStyle(LinearGradient(...))` | `GradientText`: a gradient masked by the text (`@react-native-masked-view/masked-view`) |
| `.shadow(color: c, radius: r, y: dy)` | `{ shadowColor: c, shadowOpacity: 1, shadowRadius: r / 2, shadowOffset: { width: 0, height: dy } }` on iOS; `elevation` on Android |
| `RoundedRectangle(style: .continuous)` | `borderRadius` (a plain circular corner — RN has no continuous curve) |
| `Circle().frame(width: d)` | `{ width: d, height: d, borderRadius: d / 2 }` |
| `.offset(x:y:)` on a centred shape | `position: 'absolute'` with `left: parentW/2 - d/2 + x` (RN positions by top-left, SwiftUI by centre) |

SwiftUI's shadow `radius` is roughly twice the CSS/RN blur radius for a similar result, hence `r / 2`.

---

## 6. Controls

| SwiftUI | React Native |
| --- | --- |
| `Button { } label: { }` with `.buttonStyle(.plain)` | `Pressable` with `accessibilityRole="button"` |
| `.disabled(x)` + `.opacity(x ? 1 : 0.55)` | `disabled` prop, `accessibilityState={{ disabled }}`, and the same opacity |
| `TextField` / `SecureField` | `TextInput`, with `secureTextEntry` for the latter |
| `.textContentType(.username)` | `textContentType="username"` plus `autoComplete="email"` for Android |
| `.textContentType(.password)` / `.newPassword` | `textContentType` + `autoComplete="current-password"` / `"new-password"` |
| `.textContentType(.oneTimeCode)` | `textContentType="oneTimeCode"` + `autoComplete="one-time-code"` |
| `.keyboardType(.emailAddress)` / `.numberPad` | `keyboardType="email-address"` / `"number-pad"` |
| `.textInputAutocapitalization(.never)` | `autoCapitalize="none"` |
| `.autocorrectionDisabled()` | `autoCorrect={false}` |
| `.submitLabel(.next)` / `.go` | `returnKeyType="next"` / `"go"` |
| `@FocusState` + `.onSubmit { focusedField = .x }` | a `TextInput` ref and `onSubmitEditing={() => ref?.focus()}` with `submitBehavior="submit"` |
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
| `.scrollDismissesKeyboard(.interactively)` | `keyboardDismissMode="on-drag"` (the closest available) |
| keyboard avoidance (automatic in SwiftUI) | explicit `KeyboardAvoidingView`, `behavior="padding"` on iOS |
| `Form { Section { } header: { } footer: { } }` | hand-built inset-grouped list: 20 pt outer inset, 10 pt corners, 16 pt row inset, 44 pt rows (see `app/(auth)/reset-password.tsx`) |
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
