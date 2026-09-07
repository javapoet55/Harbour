# Ask Nexdo implementation

The existing tab shell opens a native 84%-height SwiftUI sheet from Ask AI or the Ask Nexdo entry controls. Its originating view stays mounted; X and native swipe dismissal return to it. The sheet uses rounded corners, a drag indicator, blurred/dimmed background, five reusable suggestion cards, scrolling content, and a safe-area composer. Typing/request activity disables swipe dismissal; X remains available.

## Integration

All five `NexdoAIIntent` cases submit natural-language queries through the existing `AppModel.ask`, `AssistantRequest`, authenticated `APIClient`, and `/api/assistant` conversational agent. Existing server intent fallback mappings are BRIEF_ME, FOCUS_TODAY, LIST_DEADLINES (seven days), FIND_FREE_TIME, and PLAN_TOMORROW. Task/calendar context and scheduling remain server-owned; the UI does not generate answers or fetch a parallel data snapshot. Existing `/api/tasks` and `/api/agenda` flows are unchanged.

`AskResponseView` extracts the previous structured response rendering, including sections, proposed schedule changes, and explicit approval/rejection controls. Session context IDs and AI-sharing consent are reused. Submission guards reject empty/over-limit input and duplicates; successful submission clears matching input, failures preserve it and offer retry with a friendly error.

Native voice recording/speech recognition does not exist in the current app. The microphone explains this and points to keyboard dictation. The server `/api/speech` endpoint synthesizes speech; it is not a transcription API. No recording framework or new permission was introduced.

## Validation performed

- Existing Nexdo Xcode project: Debug simulator build passed with Xcode 26.6 / iOS 26.5 SDK, deployment target unchanged at iOS 17. Final build log: `/private/tmp/nexdo-ask-final-build.log`.
- All 21 existing Swift core tests passed; log: `/private/tmp/nexdo-ask-tests.log`.
- DEBUG fixtures on Nexdo Tasks Small QA (small iPhone simulator, iOS 26.5): verified Ask AI opens from Tasks and Today, X restores Tasks with the selected Today filter, native background blur/dimming, scrollable suggestion cards, pinned composer, first-use consent gate and cancellation, typed follow-up, and Ask enabled/disabled states.
- Inspected accessibility tree and added explicit button traits to suggestion cards. Dynamic Type uses semantic fonts and an alternate composer layout at accessibility sizes. The tab transition continues to honor Reduce Motion.
- No real login or live AI request was performed. No account credentials were provided. Loading/error responses, all five live answers, approval/rejection writes, software keyboard appearance, swipe dismissal, actual VoiceOver/Reduce Motion sessions, larger Dynamic Type, dark mode, and iPhone 17 Pro Max / 15 Pro Max runtime layouts remain unverified. A simulator build targeting 17 Pro Max is not a runtime layout test.
- No Xcode UI session, signing changes, backend changes, or production deployment performed.

Files: `App/AskNexdoView.swift`, `App/AskResponseView.swift`, and scoped edits to `App/RootView.swift` / `App/NexdoApp.swift`.
