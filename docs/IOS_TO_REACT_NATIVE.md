# iOS (SwiftUI) to React Native (Expo) migration plan

Last updated: 2026-09-17

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

~~This Mac has no full Xcode, so there is no iOS simulator.~~ **Out of date since 2026-09-16:** the
machine used for the `rn-ui-parity` pass has Xcode 26.6 and runs both apps in the iOS Simulator.
Setup, build commands and timings: [`mobile/docs/mac-setup.md`](../mobile/docs/mac-setup.md).

---

## 2. Screen inventory

The Swift app has **32 unique screens and sheets**. Some Swift views open from several places and are counted once.

Suggested Expo Router file paths are shown for each screen.

> **Read the Swift view column literally.** A view's name is NOT its file name. Most of the app lives
> inside four large files — `RootView.swift` alone is 121 KB and holds the auth screens, the tab shell,
> Today, Tasks and the task editor — so `SignInView` is not in `SignInView.swift`, and no such file
> exists. Every location below was verified against `ios/App/` on 2026-09-16; line numbers are the
> `struct` declaration. Phase 3 was planned from view names alone and lost time hunting for files that
> were never there, so locations are now given for every row.

### Auth (signed out): 4
| # | Screen | Swift view | Location | Presentation | Suggested route |
| --- | --- | --- | --- | --- | --- |
| 1 | Sign in (email/password, eye toggle, Sign in with Apple) | `SignInView` | `RootView.swift:258` | Root | `app/(auth)/sign-in.tsx` |
| 2 | Create account | `SignUpView` | `RootView.swift:472` | Sheet | `app/(auth)/sign-up.tsx` |
| 3 | Verify email (6-digit code, resend countdown) | `EmailVerificationView` | `RootView.swift:674` | Push from sign-up, sheet from sign-in | `app/(auth)/verify-email.tsx` |
| 4 | Reset password (request code, then code + new password) | `PasswordResetView` | `RootView.swift:574` | Sheet | `app/(auth)/reset-password.tsx` |

### App shell: 1
| # | Screen | Swift view | Location | Suggested route |
| --- | --- | --- | --- | --- |
| 5 | Tab bar: Today, Tasks, Ask AI, Calendar (Ask AI opens a sheet) | `NexdoTabShell` | `RootView.swift:84` | `app/(tabs)/_layout.tsx` |

The focus session strip (`FocusSessionStrip`, `ios/App/FocusSessionStrip.swift:25`) sits above the tab bar and is a shared component, not a screen.

### Today tab: 9
| # | Screen | Swift view | Location | Presentation |
| --- | --- | --- | --- | --- |
| 6 | Today dashboard (top bar, intelligence card, schedule, action queue) | `TodayView` | `RootView.swift:911` | Tab |
| 7 | Do Now (suggested next task) | `DoNowView` | `DoNowView.swift:3` | Sheet |
| 8 | Action queue: all actions, with snooze menu | `ActionQueueSheet`, `SnoozeMenu` | `TodayActionsView.swift:188`, `:130` | Sheet |
| 9 | Needs attention details | `attentionDetails`, a private var on `TodayView` | `RootView.swift:1202` | Push |
| 10 | Schedule check details | `scheduleCheckDetails`, a private func on `TodayView` | `RootView.swift:1191` (call site), `:1217` | Push |
| 11 | Overdue tasks | `OverdueTasksView` | `OverdueTasksView.swift:3` | Push |
| 12 | Weekly summary | `WeeklySummaryView` | `WeeklySummaryView.swift:4` | Push |
| 13 | Weekly summary task list | `WeeklySummaryTasksView` | `WeeklySummaryView.swift:241` | Push |
| 14 | Weather forecast | `WeatherForecastView` | `WeatherForecastView.swift:3` | Sheet |

### Tasks tab and projects: 8
| # | Screen | Swift view | Location | Presentation |
| --- | --- | --- | --- | --- |
| 15 | Task list (search, date pills, rows) | `TasksView` | `RootView.swift:1620` | Tab |
| 16 | Task filters | an inline `Form` in a `.sheet` on `TasksView` | `RootView.swift:1705-1726` | Sheet |
| 17 | Add task, with date picker | `TaskEditor` (its `creationForm`) | `RootView.swift:1908`, form at `:1932` | Sheet (also opened from Today, Overdue, Projects) |
| 18 | Task details (also the EDIT path) | `TaskDetailsView` | `TaskDetailsView.swift:3` | Sheet — `TaskEditor(task:)` renders it when the task is non-nil (`RootView.swift:1929`) |
| 19 | Voice capture: add task, ask AI, or add calendar event | `AddTaskByVoiceView` (3 modes) | `AddTaskByVoiceView.swift:4` | Full screen |
| 20 | Projects | `ProjectsView` | `ProjectsView.swift:12` | Section inside the Tasks tab, behind a segmented picker (`RootView.swift:1650-1658`) |
| 21 | Project detail | `ProjectDetailView` | `ProjectsView.swift:173` | Push |
| 22 | Create / edit project | `ProjectEditorView` | `ProjectsView.swift:112` | Sheet |

Corrections made during Phase 3, kept here so later phases do not repeat the mistake:

- Screens 15-17 and the filter sheet are all inside `RootView.swift`. There is no `TaskListView.swift`,
  `TaskEditorView.swift` or `TaskFilterSheet.swift`.
- Screen 18 is both the detail AND the edit screen; there is no separate task editor for an existing task.
- Screen 20 is not a route. Tasks and Projects share one screen.

### Ask AI: 2
| # | Screen | Swift view | Location | Presentation |
| --- | --- | --- | --- | --- |
| 23 | Ask Nexdo: suggestions, answers, read aloud; also full-screen text chat | `AskNexdoView` (2 modes), `AskResponseView` | `AskNexdoView.swift:89`, `AskResponseView.swift:4` | Sheet / full screen |
| 24 | AI data-sharing consent | `consentView`, a private var on `AskNexdoView` | `AskNexdoView.swift:361` (presented at `:268`) | Sheet |

Voice conversation reuses screen 19 in ask mode.

### Calendar tab: 4
| # | Screen | Swift view | Location | Presentation |
| --- | --- | --- | --- | --- |
| 25 | Calendar (tasks and synced events) | `CalendarView` | `CalendarView.swift:3` | Tab |
| 26 | Event details | an inline `.sheet(item: $eventDetail)` on `CalendarView` | `CalendarView.swift:164` | Sheet |
| 27 | Add calendar event | `CalendarEventEditor` | `CalendarView.swift:503` | Sheet |
| 28 | Schedule conflicts | `conflictSheet`, a private var on `CalendarView` | `CalendarView.swift:459` (presented at `:163`) | Sheet |

`CalendarEventEditor` is inside `CalendarView.swift`; there is no `CalendarEventEditor.swift`.

Calendar also opens Ask (screen 23), voice in calendar mode (screen 19), and task details (screen 18).

### Account: 2
| # | Screen | Swift view | Location | Presentation |
| --- | --- | --- | --- | --- |
| 29 | Account (profile, menu, sign out) | `AccountView` | `ProfileView.swift:60` | Sheet from the avatar |
| 30 | Profile and settings (photo, preferences, Connect Google Calendar, Synchronize now, web links, delete account) | `ProfileSettingsView` | `ProfileView.swift:126` | Push |

Both live in `ProfileView.swift`. There is no `AccountView.swift` or `ProfileSettingsView.swift`.

### Reminders: 2
| # | Screen | Swift view | Location | Presentation |
| --- | --- | --- | --- | --- |
| 31 | Task action (action card, clarify card), opened from a reminder notification | `TaskActionView`, `TaskActionCard`, `ClarifyTaskActionCard` | `TaskActionView.swift:101`, `:4`, `:42` | Sheet |
| 32 | Message / email composer | `ActionMessageComposer`, `ActionEmailComposer` | `TaskActionComposers.swift:22`, `:42` | Sheet (`UIViewControllerRepresentable` wrappers around MFMessageComposeViewController / MFMailComposeViewController) |

`TaskActionComposers` is a FILE, not a view: it holds the two composer wrappers above plus
`ActionEmailDraft` (`:5`) and `NativeTaskActionEmailService` (`:15`). Supporting logic for screen 31 is
split across `TaskActionCoordinator.swift`, `TaskActionContacts.swift` and `TaskActionNotifications.swift`.

### Not migrating
- `VoiceInputView` (`VoiceInputView.swift:4`) and `VoiceCapture` (`VoiceCapture.swift:6`): defined,
  but nothing opens them. Re-verified in Phase 10 with a call-site search over all of `ios/`; the
  evidence is in section 20. `/api/realtime/transcription-session` and `RealtimeTaskAudio.swift` serve
  only `VoiceInputView`, so they are unreachable too.
- Debug-only previews: `TodayDesignPreview` (`RootView.swift:184`), `CalendarDesignPreview` (`:167`),
  `ProjectsDesignPreview` (`:161`), `TaskDesignPreview` (`:211`), `WeeklySummaryPreview` (`:155`), and
  the `-email-verification-preview` launch argument.

---

## 3. Shared components

Every location verified against `ios/App/` on 2026-09-16. Note how many live in `RootView.swift`.

| Group | Swift view | Location |
| --- | --- | --- |
| Tasks | `TaskRow` | `RootView.swift:1548` |
| Tasks | `TaskListRow` | `ProjectsView.swift:316` |
| Tasks | `TaskBadge` | `RootView.swift:2123` |
| Tasks | `TaskCategoryBadge` | `TaskCategoryBadge.swift:4` |
| Tasks | `TaskMetric` | `RootView.swift:2175` |
| Tasks | `TasksHero` | `RootView.swift:2138` |
| Tasks | `TaskEditorLabel` | `RootView.swift:2207` |
| Tasks | `DetailInput` | `TaskDetailsView.swift:288` |
| Today and calendar | `EventRow` | `RootView.swift:2243` |
| Today and calendar | `TodayScheduleRow` | `RootView.swift:1507` |
| Today and calendar | `TodayTopBar` | `RootView.swift:1283` |
| Today and calendar | `TodayHeaderButton` | `RootView.swift:1343` |
| Today and calendar | `TodayIntelligenceCard` | `RootView.swift:1358` |
| Today and calendar | `NextActionRow` | `TodayActionsView.swift:165` |
| Today and calendar | `ActionNeededCard` | `TodayActionsView.swift:56` |
| Today and calendar | `FocusSessionStrip` | `FocusSessionStrip.swift:25` |
| Projects | `ProjectCard` | `ProjectsView.swift:76` |
| Projects | `ProjectFolder` | `ProjectsView.swift:90` |
| Projects | `ProjectSearchField` | `ProjectsView.swift:100` |
| Projects | `ProjectAssignmentField` | `ProjectsView.swift:295` |
| Weekly summary | `MetricCard` | `WeeklySummaryView.swift:231` |
| Weekly summary | `CompletionMetricCard` | `WeeklySummaryView.swift:336` |
| Profile | `ProfileAvatar` | `ProfileView.swift:39` |
| Auth | `RevealablePasswordField` | `RootView.swift:642` |
| Auth | `SignInFieldIcon` | `RootView.swift:821` |
| Auth | `NexdoLogoMark` | `RootView.swift:857` |
| Backgrounds and effects | `SignInBackdrop` | `RootView.swift:833` |
| Backgrounds and effects | `TodayBackdrop` | `RootView.swift:1534` |
| Backgrounds and effects | `NexdoTaskBackdrop` | `RootView.swift:2231` |
| Backgrounds and effects | `ProfileBackground` | `ProfileView.swift:116` |
| Backgrounds and effects | `WeeklySummaryBackdrop` | `WeeklySummaryView.swift:341` |
| Backgrounds and effects | `ActionGlass` | `TodayActionsView.swift:48` |
| Backgrounds and effects | `FocusButtonBorder` | `TaskDetailsView.swift:323` |
| Backgrounds and effects | `NexdoAISuggestionCard` | `AskNexdoView.swift:58` |

Style enums, which carry the colours and button styles rather than any view:

| Enum / style | Location |
| --- | --- |
| `NexdoTheme` (the brand gradients) | `RootView.swift:2118` |
| `TaskCreationStyle` (editor card, input, border, accent, selected gradient) | `RootView.swift:2191` |
| `TaskDurationButtonStyle` | `RootView.swift:2218` |
| `ProjectStyle` (project accent, surface, hex parsing) | `ProjectsView.swift:3` |
| `DetailOutlineButton` | `TaskDetailsView.swift:297` |
| `AppAppearance` | `AppAppearance.swift:3` |

Brand colors are declared in `extension Color` at `RootView.swift:884-892`: `nexdoBlue`, `nexdoIndigo`,
`nexdoPurple`, `nexdoMagenta`, plus light/dark `nexdoInk`, `nexdoSecondary`, `nexdoScheduleBlue`. They
are already ported to `mobile/src/theme/colors.ts`.

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

Every file above was verified to exist in `ios/Sources/NexdoCore/` on 2026-09-16. Unlike sections 2
and 3, this table names real files. Two it does not list, both present: `TaskCategoryAppearance.swift`
is covered, but `Models.swift` also carries `ServerDate` (ISO-8601 parsing, account-zone days, and the
multi-day event rule) and `ProfileName`, and `CalendarDates.swift` carries `CalendarSearch.matches`,
the case- and diacritic-insensitive search used by projects and the calendar.

### `AppModel` (`ios/App/NexdoApp.swift`)

