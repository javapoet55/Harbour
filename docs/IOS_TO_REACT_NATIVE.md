# iOS (SwiftUI) to React Native (Expo) migration plan

Last updated: 2026-09-16

## Goal

Replace the native SwiftUI iPhone app in `ios/` with a React Native app built on Expo, while:

- **Keeping the Swift app** working until the React Native app reaches parity.
- **Keeping the backend unchanged.** The React Native app uses the same Railway API (`https://harbour-production-f8a0.up.railway.app`) and the same session cookie auth.
- **Leaving Android optional.** Expo can build it, but it needs extra work (section 8).

This document lists everything the Swift app does, maps each piece to React Native, and proposes a phased plan with estimates.

---

## 1. Proposed setup

These are suggestions to confirm before starting:

| Decision | Suggestion | Why |
| --- | --- | --- |
| Location | New `mobile/` folder at the repo root, next to `ios/` | Keeps the Swift app untouched |
| Framework | Expo (latest SDK) with a development build (EAS) | Voice needs native WebRTC, which Expo Go cannot run |
| Navigation | Expo Router (file-based) | Tabs, stacks, and modal sheets map directly to the SwiftUI structure |
| Server data | TanStack Query | Caching, refresh, and stale-response handling that `AppModel` does by hand today |
| App state | React context or Zustand | Session, profile, focus session, consent |
| Forms and validation | React Hook Form + Zod | The web app already uses Zod |
| Tests | Jest + React Native Testing Library | Replaces the Swift checks |
| Builds | EAS Build and EAS Submit | No local Xcode needed for builds |
| Bundle ID | `com.pinslots.nexdo` | Same as the Swift app, so it replaces it on TestFlight |

This Mac has no full Xcode, so there is no iOS simulator. Test most screens on a physical iPhone, with Expo Go first and a development build once native modules (voice, Apple sign-in) are added.

---

## 2. Screen inventory

The Swift app has **32 unique screens and sheets**. Some Swift views open from several places and are counted once.

Suggested Expo Router file paths are shown for each screen.

### Auth (signed out): 4
| # | Screen | Swift view | Presentation | Suggested route |
| --- | --- | --- | --- | --- |
| 1 | Sign in (email/password, eye toggle, Sign in with Apple) | `SignInView` | Root | `app/(auth)/sign-in.tsx` |
| 2 | Create account | `SignUpView` | Sheet | `app/(auth)/sign-up.tsx` |
| 3 | Verify email (6-digit code, resend countdown) | `EmailVerificationView` | Push from sign-up, sheet from sign-in | `app/(auth)/verify-email.tsx` |
| 4 | Reset password (request code, then code + new password) | `PasswordResetView` | Sheet | `app/(auth)/reset-password.tsx` |

### App shell: 1
| # | Screen | Swift view | Suggested route |
| --- | --- | --- | --- |
| 5 | Tab bar: Today, Tasks, Ask AI, Calendar (Ask AI opens a sheet) | `NexdoTabShell` | `app/(tabs)/_layout.tsx` |

The focus session strip (`FocusSessionStrip`) sits above the tab bar and is a shared component, not a screen.

### Today tab: 9
| # | Screen | Swift view | Presentation |
| --- | --- | --- | --- |
| 6 | Today dashboard (top bar, intelligence card, schedule, action queue) | `TodayView` | Tab |
| 7 | Do Now (suggested next task) | `DoNowView` | Sheet |
| 8 | Action queue: all actions, with snooze menu | `ActionQueueSheet`, `SnoozeMenu` | Sheet |
| 9 | Needs attention details | `attentionDetails` in `TodayView` | Push |
| 10 | Schedule check details | `scheduleCheckDetails` in `TodayView` | Push |
| 11 | Overdue tasks | `OverdueTasksView` | Push |
| 12 | Weekly summary | `WeeklySummaryView` | Push |
| 13 | Weekly summary task list | `WeeklySummaryTasksView` | Push |
| 14 | Weather forecast | `WeatherForecastView` | Sheet |

### Tasks tab and projects: 8
| # | Screen | Swift view | Presentation |
| --- | --- | --- | --- |
| 15 | Task list (search, metrics, rows) | `TasksView` | Tab |
| 16 | Task filters | Sheet in `TasksView` | Sheet |
| 17 | Add / edit task, with date picker | `TaskEditor` | Sheet (also opened from Today, Overdue, Projects) |
| 18 | Task details | `TaskDetailsView` | Push (also from Calendar, Weekly summary) |
| 19 | Voice capture: add task, ask AI, or add calendar event | `AddTaskByVoiceView` (3 modes) | Full screen |
| 20 | Projects | `ProjectsView` | Section in Tasks |
| 21 | Project detail | `ProjectDetailView` | Push |
| 22 | Create / edit project | `ProjectEditorView` | Sheet |

