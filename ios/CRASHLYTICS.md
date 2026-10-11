# iOS crash reporting

Nexdo links FirebaseCrashlytics from the existing pinned Firebase Swift package.
`NexdoApp` configures Firebase and enables automatic Crashlytics collection at launch.
The existing Report Bugs flow continues to collect descriptions and optional screenshots separately.
No account identifiers, descriptions, screenshots, or tokens are added as Crashlytics custom keys.
The SDK still collects its standard crash/device/session diagnostics and Analytics breadcrumbs.

## Symbols

Debug and Release generate DWARF with dSYM files. The final app build phase runs
Firebase's supported `Crashlytics/run` script, with sandbox input paths for the dSYM,
executable, and bundled GoogleService-Info.plist. Debug dylib splitting is disabled
so the executable's symbols are in the single declared dSYM payload.
The Firebase uploader validates synchronously and uploads in the background.
Archive and retain each distributed build's matching dSYMs.

## Controlled verification

Only Debug builds recognize `-nexdo-crashlytics-test-crash`. It deliberately crashes
five seconds after startup. Do not enable it in a normal shared scheme.

1. Build and install the Debug app on a test simulator/device.
2. Launch without a debugger, adding the argument once (simctl launch supports it).
3. Wait for the crash; relaunch WITHOUT the argument to upload the report.
4. Open Firebase project `nexdoapp-19f07`, Crashlytics, Nexdo iOS.
5. Confirm the controlled crash and the `NexdoCrashReporting.swift` source location.
6. If a dSYM is missing, run the package's `Crashlytics/upload-symbols` with
   `-gsp ios/App/GoogleService-Info.plist -p ios` and the matching dSYM path.

Release builds exclude the test-crash branch. A new iOS app distribution is required;
backend deployment does not add this SDK to existing installed apps.

## Alerts

Firebase's project Alerts settings are per signed-in member and app. Select Nexdo iOS.
New fatal issue email alerts were enabled for `nexdoai@gmail.com` on October 10, 2026.
Trending issue, regression, and missing-dSYM email alerts were already enabled.
Other project members must configure their own subscriptions. This does not reroute
Crashlytics alerts to the Report Bugs support mailbox.

Setup reference: https://firebase.google.com/docs/crashlytics/ios/get-started

## Local validation (October 10, 2026)

- Debug simulator build and unsigned device Release build: passed.
- Release binary checked: test-crash argument and fatal-error message absent.
- QA simulator controlled crash fired at 17:55:24 Pacific and app relaunched.
- Firebase received one crash and confirmed dSYM UUID
  `59444F29-83D4-334B-875A-29C6D678123E` uploaded and processed.
- Full readable issue details were still processing during the initial verification.
- Kept local for Xcode installation as requested; no App Store/TestFlight upload.