App-wide state and actions, in one 46 KB file. Recreate as TanStack Query hooks plus a small store.
Locations verified during Phase 3:

| Concern | Location |
| --- | --- |
| Auth: login, register, verify, resend, password reset, Apple | `NexdoApp.swift:156-216` |
| `scheduleRequest` — the `SCHEDULE_WARNING` retry | `NexdoApp.swift:73-85` |
| `confirmScheduleWarnings` — the alert it presents | `NexdoApp.swift:87-98` |
| `load` / `loadTasks` with the `taskRevision` stale guard | `NexdoApp.swift:309-338` |
| `refreshTasks` | `NexdoApp.swift:340-345` |
| `saveTask` | `NexdoApp.swift:495-506` |
| `complete` | `NexdoApp.swift:518-527` |
| `replaceTask` — relation preservation and the revision bump | `NexdoApp.swift:537-558` |
| `saveTaskDetails` — the details/schedule two-body split | `NexdoApp.swift:558-586` |
| `changeTaskStatus` — including recurrence refetch | `NexdoApp.swift:588-600` |
| `taskRevision` itself | `NexdoApp.swift:135` |



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
| ~~No Xcode on this Mac~~ | Resolved 2026-09-16 | Xcode 26.6 is installed; both apps run in the iOS Simulator |
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
- [x] Expo project in `mobile/` with EAS development build: *Android development build made and run.
  iOS development build now made **locally** with `npx expo run:ios` — no EAS and no Apple account
  needed for the simulator; about 16 minutes the first time. See
  [`mobile/docs/mac-setup.md`](../mobile/docs/mac-setup.md).*
- [x] API client and cookie session verified on a device: *verified on Android (Expo Go, 2026-09-15).
  On iOS (simulator, 2026-09-16) the launch `GET /api/me` reaches the production API and the app
  lands on sign-in signed out, across a force-quit. The signed-in half of the check is still open:
  it needs a verified account's credentials, which were not available.*
- [x] Theme and shared components
- [x] Auth screens: sign-in, sign-up, verify-email, reset-password, the session gate and sign-out
  (Phase 2, 2026-09-16). Built and covered by tests; **run and checked against the Swift app in the
  iOS simulator** (iPhone 17 Pro, iOS 26.5) in the `rn-ui-parity` pass, 2026-09-16 — see
  [`mobile/docs/reference/PARITY.md`](../mobile/docs/reference/PARITY.md). Android was checked on a
  physical device in the same pass.
- [x] Sign in with Apple **renders**: the black "Continue with Apple" button appears on sign-in in a
  local development build (iOS simulator, 2026-09-16). Completing the flow is still untested — it
  needs a real Apple ID and the capability on the `com.pinslots.nexdo` App ID.
- [x] Task list, filters, search, creation editor, task detail, voice-capture shell
  (Phase 3, 2026-09-16). Built and covered by tests; **not yet tested on a device**.
- [x] Projects: list, detail, create/edit/delete (Phase 3).
- [x] Today dashboard, Do Now and the focus runtime (Phase 4A, 2026-09-16): screens 6 and 7 of
  section 2, built from `TodayView.body` (`RootView.swift:1017-1198`) and `DoNowView.body`
  (`DoNowView.swift:15-107`). Covered by tests; **not yet tested on a device**.
- [x] Today screens 9-14 (Phase 4B, 2026-09-16): needs-attention, schedule check, overdue, weekly
  summary, weekly summary tasks, weather forecast. Covered by tests; **not yet tested on a device**.
- [ ] Today screen 8, the action queue: **blocked on Phase 8.** Its logic (`TodayActionQueue`) is
  ported and tested, but every action comes from `TaskActionCoordinator`, which needs local
  notifications and Contacts. See section 14.
- [x] Calendar screens 25-28 (Phase 5, 2026-09-16): the Calendar tab, the event detail sheet, the
  event editor and the schedule-review sheet. Covered by tests; **not yet tested on a device**.
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

### Correction: the task detail screen was rebuilt (2026-09-16)

The first port of `mobile/app/task/[id].tsx` did not resemble `TaskDetailsView` at all. It showed an
ENERGY section, a plain Critical switch, priority and repeat as pill groups and notes at the top, and
it omitted the action card, PROJECT, SCHEDULE and the reminders checkbox.

**Root cause: it was built from the MODEL, not the VIEW.** `TaskDraft`
(`ios/Sources/NexdoCore/TaskDraft.swift`) carries `energy` and `splittable`, so an ENERGY control was
invented for them; the view never exposes either. The rest of the screen was assembled from a grep of
`TaskDetailsView.swift`'s `private var` names rather than from its `body`, so the composition (which
sections exist, in what order, and which come from other files) was guessed. `TaskDraft` is the edit
buffer; it is not the field list.

The screen has now been rebuilt element by element from the view body (`TaskDetailsView.swift:28-90`).
The order is: header, `TaskActionCard`, `actions`, TASK, `metadata` (PRIORITY and ESTIMATE side by
side), PROJECT, `schedule`, REPEAT, the "Important reminders / Use escalation channels" checkbox,
STEPS, NOTES, then the footer bar with "Mark complete" and "Save changes".

**Lesson for later phases: read the `body`.** A SwiftUI view's composition cannot be inferred from its
state, its helpers' names, or the model it edits. Two of this screen's sections come from other files
entirely (`TaskActionCard` from `TaskActionView.swift`, `ProjectAssignmentField` from
`ProjectsView.swift`), which a grep of the screen's own file will never reveal.

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
| `src/components/ProjectsList.tsx` | `ProjectsView` (`ProjectsView.swift:12-75`) |
| `src/components/ProjectParts.tsx` | `ProjectStyle`, `ProjectCard`, `ProjectFolder`, `ProjectSearchField`, `TaskListRow` (`ProjectsView.swift:3-111, 316-335`) |
| `src/components/ProjectEditorForm.tsx` | `ProjectEditorView` (`ProjectsView.swift:112-171`) |
| `src/components/ProjectAssignmentField.tsx` | `ProjectAssignmentField` (`ProjectsView.swift:295-315`) |
| `src/components/MonthCalendar.tsx` | the graphical `DatePicker` sheet (`RootView.swift:2038-2049`) |
| `mobile/app/project/[id]/index.tsx` | `ProjectDetailView` (`ProjectsView.swift:173-294`) |
| `mobile/app/project/new.tsx`, `mobile/app/project/[id]/edit.tsx` | `ProjectEditorView`, presented as a sheet |
| `src/lib/projectQuery.ts` | `ProjectQuery` (`Projects.swift:20-41`) and `ProjectStyle.color` |
| `src/store/focus.ts` | `AppModel.startFocus` / `changeTaskStatus` — STUB, Phase 4 replaces it |
| `src/components/TaskDetailParts.tsx` | `field`, `sectionLabel`, `menu`, `menuLabel`, `DetailInput`, `DetailOutlineButton`, `DetailCheckboxStyle` (`TaskDetailsView.swift:266-295, 297-321, 343-353`) |
| `src/components/ClarifyTaskActionCard.tsx` | `TaskActionCard` and `ClarifyTaskActionCard` (`TaskActionView.swift:4-100`) |
| `src/lib/taskClarification.ts` | `TaskActionClarification` and the detection half of `DeterministicTaskActionDetector` (`TaskActionDetector.swift:4-33, 67-87`) |

### NOT built in Phase 3

- **Voice transcription.** The capture screen runs on a `__DEV__`-only stub
  (`src/voice/taskCaptureStub.ts`) that yields a fixed transcript. Phase 9 replaces it.
- **The focus runtime.** The two `actions` buttons render with Swift's copy, placement and enabled
  rules but are wired to `src/store/focus.ts`, a stub that records the intent and no-ops. Phase 4
  replaces it with the real POST, `focusToken`, countdown and `FocusSessionStrip`.
- **`FocusSessionStrip`** (`ios/App/FocusSessionStrip.swift:25`), which Swift swaps in for the focus
  button while a session is live (`TaskDetailsView.swift:116-117`). Phase 4.
- **`TaskActionCoordinator`** (`ios/App/TaskActionCoordinator.swift`). `TaskActionCard` has two
  branches: a "Nexdo Action: contact X" card when the coordinator holds a scheduled reminder action,
  and the clarify card otherwise (`TaskActionView.swift:10-38`). The coordinator is reminders work, so
  only the SECOND branch is ported and the first never shows. Phase 8.
- **The "Contact someone" follow-through.** The card builds and saves the "Call <name>" title, but
  Swift then calls `coordinator.synchronize` and opens the action sheet
  (`TaskActionView.swift:92-95`). Phase 8.
- **`DeterministicTaskActionDetector.parseTime`** (`TaskActionDetector.swift:35-65`). Only the
  detection half is ported, which is all `isCandidate` needs. Phase 8 needs the rest, and the task
  CREATION form uses it too: Swift shows a "Nexdo Action: contact X. Schedule: ..." line under the
  date buttons and lets a detected time override the chosen date (`RootView.swift:1981-1984`,
  `:2082-2085`). That line is NOT in the React Native creation form. See the re-check below.

### Visual gaps

- `TaskCategoryBadge` draws no artwork. Swift hand-draws twelve bespoke vector illustrations
  (`TaskCategoryBadge.swift:33+`); this renders the capsule, gradient and label with a coloured dot.
- `.blur(radius:)` on the backdrop circles is not reproduced, because React Native cannot blur a
  view's own content and `expo-blur` blurs what is behind a view. The circles are hard-edged.
- `.ultraThinMaterial` on cards is a flat translucent fill, as in Phase 2.
- SF Rounded (`design: .rounded`) has no bundled equivalent, so "Nexdo" in the top bar and the large
  titles use the system face.
- SF Symbols are substituted with Ionicons; the mapping is in `src/components/TaskSymbol.tsx`.
- Sheet detents (`.presentationDetents([.medium, .large])`) have no Expo Router equivalent on Android,
  so those sheets are full modals.
- `TaskCard` does not switch to the accessibility-size layout that moves the category badge below the
  text (`RootView.swift:1866-1871`).
- The segmented control is a hand-built pair of pills, not a native `UISegmentedControl`.
- The task editor has no keyboard toolbar, so SwiftUI's keyboard "Done" button is absent.
- **New in the projects pass.** SwiftUI `Menu` has no React Native equivalent, so the four menus in the
  projects screens — sort, project assignment, the project-detail filters and its `ellipsis.circle`
  actions — open as inline lists under their button rather than as floating popovers.
- **New.** The date picker is a hand-built month grid, not the system `DatePicker(.graphical)`; see the
  decision note below.
- **New.** `ProjectFolder` approximates SwiftUI's `color.gradient` (a colour shaded into itself) with an
  explicit light-to-dark ramp.
- **New.** `ProjectCard`'s progress bar is a plain two-view track, not a `ProgressView`.
- **New.** The projects grid approximates `LazyVGrid`'s adaptive columns with flex-wrap and a
  `minWidth`, rather than Swift's explicit `geometry.size.width < 340` switch.
- **New in the detail rebuild.** `FocusButtonBorder` (`TaskDetailsView.swift:323-341`), the animated
  angular-gradient border on the focus button, is not reproduced; the button takes the plain outline.
- **New.** The schedule row's two compact `DatePicker`s are chips that open a month grid and a
  half-hour time list, rather than iOS wheel pickers.
- **New.** The estimate menu's `ControlGroup { Less / More }` is two full-width rows under the options
  instead of a segmented control.
- **New.** `DetailCheckbox` uses an Ionicons checkbox glyph rather than SF Symbols'
  `checkmark.square.fill` / `square`.
- **New.** The `ScrollViewReader` that scrolls a focused field to centre
  (`TaskDetailsView.swift:66-68`) is not reproduced.

### Open TODO(phase3-decision) markers

- `src/components/TaskCategoryBadge.tsx`: whether to add `react-native-svg` for the category artwork.
- `src/components/MonthCalendar.tsx`: whether to adopt `@react-native-community/datetimepicker`.
  Swift DOES use the system picker (`DatePicker` + `.datePickerStyle(.graphical)`), so the native
  dependency would be permitted — but it would force a new development build, AND its Android
  presentation is a modal dialog rather than the inline month grid `.graphical` draws, so it would be
  both costlier and less faithful than the hand-built grid. Revisit once there is an iOS build.
- `src/components/TodayShell.tsx`: the profile photo (Phase 7) and the weather / add buttons (Phase 4).

### Other open TODOs

- `TODO(phase4)` in `src/store/focus.ts` and `mobile/app/task/[id].tsx`: the real focus runtime.
- `TODO(phase7)` in `mobile/app/(tabs)/tasks.tsx`: the account button is a deliberate no-op until the
  Phase 7 account screen exists, rather than a route to a path that would render the not-found screen.
- `TODO(phase9)` in `src/voice/taskCaptureStub.ts`: the real transcription session.

### Creation form re-check (2026-09-16)

Re-verified `mobile/app/task/new.tsx` against `TaskEditor.creationForm` (`RootView.swift:1932-2050`):

- **The NOTES row must NOT navigate.** It is a `DisclosureGroup` (`RootView.swift:1954-1975`) that
  expands in place; there is no notes screen. The React Native row already expanded in place, but its
  collapsed chevron pointed right, which reads as a push. It now rotates: right when collapsed, down
  when expanded, matching the disclosure control.