### Ask AI: 2
| # | Screen | Swift view | Presentation |
| --- | --- | --- | --- |
| 23 | Ask Nexdo: suggestions, answers, read aloud; also full-screen text chat | `AskNexdoView` (2 modes), `AskResponseView` | Sheet / full screen |
| 24 | AI data-sharing consent | Sheet in `AskNexdoView` | Sheet |

Voice conversation reuses screen 19 in ask mode.

### Calendar tab: 4
| # | Screen | Swift view | Presentation |
| --- | --- | --- | --- |
| 25 | Calendar (tasks and synced events) | `CalendarView` | Tab |
| 26 | Event details | Sheet in `CalendarView` | Sheet |
| 27 | Add calendar event | `CalendarEventEditor` | Sheet |
| 28 | Schedule conflicts | Sheet in `CalendarView` | Sheet |

Calendar also opens Ask (screen 23), voice in calendar mode (screen 19), and task details (screen 18).

### Account: 2
| # | Screen | Swift view | Presentation |
| --- | --- | --- | --- |
| 29 | Account (profile, menu, sign out) | `AccountView` | Sheet from the avatar |
| 30 | Profile and settings (photo, preferences, Connect Google Calendar, Synchronize now, web links, delete account) | `ProfileSettingsView` | Push |

### Reminders: 2
| # | Screen | Swift view | Presentation |
| --- | --- | --- | --- |
| 31 | Task action (action card, clarify card), opened from a reminder notification | `TaskActionView`, `TaskActionCard`, `ClarifyTaskActionCard` | Sheet |
| 32 | Message / email composer | `TaskActionComposers` | Sheet |

### Not migrating
- `VoiceInputView`: defined, but nothing opens it.
- Debug-only previews: `TodayDesignPreview`, `CalendarDesignPreview`, `ProjectsDesignPreview`, `TaskDesignPreview`, `WeeklySummaryPreview`, and the `-email-verification-preview` launch argument.

---

## 3. Shared components

| Group | Swift views |
| --- | --- |
| Tasks | `TaskRow`, `TaskListRow`, `TaskBadge`, `TaskCategoryBadge`, `TaskMetric`, `TasksHero`, `TaskEditorLabel`, `DetailInput` |
| Today and calendar | `EventRow`, `TodayScheduleRow`, `TodayTopBar`, `TodayHeaderButton`, `TodayIntelligenceCard`, `NextActionRow`, `ActionNeededCard`, `FocusSessionStrip` |
| Projects | `ProjectCard`, `ProjectFolder`, `ProjectSearchField`, `ProjectAssignmentField` |
| Weekly summary | `MetricCard`, `CompletionMetricCard` |
| Profile | `ProfileAvatar` |
| Auth | `RevealablePasswordField`, `SignInFieldIcon`, `NexdoLogoMark` |
| Backgrounds and effects | `SignInBackdrop`, `TodayBackdrop`, `NexdoTaskBackdrop`, `ProfileBackground`, `WeeklySummaryBackdrop`, `ActionGlass`, `FocusButtonBorder`, `NexdoAISuggestionCard` |

Brand colors (from `RootView.swift`): `nexdoBlue`, `nexdoIndigo`, `nexdoPurple`, `nexdoMagenta`, plus light/dark `nexdoInk`, `nexdoSecondary`, `nexdoScheduleBlue`. Put these in one theme file.

---

## 4. Logic to port (not screens)

### `ios/Sources/NexdoCore/` (shared Swift logic)

Port each file to a TypeScript module. Several have web equivalents in `src/lib/` that may be reusable.

