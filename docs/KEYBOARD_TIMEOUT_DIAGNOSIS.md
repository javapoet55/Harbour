# Keyboard timeout investigation — September 9, 2026

The screenshot contains UIKit keyboard diagnostics, an XPC interruption, an NSMapGet warning, and repeated `Result accumulator timeout: 3.000000, exceeded.` messages. These lines alone do not identify an application source line or establish an application deadlock.

## Observed evidence

- The smaller simulator's unified log contains the same accumulator message from `com.apple.TextInputUI:CandidateGeneration` at 07:18:58 (with a 0.25-second timeout). The screenshot's exact repeated 3-second sequence was not reproduced.
- Two-second samples of both running Nexdo simulator processes show their main threads waiting in the normal UIKit/CoreFoundation event loop. No blocked Nexdo frame or busy loop was captured. These samples cannot rule out an intermittent hang at another time.
- The sign-in email field accepted test text immediately. The field was cleared afterward; no credentials or sign-in request were submitted.
- After enabling the Debug fixture, Weekly Summary loaded and both metric drilldowns responded. Completed showed three tasks and Overdue showed five. Task Details opened and closed normally. Back navigation worked. A chart-origin scroll moved the report, but further automated scroll attempts did not establish that all lower sections were reachable; full scrolling verification remains incomplete.

## Verified fix

The project's Debug configuration omitted `SWIFT_ACTIVE_COMPILATION_CONDITIONS = "$(inherited) DEBUG"`. As a result, `#if DEBUG` preview transports and launch switches were excluded even from Debug builds. Added that condition only to Debug. The rebuilt app successfully launches the isolated Weekly Summary transport with `-weekly-summary-preview`. Release settings remain unchanged. The Debug simulator build passes.

This configuration fix does not claim to fix Apple's candidate-generation service or the user's unobserved 3-second timeout sequence. Logs were not suppressed; AutoFill and accessibility remain enabled.

## Needed to reproduce the reported issue

Identify the screen and exact action that triggers the screenshot, and whether it produces a visible freeze or only console output. For a freeze, capture the app's main-thread stack while frozen, rather than using a nearby keyboard warning as its cause.

Local investigation files: `/private/tmp/nexdo-timeout-diagnostics.log`, `/private/tmp/nexdo-timeout-6621.txt`, `/private/tmp/nexdo-timeout-6447.txt`, and `/private/tmp/nexdo-debug-fix-build.log`.

## Physical-device clarification

The user reports the login screen freezing for approximately two minutes after a new build is installed on the iPhone. Read-only device checks found a paired iPhone 15 Pro Max running iOS 26.6.1, connected through the local-network/TCP developer transport, with Nexdo running. No frozen physical-device stack has been captured.

The login view does not start an authentication/backend request until a sign-in action. Its normal Xcode Run scheme attaches LLDB. Apple DTS recommends comparing with Debug Executable disabled when investigating slow first launches: https://developer.apple.com/forums/thread/800067?answerId=859763022 . Debugger overhead is a hypothesis for this device, not a confirmed root cause.

Added the shared **Nexdo Device Check** scheme. It uses the same Debug configuration but launches without LLDB, preserving the normal Nexdo scheme for breakpoints. Select it and run on the iPhone, or stop Xcode and launch from the phone's Home Screen. Compare the time until typing responds. This does not disable AutoFill, hide warnings, alter authentication, or change Release behavior. The two-minute freeze cannot be claimed resolved until the physical-device comparison is performed.