- **The custom estimate stepper matches**: `Stepper(value:in:step:)` over 5...480 in steps of 5,
  labelled "Custom estimate" and "N min". The React Native control clamps to the same bounds with the
  same step and the same two labels. It draws as two separate buttons rather than one segmented
  stepper, a minor difference already covered by the gaps list.
- **One real gap found**: Swift shows "Nexdo Action: contact X. Schedule: ..." under the date buttons
  when the title parses as a contact action, and lets that detected time override the chosen date
  unless a date was picked explicitly. Neither is ported, because both need `parseTime`. Listed under
  "NOT built" above.

### Needs confirmation on a device

Nothing in Phase 3 has run on a phone. Procedure: `mobile/README.md`, "Phase 3 on-device test plan".

- Every screen against the Swift app, side by side, in light and dark.
- The `SCHEDULE_WARNING` flow needs two overlapping tasks on the server to raise a real 409.
- Recurrence: completing a recurring task should make the next occurrence appear after the refetch.
- Pull-to-refresh, keyboard avoidance, and the modal presentations.
- Projects: create, edit, delete, the colour grid, the "No project" folder and per-project filters.
- The date picker's month grid, including stepping across a month boundary.
- The rebuilt task detail, section by section, against the iPhone: this is the screen that was wrong.

---

## 13. Phase 4A status (Today dashboard, Do Now, focus runtime)

### Built, with the `body` range each screen was read from

| Screen / module | Swift source | `body` range |
| --- | --- | --- |
| `mobile/app/(tabs)/today.tsx` | `TodayView` (`RootView.swift:911`) | `:1017-1198` |
| `mobile/app/today/do-now.tsx` | `DoNowView` (`DoNowView.swift:3`) | `:15-107` |
| `src/components/TodayIntelligenceCard.tsx` | `TodayIntelligenceCard`, `TodayScheduleRow` | `RootView.swift:1358-1506`, `:1507-1533` |
| `src/components/FocusSessionStrip.tsx` | `FocusSessionStrip` | `FocusSessionStrip.swift:25-56` |
| `src/components/TodayShell.tsx` | `TodayTopBar`, `TodayHeaderButton`, the weather chip | `RootView.swift:1283-1341`, `:1343-1356` |
| `src/store/focus.ts` | `AppModel.startFocus` / `finishFocus`, `NativeFocusSession` | `NexdoApp.swift:611-665`, `FocusSessionStrip.swift:3-10` |
| `src/lib/todaySchedule.ts` | `TodayView`'s private helpers | `RootView.swift:930-1015` |
| `src/lib/focusClock.ts` | `FocusClock`, `DurationDisplay` | `FocusClock.swift`, `DoNowRecommendation.swift:52-61` |
| `src/lib/weather.ts` | `conditionSymbol`, `condition` | `Models.swift:81-93`, `:128-140` |
| `src/query/useToday.ts` | `refreshAgenda`, `refreshWeather`, `recommendDoNow` | `NexdoApp.swift:368-371`, `:419-422`, `:603-609` |

Child view files followed while reading `TodayView.body`: `RootView.swift` itself (`TodayBackdrop`,
`TodayTopBar`, `TodayIntelligenceCard`, `TodayScheduleRow`), `ios/App/DoNowView.swift`,
`ios/App/FocusSessionStrip.swift`, `ios/App/TodayActionsView.swift` (read, deferred to 4B),
`ios/Sources/NexdoCore/TodayActionQueue.swift` (read, deferred), `ios/Sources/NexdoCore/FocusClock.swift`,
`ios/Sources/NexdoCore/DoNowRecommendation.swift`, `ios/Sources/NexdoCore/WeatherClient.swift`,
`ios/Sources/NexdoCore/Models.swift`.

### Where the brief and Swift disagree

| The brief says | Swift actually does |
| --- | --- |
| Port the Do Now recommendation engine from `NexdoCore`, with energy / working-hours / quiet-hours inputs | There is no engine. `DoNowRecommendation.swift` declares only `Decodable` response types plus `DurationDisplay`; the ranking is server-side, reached by asking `/api/assistant` a question in prose (`NexdoApp.swift:603-609`) |
| Focus `start/tick/pause/finish/cancel` | There is no pause and no cancel. `FocusSessionStrip`'s one button reads "End focus", or "Finish" at zero, and calls `finishFocus()` either way |
| Check whether focus persists to UserDefaults | It does not. `focusSession` is a plain `@Published` property (`NexdoApp.swift:121`); the only `UserDefaults` key in the model is `nexdo.lastSignedInFirstName`. A session does not survive a relaunch |
| Weather via `expo-location` if Swift asks for location | Swift never asks. `WeatherClient.forecast()` calls open-meteo directly with HARDCODED coordinates 37.7547, -121.8997 (San Ramon, California) over a cookie-free session, so no permission and no new dependency |
| Focus completion "marks task done? logs a session? both?" | Neither marks the task done. Finishing only closes the work session; the task stays IN_PROGRESS. The reverse is true though: completing a task ENDS its session first (`NexdoApp.swift:592`) |

### Deferred to Phase 4B, in `body` order

Sections 6, 7, 8 and 10 of `TodayView.body`, each marked in place in `today.tsx`:

- `TodayActionsView` (`RootView.swift:1092`) — needs `TaskActionCoordinator`, which is Phase 8, and
  `TodayActionQueue` from `NexdoCore`.
- The protected-time proposal (`:1094-1108`) — needs `model.protectedTime` and `/api/protected-time`.
- The persistent next-action card (`:1110-1128`) — needs `model.persistentNext` and
  `startRecommendedFocus` from the next-action service.
- The "Needs your attention" list (`:1145-1166`) — needs `scheduleIntelligence.today.attention`.

Also 4B: the `queue.hasImmediateActions` branch of the Weekly Summary row (`:1070-1075`), the weather
forecast sheet, and the four navigation destinations (`attentionDetails`, `scheduleCheckDetails`,
`OverdueTasksView`, `WeeklySummaryView`).

### Visual gaps

- `TimelineView(.periodic(by: 60))` wraps the whole dashboard in Swift, recomputing the action queue
  every minute. With the queue deferred, nothing here needs a minute tick, so there is none.
- The focus strip's `.regularMaterial` is a flat surface fill, as elsewhere.
- SF Rounded is still unavailable, so the greeting and the commitment headline use the system face.
- The range picker is a hand-built segmented row, not a `Picker`.
- The weather chip's condition glyph is an Ionicons substitute for each SF Symbol; the mapping is in
  `src/lib/weather.ts` and `src/components/TaskSymbol.tsx`.
- `FocusButtonBorder`, the animated gradient border on the focus button, is still not reproduced.

### Open TODOs

- `TODO(phase4b)` in `app/(tabs)/today.tsx`: the four deferred sections, the weather forecast sheet,
  the Weekly Summary destination and `attentionDetails`.
- `TODO(phase7)` in `app/(tabs)/today.tsx` and `src/components/TodayShell.tsx`: the account sheet and
  the profile photo.
- `TODO(phase7)` in `src/query/useToday.ts`: the hardcoded weather coordinates, if the account ever
  gains a location preference.
- `TODO(phase8)` in `src/components/ClarifyTaskActionCard.tsx`: `TaskActionCoordinator`.
- `TODO(phase9)` in `src/voice/taskCaptureStub.ts`: the real transcription session.

### Needs confirmation on a device

Nothing in Phase 4A has run on a phone. Procedure: `mobile/README.md`, "Phase 4A on-device test plan".

- The focus timer across backgrounding, and its auto-finish at zero.
- That a force-quit loses the session, which is correct rather than a defect.
- Do Now against a real assistant turn: the 60-second refresh, the minutes override, and starting a
  recommended session.
- The weather chip, including the offline dash, and that the reading is San Ramon rather than local.
- Every screen against the iPhone in light and dark.

---

## 14. Phase 4B status (the remaining Today screens)

### Built, with the `body` range each screen was read from

| Screen | Swift source | `body` range | Child view files followed |
| --- | --- | --- | --- |
| `app/today/overdue.tsx` | `OverdueTasksView` | `OverdueTasksView.swift:15-69` | none; rows are inline |
| `app/today/weather.tsx` | `WeatherForecastView` | `WeatherForecastView.swift:11-72` | none; `temperatures`/`dateLabel` are private funcs, glyphs from `Models.swift:81-140` |
| `app/today/weekly-summary.tsx` | `WeeklySummaryView` | `:24-42` plus `content` at `:44-73` | `MetricCard` (`:231`), `CompletionMetricCard` (`:336`), `WeeklySummaryBackdrop` (`:341`), all private structs in the same file |
| `app/today/weekly-tasks.tsx` | `WeeklySummaryTasksView` | `WeeklySummaryView.swift:264-315` | `TaskListRow` (`ProjectsView.swift:316`), already ported in Phase 3 |
| `app/today/attention.tsx` | `attentionDetails` | `RootView.swift:1202-1231` | `attentionCard` (`RootView.swift:1261`) |
| `app/today/schedule-check.tsx` | `scheduleCheckDetails` | `RootView.swift:1233-1259` | none |
| Today sections 9-10 | `TodayView.body` | `RootView.swift:1130-1166` | `attentionCard` |

Logic ported with tests: `WeeklySummaryDates` and the label helpers (`src/lib/weeklySummary.ts`),
`OverdueTasks` (`src/lib/overdueTasks.ts`), the `WeatherResponse` day helpers (`src/lib/weather.ts`),
and `TodayActionQueue` (`src/lib/todayActionQueue.ts`).

### Screen 8, the action queue: NOT built, and why

`TodayActionsView` (`ios/App/TodayActionsView.swift:16-46`) renders NOTHING when the queue is empty —
both of its branches are conditional on `queue.primaryAction` or `queue.nextActions`. Every action in
that queue comes from `TaskActionCoordinator` (`ios/App/TaskActionCoordinator.swift:20`), which:

- persists actions to a JSON file in Application Support,
- schedules reminders through `UNUserNotificationCenter`,
- resolves people through the `Contacts` framework,
- and drives `TaskActionView`, the composers, and `SnoozeMenu.snooze`.

In React Native that is `expo-notifications` and `expo-contacts`, both native, both forcing a new
development build, and both listed under **Phase 8** in section 6. Building the queue's UI now would
add a screen that can never display anything and cannot be tested against real data.

So: the QUEUE LOGIC is ported and fully tested (`src/lib/todayActionQueue.ts`, 15 cases covering the
window, the ordering, deferral past midnight and the one-action-per-task rule), ready for Phase 8 to
supply actions. The UI — `ActionNeededCard`, `NextActionRow`, `ActionQueueSheet`, `SnoozeMenu` — is
not. **Phase 4 therefore covers 8 of the 9 Today screens.**

### Also still deferred, and why

- The protected-time proposal (`RootView.swift:1094-1108`) needs `model.protectedTime` and
  `/api/protected-time`, which no phase has claimed yet.
- The persistent next-action card (`:1110-1128`) needs `model.persistentNext` and the next-action
  service behind `/api/schedule-intelligence`'s dismiss operation.
- The `queue.hasImmediateActions` branch of the Weekly Summary row (`:1070-1075`) is a function of the
  action queue, so it follows Phase 8.
- "Plan next week with Nexdo AI" routes to `/ask`, which is Phase 6; the route does not exist yet.

### Visual gaps added in 4B

- **Swift Charts has no React Native equivalent.** The planned-vs-completed chart is a hand-built
  grouped bar chart with the same data and the same two colours, but without the axis marks, the
  legend or the 220pt chart chrome. No charting dependency was added.
- `CompletionMetricCard`'s trimmed circle is a horizontal bar.
- `ShareLink` becomes React Native's `Share` API, and sits as a button rather than a toolbar item.
- The weekly summary's `.regularMaterial` cards are flat surface fills.
- `Picker(.menu)` on the weekly task filter is an inline list, as elsewhere.
- The attention list uses the same inline-list substitution for its rows rather than a `List`.

### Open TODOs after 4B

- `TODO(phase4b-decision)` in `src/query/useToday.ts`: port `WeeklySummary.taskGroups(from:)` only if
  a deployment is found that does not embed `taskGroups`.
- `TODO(phase7)` in `app/(tabs)/today.tsx`, `src/components/TodayShell.tsx`, `src/query/useToday.ts`.
- `TODO(phase8)` in `src/components/ClarifyTaskActionCard.tsx` and, by implication, the whole action
  queue described above.
- `TODO(phase9)` in `src/voice/taskCaptureStub.ts`.

### Needs confirmation on a device

Nothing in Phase 4B has run on a phone. Procedure: `mobile/README.md`, "Phase 4B on-device test plan".

- The overdue list's one-minute recomputation.
- The weekly summary against real data, including week navigation and a week with no activity.
- That the forecast's "Today" row is today in AMERICA/LOS_ANGELES, not locally.
- The attention list and schedule check against a real schedule-intelligence snapshot, which is hard
  to provoke deliberately.

---

## 15. Phase 5 status (Calendar tab)

### Built, with the `body` range each screen was read from