| Swift file | What it does | Possible web counterpart |
| --- | --- | --- |
| `APIClient.swift` | HTTPS-only requests, cookie session, no redirects, server error mapping (`SCHEDULE_WARNING`, `EMAIL_NOT_VERIFIED`) | `src/lib/schedule-fetch.ts` |
| `Models.swift` | Profile, task, agenda, calendar event, assistant response types | `src/lib/types.ts` |
| `EmailVerification.swift` | Registration response, pending verification, 6-digit code cleanup | — |
| `TaskQuery.swift` | Task search, status and date filters | Task browser logic |
| `TaskDraft.swift`, `TaskSaveInput.swift`, `VoiceTaskDraft.swift` | Task drafts and save payloads | — |
| `CalendarDates.swift` | Server date parsing, account time zone days, daylight saving, multi-day events | `src/lib/time.ts`, `src/lib/calendar-view.ts` |
| `DoNowRecommendation.swift` | Do Now pick | `src/lib/focus-ranking.ts` |
| `TodayActionQueue.swift`, `TaskAction.swift`, `TaskActionDetector.swift` | Action queue, task actions (call, message, email), detection | — |
| `OverdueTasks.swift` | Overdue filtering | — |
| `Projects.swift` | Project models and validation | — |
| `WeeklySummary.swift` | Weekly summary grouping | — |
| `FocusClock.swift` | Focus timer | `src/lib/focus-session.ts` |
| `ProfileSettings.swift` | Settings payloads | — |
| `AssistantPresentation.swift` | Answer sections | `src/lib/assistant-sections.ts` |
| `SpeechText.swift` | Splits long answers for read-aloud | — |
| `VoiceConversationSession.swift`, `VoiceToolResponse.swift`, `VoiceUpload.swift`, `RealtimePCMConverter.swift` | Voice conversation state machine, tool results, uploads, audio conversion | `src/server/voice/` (server side) |
| `WeatherClient.swift` | Weather request | `/api/weather` |
| `TaskCategoryAppearance.swift` | Category icons and colors | — |

### `AppModel` (`ios/App/NexdoApp.swift`)

App-wide state and actions. Recreate as TanStack Query hooks plus a small store:

- Sign in, sign up, verify email, resend code, reset password, Sign in with Apple, sign out, delete account.
- Load profile, sync device time zone to the account, save settings, upload profile photo with confirmation.
- Load and refresh tasks with duplicate-request protection and stale-response protection. A slow old response must not overwrite a newer save.
- Create, edit, complete, and delete tasks. Projects CRUD with count reconciliation.
- Schedule-conflict confirmation: on `SCHEDULE_WARNING`, ask the person, then retry with `allowScheduleConflict: true`.
- Agenda, schedule intelligence, next action with periodic refresh, protected time proposals.
- Assistant turns with context IDs and approve/reject, AI consent state.
- Focus session, weekly summary, weather, calendar sync.

---

## 5. Native features to Expo

| Feature | Swift today | Expo / React Native |
| --- | --- | --- |
| Session cookie | `URLSession` ephemeral cookie storage | `fetch` with native cookie handling. **Verify early** that the `harbor_session` cookie persists and is sent. If not, add a token header option on the server. |
| Sign in with Apple | `AuthenticationServices` | `expo-apple-authentication` |
| Google Calendar connect | `ASWebAuthenticationSession`, `nexdo://` callback, `?native=1` | `expo-web-browser` `openAuthSessionAsync`, `nexdo` URL scheme in app config |
| Live voice conversation | `VoiceWebRTCTransport`, `RealtimeTaskAudio` | `react-native-webrtc` in a development build. **Highest risk.** |
| Live transcription, recording, playback | `LiveVoiceTranscription`, `VoiceCapture`, `VoicePlayback` | `expo-audio` (or `expo-av`); may need a native module for streaming PCM |
| Voice animation | `VoiceAnimationView` | `react-native-reanimated` |
| Reminder notifications with actions | `TaskActionNotifications`, `TaskActionCoordinator`, app delegate | `expo-notifications` with notification categories and response handling |
| Contacts | `TaskActionContacts` | `expo-contacts` |
| Message and email composers | `TaskActionComposers` | `expo-sms`, `expo-mail-composer` |
| Profile photo | `PhotosUI`, `ProfilePhotoEncoder` | `expo-image-picker`, `expo-image-manipulator` |
| Appearance (system, light, dark) | `AppAppearance` with `@AppStorage` | `Appearance` API + `expo-secure-store` or AsyncStorage |
| Last signed-in first name | `UserDefaults` | AsyncStorage |
| Pull to refresh, sheets, date pickers | SwiftUI | `RefreshControl`, Expo Router modals or `@gorhom/bottom-sheet`, `@react-native-community/datetimepicker` |

