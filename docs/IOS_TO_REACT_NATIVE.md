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
- `VoiceInputView` (`VoiceInputView.swift:5`): defined, but nothing opens it.
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