| # | Screen | Swift source | `body` range | Child view files followed |
| --- | --- | --- | --- | --- |
| 25 | `app/(tabs)/calendar.tsx` | `CalendarView` | `CalendarView.swift:72-176` | `TodayBackdrop` (`RootView.swift:1534`), `TaskDetailsView` (Phase 3), `CalendarEventEditor` (`CalendarView.swift:503`), `AddTaskByVoiceView` (Phase 3 shell), `AskNexdoView` (Phase 6) |
| 26 | The event detail sheet, inside `calendar.tsx` | an inline `.sheet(item: $eventDetail)` on `CalendarView` | `CalendarView.swift:168-180` | none |
| 27 | `app/calendar/event/new.tsx` | `CalendarEventEditor` | `CalendarView.swift:518-588` | `NexdoTaskBackdrop` and `TaskEditorLabel` (`RootView.swift:2231`, `:2207`) |
| 28 | The schedule-review sheet | `conflictSheet`, a private var on `CalendarView` | `CalendarView.swift:459-478` | `attentionCard`, reused from Phase 4B via `/today/attention` |

Logic ported with tests (`src/lib/calendarDates.ts`, `src/lib/calendarRows.ts`): `CalendarDates`
(`key`, `addingDays`, `week`, `month`, `taskOccurs`), `CalendarSearch`, `CalendarEventFilter`,
`visibleDays`, `shift`, `overdue`, `scheduled`, and the `rows(_:)` merge.

### Where the brief and Swift disagree

| The brief says | Swift actually does |
| --- | --- |
| A month grid, a week strip and a day agenda | THREE modes: Schedule, Week and Month. Schedule shows a rolling range (Next 3 days / Next 7 days / This week); Week and Month show a date grid with one selected day beneath it (`CalendarView.swift:4-5, 32-41`) |
| An event detail route | An inline `.sheet(item:)` on the tab, with four lines and a Done button (`:168-180`). The plan doc already said so |
| An event editor with edit and delete | `CalendarEventEditor` is CREATE-ONLY. Both call sites construct it with no arguments (`CalendarView.swift:162`, `RootView.swift:14`); there is no update or delete path anywhere in the app |
| Editor fields including all-day, attendees, calendar/account selection | Title, start, end, repeat (frequency, weekday grid, until), location, notes. None of the other three exist |
| "Connect Google Calendar" and "Synchronize now" in the Calendar tab | Neither is in `CalendarView`. Both live in `ProfileSettingsView`'s "Calendars and privacy" card (`ProfileView.swift:223-234`), which is screen 30 — **Phase 7** |
| Outlook | Not exposed anywhere in the Swift UI. Skipped, as the brief allows |

Because connect and sync are Phase 7, **`expo-web-browser` was not added and no rebuild is needed.**
The two pure helpers ARE built and tested here so Phase 7 only has to wire them:
`googleConnectStartUrl` reproduces Swift's URL including `?native=1`, and `parseGoogleCallback`
reproduces its success and failure rules.

### The completed-calendar view

Commit `ba66449` ("Fix task scrolling and filters and add completed calendar view") added the
`completedOnly` filter and `CalendarEventFilter`. It is ported: the filter flips the heading from
"Upcoming" to "Completed", switches `taskOccurs` to completed tasks, and shows only events whose END
time has passed — "Events have no completion flag: their exclusive end time determines completion"
(`CalendarDates.swift:43`). Turning it on also clears "Critical only", as Swift does.

### Visual gaps

- SwiftUI `Menu` still has no React Native equivalent, so the range menu, the filters menu and the
  repeat picker open as inline lists rather than floating popovers.
- The editor's three `DatePicker`s become a month grid plus a half-hour time strip in a sheet, for the
  same reason `MonthCalendar` exists — no native date picker was added.
- `.ultraThinMaterial` and `.regularMaterial` remain flat surface fills.
- The Schedule/Week/Month segments are hand-built, not a `Picker`.
- `TodayBackdrop`'s blurred circles are still hard-edged.
- The timeline rail is a plain view rather than SwiftUI's `ZStack` overlay, so its connector does not
  extend between rows the way Swift's does.
- SF Symbols are Ionicons substitutes; the mapping is in `src/components/TaskSymbol.tsx`.

### Open TODOs

- `TODO(server-connect-token)` in `src/query/useCalendar.ts`: the one line to change when the server
  accepts a short-lived connect token. The connect flow is broken against production today, for the
  Swift app as much as this one.
- `TODO(phase6)` in `app/(tabs)/calendar.tsx`: `conflictSheet` links into Ask, and the Ask prompt the
  calendar builds (`CalendarView.swift:157-160`) belongs to Phase 6. "Review conflicts" currently
  opens the Phase 4B attention screen, which shows the same schedule-intelligence items.
- `TODO(phase6)` in `app/(tabs)/_layout.tsx`: the other three tab icons.
- `TODO(phase7)` in `src/query/useCalendar.ts`: connect and sync, with the note that
  `expo-web-browser` is native and will force a rebuild when it is added.
- `TODO(phase9)` in `app/(tabs)/calendar.tsx`: `AddTaskByVoiceView(calendarOnly: true)`; the voice
  shell has no calendar mode yet.

### Needs confirmation on a device

Nothing in Phase 5 has run on a phone. Procedure: `mobile/README.md`, "Phase 5 on-device test plan".

- The three modes against the iPhone, including the Monday-first week and Sunday-first month.
- The schedule-warning flow on an event, which needs a real overlapping commitment.
- A multi-day and an all-day event, which need real synced calendar data.
- The completed filter, which needs finished tasks and past events.

## 16. Phase 6 status (Ask AI, text)

### Built, with the `body` range each screen was read from

| Screen | Swift view | `body` | React Native |
| --- | --- | --- | --- |
| Ask Nexdo (suggestions) | `AskNexdoView` (`ios/App/AskNexdoView.swift:89`) | `:182-277` | `app/ask/index.tsx` → `src/components/AskNexdoView.tsx` |
| Free form Text | the same view with `textPage: true` (`:271`) | `:182-277` | `app/ask/text.tsx` → the same component |
| Ask by Voice | `AddTaskByVoiceView(askMode: true)` (`:270`) | `AddTaskByVoiceView.swift:30-` | `app/ask/voice.tsx` → `src/components/AddTaskByVoiceView.tsx` (shell) |

Child views followed out of `body`, in the order `body` renders them:

- `NexdoAISuggestionCard` — `AskNexdoView.swift:58`, body `:61-86` → `AskSuggestionCard` in
  `src/components/AskParts.tsx`.
- `AskResponseView` — `ios/App/AskResponseView.swift:4`, body `:11-69` → `AskResponse` in
  `src/components/AskResponse.tsx`.
  - `AskResponseSummary` — `AskResponseView.swift:72`, body `:75-84`.
  - `AskResponseCard` — `AskResponseView.swift:86`, body `:97-130`.
- `entryCards` / `entryCard` — `AskNexdoView.swift:277-310` → `AskEntryCards` / `AskEntryCard`.
- `composer` / `field` / `controls` — `AskNexdoView.swift:312-357`.
- `consentView` — `AskNexdoView.swift:348-364`.
- `NexdoAIIntent` — `AskNexdoView.swift:4-43` → `src/lib/askIntents.ts`.
- `AskStyle` — `AskNexdoView.swift:45-56` → `askBlue` and `secondaryBackground` in `src/theme/colors.ts`.

Supporting logic, each with tests:

- `src/lib/assistantPolicy.ts` — the client-side guard (`AskNexdoView.swift:120-180`).
- `src/lib/assistantPresentation.ts` — `displaySections` (`ios/Sources/NexdoCore/AssistantPresentation.swift:6-24`).
- `src/lib/speechText.ts` — `SpeechText.chunks` (`ios/Sources/NexdoCore/SpeechText.swift:6-29`).
- `src/store/assistant.ts` — `AppModel.turn` / `lastAssistantPrompt` / `contextID` (`NexdoApp.swift:119-127`).
- `src/query/useAssistant.ts` — `AppModel.ask(_:accept:)` (`NexdoApp.swift:693-711`).
- `src/api/index.ts` `endpoints.assistant` — `POST /api/assistant`.

### The server contract

`src/app/api/assistant/route.ts:8-33` returns **one JSON body**. There is no SSE, no streaming and no
separate apply/approve route, so no chunk parser exists on the mobile side. `assistantRequestSchema`
(`src/lib/executive-contract.ts:35-41`) takes `transcript` plus three optional ids and refuses
`confirmActionId` and `rejectActionId` together. `createdTaskId` is in the Swift decoder but the
server never emits it; it is kept in the type and honoured in the reload branch.

### Where the brief and Swift disagree

- **"Ask AI is a sheet; Phase 1 made it a tab."** Both are true at once. `NexdoTab.askAI`
  (`RootView.swift:77-82`) **does** have a tab-bar item, but the button runs
  `if tab == .askAI { showingAsk = true }` (`:120`) and never changes `selection`. The item is now
  kept, and its press is intercepted (`tabPress` → `router.push('/ask')`), which is exactly what
  Swift does. `app/(tabs)/ask.tsx` survives as an unreachable route, mirroring Swift's own
  unreachable `case .askAI:` at `:102`.
- **"A message list and bubbles."** There is none. Swift holds a single `model.turn`; "Show
  suggestions" (`:246`) and the ✕ (`:193`) discard it. No transcript is kept, so none was built.
- **"Reject = no server call."** Wrong. "Keep my current plan" calls `model.ask("no", accept: false)`
  (`AskResponseView.swift:62`), which POSTs `rejectActionId`. The proposal is server-side state.
  Following Swift; the test asserts the request and that no task data is invalidated.
- **"A `confirmationLevel` matrix."** No such field exists anywhere — not in `AssistantTurn`
  (`Models.swift:190-211`), not in the route, not in `executive-contract.ts`. The only confirmation
  is `confirmation: { actionId, prompt }`, which is a single yes/no card.
- **Calendar's Ask prompt.** `CalendarView.swift:157-160` presents `AskNexdoView(initialPrompt:)`
  from an `ask` state (`:14`) that **nothing ever sets to true**. It is dead code. "Review conflicts"
  (`:256`) opens `conflictSheet`, which is what the mobile button already does. The Phase 5
  `TODO(phase6)` there has been replaced with this finding.
- **Consent persistence.** Unchanged from Phase 3: in memory only, per launch. `AppModel.aiConsent`
  (`NexdoApp.swift:125`) has no storage.

### Read Loud and voice: shells, marked

`AskResponseCard` always renders a **Read Loud** control, so it is rendered here. Its transport —
`POST /api/speech` returning `audio/mpeg`, played through `VoicePlayback` (`AskNexdoView.swift:420-445`)
— needs a native audio module and is Phase 9. `src/voice/speechStub.ts` walks the same preparing →
speaking states and, like `taskCaptureStub`, **throws outside `__DEV__`**, so a release build shows
Swift's own failure line instead of pretending to speak.

`AddTaskByVoiceView` has been extracted from `app/task/voice-capture.tsx` into
`src/components/AddTaskByVoiceView.tsx` and given the `askMode` flag, because Swift has one view with
one flag that changes four pieces of copy (`AddTaskByVoiceView.swift:36, 41, 42, 69-71`). The
transcription session underneath is unchanged and still the Phase 9 stub.

### Visual gaps

- **Sheet detents.** `.presentationDetents([.fraction(0.84)])` on the Ask sheet
  (`RootView.swift:112`) and `[.medium, .large]` on the consent sheet (`AskNexdoView.swift:267`) have
  no Expo Router equivalent on Android. Both are full-height modals. Same gap as the Phase 3 filters
  sheet.
- **SF Symbols.** `target` → `locate-outline`, `alarm` → `alarm-outline`, `sunrise` →
  `sunny-outline` (Ionicons has no sunrise), `calendar.badge.clock` → `calendar-number-outline` (no
  clock badge), `arrow.up.left` → `arrow-up-outline` (Ionicons has no diagonal arrows).
- **`blocked`.** Swift's `blocked` is `submitting || model.busy`, where `model.busy` is the app-wide
  "Updating…" flag. There is no single global mutation flag in React Query here, so `blocked` is the
  Ask request alone. A task save running in another screen will not grey out the Ask controls.
- **Dynamic Type.** `typeSize.isAccessibilitySize` re-lays the composer and the entry cards into a
  vertical stack (`AskNexdoView.swift:324-328`, `:278`). Not ported; the row layout is used at every
  size, as in the other phases.
- **`.interactiveDismissDisabled(composerFocused || submitting)`** (`:265`) has no React Navigation
  equivalent; the sheet can be swiped away mid-request.
- **Grapheme clusters.** `speechChunks` splits on code points, not extended grapheme clusters; see
  the note in `src/lib/speechText.ts`.

### Open TODOs after Phase 6

- `TODO(phase4b)` in `app/(tabs)/today.tsx`: the `queue.hasImmediateActions` branch of the Weekly
  Summary card (`RootView.swift:1063-1070`) is still missing. Its **Daily Briefing** button is a
  fourth Ask entry point — `onPlanWeek("Give me today's daily briefing, prioritizing my due contact
  actions and upcoming calendar commitments.")` — so that entry point does not exist on Android yet.
  Left where Phase 4B left it rather than widened into this phase.
- `TODO(phase7)`: withdrawing AI permission (`ProfileView.swift:235-236`). `useConsent.withdraw()` is
  built and tested; nothing calls it yet.
- `TODO(phase9)`: `src/voice/speechStub.ts`, `src/voice/taskCaptureStub.ts`, and ask-mode voice
  answering with an assistant turn rather than creating a task.

### Needs confirmation on a device

- The Ask sheet over a live tab, and that the tab behind it does not change.
- A real proposal card, which needs an account the planner will actually propose changes for.
- That approving a proposal visibly updates the Tasks and Calendar tabs.
- The bottom composer with the keyboard up, on a short screen.
- Read Loud in a release build, which should show the failure line rather than silence.