### App configuration (`app.json` / `app.config.ts`)
- iOS bundle identifier `com.pinslots.nexdo`, Apple team.
- Sign in with Apple entitlement.
- URL scheme `nexdo`.
- Permission texts: microphone, contacts, notifications, photo library.
- Privacy manifest (port `PrivacyInfo.xcprivacy`).
- App icon and splash (see `output/app-icon`).
- API base URL as config, not hardcoded.

---

## 6. Phased plan and estimates

Assumes one developer working full-time with AI assistance, testing on a real iPhone.

| Phase | Scope | Working days |
| --- | --- | --- |
| 0. Voice proof of concept | Minimal Expo development build with `react-native-webrtc` connecting to `/api/realtime/task-session` | 2–3 (do first, to confirm phase 9) |
| 1. Setup | Expo app, Expo Router, theme, API client, cookie session check, TanStack Query, shared components | 2–3 |
| 2. Auth | Screens 1–4, Sign in with Apple | 2–3 |
| 3. Tasks and projects | Screens 15–18, 20–22, task logic | 5–7 |
| 4. Today | Screens 6–14, action queue, Do Now, intelligence, weekly summary | 5–7 |
| 5. Calendar | Screens 25–28, Google Calendar connect | 3–5 |
| 6. Ask AI (text) | Screens 23–24 | 2–3 |
| 7. Account and settings | Screens 29–30, photo upload | 2–3 |
| 8. Reminders | Notifications with actions, screens 31–32, contacts, composers | 3–5 |
| 9. Voice | Screen 19 (all three modes), live conversation, transcription, playback | 7–15 |
| 10. Finish | Tests, design polish, device QA, EAS build, TestFlight | 5–7 |
| **Total** | | **about 38–61 days (8–12 weeks)** |

### Phase 2 result

**Passed on Android, 2026-09-16.** Sign in, sign up, email verification and password reset all work
against the deployed backend on a physical Android phone, with the cookie session surviving a relaunch.

One open item, which is not an auth-screen defect:

- **Password-reset email is silent for `+` addresses from mobile** (e.g. `visakan+signintest@apzzo.com`,
  while `visakan@apzzo.com` works). The request bytes leaving the phone are confirmed correct by
  `mobile/src/api/password-reset.test.ts`, which pins the path, method and body and asserts the `+`
  travels unencoded; the navigation param round-trip preserves it too. A server-side rate limit is the
  leading suspicion: `createPasswordReset` (`src/server/account-auth.ts`) allows three sends per 15
  minutes per user and returns the same `{ delivered: true }` and the same generic message when it
  refuses, so a throttled send is indistinguishable from a sent one. Re-test after a quiet 20-minute
  gap, watching the `__DEV__` request log in the Metro terminal to confirm the address on the wire.

### Phase 0 result

**Passed on Android, 2026-09-16.** A development build on a physical Android phone connected to
`/api/realtime/task-session`, streamed microphone audio, and played a spoken reply. Connect, speak, hear a
reply all work, so Phase 9 is not blocked by React Native WebRTC.

Not measured during the proof of concept, and carried into Phase 9 rather than treated as blockers:

- Latency figures were not recorded (neither start → data channel open, nor end of speech → first audio back).
- Speaker volume relative to the Swift app was not measured.
- End-to-end task creation from speech was not confirmed.

iOS is untested for voice. The proof of concept ran only on Android.

Options:

| Scope | Estimate |
| --- | --- |
| Everything except voice (keep voice in Swift or add later) | 5–8 weeks |
| Minimum usable app: auth, Today, Tasks, Calendar, text Ask AI, settings | 3–5 weeks |
| Adding Android | +1–2 weeks |

App Store review adds a few days per submission.

---

## 7. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| WebRTC voice in React Native | Voice could take much longer than estimated | Phase 0 proof of concept before committing |
| Cookie session handling | Sign-in could fail to persist | Test in phase 1. Fallback: bearer token support on the server |
| No Xcode on this Mac | No simulator | Physical iPhone with Expo Go and development builds, EAS cloud builds |
| Design parity | SwiftUI blur, material, and gradient effects differ in React Native | `expo-blur`, `expo-linear-gradient`; agree on acceptable differences |
| Two apps at once | Features added to Swift during migration must also be built in React Native | Freeze new Swift features, or track them in this doc |
| Android | Sign in with Apple, notifications, and audio differ | Decide early. Add Google sign-in if Android is in scope |
| Google OAuth in Testing mode | Only listed test users can connect, connections expire after 7 days | Complete Google verification before public launch |

---

## 8. Android (if in scope)

