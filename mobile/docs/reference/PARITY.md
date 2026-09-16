# Auth screen parity: React Native against SwiftUI

Result of the `rn-ui-parity` pass. Every screenshot in [`ios/`](ios), [`rn/`](rn) and [`diff/`](diff)
was taken on the **same simulator — iPhone 17 Pro, iOS 26.5**, 402 x 874 points, captured at
1206 x 2622 px and stored here at half that size. Setup is in
[`../mac-setup.md`](../mac-setup.md); the translation rules the fixes came from are in
[`../swift-to-rn-style-map.md`](../swift-to-rn-style-map.md).

## How the percentage is measured

`imgdiff.py` (kept with the run scripts, not in the repo) compares the two captures pixel by pixel
and reports **the share of compared pixels whose largest RGB channel differs by more than 16/255**.
The threshold ignores antialiasing while still catching any real difference in spacing, size,
colour or text wrapping. Both captures use a pinned status bar, so the clock and battery never
differ.

Two regions are excluded from every measurement, because they exist only in a development build and
have no counterpart in the Swift app:

- the `expo-dev-client` floating **Tools** button, top right;
- the `__DEV__`-only version label at the bottom of sign-in (`DevEntryPoints`).

Nothing else is excluded. **A percentage is a floor, not a grade** — see "What the remaining
percentage is" below.

## Results

"Before" is the same screen on the same simulator with the Phase 2 code, measured the same way.

| Screen | State | Before | After |
| --- | --- | ---: | ---: |
| sign-in | empty, light | 53.13% | **3.97%** |
| sign-in | keyboard open, email focused | — | 10.52% |
| sign-in | both fields filled | — | 14.14% |
| sign-in | server error alert | — | 3.91% |
| sign-in | submitting ("Signing In…") | — | 8.95% |
| sign-in | empty, dark | 54.08% | **4.68%** |
| sign-up | empty, light | 37.28% | **6.78%** |
| sign-up | keyboard open, name focused | — | 4.93% |
| sign-up | validation error | — | *not captured, see below* |
| sign-up | submitting | — | *not captured, see below* |
| sign-up | empty, dark | 77.69% | **13.02%** |
| verify-email | empty, light | 34.61% | **10.73%** |
| verify-email | keyboard open, code focused | 24.33% | 7.17% |
| verify-email | server error | — | *not captured, see below* |
| verify-email | submitting | — | *not captured, see below* |
| verify-email | empty, dark | 38.51% | **11.21%** |
| reset-password | empty, light | 5.26% | **1.91%** |
| reset-password | keyboard open, email focused | — | 1.94% |
| reset-password | code-sent stage | — | 3.45% |
| reset-password | validation error | — | 4.45% |
| reset-password | submitting ("Sending…") | — | 2.08% |
| reset-password | empty, dark | 86.85% | **1.98%** |

A "before" figure is given for the states that could be reached without typing. The fixes were made
and measured in sequence, so for the typing-dependent states only the final figure is recorded.

The iOS reference exists for every state, including the four with no React Native counterpart:
`ios/sign-up-error.png`, `ios/sign-up-loading.png`, `ios/verify-email-error.png`,
`ios/verify-email-loading.png`.

### States not captured on the React Native side

Both gaps come from driving the simulator, not from the app:

- **sign-up validation error and submitting.** Filling four fields needs the text typed in short
  chunks (see the input race under "Functional notes"), and the XCUITest driver used for this pass
  slowed to a crawl querying React Native's very deep accessibility tree — single taps began taking
  over a minute. The iOS references for both states are captured and the procedure is written down,
  so they are a short follow-up rather than an open question.
- **verify-email server error and submitting.** Same reason. Reaching the screen at all needs a
  `nexdo://verify-email?...` deep link, because the only in-app routes to it are registering a new
  account or signing in with an unverified one, and no test account was available.

## What the remaining percentage is

Sorted by how much of the residual it accounts for.

1. **The system keyboard** dominates every keyboard-open state (sign-in keyboard 10.52%, filled
   14.14%). Above the keyboard the two apps line up; the red in
   `diff/sign-in-keyboard.png` is almost entirely the QuickType suggestion strip, which predicts
   different words between runs, and a transient "Paste / AutoFill" callout. This is simulator
   state, not app UI.
2. **SF Rounded.** Both large titles (`design: .rounded`) are a known gap and cannot be closed
   without bundling a font. On sign-in the 42pt "Welcome back" alone is most of the remaining 4%.
3. **The backdrop circle inside a sheet** (sign-up, verify-email). SwiftUI's `GeometryReader` sits
   under the navigation bar because of `.ignoresSafeArea()`; the React Native view is laid out below
   the header, so the third circle lands about 10pt low. See the style map, section 5.
4. **iOS 26 navigation-bar buttons.** Swift's `Cancel` is a native bar button, which iOS 26 draws in
   a glass capsule. A custom `headerLeft` in Expo Router renders plain text and gets no capsule.
   This is the double "Cancel" in `diff/sign-up-empty.png` and `diff/reset-password-empty.png`.
5. **Translucency in a wide-gamut space.** After matching the effective opacity (style map,
   section 5) the disabled buttons agree within about 3/255 at the gradient ends, but SwiftUI
   composites and interpolates in the display's linear wide-gamut space, and neither
   `expo-linear-gradient` nor React Native's `opacity` can be pushed all the way there. Worst
   remaining error is roughly 20/255 in one channel in the middle of a gradient.
6. **Continuous corners and SF Symbols**, both on the accepted list: every rounded rectangle differs
   by a pixel or two at the corner, and the Ionicons glyphs are a slightly different shape.
7. **The sign-in assurance line** sits 14pt left of where Swift centres it. Flexbox cannot size a
   wrapped `Text` to its longest line; see `SymbolLabel` for why measuring does not help.
8. **`sign-in-loading`** carries a system "Updating…" keychain HUD in the iOS capture that iOS
   raises whenever a `.password` field is submitted. It is timing-dependent, so it is not in the
   React Native capture of the same moment.

## A capture trap worth knowing

The sign-in greeting reads the device-stored `nexdo.lastSignedInFirstName`, so once anything has
written it the React Native capture says "Welcome back, A" where the Swift reference says "Welcome
back". That is app state, not styling, and it silently adds about 0.7 points to the sign-in figures.
Clear it before capturing:

```bash
CONT=$(xcrun simctl get_app_container booted com.pinslots.nexdo data)
rm -rf "$CONT/Library/Application Support/com.pinslots.nexdo/RCTAsyncLocalStorage_V1"
```

## Functional notes

Found while capturing; **none of these were changed** (see the report for detail):

- **Fast typing into the controlled `TextInput`s scrambles the value.** Typing
  `parity@example.com` at machine speed into reset-password produced `pae.comrity@exampl`. Typing in
  chunks is reliable. Worth checking on a device with a fast human typist or a password manager.
- **`verify-email`'s code field sets `returnKeyType="go"`**, so iOS floats a **Go** key over the
  number pad. The Swift field sets no `submitLabel` and has no such key.
- **Password reset from sign-in reached the server fine**, but the same request with a mangled email
  returns "Enter a valid name and email address." rather than anything reset-specific.