## 17. Phase 7 status (Account and settings)

### Built, with the `body` range each screen was read from

| Screen | Swift view | `body` | React Native |
| --- | --- | --- | --- |
| My Page (Account) | `AccountView` (`ios/App/ProfileView.swift:60`) | **`:65-99`** | `app/account/index.tsx` |
| Settings | `ProfileSettingsView` (`ios/App/ProfileView.swift:126`) | **`:146-270`** | `app/account/settings.tsx` |

Child views followed out of those two `body`s, in the order they render:

- `ProfileAvatar` — `ProfileView.swift:39`, body `:48-57` → `AccountAvatar` in
  `src/components/ProfileParts.tsx` (and re-exported at its 44pt size by `TodayShell.tsx`).
- `ProfileBackground` — `ProfileView.swift:116-118` → same file.
- `menuRow(_:_:web:)` / `webRow(_:_:_:)` — `ProfileView.swift:104-114` → `AccountMenuRow`.
- `profileCard()` — `ProfileView.swift:119-123` → `ProfileCard` and `SettingsCard`.
- `card(_:content:)`, `field(_:text:placeholder:)`, `hours(_:start:end:)`, `clock(_:)` —
  `ProfileView.swift:274-295` → `src/components/SettingsControls.tsx`.
- `CalendarOAuthCoordinator` — `ProfileView.swift:6-36` → `useConnectGoogleCalendar` in
  `src/query/useCalendar.ts`, over the Phase 5 `googleConnectStartUrl` / `parseGoogleCallback`.
- `ProfilePhotoEncoder` — `ios/App/ProfilePhotoEncoder.swift:4-29` → `src/lib/profilePhoto.ts`
  (the policy) and `src/photo/encodePhoto.ts` (the resize and re-encode).
- `AppAppearance` / `AppVoice` — `ios/App/AppAppearance.swift:3-37` → `src/store/appearance.ts`.
- `ProfileSettingsInput` / `settingsInput()` / `normalizePhone(_:)` — `ProfileSettings.swift:22-27`,
  `ProfileView.swift:339-366` → `src/lib/profileSettings.ts`.

### Is appearance user-selectable in Swift? YES

`ProfileSettingsView` has an `@AppStorage(AppAppearance.storageKey)` segmented picker with **System,
Day, Night** (`ProfileView.swift:127`, `:148-157`), and `NexdoApp` applies it at the root with
`RootView().preferredColorScheme(appearance.colorScheme)` (`ios/App/NexdoApp.swift:6-8`). It is stored
on the device under `UserDefaults` key **`nexdo.appearance`** and never sent to the server.

**This corrects a Phase 2 finding.** `nexdo.lastSignedInFirstName` is not the only `UserDefaults` key
the Swift app writes. There are three: that one, `nexdo.appearance`, and `nexdo.appVoiceVolume`
(`AppAppearance.swift:4`, default 1.0, the App Voice slider). All three are AsyncStorage here, under
the same key names. `useTheme` now resolves the choice, since React Native has no root
`preferredColorScheme` equivalent.

### The time-zone rule, as implemented

`synchronizeDeviceTimeZone()` (`NexdoApp.swift:225-233`), ported in `src/query/useProfile.ts`:

1. no signed-in profile → do nothing;
2. `profile.timeZone === Intl.DateTimeFormat().resolvedOptions().timeZone` → **no request at all**;
3. otherwise `PATCH /api/settings` with `{ timeZone }` **alone**, re-read `/api/me`, and verify the
   reloaded zone really is the device zone — a server that accepted the PATCH without persisting it
   is an error, not a success.

The account follows the device, never the reverse. Swift calls it from three places and two are now
wired: `finishAuthentication()` (`:300`) in `src/query/useAuth.ts` — which closes the Phase 2
`TODO(phase2-decision)` — and `refresh()` (`:437`) on returning to the foreground, in
`app/_layout.tsx`, where a failure raises Swift's own alert ("Unable to complete request" /
"Couldn't synchronize your device time zone. Please reconnect and try again."). The third,
`voiceTaskSession()` (`:472`), belongs to Phase 9. Saving the settings form also re-asserts it,
because `settingsInput()` always sends the device zone (`ProfileView.swift:355`).

### Where the brief and Swift disagree

- **"PATCH profile, preference, photo upload" as separate routes.** There is only one:
  `PATCH /api/settings`. There is no `/api/profile` and no `/api/account/*` except the DELETE.
- **"Photo: match the content type and field names — multipart? base64?"** Neither multipart nor an
  upload route. `saveProfilePhoto` (`NexdoApp.swift:255`) sends `{"photo": "data:image/jpeg;base64,…"}`
  on the same settings PATCH, and `null` removes it. The server enforces the JPEG data-URL prefix,
  256,000 decoded bytes and real SOI/EOI markers (`src/app/api/settings/route.ts:36`).
- **"Edit name/email → PATCH, optimistic where Swift is."** Only the NAME is editable; there is no
  email field in `body`. And nothing on this screen is optimistic or debounced except the photo:
  every other control edits `@State` and only **Save settings** or the back chevron writes. The
  photo is the one optimistic write, with a rollback and a server confirmation.
- **"Default duration and reminder minutes", "phone number for SMS if present", "suggestNextAction
  and its mode picker".** The mode picker exists — "Protect my current focus" with Flexible 5 /
  Balanced 10 / Strong 25 (`:212-214`). The others do not: no control in `body` touches
  `defaultDurationMin` or `defaultReminderMinutes`, and `ProfilePreferences`
  (`ProfileSettings.swift:3-17`) does not even decode them. There is no SMS toggle and no phone
  field, although `smsEnabled` and `phoneNumber` ARE decoded — and `settingsInput()` still normalises
  the stored phone number on every save (`:343-350`), so a legacy value the server would now reject
  blocks the save. That is ported, with tests.
- **"Delete account with its confirmation flow", "app version/legal links if present".** Delete is in
  the "Calendars and privacy" card, not on My Page. There is no version string and no legal link
  anywhere in either `body`.
- **"Photo crop? working-hours picker sheet?"** Neither exists. `PhotosPicker` returns the image
  as-is and the encoder downsamples it; working hours are two compact `DatePicker`s inline.
- **"Sign-out button currently in the dev menu."** Moved to My Page (`:84-86`), and the Today mount of
  `DevMenu` is gone. The menu stays on sign-in, `__DEV__` only, without a sign-out entry.
- **Google connect.** Unchanged from Phase 5's finding: still broken against production for any
  in-app browser, the Swift app included, and the `TODO(server-connect-token)` is still the one line
  to change.

### Rebuild needed: YES

Three new native modules:

| Package | Version | Why |
| --- | --- | --- |
| `expo-image-picker` | ~57.0.18 | `PhotosPicker(matching: .images)` (`ProfileView.swift:181`). |
| `expo-image-manipulator` | ~57.0.18 | The resize half of `ProfilePhotoEncoder` — ImageIO thumbnails plus `jpegData(compressionQuality:)`. |
| `expo-web-browser` | ~57.0.3 | `ASWebAuthenticationSession` for the Google OAuth session (`ProfileView.swift:12`). |

Permission strings are deliberately **off** for `expo-image-picker` (`photosPermission: false`,
`cameraPermission: false`). The Swift target declares `NSContactsUsageDescription` and
`NSMicrophoneUsageDescription` and **no photo-library or camera string**
(`ios/Nexdo.xcodeproj/project.pbxproj:243-250`), because PHPicker runs out of process; Swift offers no
camera option at all. `expo prebuild --platform android` was run and discarded: the `nexdo` scheme
intent filter is already generated from `scheme: 'nexdo'`, and image-picker adds only the legacy
`READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` pair capped at `maxSdkVersion="32"` — no
`READ_MEDIA_IMAGES`, because the system photo picker needs none.

### Visual gaps

- **The `.menu` and default `Picker` styles.** "AI confirmation" and "Protect my current focus" are a
  label-plus-value row that opens a list, not an iOS pull-down menu.
- **`DatePicker(displayedComponents: .hourAndMinute)`** is a field that opens two scrollable columns,
  not the compact SwiftUI wheel. Hand-built for the reason `MonthCalendar` records: the community
  date-time picker forces an Android dialog, which is further from the compact control than this is.
  Every minute Swift allows is still reachable.
- **`Slider`.** React Native's core has no slider, and the setting it drives is inert until Phase 9,
  so it is hand-built from responder events rather than a fourth native module. It has the same 0.05
  step, the same percentage read-out and the same accessibility value.
- **SF Symbols.** `arrow.up.right` → `open-outline` (Ionicons has no diagonal arrow),
  `calendar.badge.plus` → `calendar-outline` (no plus badge), `speaker.wave.2` → `volume-medium-outline`.
- **Sheet presentation.** My Page is a plain modal; Swift's `.sheet` carries the iOS grabber and
  rounded corners. Same gap as every other sheet in this port.
- **`ProfileAvatar`'s gradient** is `NEXDO_GRADIENT` (the Phase 4 port of `NexdoTheme.gradient`), and
  the photo fills the circle the way `scaledToFill` does.
- **The app-wide "Updating…" overlay** (`RootView.swift:62`) still has no equivalent, so a long save
  shows only the in-place "Saving…" on the button.

### TODOs closed in Phase 7

- `TODO(phase7)` in `app/(tabs)/tasks.tsx` — the account button now opens `/account`.
- `TODO(phase7)` in `app/(tabs)/today.tsx` — the avatar now opens `/account`.
- `TODO(phase3-decision)` in `src/components/TodayShell.tsx` — the top-bar avatar draws the photo.
- `TODO(phase2-decision)` in `src/query/useAuth.ts` — `finishAuthentication` now synchronizes the
  device time zone and invalidates what Swift's `load()` fetches.
- `TODO(phase7)` in `src/query/useCalendar.ts` — connect and sync are built, in Settings, where Swift
  keeps them.
- The Phase 4 note in `src/components/DevMenu.tsx` — sign-out is on My Page.
- `TODO(phase1-decision)` in `src/theme/useTheme.ts` — the manual appearance override exists.

### TODOs still open after Phase 7

- `TODO(server-connect-token)` in `src/query/useCalendar.ts` — a server change, deliberately untouched.
- `TODO(phase7)` in `src/query/useToday.ts` — the hardcoded weather coordinates are Swift's own
  (`WeatherClient.swift:14-32`), not an account setting, and no control in either `body` exposes
  them. It stays open only as a marker for if the account ever gains a location preference.
- `TODO(phase4b)` in `app/(tabs)/today.tsx` — the `queue.hasImmediateActions` branch of the Weekly
  Summary card, still outstanding from Phase 4B.
- `TODO(phase9)` in `src/voice/speechStub.ts` and `src/voice/taskCaptureStub.ts`, plus the third
  time-zone sync call site in `voiceTaskSession()`.
- `TODO(phase0-decision)` / `TODO(phase1-decision)` in `app.config.ts` (tablet support, the Android
  package name, the WebRTC plugin's SDK table).

### Needs confirmation on a device

- The photo round trip end to end: the encoder's output size on a real 12MP photo, and that no
  permission prompt appears.
- That the device time-zone PATCH fires on a real foreground transition, and does NOT fire when the
  zones already match.
- The Google connect failure mode against production, and the success path once the server lands.
- Deleting a throwaway account.
- The hand-built slider's feel, and the hour/minute columns on a small screen.
- Appearance surviving a relaunch, and the whole app following Day/Night.

## 18. Phase 8 status (Reminders, action queue, native actions)

### Built, with the `body` range each screen was read from

| # | Screen | Swift view | `body` | React Native |
| --- | --- | --- | --- | --- |
| 31 | Task action | `TaskActionView` (`ios/App/TaskActionView.swift:101`) | **`:133-236`** | `app/action/[id].tsx` |
| 32 | Message / email composer | `ActionMessageComposer` / `ActionEmailComposer` (`TaskActionComposers.swift:22`, `:42`) | n/a — `UIViewControllerRepresentable` wrappers | the SYSTEM composers, via `src/actions/composers.ts` |
| 8 | Action queue (Today section 6) | `TodayActionsView` (`TodayActionsView.swift:9`) | **`:16-46`** | `src/components/TodayActions.tsx` |
| — | Action queue sheet | `ActionQueueSheet` (`TodayActionsView.swift:188`) | **`:193-220`** | `app/action/queue.tsx` |
| — | Task action card | `TaskActionCard` (`TaskActionView.swift:4`) | **`:9-40`** | `src/components/TaskActionCard.tsx` |

Child views followed out of those `body`s, in render order:

- `ActionNeededCard` — `TodayActionsView.swift:56`, body `:69-128`.
- `SnoozeMenu` — `TodayActionsView.swift:130`, body `:134-159`.
- `NextActionRow` — `TodayActionsView.swift:165`, body `:168-186`.
- `ActionGlass` — `TodayActionsView.swift:48-54`; `actionIcon` / `actionTimeLabel` — `:224-232`.
- `ClarifyTaskActionCard` — `TaskActionView.swift:42`, body `:51-80` — already built in Phase 3; its
  "Contact someone" follow-through (`:90-93`) is wired now.

Supporting ports, each with tests:

- `src/lib/taskActionDetector.ts` — `DeterministicTaskActionDetector` and its private `parseTime`
  (`ios/Sources/NexdoCore/TaskActionDetector.swift:4-77`).
- `src/lib/taskAction.ts` — `transition`, `TaskActionReconciler`, `TaskActionNotificationPlan`
  (`ios/Sources/NexdoCore/TaskAction.swift:21-115`).
- `src/actions/coordinator.ts` — `TaskActionCoordinator` (`TaskActionCoordinator.swift:21-158`).
- `src/actions/notifications.ts` — `LocalTaskActionScheduler` and `TaskActionAppDelegate`
  (`TaskActionNotifications.swift`).
- `src/actions/persistence.ts`, `contacts.ts`, `composers.ts`, `errors.ts`.

### Backend gaps

**The server has no APNs or FCM path, and the Swift app registers no device token.** `ios/` contains
no `registerForRemoteNotifications`, no `didRegisterForRemoteNotificationsWithDeviceToken` and no
token upload; every reminder is a local `UNCalendarNotificationTrigger` the app schedules itself
(`TaskActionNotifications.swift:35-37`). The server's only push route is
`src/app/api/push-subscriptions/route.ts`, which is **Web Push over VAPID** — it stores a browser
`PushSubscription` (`endpoint`, `keys.p256dh`, `keys.auth`) and is used by the web app, not by a
mobile device token.

So this phase registers nothing, by design and by parity: there is no endpoint to register with, and
Swift does not register either. Everything else — the category, the four action buttons, the
foreground rule, tap and button routing, and the scheduled reminders — is real and works offline on
both platforms. If the backend later adds FCM, the only new work is a token upload; the response
handling in `src/actions/useActionNotifications.ts` already routes any payload carrying
`{ actionID, owner }`, which is the shape Swift's local notifications use.

A second, smaller gap: `src/server/reminders.ts` contains no `web-push`, `apn` or `fcm` call at all,
so nothing on the server currently sends to any device.

### Where the brief and Swift disagree

- **"How the device token is registered with the server (`POST /api/push/register` or similar — find
  it)."** There is no such route and no such call. See Backend gaps.