- Sign in with Apple on Android needs the web flow, or add Google sign-in (server work).
- Notification channels and action buttons differ from iOS.
- Audio recording and WebRTC behave differently. Test separately.
- Google Play listing, signing, and review.

---

## 9. Migration checklist

- [ ] Confirm setup decisions (section 1), including Android scope
- [x] Phase 0: voice proof of concept (built: `mobile/app/dev/voice-check.tsx`, protocol in `mobile/docs/voice-protocol.md`): *passed on Android 2026-09-16; iOS untested*
- [x] Expo project in `mobile/` with EAS development build: *Android development build made and run; iOS build not made*
- [x] API client and cookie session verified on a device: *verified on Android (Expo Go, 2026-09-15); iOS pending*
- [x] Theme and shared components
- [x] Auth screens: sign-in, sign-up, verify-email, reset-password, the session gate and sign-out
  (Phase 2, 2026-09-16). Built and covered by tests; **not yet tested on a device**.
- [ ] Sign in with Apple: built (`expo-apple-authentication`, `ios.usesAppleSignIn`), untested — it
  needs an iOS development build and the capability on the Apple Developer App ID.
- [x] Task list, filters, search, creation editor, task detail, voice-capture shell
  (Phase 3, 2026-09-16). Built and covered by tests; **not yet tested on a device**.
- [ ] Projects: list, detail, create/edit/delete: **not built**. The Tasks tab Projects segment
  renders a placeholder. See section 12, "Phase 3 status".
- [ ] Tasks and projects
- [ ] Today
- [ ] Calendar and Google Calendar connect
- [ ] Ask AI (text) and consent
- [ ] Account and settings
- [ ] Reminder notifications and task actions
- [ ] Voice (all modes)
- [ ] Jest tests for ported logic (task query, calendar dates, action queue, verification, API errors)
- [ ] Privacy manifest, permission texts, icons
- [ ] TestFlight build, internal testing
- [ ] Parity review against the 32 screens in section 2
- [ ] Retire the Swift app from TestFlight and archive `ios/`

---

## 10. Phase 1 status

Last updated: 2026-09-15. Branch: `react-native-migration`.

Phase 1 runs in **Expo Go** (Expo SDK 57, React Native 0.86, Expo Router, TypeScript). It has no native modules that need a development build, so the "EAS development build" checklist item stays open until Phase 0 or 2. Run and test instructions: [`mobile/README.md`](../mobile/README.md).

### What exists
| Area | Files |
| --- | --- |
| App config | `mobile/app.config.ts`: name Nexdo, slug `nexdo`, bundle ID `com.pinslots.nexdo`, scheme `nexdo`, `extra.apiUrl` from `EXPO_PUBLIC_API_URL` (default: the Railway URL) |
| Routes | `app/_layout.tsx` session gate (`GET /api/me`, with `Stack.Protected`), `app/index.tsx`, `(auth)/sign-in`, `(tabs)/today`, `tasks`, `ask`, `calendar` (all placeholders), `dev/session-check` |
| Theme | `src/theme/`: brand colours from `RootView.swift` with source lines, spacing, typography, radii, `useTheme` (follows the system setting) |
| API | `src/api/client.ts` (port of `APIClient.swift`), `src/api/types.ts` (port of `Models.swift`, with differences from the web types noted inline), `src/api/index.ts` endpoints |
| Server data | `src/query/`: `QueryClient` (no retry on 4xx; a `SIGNED_OUT` error signs the app out), query-key factory, `useMe`, stub `useTasks` (the Tasks tab shows the count) |
| App state | `src/store/session.ts` (Zustand) |
| Components | `Screen`, `Text`, `Button`, `Card`, `TextField`, `LoadingView`, `ErrorView` |
| Root repo | `mobile/` is excluded from the root `tsconfig.json`, ESLint and Vitest, and its build outputs are added to `.gitignore` |

### Verified by automated checks
- `npx tsc --noEmit`, `npm run lint`: clean.
- `npm test`: 38 Jest tests.
  - API client: HTTPS-only base URLs and paths, `credentials: 'include'` and `redirect: 'manual'`.
  - Error mapping: `EMAIL_NOT_VERIFIED` (with email), `SCHEDULE_WARNING` (with warnings), 401, and fallback messages matching Swift.
  - Redirects to `/login` treated as signed out: 3xx, opaque, and followed.
  - Network and invalid-body errors, and the retry policy.
  - `Button` and `TextField` render tests.
