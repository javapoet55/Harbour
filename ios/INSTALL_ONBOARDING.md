# First-install introduction

`InstallIntroductionView` presents the four supplied designs in screen-number order before authentication. Headings, descriptions, feature cards, page indicators, and actions are native SwiftUI. The original supplied artwork is retained in `first-launch-1` through `first-launch-5`; illustration regions are laid out separately from the mockups' status bars and controls.

- Next, horizontal swipe, and accessible page buttons navigate the introduction.
- Skip and Get Started finish the introduction and open the redesigned Create Account screen.
- The explicit Sign In link finishes the introduction and opens existing sign-in.
- `nexdo.installIntroductionCompleted` is stored in app-container UserDefaults, not Keychain or account settings. Relaunch/sign-out does not reset it. Deleting the app and installing fresh clears it; restoring app data from a backup or offloading the app can retain it.
- Copy uses Dynamic Type and each page scrolls independently. Actions stay outside the scroll area above the safe area. The supplied light artwork uses a light presentation for readable status-bar and control colors in either app appearance setting.
- No permissions, network requests, or account creation are initiated by the introduction itself.

## Validation

Run `NexdoMomentUITests/InstallIntroductionUITests` on an iPhone simulator. Tests cover all pages, signup routing, skip persistence, swipe/page navigation, sign-in routing, and resetting the per-install flag. Each page is attached to the test result as a screenshot.

Debug builds accept `-reset-install-introduction` to clear only this completion flag at launch. This argument has no effect in Release builds. Testing a physical uninstall/reinstall must use a disposable simulator/app installation; do not erase a user's existing app data to preview this feature.

Validated 2026-10-18: simulator build passed; all 3 `InstallIntroductionUITests` passed on iPhone 17 Pro Max (43.34 seconds). Visually reviewed all four pages on Pro Max and first-page layout on the small QA iPhone. Fresh-install behavior is tested by clearing the exact app-container completion key; no existing installation was uninstalled. Physical-device, VoiceOver spoken-output, and backup-restore testing remain outstanding.