- **"`parseTime` in `NexdoCore`."** It is `private` to `DeterministicTaskActionDetector`
  (`TaskActionDetector.swift:35`), not a public `NexdoCore` helper. Ported and exported here because
  the creation form's behaviour depends on it and Swift's tests pin it.
- **"Detected time overrides the chosen date."** Only until a date pill is tapped.
  `resolvedCreationDate` (`RootView.swift:2086-2089`) prefers the detected time **while
  `!dateExplicitlyChosen`**; `dateExplicitlyChosen` is set by any pill (`:2061`). The caption at
  `:1983-1986` always shows the resolved date, whichever won.
- **"The reminder screens' action buttons call the same endpoints (complete, snooze with Swift's
  offset)."** None of the four buttons calls the server. CALL / MESSAGE / EMAIL open the action
  screen with a channel preselected; REMIND_LATER snoozes locally by 15 minutes AND opens the screen
  ("Snooze from a notification still opens the authenticated action screen",
  `TaskActionCoordinator.swift:88`). The only server call anywhere in this flow is "Mark task
  complete", which is the ordinary task PATCH.
- **"Persistence with the same file shape (use `expo-file-system` if Swift writes a file; state
  which)."** Swift does write a file: `Application Support/TaskActions/<sha256(userID)>.json`. This
  uses `expo-file-system` at `Paths.document/TaskActions/<sha256>.json` with the same JSON array.
- **"`TodayActionsView.swift` (body :16-46)"** — correct, confirmed.
- **"Contact resolution via `expo-contacts` (same permission moment, same fields)."** The moment is
  the first time a channel is chosen on the action screen, not at launch. Swift also accepts iOS 18's
  `.limited` authorization; `expo-contacts` reports limited access as granted, which behaves the same.

### The one-action-per-task rule

Enforced twice, as in Swift: `reconcileActions` maps over TASKS, so a second action for one task
cannot be produced; and `buildActionQueue` (Phase 4B) keeps only the first action per task in its
sorted order. Both are tested.

### Rebuild needed: YES

| Package | Version | Why |
| --- | --- | --- |
| `expo-notifications` | ~57.0.19 | `UNUserNotificationCenter`: the `CONTACT_TASK` category, its four buttons, scheduling and responses. |
| `expo-contacts` | ~57.0.5 | `CNContactStore` (`TaskActionContacts.swift:18-46`). |
| `expo-sms` | ~57.0.2 | `MFMessageComposeViewController` (`TaskActionComposers.swift:22-41`). |
| `expo-mail-composer` | ~57.0.2 | `MFMailComposeViewController` (`TaskActionComposers.swift:42-66`). |
| `expo-file-system` | ~57.0.7 | The coordinator's per-account JSON file (`TaskActionCoordinator.swift:33-41`). |

### The Android permission list

`npx expo prebuild --platform android --no-install`, after blocking what Swift has no equivalent for:

| Permission | Source | Kept? |
| --- | --- | --- |
| `INTERNET`, `ACCESS_NETWORK_STATE` | Expo | yes |
| `READ_CONTACTS` | expo-contacts | yes — the contact lookup |
| `WRITE_CONTACTS` | expo-contacts | **blocked** — Nexdo only reads contacts |
| `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` (`maxSdkVersion="32"`) | expo-image-picker | yes — legacy only; no `READ_MEDIA_IMAGES`, because the system photo picker needs none |
| `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `BLUETOOTH`, `WAKE_LOCK` | react-native-webrtc (Phase 0) | yes |
| `CAMERA`, `SYSTEM_ALERT_WINDOW` | react-native-webrtc | **blocked** — voice uses neither |
| `VIBRATE` | Expo / notifications | yes |
| `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` | expo-notifications' own manifest, merged at build | yes — Android 13+ requires the first; the second restores scheduled reminders after a reboot, which iOS does on its own |

No SMS permission is added: `expo-sms` hands off to an intent, so the person always sees the
composer. The `nexdo` scheme intent filter is present, from Phase 1.

### Build profiles

`eas.json` now has three. `development` is unchanged.

- **`preview`** — internal distribution, an Android **APK**, `channel: "preview"`, the production API
  URL in `env`, and NO dev client, so a tester installs the APK and runs it with no Metro server.
- **`production`** — store distribution, an Android **app-bundle** (AAB), `autoIncrement: true`.

**Versioning is REMOTE** (`cli.appVersionSource: "remote"`, already set in Phase 1). EAS owns
`android.versionCode`; `autoIncrement` on the production profile bumps it per build, and
`app.config.ts` deliberately declares no `versionCode` so the two cannot disagree. `version` stays
manual at `1.0.0` in `app.config.ts`.

### Visual gaps

- **`ActionQueueSheet`'s `List` sections.** Swift uses a grouped `List` with real section headers;
  this is a scroll view with header labels and a card per section.
- **`SnoozeMenu`'s "Choose time…"** (`TodayActionsView.swift:141-157`) opens a `DatePicker` sheet with
  a `[.medium]` detent. The five fixed offsets are built; the custom picker is not, for the reason
  recorded on `MonthCalendar` — see Open TODOs.
- **A swipe-away does not cancel on Android.** `UNNotificationDismissActionIdentifier` and
  `.customDismissAction` (`TaskActionNotifications.swift:56`, `TaskActionCoordinator.swift:83`) have
  no Android equivalent; Android raises no response for a dismissed notification. The branch is
  built and tested, and will fire on iOS.
- **`.ultraThinMaterial`** on the action cards is a flat surface plus an indigo hairline, as
  everywhere else in this port.
- **SF Symbols**: `phone`/`message`/`envelope` → `call-outline`/`chatbubble-ellipses-outline`/
  `mail-outline`; `person.crop.circle.fill` → `person-circle`; `bell.fill` → `notifications`.
- **iOS file protection.** `.completeFileProtectionUntilFirstUserAuthentication` and
  `isExcludedFromBackup` (`TaskActionCoordinator.swift:132-136`) have no `expo-file-system`
  equivalent. On Android the app's files directory is already private to the app.
- **Dynamic Type.** `typeSize.isAccessibilitySize` re-lays `ActionNeededCard`'s channel row into a
  vertical stack (`TodayActionsView.swift:107`); not ported, as in the other phases.

### TODOs closed in Phase 8

- `TODO(phase8)` in `src/components/ClarifyTaskActionCard.tsx` — the coordinator branch renders ahead
  of the clarify card, and "Contact someone" now opens the created action.
- `TODO(phase4b)` in `app/(tabs)/today.tsx` (the Weekly Summary card) — the `hasImmediateActions`
  branch and its Daily Briefing button are built.
- `TODO(phase4b)` in `app/(tabs)/today.tsx` (sections 6-8) — section 6, `TodayActionsView`, is built.
  Sections 7 and 8 are re-marked `TODO(phase9)`; see below.
- The Phase 4B note in `src/lib/todayActionQueue.ts` that nothing supplies `actions` — the coordinator
  does now.

### TODOs still open after Phase 8

- `TODO(phase9)` in `app/(tabs)/today.tsx`: sections 7 and 8 of the dashboard — the protected-time
  proposal card and the persistent next-action card. Both depend on `model.protectedTime` and
  `model.persistentNext`, which are the next-action service, not the coordinator, so they were never
  Phase 8 work.
- `TODO(phase9)` in `src/voice/speechStub.ts` and `src/voice/taskCaptureStub.ts`, and the third
  device time-zone sync call site in `voiceTaskSession()`.
- `TODO(server-connect-token)` in `src/query/useCalendar.ts` — a server change.
- `TODO(phase7)` in `src/query/useToday.ts` — the hardcoded weather coordinates are Swift's own.
- `TODO(phase3-decision)` in `src/components/MonthCalendar.tsx` — the hand-built pickers, which
  `SnoozeMenu`'s "Choose time…" would also need.
- `TODO(phase0-decision)` / `TODO(phase1-decision)` in `app.config.ts`.

### Needs confirmation on a device

- The notification permission prompt appearing at the first scheduled reminder, not at launch.
- A reminder actually firing, and each of the four buttons routing correctly from the lock screen,
  from the shade with the app backgrounded, and with the app open.
- A cold-start tap: the app launching straight into the action screen for the right task.
- The Contacts prompt, a real multi-match name, and a contact with several numbers.
- The SMS and mail composers opening with the drafted body, and the three outcomes.
- `tel:` opening the dialler with the number intact.
- The `preview` APK installing and running with no Metro server.

## 19. Phase 9 status (Voice, and the last two Today sections)

### Built, with the line ranges each feature was read from

| Feature | Swift | Range | React Native |
| --- | --- | --- | --- |
| The conversation | `VoiceConversationSession` (`ios/Sources/NexdoCore/VoiceConversationSession.swift:81`) | **`:81-364`** | `src/voice/conversation.ts` |
| The transport | `VoiceWebRTCTransport` (`ios/App/VoiceWebRTCTransport.swift:5`) | **`:5-146`** | `src/voice/transport.ts` (+ `nativeDriver.ts`) |
| The tools | `VoiceToolExecutor` (`ios/App/VoiceToolExecutor.swift:4`) and `AppModel.executeVoiceTool` (`NexdoApp.swift:481-493`) | **`:4-32`** | `src/voice/toolExecutor.ts` |
| The screen (3 modes) | `AddTaskByVoiceView` (`ios/App/AddTaskByVoiceView.swift:4`) | body **`:27-124`**, `orb` **`:138-160`** | `src/components/AddTaskByVoiceView.tsx` |
| Read Loud | `VoicePlayback` (`ios/App/VoicePlayback.swift:4`) + `speakChunks` (`AskNexdoView.swift:428-445`) | **`:4-54`** | `src/voice/speech.ts` |
| Protected time (section 7) | `TodayView.body` (`ios/App/RootView.swift:914`) | **`:1095-1106`** | `ProtectedTimeCard` in `src/components/TodayNextAction.tsx` |
| Persistent next action (section 8) | `TodayView.body` | **`:1108-1126`** | `PersistentNextCard`, same file |

Child files followed: `ios/Sources/NexdoCore/VoiceTaskDraft.swift`, `VoiceToolResponse.swift`,
`SpeechText.swift`, `ios/App/TaskActionContacts.swift` (the contact tools), `RealtimeTaskAudio.swift`
and `RealtimePCMConverter.swift` (read and NOT ported — see below), plus
`ios/Sources/NexdoCore/DoNowRecommendation.swift:34-63` for sections 7 and 8, and
`AppModel.refreshNextAction` / `respondToProtectedTime` / `dismissPersistentNext`
(`NexdoApp.swift:21-71`).

### Rebuild needed: YES — one new module

| Package | Version | Why |
| --- | --- | --- |
| `expo-audio` | ~57.0.5 | Read Loud. `VoicePlayback` plays the MP3 `/api/speech` returns through `AVAudioPlayer`, and React Native's core has no audio player. |
| `expo-asset` | ~57.0.5 | A required peer of `expo-audio`, flagged by `expo-doctor` and installed with it. |

`react-native-webrtc` and `react-native-incall-manager` were already in from Phase 0. Nothing else was
added: the whole conversation runs over the existing peer connection.

### How Read Loud is implemented

**Not `AVSpeechSynthesizer`, and not the realtime model.** `AppModel.speechAudio(for:)`
(`NexdoApp.swift:682-691`) POSTs the text to `/api/speech`, which answers `audio/mpeg`, and
`VoicePlayback.play(_:)` hands that MP3 to `AVAudioPlayer`. `src/voice/speech.ts` does the same: one
request per `SpeechText.chunks` chunk, written to the cache directory, played by `expo-audio` in
order, with `playsInSilentMode` standing in for Swift's `.playback` / `.spokenAudio` category.

### The volume and gain approach, and its gap

There are TWO volumes in Swift, and they are not the same:

- **Read Loud** sets `player.volume = Float(AppVoice.volume)` (`VoicePlayback.swift:31`) — the plain
  0…1 slider value, no gain. **Ported exactly**, including Swift's observer that re-applies the
  volume to a PLAYING chunk when the slider moves (`:15-19`).
- **The realtime reply** sets `remoteAudio.source.volume = AppVoice.volume * 3`
  (`VoiceWebRTCTransport.swift:143`) — "Realtime's track supports gain above unity. 3.0 preserves
  Nexdo's existing +200% voice gain at the slider's 100% position."

**GAP: the ×3 realtime gain cannot be applied on Android.** react-native-webrtc exposes no per-track
gain on `MediaStreamTrack`, and react-native-incall-manager has no volume API, so the model's reply
plays at the device volume. The multiplier and the call site are both in place
(`WebRtcTransport.applyVolume`, `VOICE_OUTPUT_GAIN`, and `audioRoute.setVolume`, which the native
driver implements as a no-op with the reason recorded) so a single driver change turns it on if
react-native-webrtc ever adds a track gain. The slider itself is stored, applied to Read Loud, and
re-applied live.

The setting is `nexdo.appVoiceVolume` in AsyncStorage, unchanged from Phase 7 — the same place the
appearance choice lives, and the same key the Swift app's `UserDefaults` uses.

### Where the brief and Swift disagree

- **"Voice task capture … replace `taskCaptureStub.ts` with the transcription/task session Swift uses;
  review/confirm step posts the parsed task exactly as Swift does."** THERE IS NO REVIEW/CONFIRM STEP.
  `AddTaskByVoiceView` runs one live conversation in all three modes; the model creates and edits
  tasks through TOOL CALLS while you talk, and the screen lists them under "Added this session"
  (`:52-66`). The Phase 3 stub's transcript → "Add this task" flow was the stub's own invention and is
  gone, with a guard test against it coming back.
- **"How the transcription session differs from the task session."** `AddTaskByVoiceView` never uses
  `/api/realtime/transcription-session`. That endpoint belongs to `VoiceInputView` /
  `LiveVoiceTranscription` — dictation into a text field — which is a screen this migration has not
  been asked to build. Only `/api/realtime/task-session` is used here.
- **"Ask by Voice … the answer should come back as an assistant turn."** It does not. `askMode`
  changes four pieces of copy (`:36`, `:41`, `:42`, `:69-71`) and nothing else; the model answers out
  loud, and `model.turn` is untouched.
- **"If it's `AVSpeechSynthesizer`, use `expo-speech`."** It is neither — see above.
- **"Error handling (Swift closes on realtime error events — the PoC logged and continued; match
  Swift)."** Confirmed and matched: a realtime `error` event calls `fail()`, which sets the message
  and closes with `networkFailure`, EXCEPT for `response_cancel_not_active` and
  `conversation_already_has_active_response` (`VoiceConversationSession.swift:295-300`).
- **Sections 7 and 8 were "the next-action service".** They are `POST /api/schedule-intelligence` with
  `{"operation":"next-action"}` and `GET /api/protected-time`, in that order, with the second wrapped
  in `try?` so its failure hides only its own card (`NexdoApp.swift:30-37`).

### Read but deliberately not ported

`RealtimeTaskAudio.swift` and `RealtimePCMConverter.swift` build an `AVAudioEngine` tap that streams
PCM frames — the transport for `LiveVoiceTranscription`, not for `AddTaskByVoiceView`, which uses
WebRTC. `LiveVoiceTranscription`, `VoiceInputView`, `VoiceCapture` and `VoiceAnimationView` belong to
the dictation feature and to screens outside this migration's screen list.

### The dev voice-check screen: DELETED

`app/dev/voice-check.tsx` and the Phase 0 `src/voice/session.ts` are gone, and so is the dev-menu
entry. The real Add by Voice screen drives the same task-session → WebRTC → `oai-events` → tool path
and shows the live phase, transcript, reply and created tasks, which is strictly more than the check
reported. `src/voice/protocol.ts` survives — the SDP exchange and the session validation are still
the transport's.

### Visual and behavioural gaps

- **The orb does not animate.** Swift drives three breathing rings and 25 capsules from a 24fps
  `TimelineView` (`AddTaskByVoiceView.swift:139-159`). The same composition is drawn at rest; a
  per-frame JavaScript loop costs more than it conveys. It is `accessibilityHidden` either way.
- **No ready chime.** `.onChange(of: voice.phase)` plays `ListeningReady.wav` when the session reaches
  `listening` (`:104-109`). That audio file is not in this repository, so there is nothing to play.
- **The ×3 realtime gain** — see above.
- **No background task.** Swift calls `beginBackgroundTask` so a session can finish while the app is
  backgrounded (`:112-115`); React Native has no equivalent, so the five-second `backgroundGrace`
  simply closes the session, which is the same outcome the grace period was protecting.
- **Audio interruptions and route changes.** Swift closes the session on an `AVAudioSession`
  interruption or an unplugged headset (`:119-121`). `interruptAudio()` is built and tested, but
  React Native raises no equivalent notification, so nothing calls it yet.
- **`.ultraThinMaterial`** on the transcript card is a flat surface, as everywhere else.
- **Dynamic Type** re-layout is not ported, as in every earlier phase.

### TODOs closed in Phase 9

- `TODO(phase9)` in `app/(tabs)/today.tsx` — sections 7 and 8 are built.
- `TODO(phase9)` in `app/(tabs)/calendar.tsx` — "Add by Voice" opens the real calendar-only session.
- `TODO(phase9)` in `app/ask/voice.tsx` — the shell is the real session.
- `src/voice/speechStub.ts`, `taskCaptureStub.ts`, `taskCaptureTypes.ts` — deleted.
- The third `synchronizeDeviceTimeZone()` call site (`NexdoApp.swift:472`), left open in Phase 7 — the
  voice session syncs the zone before asking for a credential.
- `TODO(phase0-decision)` in `src/voice/nativeDriver.ts` about the speaker route — resolved and
  documented; the volume gap replaces it.

### TODOs still open

- `TODO(server-connect-token)` in `src/query/useCalendar.ts` — a server change.
- `TODO(phase7)` in `src/query/useToday.ts` — the weather coordinates are Swift's own constant.
- `TODO(phase3-decision)` in `src/components/MonthCalendar.tsx` — the hand-built pickers.
- `TODO(phase0-decision)` / `TODO(phase1-decision)` in `app.config.ts` — tablet support, the Android
  package name, the WebRTC plugin's compatibility table.
- The two `TODO(phase1-decision)` colour notes in `src/theme/colors.ts`.

### Needs confirmation on a device

- A full conversation: connect, speak, hear the reply, watch a task appear under "Added this session".
- **Barge-in**: talk over the assistant and confirm its audio stops at once.
- **Mute**: the status reads Muted, the model stops hearing you, unmuting resumes.
- **The inactivity timeout**: say nothing for 45 seconds and hear "Are you still there?", then nothing
  for 20 more and hear "I'll close voice mode for now."
- **Error recovery**: turn off the network mid-session and confirm the message and the closed state.
- **Done**: hear "You're all set." before the screen dismisses.
- **Calendar mode**: an event is created and a task request is refused.
- Read Loud actually playing, and following the slider mid-sentence.
- Sections 7 and 8, which need an account the server actually makes proposals for.

## 20. Final status (Phase 10)

**The Swift app in `ios/` remains the iOS product.** Nothing under `ios/` has been changed, retired
or archived by this migration, and nothing should be until the team has signed off on the Android
review candidate. This section is the state of that candidate.

Android review candidate: **1.0.0-rc.1**.

### Screen parity: 32 of 32

Every screen in section 2 is built, with the `body` range it was read from recorded in the phase
section named below.

| # | Screen | Built as | `body` | Phase |
| --- | --- | --- | --- | --- |
| 1 | Sign in | `app/(auth)/sign-in.tsx` | `RootView.swift:258` | 2 (§11) |
| 2 | Create account | `app/(auth)/sign-up.tsx` | `RootView.swift:472` | 2 |
| 3 | Verify email | `app/(auth)/verify-email.tsx` | `RootView.swift:674` | 2 |
| 4 | Reset password | `app/(auth)/reset-password.tsx` | `RootView.swift:574` | 2 |
| 5 | Tab shell | `app/(tabs)/_layout.tsx` | `RootView.swift:84-190` | 1, corrected in 6 |
| 6 | Today dashboard | `app/(tabs)/today.tsx` | `RootView.swift:924-1199` | 4A, 4B, 8, 9 |
| 7 | Do Now | `app/today/do-now.tsx` | `DoNowView.swift:8-96` | 4A (§13) |
| 8 | Action queue | `app/action/queue.tsx`, `src/components/TodayActions.tsx` | `TodayActionsView.swift:193-220`, `:16-46` | 8 (§18) |
| 9 | Needs attention | `app/today/attention.tsx` | `RootView.swift:1202-1231` | 4B (§14) |
| 10 | Schedule check | `app/today/schedule-check.tsx` | `RootView.swift:1217-1259` | 4B |
| 11 | Overdue tasks | `app/today/overdue.tsx` | `OverdueTasksView.swift:8-70` | 4B |
| 12 | Weekly summary | `app/today/weekly-summary.tsx` | `WeeklySummaryView.swift:12-238` | 4B |
| 13 | Weekly summary tasks | `app/today/weekly-tasks.tsx` | `WeeklySummaryView.swift:245-300` | 4B |
| 14 | Weather forecast | `app/today/weather.tsx` | `WeatherForecastView.swift:8-60` | 4B |
| 15 | Task list | `app/(tabs)/tasks.tsx` | `RootView.swift:1629-1726` | 3 (§12) |
| 16 | Task filters | `app/task/filters.tsx` | `RootView.swift:1705-1726` | 3 |
| 17 | Add task | `app/task/new.tsx` | `RootView.swift:1932-2010` | 3, 8 |
| 18 | Task details | `app/task/[id].tsx` | `TaskDetailsView.swift:28-90` | 3 (rebuilt), 8 |
| 19 | Voice, 3 modes | `app/task/voice-capture.tsx`, `app/ask/voice.tsx`, `app/calendar/voice.tsx` | `AddTaskByVoiceView.swift:27-124` | 9 (§19) |
| 20 | Projects | `src/components/ProjectsList.tsx`, inside the Tasks tab | `ProjectsView.swift:20-108` | 3 |
| 21 | Project detail | `app/project/[id]/index.tsx` | `ProjectsView.swift:180-240` | 3 |
| 22 | Create / edit project | `app/project/new.tsx`, `app/project/[id]/edit.tsx` | `ProjectsView.swift:119-170` | 3 |
| 23 | Ask Nexdo | `app/ask/index.tsx`, `app/ask/text.tsx` | `AskNexdoView.swift:182-277` | 6 (§16) |
| 24 | AI consent | inside `src/components/AskNexdoView.tsx` | `AskNexdoView.swift:348-364` | 6 |
| 25 | Calendar | `app/(tabs)/calendar.tsx` | `CalendarView.swift:20-165` | 5 (§15) |
| 26 | Event details | inside `app/(tabs)/calendar.tsx` | `CalendarView.swift:164-180` | 5 |
| 27 | Add calendar event | `app/calendar/event/new.tsx` | `CalendarView.swift:510-600` | 5 |
| 28 | Schedule conflicts | `app/calendar/conflicts.tsx` | `CalendarView.swift:464-477` | **10** |
| 29 | Account | `app/account/index.tsx` | `ProfileView.swift:65-99` | 7 (§17) |
| 30 | Profile and settings | `app/account/settings.tsx` | `ProfileView.swift:146-270` | 7 |
| 31 | Task action | `app/action/[id].tsx` | `TaskActionView.swift:133-236` | 8 |
| 32 | Message / email composer | the system composers, via `src/actions/composers.ts` | wrappers, no `body` | 8 |

**Screen 28 was the one gap, and Phase 10 closed it.** Phase 5 pointed the Calendar's "Review
conflicts" button at `/today/attention` — a port of a *different* Swift view (`attentionDetails`,
`RootView.swift:1202`). The two list the same attention items, but `conflictSheet` has its own title
("Schedule review"), its own empty state ("No issues reported by schedule intelligence.") and the
`intelligenceStatus()` block (`CalendarView.swift:295-312`). It is now built, tested, and the button
points at it.

### The dictation screen: confirmed dead code

Phase 9 noticed `VoiceInputView` / `LiveVoiceTranscription` and asked whether they were a 33rd screen.
**They are not reachable from the Swift app's UI.** Evidence, from `grep -rn` over `ios/`:

- `VoiceInputView` appears exactly once outside its own file's declaration: never. Its only
  references are its own `struct` (`VoiceInputView.swift:4`), its internal use of
  `LiveVoiceTranscription`, and `ios/Tests/AppModelChecks/VoiceInputChecks.swift`.
- `LiveVoiceTranscription` is referenced only by `VoiceInputView` and
  `ios/Tests/LiveTranscriptionChecks/Checks.swift`.
- `voiceTranscriptionSession()` (`NexdoApp.swift:476`) has exactly one caller:
  `VoiceInputView.swift:109`.
- `VoiceCapture` (`VoiceCapture.swift:6`) is likewise declared and never instantiated.

So `/api/realtime/transcription-session`, `RealtimeTaskAudio.swift` and `RealtimePCMConverter.swift`
serve a screen nothing opens. Nothing was built. This matches the "Not migrating" note already in
section 2, whose line reference is corrected here: `VoiceInputView.swift:4`, not `:5`.

The screen count stays **32**.

### Every TODO in `mobile/`, classified

11 remain. None is unclassified, and none blocks the review.

| Where | Marker | Class | Note |
| --- | --- | --- | --- |
| `app/(auth)/sign-in.tsx` | `phase2-decision` | **Backend gap** | The brief expected a "5 failed logins / 15 min" lockout; the server has none to show. |
| `app/(auth)/verify-email.tsx` | `phase2-decision` | **Backend gap** | The server returns no distinct "too many attempts" code. |
| `src/query/useCalendar.ts` | `server-connect-token` | **Backend gap** | Google OAuth needs the session cookie an in-app browser cannot send. The iPhone app fails identically. One line changes when the server lands the fix. |
| `app/(auth)/_layout.tsx` | `phase2-decision` | Deferred, visual | Sign-in presents reset-password as a sheet; here both are routes in one stack. |
| `src/components/MonthCalendar.tsx` | `phase3-decision` | Deferred, deliberate | Hand-built date grid rather than `@react-native-community/datetimepicker`, whose Android presentation is a dialog and therefore further from `.graphical`. |
| `src/components/TaskCategoryBadge.tsx` | `phase3-decision` | Deferred, needs a dependency | The badge artwork needs `react-native-svg`; not worth a native module for one badge. |
| `src/components/TodayShell.tsx` | `phase3-decision` | Deferred, platform | SF Rounded is an Apple font. |
| `src/theme/colors.ts` ×2 | `phase1-decision` | Deferred, platform | iOS dynamic `.label` / `.secondaryLabel`; the standard dark values are used. |
| `src/query/useToday.ts` | `phase4b-decision` | Deferred, conditional | Port `WeeklySummary.taskGroups(from:)` only if a deployment is found that omits `taskGroups`. |
| `src/query/useToday.ts` | `phase7` | Deferred, no work exists | The weather coordinates are hardcoded in Swift's own `WeatherClient`, not an account setting. The marker stays as a pointer if a location preference is ever added. |
| `src/voice/protocol.ts` | `phase0-decision` | Deferred, harmless | `Math.random` for a session id that only scopes tool idempotency on the device. |

Closed in Phase 10: the `phase1-decision` on `Button.tsx` (the gradient lives in `GradientButton`, which
every real screen uses) and the `phase0-decision` on `nativeDriver.ts` (the speaker route is
implemented through incall-manager). Both are now plain resolution notes. `uuidV4` in
`src/voice/protocol.ts` was deleted outright: `expo-crypto.randomUUID` replaced it everywhere.

### Dev-only code is out of the production bundle

`app/dev/session-check.tsx` and `src/components/DevMenu.tsx` are **deleted**. The session check proved
cookie auth in Phase 1 and the app now does that on every launch; the voice check went in Phase 9 for
the same reason. Deleting them is what actually removes their strings from the bundle — `__DEV__`
guards hide behaviour, but expo-router still registers any file under `app/`, so the route existed in
a preview build.

`NODE_ENV=production npx expo export --platform android`, then grepping the Hermes bundle:

| Needle | Hits |
| --- | --- |
| `session-check` | 0 |
| `voice-check` | 0 |
| `Open session check` | 0 |
| `developer checks` | 0 |
| `[api] ->` | 0 |
| `PHASE 9 REPLACES` | 0 |

The `__DEV__` request log (`src/api/client.ts`) is dead-code-eliminated, and every Phase 3-8 stub is
gone from the source. A literal grep for `DevMenu` returns one hit, which is a fragment of Hermes's
packed string table sitting between icon names (`…mortgaget DevMenumProcessor…`), not a symbol from
this app: the component's own strings return 0, and `expo-dev-menu` does not appear either.

### Error and offline behaviour

**What Swift does when the API is unreachable**: nothing bespoke. `APIError`
(`ios/Sources/NexdoCore/APIClient.swift:7-17`) has no network case at all — a `URLError` propagates
and is shown through `error.localizedDescription`, so the person sees iOS's own sentence. There is no
offline screen, no banner, no queue-and-retry. The only app-wide presentation is the alert at
`RootView.swift:63-65`: **"Unable to complete request"**, the message, one **OK**.

Matched here as follows.

- **Per-request**: `ApiError` with code `NETWORK` and the message "Nexdo could not reach the server.
  Check your connection and try again." Each screen shows it inline, as Swift's screens do.
  **Known difference**: this is Nexdo's own sentence where the iPhone shows iOS's. It says the same
  thing; it is listed in the README's table.
- **Root**: `src/components/RootErrorBoundary.tsx`, mounted in `app/_layout.tsx`. A render error
  anywhere shows Swift's title, the message and **OK**, which re-renders rather than leaving a blank
  screen. SwiftUI has no equivalent because it cannot recover from a crash at all; this is strictly
  a safety net, and it invents no reporting, no stack trace and no "restart the app".
- **Empty states** were built per screen in their own phases, each from the Swift view's own empty
  branch. No new ones were added here.

### Test suite

1,024 tests in 58 suites, all passing. Coverage: **85.94% lines**, 83.66% statements, 79.24%
branches, 75.74% functions.

Thirteen files are under 60% line coverage:

| File | Lines | Why |
| --- | --- | --- |
| `src/config.ts` | 0% | Three lines reading `Constants.expoConfig`; every suite mocks it. |
| `src/components/Card.tsx` | 0% | A styled `View` with no logic. |
| `src/voice/nativeDriver.ts` | 0% | The only file that imports `react-native-webrtc` and `react-native-incall-manager`. Untestable off-device by design; that is why `WebRtcTransport` takes the driver as a parameter. |
| `src/voice/useVoiceSession.ts` | 1.5% | The React lifecycle around the session. The session itself is at 98%; the hook is mocked in the screen tests and is exercised on a device. |
| `src/api/index.ts` | 23.7% | A list of one-line endpoint builders. The ones with shaping logic (assistant, settings, photo, tool) have wire-shape tests; the rest are a URL and a verb. |
| `src/actions/useActionNotifications.ts` | 25% | The `expo-notifications` listener wiring. `handleNotificationResponse` — the part with logic — is tested directly. |
| `src/components/Screen.tsx` | 25% | A `SafeAreaView` wrapper. |
| `src/components/LoadingView.tsx` | 33% | An `ActivityIndicator`. |
| `src/store/appearance.ts` | 37.5% | `hydrate` reads AsyncStorage at launch; the setters are covered through the settings screen. |
| `src/components/AppleSignInButton.tsx` | 39% | Renders nothing on Android (`isAvailableAsync` is false), which is the branch these tests take. |
| `src/query/client.ts` | 40% | The production `QueryClient` defaults; every test builds its own. |
| `src/store/taskQuery.ts` | 50% | Filter state; the filtering logic it feeds is in `src/lib/taskQuery.ts` at 97%. |
| `src/components/SettingsControls.tsx` | 56.7% | The uncovered part is the hand-built slider's responder maths, which needs real touch coordinates. |

**The "worker failed to exit" warning: diagnosed, partly fixed, still present.**
`--detectOpenHandles` reported 20 open handles, **all** of them `Query.scheduleGc` timers — every
`QueryClient` built in a test without `gcTime: 0` schedules a five-minute `setTimeout` per cached
query. Two test files did that (`src/query/useTasks.test.ts`, `src/voice/toolExecutor.test.ts`); both
now pass `gcTime: 0`, and `--detectOpenHandles` reports **zero** handles with the suite green. The
warning still appears in the default parallel run. Bisecting by folder, only `src/__tests__` triggers
it, and **every file in that folder passes individually with no warning** — so the residual is an
interaction between screen suites sharing a worker that Jest's handle tracker cannot attribute. Left
in place; it does not affect results.

A second, unrelated fragility was found and fixed while diagnosing: the reminder and Today-action
fixtures scheduled an action at a fixed offset (now + 1h, now + 10min), which falls outside
`buildActionQueue`'s "rest of today" window whenever the suite runs within that offset of local
midnight. Both now take half the remaining day, so the wall clock cannot change the outcome.

### Static checks

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npx expo prebuild --platform android --no-install` — succeeds; `android/` deleted afterwards and
  the npm scripts it rewrote reverted.