- `npx expo export --platform ios`: the app bundles.
- Root project: `npm run typecheck` passes, and `npm test` gives the same results with and without the `mobile/` config changes.

### Needs confirmation on a device
- **Cookie session (risk gate):** sign in, force-quit, reopen, and `/api/me` still returns the profile. Procedure: `mobile/README.md`. Unverified.
- Whether React Native's iOS networking obeys `redirect: 'manual'`. The client also detects a followed redirect to `/login`, but only a device shows which path runs.
- Placeholder screens, tab bar, safe areas and dark mode on a real iPhone.

### Phase 1 decisions to review
Marked `TODO(phase1-decision)` in code:
- Dark `nexdoInk` and `nexdoSecondary` use the standard dark values of iOS `.label` and `.secondaryLabel`. The Swift code uses the dynamic system colours, not fixed values.
- The primary `Button` is solid indigo. The Swift gradient needs `expo-linear-gradient`, which can come with the auth screens.
- `ios.supportsTablet` keeps the template value `true`.

---

## 11. Phase 2 status

Last updated: 2026-09-16. Branch: `react-native-migration`.

Phase 2 builds the four auth screens (section 2, screens 1–4), Sign in with Apple, the session gate and
sign-out. Screens are reproduced from `SignInView`, `SignUpView`, `EmailVerificationView` and
`PasswordResetView` — all four live in `ios/App/RootView.swift`, not in separate files. The
modifier-by-modifier translation rules are in
[`mobile/docs/swift-to-rn-style-map.md`](../mobile/docs/swift-to-rn-style-map.md), calibrated against
the live sign-in screenshot in `mobile/docs/reference/`.

### What exists
| Area | Files |
| --- | --- |
| Screens | `app/(auth)/sign-in.tsx`, `sign-up.tsx`, `verify-email.tsx`, `reset-password.tsx`, `_layout.tsx` |
| Auth components | `SignInBackdrop`, `GlassCard`, `GradientButton`, `GradientText`, `NexdoLogoMark`, `SignInFieldIcon`, `AuthFieldRow`, `RevealablePasswordField`, `AuthScreen`, `AppleSignInButton`, `SplashView` |
| Validation | `src/schemas/auth.ts`, derived from `src/server/account-auth.ts` and the Swift enable gates |
| Server calls | `src/api/index.ts` auth endpoints, `src/query/useAuth.ts` mutations |
| Stores | `src/store/consent.ts` (Phase 6), `src/store/lastSignedIn.ts` (the sign-in greeting) |
| Gate | `app/_layout.tsx`: launch `GET /api/me`, splash while undecided, app-wide 401 sign-out via `onSignedOut` |
| New packages | `expo-linear-gradient`, `expo-blur`, `expo-apple-authentication`, `expo-crypto`, `expo-font`, `@expo/vector-icons`, `@react-native-masked-view/masked-view`, `@react-native-async-storage/async-storage` |

### Verified by automated checks
- `npx tsc --noEmit`, `npm run lint`: clean.
- `npm test`: 129 Jest tests (91 added in Phase 2), covering the Zod rules, the sign-in screen
  (render, submit, server error, `EMAIL_NOT_VERIFIED` routing), the verify screen (paste handling,
  resend countdown, the too-many-attempts state) and the session gate (200, 401, app-wide 401).
- `npx expo-doctor`: back to the Phase 0 state — only the known New Architecture warnings for
  `react-native-webrtc` and `react-native-incall-manager`.

### Where the server does not match the brief
Found while reading `src/app/api/auth/*` and `src/server/account-auth.ts`, and worth deciding on
separately from the mobile app:

- **There is no login lockout.** No attempt counter, no 429, no `Retry-After` anywhere in the login
  path. A wrong password always returns the same 401, however many times it is sent.
- **The code attempt limit is five, not ten** (`MAX_CODE_ATTEMPTS`), and exhausting it returns the same
  400 and the same message as an ordinary wrong code, so a client cannot show a distinct lockout state.
- **The 60-second resend cooldown is client-side only.** It is `EmailVerificationView.resendCooldown` in
  Swift and is reproduced as such. The server's own limit is three sends per 15 minutes, and exceeding
  it returns success without sending.
- **Sign in with Apple posts an authorization code and a raw nonce**, not an identity token —
  `authenticateApple` in `src/app/api/auth/apple/route.ts`. The React Native client sends the same shape.
