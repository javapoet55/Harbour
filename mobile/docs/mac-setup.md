# Running both apps on this Mac

Notes from the first machine that has Xcode and can run the SwiftUI app (`../ios`) and the React
Native app (`..`) side by side in the same iOS Simulator. Written during the auth parity pass
(`rn-ui-parity`).

This supersedes the "no Xcode, no simulator" assumption in
[`../../docs/IOS_TO_REACT_NATIVE.md`](../../docs/IOS_TO_REACT_NATIVE.md) sections 1 and 7.

## What is installed

| Tool | Version |
| --- | --- |
| Xcode | 26.6 (build 17F113), at `/Applications/Xcode.app` |
| iOS runtime | 26.5 |
| Node | v22.17.1 |
| CocoaPods | 1.16.2 |
| Ruby | 4.0.2 (with the `xcodeproj` gem, via CocoaPods) |

## The simulator

**iPhone 17 Pro, iOS 26.5** — UDID `F8943C20-E213-4FE0-B678-F4317818C8EF`. Everything in the parity
pass used this one device. Its screen is 402 x 874 points, captured at 1206 x 2622 px (`@3x`).

```bash
xcrun simctl boot F8943C20-E213-4FE0-B678-F4317818C8EF
open -a Simulator
```

## Building the Swift app

No signing setup was needed. A simulator build does not need a team or a provisioning profile as long
as signing is switched off on the command line:

```bash
cd ios
xcodebuild -project Nexdo.xcodeproj -scheme Nexdo -configuration Debug \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,id=F8943C20-E213-4FE0-B678-F4317818C8EF' \
  -derivedDataPath /tmp/nexdo-dd \
  CODE_SIGNING_ALLOWED=NO build
```

- Scheme: **`Nexdo`** (the other scheme, `Nexdo Device Check`, is not for this).
- The build resolves one Swift package, `stasel/WebRTC` 153.0.0, on the first run.
- The product is named **`Nexdo: AI Daily Planner.app`** — the space and colon need quoting.
- First build: about 4 minutes. No signing or scheme changes were required.

Install and launch:

```bash
APP='/tmp/nexdo-dd/Build/Products/Debug-iphonesimulator/Nexdo: AI Daily Planner.app'
xcrun simctl install booted "$APP"
xcrun simctl launch booted com.pinslots.nexdo
```

### Debug-only preview launch arguments

`RootView.swift` dispatches on launch arguments under `#if DEBUG`. The one that matters for auth is
`-email-verification-preview`, which opens `EmailVerificationView` directly with
`preview@example.com` and reason `.codeSent`. That is the only auth screen reachable without tapping.

## Building the React Native app

`mobile/node_modules` was not present, so start with an install:

```bash
cd mobile
npm install
npx expo run:ios --device F8943C20-E213-4FE0-B678-F4317818C8EF
```

- **First build: about 16 minutes.** That covers `expo prebuild` (which creates the gitignored
  `mobile/ios` folder), `pod install`, and the Xcode build of every pod.
- **No EAS and no Apple account were needed.** This is a local development-client build.
- **No pod problems.** `pod install` succeeded first time. The build printed one harmless linker
  warning, `ignoring duplicate libraries: '-lc++'`, and no errors.
- `expo run:ios` leaves Metro running and installs and launches the app itself. Later JavaScript
  changes reload over Metro, so the 16 minutes is a one-off.
- The build product is at
  `~/Library/Developer/Xcode/DerivedData/Nexdo-*/Build/Products/Debug-iphonesimulator/Nexdo.app`.

## Both apps share one bundle identifier

`com.pinslots.nexdo` belongs to **both** apps. Installing one **replaces** the other on the
simulator; they cannot sit side by side. To switch:

```bash
xcrun simctl install booted "$SWIFT_APP"   # or "$RN_APP"
```

Re-installing is a second or two and needs no rebuild, so alternating is cheap. Metro keeps running
while the Swift app is installed, so the React Native app works again the moment it is reinstalled.

This also means a React Native build launched while the Swift app is under automation will kill that
automation session — build first, then capture.

## Preparing the simulator for screenshots

Three things otherwise differ between two runs of the same screen and show up as a false diff:

```bash
SIM=F8943C20-E213-4FE0-B678-F4317818C8EF

# 1. Pin the status bar, so the clock and battery are identical in every capture.
xcrun simctl status_bar $SIM override --time "9:41" \
  --batteryState charged --batteryLevel 100 \
  --cellularMode active --cellularBars 4 --wifiMode active --wifiBars 3

# 2. Clear saved passwords, or iOS offers to save one after each sign-in attempt.
xcrun simctl keychain $SIM reset

# 3. Appearance, for the dark-mode captures.
xcrun simctl ui $SIM appearance dark    # or: light
```

Also turn **Settings > General > AutoFill & Passwords > AutoFill Passwords and Passkeys** off. With
it on, a "Passwords" strip sits above the keyboard in any capture involving a password field.

Even with all of that, iOS still shows a system **"Updating…"** HUD over the screen for the moment a
`.password` field is submitted. It appears in both apps, so it is left in the loading captures rather
than worked around.

Capture with:

```bash
xcrun simctl io booted screenshot --type png out.png
```

## Driving the simulator without Accessibility permission

`xcrun simctl` cannot tap or type, and AppleScript UI scripting is refused on this Mac
("osascript is not allowed assistive access"), which would need a GUI permission grant.

The parity pass used a small **XCUITest remote driver** instead: a generated, throwaway Xcode project
containing nothing but a UI-test bundle, whose single test reads a command from a file, runs it
against `XCUIApplication(bundleIdentifier: "com.pinslots.nexdo")`, and writes back a reply. It
supports `launch`, `tap x y`, `taplabel <label>`, `type <text>`, `dump`, `terminate` and `quit`.

It lives outside the repository (it is scaffolding, not project code) and is regenerated with the
`xcodeproj` gem that CocoaPods already provides. Two things it must do to survive a long session:

- Pass the shared directory through **`TEST_RUNNER_DRIVER_DIR`**, not a plain environment variable —
  that is the only way xcodebuild forwards a value into the test runner. The simulator can read and
  write host paths under `/private/tmp` directly.
- Tap **only hittable elements**. A presented sheet leaves the screen underneath in the accessibility
  tree, so a label like "Email address" matches twice; tapping the covered one fails the test and
  ends the whole session.

Run it with `-test-timeouts-enabled NO`, or it stops after the default allowance. Two more things
this pass learned the hard way:

- **Never run two of these at once.** A second `xcodebuild test` against the same `-derivedDataPath`
  makes both fail with an unhelpful result-bundle error.
- **Tap React Native by coordinate, not by label.** `descendants(matching: .any)` walks the whole
  accessibility tree, and React Native's is very deep — around 25 nested container views before the
  first real one. Label queries against the Swift app return instantly; against the React Native app
  they degraded to over a minute per tap, which is what stopped the last few states being captured.
  `dump` once to read the frames, then use `tap x y`.

Also note **`xcrun simctl openurl` cannot deep-link into a route** while the development client is
running: it hands the URL to the launcher. Terminate the app, open the Metro bundle, wait for it to
load, and only then send `nexdo://<route>` — and expect an "Open in Nexdo?" confirmation, which is a
Springboard alert, so the driver has to `activate com.apple.springboard` to tap it.