- `npx expo-doctor` — 20 of 21. The one failure is **react-native-incall-manager** and
  **react-native-webrtc** being "untested on the New Architecture". Both are **known to work on a
  physical Android phone**: the Phase 0 proof of concept ran a live WebRTC voice session against the
  production task-session endpoint on this project's New-Architecture build, and Phase 9 kept the same
  transport for every voice mode. The warning reflects the React Native Directory's metadata, not a
  measured failure here.

### The final Android permission list

| Permission | Source | Kept |
| --- | --- | --- |
| `INTERNET`, `ACCESS_NETWORK_STATE` | Expo | yes |
| `VIBRATE`, `WAKE_LOCK` | Expo, notifications | yes |
| `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `BLUETOOTH` | react-native-webrtc | yes — live voice |
| `READ_CONTACTS` | expo-contacts | yes — the contact lookup |
| `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` (`maxSdkVersion="32"`) | expo-image-picker | yes — legacy only; no `READ_MEDIA_IMAGES` |
| `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` | expo-notifications, merged from its own manifest | yes — Android 13+, and restoring reminders after a reboot |
| `CAMERA` | react-native-webrtc | **blocked** |
| `SYSTEM_ALERT_WINDOW` | react-native-webrtc | **blocked** |
| `WRITE_CONTACTS` | expo-contacts | **blocked** — Nexdo only reads |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | expo-audio | **blocked, new in Phase 10** — Nexdo never plays audio in the background; the voice session closes five seconds after backgrounding |

The `nexdo` scheme intent filter is present, from the app's own `scheme`.

### Versioning

`version: '1.0.0-rc.1'` in `app.config.ts`. The Swift app's `MARKETING_VERSION` is **0.1.0**
(`ios/Nexdo.xcodeproj/project.pbxproj:255`) and it keeps that number, because it stays the shipping
iOS product; reusing it here would make two different artefacts claim one version. `-rc.1` says what
this build is.

`android.versionCode` is deliberately absent from `app.config.ts`: `cli.appVersionSource` is
`"remote"`, so EAS owns the build number and the `production` profile increments it.

### Deferred, and why

- **Everything in the README's "Known differences" table** — platform limits and deliberate choices,
  each with its reason recorded in the phase section that made it.
- **The `.graphical` date picker, the SVG category badge, SF Rounded, dynamic system colours** —
  visual fidelity that costs a native dependency or a font licence.
- **Dynamic Type re-layout** — Swift re-stacks several cards at accessibility sizes; not ported in any
  phase.
- **The app-wide "Updating…" pill** (`RootView.swift:62`) — there is no single global busy flag in a
  React Query app; each screen reports its own.

### Backend gaps

These need server work and cannot be closed from `mobile/`.

1. **Google Calendar OAuth.** `/api/calendar/oauth/google/start` requires the account session cookie,
   which no in-app browser sends. **The Swift app is broken in the same way.** The fix is most likely
   a short-lived connect token as a query parameter; the URL is built in one place,
   `googleConnectStartUrl` in `src/query/useCalendar.ts`, marked `TODO(server-connect-token)`.
2. **No mobile push.** The server's only push route is `/api/push-subscriptions`, which is Web Push
   over VAPID for browsers — neither APNs nor FCM. The Swift app registers no device token either, so
   all reminders on both platforms are local notifications. Everything on the client side of a push —
   the category, the four action buttons, the payload routing — is already built and would need only a
   token upload.
3. **No sign-in lockout state** and **no "too many attempts" code** for email verification, so
   neither app can show one.

### iOS: pending until the team signs off

The Swift app ships on iOS today and nothing here changes that. If and when the React Native app is
taken to iOS, these are the open items, none of which has been attempted:

- **The session cookie.** iOS's `WKWebsiteDataStore` and `URLSession` cookie behaviour differs from
  Android's; the cookie-session gate has only been exercised on Android.
- **Sign in with Apple.** `expo-apple-authentication` is installed and `usesAppleSignIn` is set, but
  the button renders nothing on Android, so the whole flow — including the server's
  `/api/auth/apple` round trip — is untested from this app.
- **The marketing version.** `CFBundleShortVersionString` must be numeric, so `1.0.0-rc.1` cannot be
  submitted to App Store Connect. Drop the pre-release suffix before the first TestFlight upload.
- **TestFlight and the bundle identifier.** `com.pinslots.nexdo` is deliberately the same as the Swift
  app's, so an iOS build would **replace** it on TestFlight. That is a decision to make, not a
  default to fall into.
- **Push.** Even with an APNs path on the server, iOS would need the entitlement and a token upload.
- **The realtime voice gain.** The ×3 track gain the Swift app applies has no Android equivalent; on
  iOS the same problem may not exist, which would make the two platforms differ.

### Build commands

```
eas build --profile development --platform android
eas build --profile preview --platform android
```

`preview` is the one testers install: internal distribution, an APK, no dev client, the production
API URL. `production` (an AAB, with `autoIncrement`) is defined but nothing needs it yet.