- **Consent is not stored on the device in Swift.** `AppModel.voiceConsent` and `aiConsent` are plain
  `@Published` properties with no storage key, so consent resets on every launch. Phase 2 was asked for a
  device-backed store and built one; Phase 6 decides which behaviour is correct.

### Needs confirmation on a device
Nothing in Phase 2 has run on a phone. Procedures: `mobile/README.md`, "Auth flows to test on a device".

- All four screens against the Swift app, side by side, in light and dark.
- Sign in with Apple: untested and untestable here. It needs an iOS development build carrying the
  entitlement, and the capability enabled on the `com.pinslots.nexdo` App ID.
- Password-manager behaviour for the `textContentType` / `autoComplete` pairs.
- The visual gaps listed in the style map, above all the missing SF Rounded face on the two large titles.


---

## 12. Phase 3 status (tasks and projects)

### Where the Swift app does not match the brief

The Phase 3 brief was written from the screen inventory, not from the Swift source, and the two differ
substantially. Per the parity rule, the build follows Swift. The differences, all verified against
`ios/App/`:

| The brief says | Swift actually does |
| --- | --- |
| Separate Projects screens | Tasks and Projects are ONE screen with a segmented picker; `ProjectsView()` renders inline (`RootView.swift:1650-1658`) |
| A task-detail push route | Tapping a task opens `TaskEditor` as a SHEET, which renders `TaskDetailsView` for an existing task (`RootView.swift:1699`, `1929-1931`) |
| Swipe actions and a long-press menu | Neither exists. A row has a completion circle and a tap target (`RootView.swift:1843-1876`) |
| Optimistic completion | `AppModel.complete` awaits the server, then calls `replaceTask`; the button is disabled by `model.busy` meanwhile (`NexdoApp.swift:518-527`) |
| Filters for status, priority, energy, project, tags, due range | Status, Priority, an "Earliest due first" toggle and Reset. Nothing else (`RootView.swift:1705-1726`) |
| Editor fields including tags, dependencies, reminder offset, recurrence | The creation form has title, notes, project, date and duration. Nothing else (`RootView.swift:1932-2010`) |
| Tags and dependencies on a task | `NexdoTask` has neither field (`Models.swift:33-48`). They are not in the mobile model either |
| `TaskFiltering.swift`, `TaskSorting.swift`, `RecurrenceRule.swift`, `TaskValidation.swift`, `DateFormatting.swift` | None exist. The logic is in `TaskQuery.swift`, `TaskDraft.swift` and `TaskSaveInput.swift` |
| `TaskListView.swift`, `TaskEditorView.swift`, `TaskFilterSheet.swift`, `TaskRow.swift`, `PriorityBadge.swift`, `EnergyBadge.swift`, `TagChip.swift`, `ScheduleConflictSheet.swift` | None exist as files. `TasksView`, `TaskEditor`, `TaskRow` and the filter sheet are all inside `RootView.swift` |

Two more findings worth recording:

- **Recurrence is server-side.** Completing a recurring task creates the next occurrence inside
  `completeTask` (`src/server/tasks.ts:89-97`); the client only refetches. This is why completion is
  not optimistic: an optimistic flip would show a list missing the new occurrence.
- **The task list is fetched whole and filtered on the device.** Swift never sends the server's
  `q`/`status`/`priority`/`energy`/`due` parameters (`NexdoApp.swift:315`). The date-pill counts depend
  on this, because every pill's count comes from one pass over the same array.

### Built in Phase 3

| Screen / module | Swift source |
| --- | --- |
| `mobile/app/(tabs)/tasks.tsx` | `TasksView` (`RootView.swift:1620-1907`) |
| `mobile/app/task/new.tsx` | `TaskEditor.creationForm` (`RootView.swift:1932-2050`) |
| `mobile/app/task/[id].tsx` | `TaskDetailsView` (`ios/App/TaskDetailsView.swift`) |
| `mobile/app/task/filters.tsx` | the filter sheet (`RootView.swift:1705-1726`) |
| `mobile/app/task/voice-capture.tsx` | `AddTaskByVoiceView` (`ios/App/AddTaskByVoiceView.swift`), over a stub |
| `mobile/app/task/_layout.tsx` | the `.sheet` / `.fullScreenCover` modifiers on `TasksView` |
| `src/lib/taskQuery.ts` | `TaskQuery.swift` |
| `src/lib/taskDraft.ts` | `TaskDraft.swift` |
| `src/lib/taskCreation.ts` | `TaskCreationDate` (`TaskSaveInput.swift:24-39`) |
| `src/lib/taskCategory.ts` | `TaskCategoryAppearance.swift` |
| `src/lib/taskLabels.ts` | `ServerDate.time`, `TasksView.sectionTitle`, `TasksView.taskSubtitle` |
| `src/query/useTasks.ts`, `src/query/taskRevision.ts` | the task methods on `AppModel` (`NexdoApp.swift:309-560`) |
| `src/query/useProjects.ts` | `Projects.swift` and the project routes |
| `src/store/taskQuery.ts` | `AppModel.taskQuery` |
| `src/components/TaskCard.tsx` | `TasksView.taskCard` (`RootView.swift:1843-1876`) |
| `src/components/TaskListParts.tsx` | `headerButton`, `datePills`, `creationCard`, the section header, `ContentUnavailableView` |
| `src/components/TaskBadge.tsx` | `TaskBadge` (`RootView.swift:2123-2137`) |
| `src/components/TaskCategoryBadge.tsx` | `TaskCategoryBadge.swift` |
| `src/components/NexdoTaskBackdrop.tsx` | `NexdoTaskBackdrop` (`RootView.swift:2231-2242`) |
| `src/components/TodayShell.tsx` | `TodayBackdrop`, `TodayTopBar`, `ProfileAvatar` |
| `src/components/TaskSymbol.tsx` | the SF Symbol to Ionicons mapping for these screens |

### NOT built in Phase 3

- **Projects screens.** `ProjectsView.swift` (21.8 KB) and its editor are not ported; the Projects
  segment renders a placeholder. The data layer (`useProjects`) and the project model are in place.
- **The `actions` section of `TaskDetailsView`**, being "Start a 25-minute focus session" and
  "Start task" (`TaskDetailsView.swift:114-127`). These drive the focus timer, which is Phase 4/8.
- **`ProjectAssignmentField`** in the creation editor: the create call sends `projectId: null`.
- **Voice transcription.** The capture screen runs on a `__DEV__`-only stub
  (`src/voice/taskCaptureStub.ts`) that yields a fixed transcript. Phase 9 replaces it.
- **The custom date picker** on the creation form (`RootView.swift:2040-2049`). The "Select Date"
  button is present and selectable but does not open a calendar.

### Visual gaps

- `TaskCategoryBadge` draws no artwork. Swift hand-draws twelve bespoke vector illustrations
  (`TaskCategoryBadge.swift:33+`); this renders the capsule, gradient and label with a coloured dot.
- `.blur(radius:)` on the backdrop circles is not reproduced, because React Native cannot blur a
  view's own content and `expo-blur` blurs what is behind a view. The circles are hard-edged.
- `.ultraThinMaterial` on cards is a flat translucent fill, as in Phase 2.
- SF Rounded (`design: .rounded`) has no bundled equivalent, so "Nexdo" in the top bar and the large
  titles use the system face.
- SF Symbols are substituted with Ionicons; the mapping is in `src/components/TaskSymbol.tsx`.
- Sheet detents (`.presentationDetents([.medium, .large])` on the filter sheet) have no Expo Router
  equivalent on Android, so the sheet is a full modal.
- `TaskCard` does not switch to the accessibility-size layout that moves the category badge below the
  text (`RootView.swift:1866-1871`).
- The segmented control is a hand-built pair of pills, not a native `UISegmentedControl`.
- The task editor has no keyboard toolbar, so SwiftUI's keyboard "Done" button is absent.

### Open TODO(phase3-decision) markers

- `src/components/TaskCategoryBadge.tsx`: whether to add `react-native-svg` for the category artwork.
- `src/components/TodayShell.tsx`: the profile photo (Phase 7) and the weather / add buttons (Phase 4).
- `mobile/app/(tabs)/tasks.tsx`: the inline `ProjectsView()`.
- `mobile/app/task/new.tsx`: `ProjectAssignmentField`.
- `mobile/app/(tabs)/tasks.tsx`: the account button is inert until the Phase 7 account screen exists.

### Needs confirmation on a device

Nothing in Phase 3 has run on a phone. Procedure: `mobile/README.md`, "Phase 3 on-device test plan".

- Every screen against the Swift app, side by side, in light and dark.
- The `SCHEDULE_WARNING` flow needs two overlapping tasks on the server to raise a real 409.
- Recurrence: completing a recurring task should make the next occurrence appear after the refetch.
- Pull-to-refresh, keyboard avoidance, and the modal presentations.
