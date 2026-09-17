# Per-phase on-device test plans (archive)

These are the plans written as each phase landed, kept for the detail they carry about WHY each check
exists and what Swift does at that point. The consolidated walkthrough a tester should follow is in
`mobile/README.md`; this file is the long form behind it.

The developer setup sections at the top are superseded by the README's "For developers".

---

# Nexdo mobile (React Native, Expo)

The React Native replacement for the SwiftUI app in `../ios`. It uses the same Railway API and the same `harbor_session` cookie. The migration plan is in [`../docs/IOS_TO_REACT_NATIVE.md`](../docs/IOS_TO_REACT_NATIVE.md).

**Status:**
- Phase 1 (setup) is done. Screens are placeholders, except the auth screens and the session check.
- Phase 2 (auth) is done: sign-in, sign-up, verify-email and reset-password are built to match the Swift
  screens ([`docs/swift-to-rn-style-map.md`](docs/swift-to-rn-style-map.md)), with the session gate and
  Sign in with Apple. Apple sign-in is **untested** — it needs an iOS device and a new build.
- Phase 0 (voice proof of concept) is at `app/dev/voice-check.tsx`. It needs a **development build** (see "Voice proof of concept"). Everything else still runs in Expo Go.

## Requirements

- Node.js 22 and npm
- An iPhone with **Expo Go** from the App Store. Expo Go must support SDK 57, so update it if it asks.
- The phone and the Mac on the same Wi‑Fi, or use `--tunnel` (below)

No Xcode or simulator is needed.

## Install

```bash
cd mobile
npm install
```

## Run on an iPhone with Expo Go

```bash
cd mobile
npx expo start
```

1. A QR code appears in the terminal.
2. On the iPhone, open the **Camera** app and scan the QR code, then tap the banner to open it in Expo Go.
3. If the phone cannot reach the Mac (a different network, or a client or guest Wi‑Fi), stop the server and run `npx expo start --tunnel`. The first run may ask to install `@expo/ngrok`; accept.

The app opens on **Sign in**, or on Today if a session already exists.

Everything in Phase 2 runs in Expo Go **except Sign in with Apple**, which needs the entitlement and
so only appears in a build made from `app.config.ts` (see "Development builds" below).

## API address

The API origin comes from `extra.apiUrl` in `app.config.ts`:

- Default: `https://harbour-production-f8a0.up.railway.app`
- Override: set `EXPO_PUBLIC_API_URL` before starting Metro. The value must be an `https://` origin with no path.

```bash
EXPO_PUBLIC_API_URL=https://my-staging.up.railway.app npx expo start
```

`app.config.ts` is read when Metro starts, so restart `npx expo start` after changing the variable. The API client refuses non-HTTPS addresses, so a local `http://127.0.0.1:43217` server will not work from the phone.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start Metro for Expo Go |
| `npm test` | Jest (jest-expo, React Native Testing Library). No network: `fetch` is mocked |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint with `eslint-config-expo` |
| `npx expo export --platform ios` | Bundle check without a device |

## Layout

```
app/                     Expo Router routes
  _layout.tsx            QueryClientProvider, theme, session gate (GET /api/me)
  index.tsx              Loading or error, then redirect to /today or /sign-in
  (auth)/sign-in.tsx     sign in, Sign in with Apple, links to sign-up and reset
  (auth)/sign-up.tsx     create account
  (auth)/verify-email.tsx  six-digit code, resend with a 60s cooldown
  (auth)/reset-password.tsx  request a code, then code + new password (one screen, two stages)
  (tabs)/                Today, Tasks, Ask AI, Calendar placeholders
  dev/session-check.tsx  cookie session test (below)
src/
  api/client.ts          port of ios/Sources/NexdoCore/APIClient.swift
  api/types.ts           port of Models.swift, compared with src/lib/types.ts
  api/index.ts           app-wide client and endpoints
  query/                 QueryClient, query keys, useMe, useTasks
  store/session.ts       Zustand session store
  store/consent.ts       voice and AI consent, for Phase 6
  store/lastSignedIn.ts  the greeting name on sign-in (UserDefaults key from the Swift app)
  schemas/auth.ts        Zod rules, derived from src/server/account-auth.ts and the Swift gates
  query/useAuth.ts       sign in, sign up, verify, resend, reset, Apple, sign out
  theme/                 colours from ios/App/RootView.swift, spacing, type, radii, useTheme
  components/            shared UI, including the auth pieces ported from RootView.swift:
                         SignInBackdrop, GlassCard, GradientButton, GradientText, NexdoLogoMark,
                         SignInFieldIcon, RevealablePasswordField, AuthScreen, AppleSignInButton
  __tests__/             tests for screens under app/ (they must NOT live in app/, where Expo
                         Router's require.context would turn them into routes and bundle them)
```

## Auth flows to test on a device

Phase 2 is built but only automated checks have run. Work through these on a phone, in order. You need
a real inbox you can read, because every code is emailed.

Signed out, the app opens on **Sign in**. In a development build the version number at the very bottom
of that screen is a long-press target that reveals the session and voice check links; it appears only
in development builds.

### 1. Fresh sign-up through verification

1. Tap **Create account**. The sheet says "Create your account".
2. **Create Account** stays dimmed until there is a name, an "@" in the email, and both password fields
   have at least 12 characters. Confirm that.
3. Enter a name, a new email address, and the same 12+ character password twice. Tap **Create Account**.
4. Change one character of the confirmation and submit: "The passwords do not match." appears under the
   card and nothing is sent. Put it back.
5. On success the **Verify your email** screen appears, saying a code was sent to that address, expiring
   in 24 hours. The keyboard opens on the code field.
6. Type five digits: **Verify Email** stays dimmed. Type the sixth: it enables.
7. Paste the code from the email instead. Non-digits are stripped and it stops at six characters.
8. Tap **Verify Email**. The app goes to **Today** and shows your name.

### 2. Sign in

1. Sign out (below), then sign in with that account.
2. The greeting now reads **"Welcome back, <first name>"** — it is stored on the device, so it also shows
   before you sign in.
3. The eye button in the password row reveals and hides the password.
4. The email field's Return key moves to the password field; the password field's **Go** submits.
5. A password manager should offer the saved credentials for both fields.

### 3. Wrong password

1. Sign in with a deliberately wrong password.
2. An alert titled **Unable to complete request** shows "Invalid email or password." Tap OK.
3. The password field is cleared; the email is kept.
4. Repeat five or more times.
   **Expected: it keeps saying the same thing.** The server has no login lockout — there is no attempt
   counter, no 429, and no cooldown anywhere in `src/app/api/auth/login/route.ts` or `src/server/auth.ts`.
   If you expected a lockout after five attempts, that is a server change, not a mobile one.

### 4. Unverified account signing in

1. Create an account but do not verify it. Sign out, then sign in with it.
2. The app routes to **Verify your email** with the address filled in and the message "Verify your email
   to sign in...". No code is sent automatically — matching the Swift app. Use **Send a new code**.

### 5. Resend cooldown and too many attempts

1. On the verify screen, tap **Send a new code**.
2. The button becomes **"Send a new code in 60s"**, disabled, and counts down once a second to zero,
   then returns to **Send a new code**. Tapping during the countdown does nothing.
3. Enter a wrong six-digit code and tap **Verify Email** five times.
   On the fifth, the server stops accepting that code and answers "That verification code is invalid,
   expired, or already used. Send a new code and try again." That message *is* the lockout state; the
   API does not distinguish it from an ordinary wrong code. The limit is **five**, not ten.
4. Tap **Send a new code** and verify with the fresh code. It works.

### 6. Reset password

1. From sign-in, tap **Forgot password?**. The address you typed carries over.
2. Tap **Send Verification Code**. The Verification section appears in place, on the same screen.
3. **Update Password** stays disabled until the code is six digits and the new password is 12+ characters.
4. Enter mismatched passwords and submit: "The passwords do not match."
5. Enter the emailed code and a matching new password. On success an alert says **Password updated**;
   tap **Sign In** to return.
6. Sign in with the new password. Note that resetting also verifies the email address.
7. Codes here expire after **15 minutes**, not 24 hours. Leave one for 16 minutes to see it rejected.

### 7. Sign out

1. On **Today**, tap **Sign out** (temporary — Phase 7 moves it to Account).
2. The app returns to **Sign in** and the greeting still shows your first name.
3. Open the session check and tap **Who am I**: *failed*, `401 SIGNED_OUT`.

### 8. Force-quit while signed in

1. Sign in, then force-quit the app from the app switcher.
2. Reopen it. It must show the splash briefly and go **straight to Today**, never flashing sign-in.
3. Repeat while signed out: it must land on **Sign in**, not on Today.

### 9. Sign in with Apple (iPhone only)

Untested. On Android the button does not render at all, which is correct for this phase. On iOS it
needs a build carrying the Sign in with Apple entitlement (see below).

1. The black **Continue with Apple** button appears under the OR rule.
2. Tapping it opens the system sheet. Completing it signs in and lands on Today.
3. Cancelling it shows no error, matching the Swift app.
4. Apple returns a name only on the **first** authorization for this app. To test that path again,
   remove the app from Settings > Apple ID > Sign in with Apple.

## Cookie session test (Phase 1 gate)

This checks that the session cookie from sign-in is stored by iOS, sent with later requests, and **survives a force-quit**. If it does not, the fallback is bearer-token support on the server. That is not built yet.

You need an existing, **email-verified** Nexdo account on the production server.

1. Start Metro (`npx expo start`) and open the app in Expo Go on the iPhone.
2. Open the session check:
   - Signed out: tap **Open session check** on the sign-in placeholder.
   - Or open the URL directly: in the Metro terminal, the `exp://…` address plus `/--/dev/session-check`.
3. Tap **Sign out** first, so the test starts from a clean state. Then tap **Who am I**. Expected: *failed*, `ApiError status=401 code=SIGNED_OUT`.
4. Enter the email and password and tap **Sign in**. Expected: *succeeded*, with `{ id, name, email }`. The log shows `POST /api/auth/login` with status `200`.
5. Tap **Who am I**. Expected: *succeeded*, showing your profile (`user.id`, `user.email`, `user.timeZone`, …). The log shows `GET /api/me` with status `200`. **This proves the cookie is sent.**
6. **Force-quit Expo Go:** swipe up from the bottom edge and pause to open the app switcher, then swipe Expo Go away.
7. Reopen Expo Go and open the project again, from **Recently opened** or by scanning the QR code again. Do not sign in. Expected: the app goes straight to **Today** and shows your name.
8. Open the session check again (**Open session check** on Today) and tap **Who am I**. Expected: *succeeded* with your profile. **This proves the cookie persists.**
9. Tap **Sign out**, then **Who am I**. Expected: *failed*, `401 SIGNED_OUT`. This shows sign-out clears the cookie.

**Pass:** steps 5, 7 and 8 succeed.
**Fail:** step 5 fails (the cookie is not sent), or steps 7 and 8 show signed out (the cookie is not persisted). Record the log panel contents (take a screenshot) for the decision on the bearer-token fallback.

The log panel's "Set-Cookie visible" column is informational only. The cookie is `HttpOnly`, and iOS may or may not show the header to JavaScript. That does not change whether the native cookie store keeps it.

Note: Expo Go keeps cookies in its own app container. A standalone or development build has a separate container, so repeat this test once on the first development build.

## Voice proof of concept

Phase 0 checks whether a live voice conversation works from React Native against the existing backend. This is the go/no-go gate for Phase 9. The protocol, and how it maps from Swift, is in [`docs/voice-protocol.md`](docs/voice-protocol.md).

The proof of concept uses native code (`react-native-webrtc`, `react-native-incall-manager`), so **it does not run in Expo Go**. You need a development build: your own app with the Expo dev client inside.

### Sign in with Apple needs a new build

`expo-apple-authentication` and `ios.usesAppleSignIn` were added in Phase 2. They change the native
project, so the existing Android development build does **not** contain them, and neither does Expo Go.

- **Android:** nothing to do. Apple sign-in never renders there, and every other Phase 2 change is
  JavaScript, so the existing development build picks them up from Metro:
  `npx expo start --dev-client`.
- **iOS:** a build is required before Apple sign-in can be tested at all, and the bundle ID
  `com.pinslots.nexdo` needs the Sign in with Apple capability on its Apple Developer App ID:

  ```bash
  cd mobile
  npx eas-cli@latest build --profile development --platform ios
  ```

### Build the Android development build (EAS, once)

EAS builds in the cloud, so no Android Studio is needed on the Mac.

```bash
cd mobile
npm install
npx eas-cli@latest login                      # skip if `npx eas-cli whoami` already shows your account
npx eas-cli@latest init                       # first time only: creates the EAS project and writes its ID into app config
npx eas-cli@latest build --profile development --platform android
```

- **`eas init`:** `app.config.ts` is TypeScript, so EAS cannot write into it. If it asks, add the printed `extra.eas.projectId` to `app.config.ts` by hand and run the build again.
- **Keystore:** the first build asks whether to generate one. Answer **yes**; EAS stores it.
- **Result:** the build finishes with a URL and a QR code for an `.apk`.

To install the APK on the Android phone:
1. Open the build URL (or scan the QR code) on the phone, and download the APK.
2. Open it. Android asks to allow installs from the browser or Files app; allow it once, then **Install**.
3. The app appears as **Nexdo** with the Expo dev client launcher. It replaces nothing and can sit next to Expo Go.

Rebuild only when native dependencies or `app.config.ts` plugins change. JavaScript changes load from Metro as usual.

### Run it

```bash
cd mobile
npx expo start --dev-client          # add --tunnel if the phone is on another network
```

Open the **Nexdo** development build on the phone and pick the Metro server it lists, or scan the QR code.

### Test procedure (Android phone)

You need a verified account, and a web browser signed in to the same account at `https://harbour-production-f8a0.up.railway.app/tasks`.

1. **Cookie in the dev build.**
   - The first time, the app opens on the sign-in placeholder, because cookies are not shared with Expo Go. Open **session check** and sign in. The app switches to **Today**.
   - Force-quit the development build and reopen it. It must open on **Today** without signing in.
   - Open **voice check**. The footer shows `GET /api/me on mount` with `200, signed in as <email>`.
2. **Connect.**
   - Turn on the sharing switch and tap **Start**. Allow microphone access when Android asks (the first time only).
   - Expected: the log shows `POST /api/realtime/task-session`, `microphone: 1 audio track(s)`, `POST OpenAI /v1/realtime/calls`, `SDP answer`, then `data channel "oai-events" open`. Status becomes **connected**.
   - **Start → data channel open** should be a few seconds at most.
3. **Talk.**
   - Say "What's on my schedule today?" Expected: `input_audio_buffer.speech_started` / `committed`, `send response.create`, then `output_audio_buffer.started`.
   - You hear a spoken reply **from the loudspeaker**. **End of speech → first audio back** shows a figure.
4. **Create a task.**
   - Say "Add a task called test tomorrow at 3 pm for 30 minutes." The model may ask a follow-up; answer it.
   - Expected: `[tool] call create_task …`, `POST /api/realtime/tool (create_task)`, `result create_task: {"success":true,"task":{…}}`, then a spoken confirmation.
   - Refresh the web Tasks page. The task **test** is there.
   - If the result is `requiresConfirmation`, the model reads out the scheduling warning; say "yes, create it anyway".
5. **Stop.** Tap **Stop**.
   - Status returns to **idle**, the log ends with `stopped`, and the microphone indicator in the Android status bar goes away.
   - The phone's audio routing returns to normal; for example, media plays from the loudspeaker again.
6. **Start again.** Tap **Start** again without restarting the app. It must connect and answer as in steps 2–3.

**Pass:** steps 1–6 all behave as described.

If something fails, screenshot the whole event log, including latency and the footer, and note the step. The first line in red is usually the cause. `ICE failed` or `disconnected` after `SDP answer` points to the network (UDP blocked); try another Wi‑Fi network or mobile data.

PoC limits, left for Phase 9:
- no mute
- no barge-in handling beyond what OpenAI's server does
- no inactivity timeout
- `end_session` does not close the call; use **Stop**
- contacts (`prepare_call` / `prepare_email`) always report unavailable

## Phase 3 on-device test plan

Tasks and projects. Run these in order on a signed-in phone, with the Swift app open beside you for
the visual checks. Nothing in Phase 3 has been run on a device yet.

Watch the Metro terminal throughout: the `__DEV__` request log prints the exact method, URL and body
of every request, with passwords and codes redacted.

Before you start, you need an account with a handful of tasks spread across today, tomorrow, later
this week and last month, plus at least one completed task and one recurring task.

### 1. The list

1. Open the Tasks tab. The header reads "Tasks" / "Turn intent into action.", with a filter button and
   a search button on the right.
2. The four date pills read Today, Tomorrow, This Week, All. Only the first three carry a count.
3. Check each pill count against the list it opens: tap the pill and count the rows. A disagreement
   here means the snapshot pass is wrong, not the display.
4. Tasks are grouped under day headings with a "N tasks" count on the right, open work before
   completed work.
5. Pull down to refresh. The list should reload without flicker.
6. Switch to All. The history range control appears; try This Month, Last Month and Last 2 weeks.
   Under Last 2 weeks, open tasks scheduled beyond the range should still be listed, at the top.

### 2. Search

7. Tap the search button. Type part of a task title; the list narrows as you type.
8. Type part of a task's NOTES instead. It should match too.
9. Try a term with different case and accents from the original.
10. Tap the clear button. The field closes and the full list returns.

### 3. Filters

11. Tap the filter button. The sheet has Status, Priority, "Earliest due first" and Reset filters.
12. Set Status to Completed. Only completed tasks remain. Set it to All: completed sections gain a
    "Completed · " prefix.
13. Set a Priority. The options listed are only the priorities present in your tasks.
14. Toggle "Earliest due first" off. Within a day, the order reverses.
15. Switch the date pill to All; the "Earliest due first" toggle disappears, as in Swift.
16. Tap Reset filters: status back to Open, priority to All, earliest-first on. The date and the
    search term are deliberately NOT reset.

### 4. Creating a task

17. Tap "Add Manually". The sheet has TASK NAME, NOTES, PROJECT, DATE and TIME ESTIMATE, and nothing
    else.
18. "Create Task" stays grey until the title has non-space content.
19. Expand NOTES; the collapsed row previews the first line.
20. Pick a duration chip, then use the custom stepper: it moves in fives and stops at 5 and 480.
21. Choose Tomorrow, then create. In the Metro log, confirm the body is exactly
    `{"projectId":null,"title":...,"notes":...,"durationMin":...,"startAt":...}` and that `startAt` is
    tomorrow at the CURRENT time, not midnight.
22. After the save, the list should move to the day the task landed on, with the filters cleared.

### 5. Completing, and recurrence

23. Tap a task's circle. The circle should not flip until the server answers; it is disabled while the
    write is in flight. This matches Swift, which is not optimistic here.
24. Tap it again to restore it. Confirm the Metro log shows `{"status":"PLANNED"}`.
25. Complete the RECURRING task. After the refetch, the next occurrence should appear in the list; the
    server creates it, not the app.

### 6. Editing a task

26. Tap a task row. The detail sheet opens with the title, a Critical toggle, notes, priority, energy,
    time estimate, repeats and steps.
27. Change only the priority and save. In the Metro log, the PATCH body should contain ONLY
    `{"priority":...}` — nothing else.
28. Change only the duration on a SCHEDULED task and save. Two requests go out: the details body, then
    a schedule body carrying `startAt` and `durationMin`, because the server revalidates the slot.
29. Add a step, toggle one complete, rename one, delete one. Save. The `subtasks` key should be an
    array of titles, and the server replaces every row.
30. Set Repeats to Weekly, save, reopen: the value should have stuck.
31. Open a task, change nothing, and confirm "Save changes" stays disabled.
32. Delete a task from the detail footer and confirm it leaves the list.

### 7. The schedule conflict flow

33. Create or edit a task so it overlaps an existing one. The server answers 409 `SCHEDULE_WARNING`.
34. An alert titled "Review this time" lists the conflicts, with "Keep previous schedule" and
    "Save anyway".
35. Tap "Keep previous schedule": nothing is saved, no second request in the log, and no error alert.
36. Repeat and tap "Save anyway": the SAME body is resent with `"allowScheduleConflict":true`.

### 8. Voice capture (stub)

37. Tap "Add by Voice". First time, the consent alert appears with the OpenAI sharing wording.
38. "Not now" closes the screen. Reopen and choose "Allow and start".
39. The status line steps Listening… → Connecting… → Ready to add, then a fixed transcript appears.
    THIS IS A STUB: it is a canned transcript on timers, not real transcription. Phase 9 replaces it.
40. Tap "Add this task". The task is created through the same endpoint as the manual editor, and
    "Added this session" lists it.
41. Force-quit and reopen the app, then open voice capture again: the consent alert must appear again,
    because consent is in memory only, exactly as in Swift.

### 9. Projects

42. Tap the Projects segment. The header reads "Projects" with a "New project" button, a search field
    and a sort button.
43. Each project card shows a coloured folder, the name, "Open: N   Done: N" and a progress bar. Check
    the counts against the project's real tasks.
44. Below the cards, a "No project" folder shows the unassigned open and done counts.
45. Type part of a project name into the search field; the grid narrows. Clear it.
46. Tap the sort button and try each of Recently updated, Name, Most tasks, Highest completion. Confirm
    the order changes and that ties keep a stable order.
47. Tap "New project". The sheet has a name field and a six-colour grid.
48. Leave the name blank: "Done" stays grey. Type 81 characters: the rule "Use 1–80 characters,
    excluding surrounding spaces." appears and Done stays grey.
49. Type a name, pick a colour, tap Done. In the Metro log the body is exactly `{"name":…,"color":…}`
    with the name trimmed. The new project appears in the grid.
50. Open a project. It pushes (it does not present as a sheet) and lists that project's OPEN tasks
    only, with a "N tasks" count.
51. Tap the filter button; switch Status to All. Completed tasks appear. Try a priority. Tap
    "Reset filters": status returns to Open, priority to All.
52. Search inside the project; only that project's tasks are matched.
53. Tap the "+" button. The task editor opens with THIS project already selected in the PROJECT field.
    Create a task and confirm it appears in the project.
54. Open the "···" menu: Add task, Edit project, Delete project.
55. Edit the project: the form is pre-filled with the current name and colour. Change both, save,
    reopen: the change stuck.
56. Delete the project. The confirmation reads "Its tasks will move to No project. No tasks will be
    deleted." Confirm, then check that its tasks now appear under the "No project" folder and that
    none were deleted.
57. Open the "No project" folder and confirm it lists unassigned tasks and has no Edit/Delete actions.

### 10. Project assignment on the task editor

58. Open "Add Manually". The PROJECT field reads "No project".
59. Tap it: the list shows "No project" followed by every project, sorted by name.
60. Pick a project; the field shows its name and its colour on the folder glyph.
61. Create the task and confirm the Metro log body carries `"projectId":"<the id>"`, not null.
62. Repeat, setting it back to "No project", and confirm the body carries `"projectId":null`.

### 11. The date picker

63. On the task editor, tap "Select Date". A sheet titled "Select Date" opens with a month grid.
64. The grid starts on Monday and highlights today.
65. Step back and forward a month with the ‹ › buttons. Step from a 31-day month into a 30-day one and
    confirm the selection clamps to the last day rather than rolling over.
66. Pick a day, tap Done. The date button now reads that date as "MMM d, yyyy".
67. Create the task. In the Metro log, `startAt` is the chosen DAY at the CURRENT time of day — not
    midnight, and not today.
68. NOTE: this is a hand-built grid, not the iOS system picker. Compare it against Swift's
    `.datePickerStyle(.graphical)` and decide whether the difference is worth a native dependency and
    a rebuild; the trade-off is recorded in section 12 of `docs/IOS_TO_REACT_NATIVE.md`.

### 12. The task detail screen

This screen was rebuilt after the first port came out wrong. Compare it against the iPhone section by
section, top to bottom; the order below IS the Swift order.

69. Open a task. The header shows "TASK DETAILS" above the task title, with a round X on the right.
70. For a task with a SHORT, VAGUE title and no steps yet (try "Kitchen"), a tinted card reads
    "What would you like to do about "Kitchen"?" with a Work on it / Contact someone control.
    For "Pay the rent", or for any task that already has steps, the card should NOT appear.
71. On "Work on it": the field reads "First step, e.g. Draft three presentation slides". "Save next
    step" stays grey until you type at least TWO words.
72. Type a step and save. In the Metro log the body is `{"title":…,"subtasks":[…]}` — the same text as
    both the title and the only step. The card then disappears, because the task now has a step.
73. On "Contact someone": the field pre-fills with the task title, and Call / Message / Email save a
    title like "Call Damien". NOTE: Swift then opens the action sheet; that is Phase 8 and does not
    happen here.
74. Below the card: "Start a 25-minute focus session" and "Start task". These are the Phase 4 stub —
    nothing should happen and no request should appear in the log.
75. TASK: the title field.
76. PRIORITY and ESTIMATE sit SIDE BY SIDE. Priority reads "Normal" for a NORMAL task. Estimate reads
    "30 min" and its menu offers 15/30/45/60/90/120 plus Less and More in fives.
77. PROJECT: the same assignment control as the creation form.
78. SCHEDULE: a card with a date chip and a time chip side by side. For an UNSCHEDULED task it instead
    shows "Set date and start time"; tap it and the chips appear.
79. REPEAT: reads "Does not repeat" when there is no rule.
80. The checkbox reads "Important reminders" with "Use escalation channels" beneath it. It is a
    CHECKBOX, not a switch.
81. STEPS: existing steps each with an X to remove, then an "Add a step" field with an Add button.
82. NOTES last, as a multi-line field.
83. The bottom bar has "Mark complete" (green) and "Save changes" (tinted) SIDE BY SIDE. "Save changes"
    stays dim until something is dirty.
84. Edit the title, then tap "Mark complete". TWO requests should appear in the log: the title change
    first, then `{"status":"COMPLETED"}` — Swift saves the buffer before flipping.
85. Type into "Add a step" without pressing Add, then tap "Save changes". The unsent step should still
    be included in the `subtasks` array.
86. Confirm NONE of these appear, because the Swift view has none of them: an ENERGY section, a
    "Critical" switch, a "TIME ESTIMATE" heading, or a "REPEATS" heading.

### 13. Visual parity

87. With the Swift app beside you, compare the list, the creation sheet and the detail sheet in light
    and dark mode. The known differences are listed under "Visual gaps" in section 12 of
    `docs/IOS_TO_REACT_NATIVE.md`; anything NOT on that list is a defect worth reporting.
88. Check the category badges in particular: they carry no artwork here, only a coloured dot.
89. Check the four menus in the projects screens: they open as inline lists, not floating popovers.

## Phase 4A on-device test plan

The Today dashboard, Do Now, and the focus runtime. Run these in order on a signed-in phone with the
Swift app beside you. Watch the Metro terminal: the `__DEV__` request log prints every request.

You need an account with a few tasks today, one two days out, at least one overdue task, and one
synced calendar event today.

### 1. The dashboard, top to bottom

1. Open the Today tab. The order must be: top bar, greeting, range picker, Weekly Summary card, then
   the intelligence card. Nothing else.
2. The greeting reads "Good morning/afternoon/evening, <first name>" and switches at noon and 17:00 in
   the ACCOUNT time zone, not the phone's. The line under it reads "Wed, Sep 16, 2026".
3. The top bar shows the Nexdo mark, a weather chip, a "+" button and your avatar.
4. Tap "+": the task editor opens.
5. Pull down to refresh. Tasks, agenda and weather all reload.

### 2. The range picker

6. Today / 3 days / 5 days. Today is selected on open.
7. Switch to 5 days. The schedule list grows, and the headline changes from "N commitments today" to
   "N commitments ahead" and from "Your day, in focus" to "Your next 5 days".
8. Check the counts against the list: "N Tasks · N Appointments" must equal what is listed.

### 3. The schedule list

9. Events and tasks appear together, ordered by time, with critical tasks FIRST regardless of time.
10. Each row shows the time on the left, a calendar or check glyph, the title, and a detail line
    reading "Planned task", "Task deadline", "Critical task" or "Calendar appointment".
11. A task scheduled with only a due date reads "Due 5:00 PM".
12. Tap a task row: the task detail opens. Tap an event row or "View day": the Calendar tab opens.
13. With more than seven items, a "View N more" row appears at the bottom.
14. With nothing scheduled, the list reads "Your schedule is clear" / "Add a task or enjoy the open
    space."

### 4. Search

15. Tap the magnifying glass in the schedule header. Type part of a task title; the list narrows.
16. Search matches TASKS ONLY — an event title must not match, even exactly.
17. Multiple words must ALL match (title or notes).
18. A term with no match reads "No matching tasks" / "Try different keywords or select a wider date
    range."

### 5. The attention chip

19. With overdue tasks, the summary shows an orange "N things need attention" chip; with none, a green
    "Nothing needs attention".
20. NOTE: tapping the chip does nothing yet. The attention detail screen is Phase 4B.

### 6. Weather

21. The chip shows a condition glyph over a temperature in Fahrenheit.
22. Turn airplane mode on and reopen the tab: the chip shows "–°" and NO error alert appears.
23. NOTE: the coordinates are hardcoded to San Ramon, California, in Swift (`WeatherClient.swift:17`).
    The reading is NOT for your location, and the app never asks for location permission. If the
    temperature looks wrong for where you are, that is why, and it matches the iPhone.
24. Tapping the chip does nothing yet; the forecast sheet is Phase 4B.

### 7. Do Now

25. Tap "What should I do now?" in the intelligence card. The sheet opens titled "What should I do
    now?" with a "Done" button.
26. First time, with AI consent withdrawn, it shows the consent paragraph and "Allow and find my next
    task". Tap it.
27. It reads "Finding your best next step…", then either a recommendation or a message.
28. The headline reads "You have N minutes free now", or "Outside your working hours".
29. The best action card shows the task, "~N min", a reason, and "Start Focus Session".
30. Enter 45 in "Minutes available" and tap Update. The recommendation refreshes for that window, and
    "Use my calendar opening" appears; tap it to go back.
31. Enter 0 or 900 and tap Update: "Enter between 1 and 480 minutes."
32. Leave the sheet open for a minute; it refreshes on its own.
33. Tap "Start Focus Session". The sheet closes and the focus strip appears on Today.

### 8. The focus runtime

34. On a task detail, tap "Start a 25-minute focus session". In the Metro log the body is
    `{"status":"IN_PROGRESS","focusMinutes":25,"fromRecommendation":false}`.
35. The focus button is REPLACED by the strip, showing the task title and a counting-down 25:00.
36. Go to Today: the SAME strip is there, with the same countdown.
37. Background the app for a minute and return: the countdown has advanced by a minute. It is derived
    from the clock, not from ticks.
38. FORCE-QUIT the app and reopen: the session is GONE. That matches Swift, where `focusSession` is a
    plain published property with no persistence. Do not report it as a bug.
39. Tap "End focus". In the log: `{"focusAction":"finish","focusToken":…,"endedAt":…}` plus
    `workSessionId` when the server sent one.
40. Start a session and let it run out. At zero the title reads "Focus finished", the button reads
    "Finish", and the session closes itself with the same finish request.
41. Start a session on task A, then start one on task B: A is finished first, then B starts — two
    requests, in that order.
42. Complete a task that has a live session: the session ends as part of completing it.
43. There is NO pause and NO cancel. The only control is End focus. That is Swift.

### 9. Sign out

44. Sign-out has moved off Today. Long-press the version number at the bottom of the Today screen (or
    the sign-in screen) to open the `__DEV__` menu, then tap "Sign out". This is a development-only
    affordance; Phase 7 puts the real control on the Account screen.

### 10. What is NOT here yet (Phase 4B)

45. Confirm these are ABSENT rather than broken: the action queue, the protected-time card, the
    persistent next-action card, the "Needs your attention" list, the weekly summary screen, the
    overdue screen and the weather forecast sheet.

## Phase 4B on-device test plan

The remaining Today screens. Run these after the Phase 4A plan, on a signed-in phone with the Swift
app beside you. You need at least one overdue task, one synced calendar event, and a week with some
completed work so the weekly summary has something to show.

### 1. Overdue

1. From Today, tap the attention chip, then the overdue row; or reach it from the attention screen.
   The title reads "Unfinished deadlines".
2. Tasks are listed OLDEST FIRST, each with a red "Due <medium date> at <time>" line.
3. The header reads "N UNFINISHED DEADLINES", singular for one.
4. A task whose deadline passes while you watch appears within a minute, without a manual refresh.
5. With nothing overdue: "No unfinished deadlines" / "You have no overdue tasks."
6. Tap a row: the task detail opens. Reschedule it, come back, and confirm it has left the list.

### 2. Weather forecast

7. Tap the weather chip on Today. The sheet is titled "Weather".
8. The heading reads "San Ramon" and "5-day forecast · °F". San Ramon is CORRECT: the coordinates are
   hardcoded in Swift and the app never asks for your location.
9. The current reading shows a condition glyph and a large temperature.
10. Five day rows follow, each with a weekday, a condition name, a glyph, and H/L temperatures.
11. The first row reads "Today" — note this is today in the FORECAST's zone (America/Los_Angeles),
    which may be yesterday's date where you are. That matches Swift.
12. A day with rain shows "N% chance of precipitation".
13. Turn airplane mode on and reopen: "Couldn't load the forecast. Please try again." with a Retry.
14. "Weather by Open-Meteo" opens the provider's site.

### 3. Weekly summary

15. Tap the Weekly Summary card on Today.
16. The week selector reads "Sep 14–Sep 20, 2026". "Next week" is DISABLED on the current week.
17. Tap "Previous week": the range moves back a week and the report reloads. "Next week" enables.
18. The summary card shows the headline and the paragraph.
19. Four metric cards: "N of N Tasks completed", a completion rate, "Overdue tasks", and
    "Recorded focus time" (minutes under an hour, otherwise one decimal such as "2.5h").
20. A metric the server could not compute reads "Unavailable", not a blank or a zero.
21. The chart shows two bars per day, planned and completed. NOTE: this is hand-built, not Swift
    Charts, so it has no axis chrome or legend — compare the DATA, not the styling.
22. Tap a weekday letter: a line appears reading "Wed, Sep 16: 5 planned, 3 completed".
23. With no activity all week: "No task activity" and the explanation.
24. "Top accomplishments" lists completed tasks; tapping one opens the task detail.
25. Tap "Share": the system share sheet opens with the headline and summary.
26. Tap "Plan next week with Nexdo AI →". NOTE: it routes to Ask, which is Phase 6 — expect a
    not-found screen for now, and check the Metro log rather than the screen.

### 4. Weekly summary task list

27. From the weekly summary, tap "Tasks completed". The list opens on the Completed filter.
28. The header shows the week as "Mon, Sep 14 – Sun, Sep 20".
29. Tap the filter row and switch to Planned, then Overdue. The list and the count change.
30. On Overdue only, a caveat appears explaining the list is as of the report.
31. An empty group reads "No <filter> tasks for this period."
32. Tap a task: its detail opens.
33. Go back to the summary and tap "Overdue tasks": the list opens on the Overdue filter directly.

### 5. Needs your attention, and the schedule check

34. With schedule intelligence available, Today shows a "Needs your attention" card listing each item,
    with the OVERDUE item first.
35. Tap the attention chip in the summary instead: the same items open as their own screen.
36. Tap the overdue item: the overdue list opens.
37. Tap a non-overdue item: the schedule check opens, showing the explanation, the recommended action,
    and a section titled "Tasks needing N minutes by <time>".
38. Each affected task is listed with "N minutes · due <time>"; tapping one opens its detail.
39. If those tasks have since been rescheduled: "The affected tasks are no longer available."
40. With intelligence unavailable, the attention screen offers the overdue list instead. Swift does the
    same fall-through.
41. On Today, confirm the attention COUNT comes from intelligence: it may differ from the number of
    overdue tasks.

### 6. The Today schedule with intelligence

42. With intelligence loaded, the Today schedule list comes from the SERVER timeline, not the agenda.
    Rows may differ from the 3-day and 5-day views, which always use the agenda. That is Swift.
43. If the server returns a snapshot dated other than today, the app ignores it and falls back to the
    agenda. Hard to force by hand; if the schedule ever looks a day stale, this is the guard to check.

### 7. Still not built

44. Confirm these are ABSENT rather than broken: the action queue ("Next up", the "Nexdo Action" card,
    the snooze menu and the "View all" sheet), the protected-time card, and the persistent
    next-action card. All three need the reminders work in Phase 8 or the next-action service.

## Phase 5 on-device test plan

The Calendar tab. Run on a signed-in phone with the Swift app beside you. You need a few tasks spread
over the next week, at least one with only a due date, one critical task, one overdue task, and at
least one synced calendar event.

### 1. The tab, top to bottom

1. Open Calendar. The order is: "Calendar" / "Plan your time. Make it happen." with a search button,
   then the Schedule / Week / Month segments, then the Schedule Intelligence card, then Upcoming.
2. The tab bar now shows a calendar icon. The other three tabs are still labels only, by design.
3. Pull down to refresh. Tasks, the agenda and schedule intelligence all reload.

### 2. Schedule mode

4. "Upcoming" shows a range button reading "Next 3 days" and a filter button.
5. Tap the range button: Next 3 days / Next 7 days / This week. Choosing "This week" switches to the
   MONDAY-first week, not the next seven days.
6. The summary card reads "N items · N deadlines" and a second line with the overall overdue count.
7. Each day has a heading. Today reads "Today · Wed, Sep 16" and tomorrow "Tomorrow · Thu, Sep 17".
8. A day with nothing reads "Nothing scheduled. Room to breathe."
9. At the bottom, "Unscheduled & overdue  N" expands to list tasks with no start date or a past
   deadline, each overdue one carrying an amber badge. Empty reads "No unscheduled or overdue tasks."

### 3. The merged day rows

10. Tasks and events appear together, ordered by time, with a time gutter on the left and a connector
    rail down the middle.
11. A SCHEDULED task reads "30 min · Task"; a task that only has a due date reads "Due 5:00 PM" and
    "Task deadline", with a "Deadline" badge.
12. A repeating task adds "· Repeats".
13. An event reads its duration and "Event"; an all-day event reads "All day" and "Calendar event".
14. A multi-day event shown on a middle day starts at 12:00 AM and reads 1440 min. That is correct:
    Swift clamps the event to the day being shown.
15. Colours: indigo normally, amber for overdue, red for critical. Check an overdue task shows the
    document glyph rather than the checkbox.
16. Tap a task row: the Phase 3 task detail opens. Tap an event row: the event detail sheet opens.

### 4. The event detail sheet

17. It is titled "Event Details" and shows the event title, then "Starts:", "Ends:" and the account
    time zone, with a Done button. An all-day event adds an "All day" line.
18. NOTE: there is no edit or delete here. Swift has neither, so neither does this.

### 5. Week and Month modes

19. Week mode: a MON…SUN column header, seven day cells, and a range label "Sep 14 – Sep 20, 2026".
20. Month mode: a SUN…SAT header, a full month grid padded to whole weeks, and a "September 2026"
    label. Days outside the month are dimmed.
21. Under each day cell, up to three dots: blue for planned, amber for overdue, red for critical. The
    legend below says so.
22. Tap a day: only that day's items are listed beneath the grid.
23. The arrows move a week in Week mode and a month in Month mode. From 31 October, "next" lands on
    30 November rather than rolling into December.
24. "Today" returns to the current period.
25. Week mode adds a card reading "Your Wednesday" with the item count and the planned minutes.

### 6. Filters

26. Tap the filter button: Tasks, Calendar events, Completed, Critical only, Reset filters.
27. Turn off "Calendar events": events disappear, tasks remain.
28. Turn on "Critical only": ALL events disappear too, leaving only critical tasks. That is Swift —
    critical-only suppresses events entirely.
29. Turn on "Completed": "Critical only" switches itself off, the heading changes from "Upcoming" to
    "Completed", and the list shows completed tasks and events whose END time has passed.
30. With filters on, an empty day reads "No items match your filters." rather than the clear-day copy.
31. "Reset filters" restores all four.

### 7. Search

32. Tap the magnifying glass. The field reads "Search events and tasks" and below it a line naming the
    date range being searched.
33. Type a keyword: only matching days are listed. Search covers both tasks and events.
34. A term with no match reads "No matching events or tasks in this date range. Try another keyword,
    date range, or filter."
35. "Cancel" clears the term and closes the field.

### 8. Creating an event

36. In Schedule mode, the Schedule Intelligence card has "Add by Voice" and "Add Manually".
37. Tap "Add Manually". The sheet is titled "New Appointment / Event" with a Close button.
38. Fields, in order: APPOINTMENT / EVENT, SCHEDULE (Starts, Ends, the time zone), REPEAT, LOCATION,
    NOTES. There is NO all-day toggle, no attendees and no calendar picker — Swift has none.
39. "Create Event" stays grey until there is a title.
40. Starts defaults to an hour from now and Ends to ninety minutes. Move Starts: Ends moves with it,
    keeping the same gap.
41. Choose a repeat frequency. "Particular days of the week" reveals a Mon…Sun grid, and Create stays
    grey until at least one day is chosen.
42. With a repeat set, "Repeat until" appears with an explanatory line that differs for Monthly.
43. Create the event. In the Metro log the body is exactly
    `{"requestId":…,"title":…,"notes":…,"location":…,"startAt":…,"endAt":…}` plus `repeat` only when
    a frequency is set. The route's schema is strict, so any extra key would be a 400.
44. Set a start in the past and save: "Choose a future start time." appears before any request.
45. Create an event overlapping an existing commitment. The server answers 409 and an alert titled
    "Review this time" appears with "Keep previous schedule" and "Save anyway".
46. "Save anyway" resends with `allowScheduleConflict: true` AND THE SAME `requestId`. Check the log:
    a different requestId would create a duplicate repeat series.
47. "Keep previous schedule" sends nothing more and leaves the form open with your entries.

### 9. Connect Google Calendar — NOT in this phase

48. Confirm the Calendar tab has NO "Connect Google Calendar" or "Synchronize now" button. In Swift
    both live in Profile → Settings → "Calendars and privacy", which is Phase 7. Their absence here is
    correct, not a gap.
49. When Phase 7 builds the button, expect it to FAIL against the current server: the start route
    needs the account session cookie, which an in-app browser does not send, so the server returns a
    blank page instead of redirecting to Google. The Swift app has the same failure today.
50. What "pass" looks like once the server fix lands: tapping Connect opens a Google sign-in page in an
    in-app browser; after consent it returns to `nexdo://…`; a callback carrying `calendar=error` or
    any `detail` parameter is a failure and its text is shown; a clean callback reads "Google Calendar
    connected and synchronized." The URL is built in ONE place,
    `googleConnectStartUrl` in `src/query/useCalendar.ts`, marked `TODO(server-connect-token)` — adding
    the token there is the only mobile change needed.

## Phase 6 on-device test plan

Ask AI in text mode. Sign in first. Ask AI needs a working assistant on the server; every step below
is against the real `/api/assistant`, because there is no fixture mode.

Consent is per launch, in memory. **Force-quit and reopen the app between the consent steps**, or the
first "Allow" makes every later run skip the sheet.

### 1. The tab bar item is not a tab

1. With Today showing, tap **Ask AI** in the tab bar.
2. The Ask sheet opens over Today. **Today stays behind it** — Ask never replaces the screen.
3. Dismiss the sheet. You are back on Today, not on a fourth tab.
4. All four tab items now carry an icon: a sun, a check circle, sparkles and a calendar.

### 2. The suggestions page

1. Open Ask AI. The title is **Ask Nexdo** with a large round ✕ on the right.
2. Under it: "Let's make room for what matters."
3. Five cards, in this exact order, each with an icon, a title and a grey subtitle:
   - Give me my full day briefing — Priorities, deadlines, conflicts, and your next move
   - Pick my Top 3 focus tasks — Ranked by urgency, effort, and completion risk
   - Show deadlines and risks — See what is due in the next 5 days
   - Find time in my schedule — Surface open time around calendar commitments
   - Help me plan tomorrow — Check whether tomorrow has enough capacity
4. Pinned to the bottom, two cards side by side on a faint magenta-to-indigo wash: **Ask by Voice**
   ("Tap and speak", gradient circle) and **Free form Text** ("Type your prompt").
5. There is **no text field on this page**. That is correct.

### 3. The consent gate

1. Force-quit and reopen the app. Open Ask AI.
2. Tap any suggestion card. **No spinner appears and no request goes out.** A sheet slides up titled
   **Before using Ask AI**.
3. It reads: "Nexdo sends your question and relevant task and calendar information—including titles,
   notes, times, preferences, and conversation context—to OpenAI to generate answers. Do not include
   information you do not want shared. AI can make mistakes; review proposed changes before approving
   them."
4. Below: a link **OpenAI data privacy information**, then the grey line about withdrawing permission
   in Account, then **Allow sharing with OpenAI** and **Not now**.
5. Tap **Not now**. The sheet closes and nothing was sent — the suggestion cards are still there.
6. Tap the same card again, then **Allow sharing with OpenAI**. The sheet closes and **the card's
   question is sent straight away**, without you tapping it a third time.
7. Force-quit and reopen. Tap a card again: the sheet is back. Consent does not survive a relaunch,
   which is what the Swift app does.

### 4. An answer

1. With sharing allowed, tap **Give me my full day briefing**.
2. "Asking Nexdo…" with a spinner appears under the cards while the request runs.
3. When it lands, the cards are replaced by:
   - a small grey line with a "?" icon showing the question you asked;
   - a blue-tinted summary bar with a sparkles icon (at most three lines);
   - one card per section, header in BOLD CAPS with a count pill and a chevron.
4. **Only the first section shows anything** — its first two items, each with a small blue bullet.
   Under them, **Show N more**.
5. Every later section is collapsed and reads "Tap to view the details."
6. Tap a section header, or **Show N more**: it expands, the chevron flips up, and the button becomes
   **Show less**.
7. At the bottom: **Show suggestions**. Tap it — the answer disappears and the five cards return.

### 5. Read Loud — a Phase 9 shell

1. Ask something, then tap **Read Loud** on a section header.
2. In a **development build** the button flips to **Stop** and the states cycle. **No audio plays.**
   The speech transport is Phase 9.
3. In a **release build** the row instead shows "Your answer is ready to read. Read Loud is not
   available in this build yet. Phase 9 adds spoken replies." with a **Retry voice reply** button.
4. Either is expected. Report it only if the button is missing, or if it claims to be speaking in a
   release build.

### 6. Free form Text

1. From the suggestions page, tap **Free form Text**.
2. A full-screen page titled **Free form Text**, with:
   - "Let's make room for what matters."
   - **What would you like help with?**
   - "Type a question or tell Nexdo what to plan, create, or change."
   - a tall multi-line field, placeholder "Type your prompt…"
   - an **Ask Nexdo** button on the right — and **no microphone button** on this page
   - **Try a prompt**, then three rows: "What should I focus on today?", "Find 30 minutes free
     tomorrow for a walk.", "Remind me to call Damien tomorrow at 11 AM."
3. Tap one of the three. It **fills the field and nothing is sent**.
4. Tap **Ask Nexdo**. The answer replaces the page content, the field empties, and a **composer
   appears pinned to the bottom** — a short field plus **Ask Nexdo** — for the follow-up.
5. Type a follow-up and send it. The previous answer is replaced; there is no chat history. That is
   correct: the Swift app keeps one turn.
6. Paste more than 4,000 characters into the bottom composer: "Keep your question under 4,000
   characters." appears and **Ask Nexdo** greys out.

### 7. The policy guard

1. On the Free form Text page, type **Who is Ada Lovelace?** and send.
2. **No spinner, no network request.** The answer area immediately shows "I can't help with that
   request. Ask me about your tasks, deadlines, or schedule instead." in both the summary bar and an
   AI RESPONSE card.
3. Type **What is on my calendar tomorrow?** — the same opener, but it mentions the calendar — and
   send. This one **does** go to the server.
4. Type something political or violent and send. The other refusal appears: "I can't help with
   political, violent, sexual, or general-knowledge questions. I can help with your tasks, calendar,
   and scheduling questions instead."
5. Do this before allowing consent as well: the refusal appears **without** the consent sheet.

### 8. A proposal, approved and declined

Needs a prompt the server answers with a plan, for example "Reschedule my afternoon so I have two
free hours." It will not happen on every account.

1. When the answer carries a proposal, a final card appears: **REVIEW PROPOSED CHANGES**.
2. It shows the server's prompt text, then one block per change: the task title in semibold,
   "From: …" (or "From: Unscheduled"), "To: … · N min", then the reason in grey.
3. **Approve changes** (filled blue) and **Keep my current plan** below it.
4. Tap **Approve changes**. Both buttons grey out while it runs, a new answer replaces the old one,
   and **the Tasks and Calendar tabs reflect the new times** when you go back to them.
5. Repeat and tap **Keep my current plan** instead. This **also calls the server** — that is what the
   Swift app does — and a new answer comes back, but Tasks and Calendar are unchanged.

### 9. Failure and retry

1. Turn off Wi-Fi and mobile data. Ask something.
2. "Nexdo couldn't complete that request. Please try again." appears with a **Retry** button.
3. Turn the network back on and tap **Retry**: the same question is sent again.

### 10. Entry points from other screens

1. Today → **Weekly Summary** → **Plan next week with Nexdo AI →**. Ask opens **with the prompt
   already in the field, not sent**.
2. Calendar → **Review conflicts** opens the schedule review, **not** Ask. That matches Swift: the
   Ask sheet in `CalendarView` is unreachable code.

### 11. What is NOT here yet

- **Ask by Voice** opens the voice shell with ask-mode copy ("Ask Nexdo anything"), but the session
  underneath is still the development stub and it creates a task rather than answering. Phase 9.
- The microphone button in the suggestions-page composer does the same.
- **Read Loud** does not speak. Phase 9.
- Withdrawing AI permission lives in Account. Phase 7.

## Phase 7 on-device test plan

Account and settings. **A NEW DEVELOPMENT BUILD IS REQUIRED** — three native modules landed in this
phase (`expo-image-picker`, `expo-image-manipulator`, `expo-web-browser`). The previous build will
crash the moment you open Settings.

Use a throwaway account for step 11.

### 1. Getting there

1. On **Today**, tap the avatar in the top right. A sheet slides up titled **My Page**.
2. Dismiss it. On **Tasks**, tap the avatar in the top right: the same sheet.
3. The sheet covers the tab behind it; the tab bar does not change.

### 2. My Page, top to bottom

1. A 76pt gradient circle with your first initial, your full name in bold, your email under it in
   small grey text.
2. **Edit profile and settings** with a person icon and a chevron.
3. A card of six rows, in this order: **Inbox**, **Waiting For**, **AI Planner**, **Insights**,
   **Notifications** — each with an outward arrow — then **Settings** with a chevron.
4. **Sign out** in red at the bottom.
5. Tap **Inbox**. The system browser opens `harbour-production-f8a0.up.railway.app/inbox`. Come back.
6. There is no Delete account and no Appearance here. Both live one screen deeper. That is correct.

### 3. Settings, top to bottom

Tap **Edit profile and settings**. Check the cards appear in exactly this order:

1. **Appearance** — a three-way System / Day / Night control, then the grey caption ending "saved on
   this device."
2. **App Voice** — "AI speaking volume" with a percentage on the right, a slider between a small and a
   large speaker icon, then its caption.
3. **Profile picture** — your avatar, **Change photo**, the caption, and **Remove photo** only if you
   already have one.
4. **Profile and time** — Display name, "Time zone (Automatic)" with the device zone, Working hours
   (Start/End), Quiet hours (Start/End).
5. **Voice and confirmation** — AI confirmation, Enable spoken replies, a divider, Personalized
   predictions and its caption.
6. **Notifications and focus** — Suggest my next action, Protect my current focus, a caption, then
   Push / Email / Morning summary / Evening summary, a caption, **Open Notification Center**.
7. **Calendars and privacy** — the Google line, **Connect Google Calendar**, **Synchronize now**, a
   divider, the OpenAI sharing state, and **Delete account** in red.
8. **Save settings** — a gradient capsule.

**Nothing else.** There is no email field, no default duration, no reminder minutes, no SMS toggle, no
phone number field and no version or legal links. Swift has none of those on this screen; report it if
you see one.

### 4. Appearance applies immediately

1. Tap **Night**. The whole app turns dark at once, without saving.
2. Go back, visit Today, Tasks and Calendar: all dark.
3. Force-quit and reopen. Still dark — it is stored on the device, like the iPhone's `@AppStorage`.
4. Set it back to **System** and confirm the app follows the phone's own light/dark setting.

### 5. App Voice volume

1. Drag the slider. The percentage changes in 5% steps.
2. Force-quit and reopen: the value survives.
3. **Nothing is spoken.** Spoken replies are Phase 9; this only stores the setting, as the caption says.

### 6. Nothing saves until you press Save

1. Turn **Push notifications** off, change the display name, change Working hours.
2. **Watch the Metro terminal: no PATCH goes out.** Swift batches the whole form the same way.
3. Press **Save settings**. One `PATCH /api/settings` appears carrying `name`, `timeZone`,
   `preference` and `nextAction` together, then a `GET /api/me`.
4. A green "Settings saved." line appears under the button.
5. Leave and come back: the values stuck.

### 7. Validation

1. Clear the display name and press **Save settings** → an alert "Could not update profile" with
   "Enter a display name of 1–80 characters.", and no request.
2. Set Working hours to start 17:00 and end 09:00, press Save → "Working hours must end after they
   start.", and no request.
3. Quiet hours crossing midnight (21:00 → 07:00) is allowed. It must save.
4. Fix the name, then press the **back chevron** at the top left. It SAVES and then leaves. With an
   invalid name it shows the error and stays put.

### 8. The profile photo

1. **Change photo** → the system photo picker. **No permission prompt should appear** — the picker
   runs out of process, which is why the iPhone app has no photo-library usage string either.
2. Pick a large photo. "Saving profile photo…" appears, then "Profile picture saved."
3. The avatar updates here, and on **Today** and **Tasks** top bars.
4. In the Metro terminal the PATCH body is `{"photo":"data:image/jpeg;base64,…"}` — one JSON string,
   not a file upload — and it is under 256 KB however big the original was.
5. **Remove photo** → "Profile picture removed." and the initial comes back everywhere.
6. Try a photo the encoder cannot shrink (a very large panorama). It should report "Could not process
   this photo. Please choose another image." rather than failing silently.

### 9. Time zone sync

This is the rule the iPhone uses: **the account follows the device, never the other way round.**

1. On the web app, set your account time zone to something different from the phone's.
2. Force-quit the mobile app and sign in again. On sign-in it sends
   `PATCH /api/settings {"timeZone":"<the phone's zone>"}`, then re-reads `/api/me`.
3. Reload the web settings page: the account zone is now the phone's.
4. Do it again, but instead of signing in, just background the app and bring it back. The same PATCH
   fires on returning to the foreground.
5. With the two already equal, background and foreground the app: **no PATCH at all.** Check the
   Metro terminal.
6. Saving the settings form also re-asserts the device zone — that is Swift's behaviour, not an extra.

### 10. Google Calendar and Synchronize now

1. **Connect Google Calendar** opens a system browser tab.
2. **EXPECT THIS TO FAIL TODAY.** The server route needs the account session cookie, which no in-app
   browser sends — the iPhone app fails in exactly the same way. You will see a blank page, then on
   dismissal "Google Calendar authorization was cancelled." That is the current, known state.
3. What passing will look like after the server fix: Google's consent screen, then a return to the app
   and "Google Calendar connected and synchronized." The URL is built in one place,
   `googleConnectStartUrl` in `src/query/useCalendar.ts`, still marked `TODO(server-connect-token)`.
4. **Synchronize now** works today. With no calendars connected it says "No calendars connected yet.";
   with one connected, "Calendars synchronized."; if the server reports an error on any connection,
   "Some calendars could not synchronize. Check their connections in calendar settings."

### 11. OpenAI sharing, and deleting the account

1. Ask something in Ask AI first so sharing is on for the session. Back in Settings the line reads
   "OpenAI sharing is allowed for this session." with **Withdraw AI permission** under it.
2. Tap it: the line becomes "OpenAI sharing is off.", the button disappears, and any Ask answer on
   screen is discarded. No request goes out — consent is per launch and local.
3. **With a throwaway account**: tap **Delete account** → a confirmation titled "Permanently delete
   this account?" with "This removes your Nexdo data permanently and cannot be undone."
4. Cancel first and confirm nothing happened. Then delete: `DELETE /api/account` goes out and the app
   returns to the sign-in screen with everything cleared.
5. Try signing in with that account: it is gone.

### 12. Sign out

1. Sign-out has MOVED. It is on **My Page**, where the iPhone app puts it — not in the developer menu
   on Today any more, and the developer menu is gone from Today entirely.
2. Tap **Sign out** → "Sign out of Nexdo?" with a red **Sign out**. Confirm: you land on sign-in, the
   greeting still remembers your first name.
3. The developer menu (long-press the version number) is still on the sign-in screen in a development
   build, without a sign-out entry.

### 13. What is NOT here

- Spoken replies and the App Voice volume actually doing something: Phase 9.
- Reminders and notification delivery: Phase 8. "Open Notification Center" goes to the web app, as it
  does on the iPhone.

## Phase 8 on-device test plan

Reminders, the action queue and the native actions. **A NEW DEVELOPMENT BUILD IS REQUIRED** — five
native modules landed (`expo-notifications`, `expo-contacts`, `expo-sms`, `expo-mail-composer`,
`expo-file-system`). The Phase 7 build will crash on the Today tab.

Everything here is a **local** notification. Nothing is pushed from the server, on either platform —
the Swift app works the same way, so a reminder still fires with the phone offline.

### 1. Creating a task that becomes an action

1. Tasks → **+**. Type **Call Damien at 4 PM**.
2. Under the DATE pills a grey line appears: **"Nexdo Action: contact Damien. Schedule: …"**, and the
   schedule is **4 PM today** (or tomorrow if 4 PM has passed), not the "Today" pill's time.
3. Now tap the **Tomorrow** pill. The line stays, but the schedule changes to the pill's date. That is
   correct: once you choose a date, the title's time stops overriding it.
4. Reset by reopening the form. Type **Buy groceries** — no line at all. Type **Call** on its own — no
   line. Both are correct; the parser is deliberately conservative.
5. Save with the title **Call Damien at 4 PM** and no pill tapped.

### 2. The permission prompt

1. The notification permission prompt appears **when the first reminder is scheduled**, not at launch
   and not on the Today tab. Saving the task above is what triggers it.
2. Allow it.
3. If you refuse: the task still exists, but an orange line appears on the task's action card reading
   "Notifications are off. Enable notifications for Nexdo in Settings…", with **Retry reminders**.

### 3. A reminder firing

Set a task a few minutes out so you do not have to wait: **Call Damien at <four minutes from now>**
using the 12-hour form, e.g. "Call Damien at 3:07 PM".

1. Lock the phone and wait.
2. The notification reads **"Time to contact Damien"** / "Choose Call, Message, Email, or remind me
   later." Expand it: four buttons — **Call**, **Message**, **Email**, **Remind me later**.
3. **Tap the body.** The app opens straight onto the **Nexdo Action** screen for that task, with no
   channel ticked.
4. Force-quit the app, fire another reminder (snooze one by 5 minutes), and tap the body from a **cold
   start**. It must still land on the right action — not on Today.
5. With the app OPEN on any tab, let a reminder fire. It still appears as a banner, with sound.

### 4. The four buttons

Snooze a reminder by 5 minutes between each of these so you get a fresh notification.

1. **Call** → the action screen opens with **Call** ticked and the contact lookup already running.
2. **Message** → same, with Message ticked.
3. **Email** → same, with Email ticked.
4. **Remind me later** → the action screen opens AND the reminder is pushed 15 minutes out. Check the
   task's action card afterwards: it reads "Reminder: …" with the new time. This double behaviour is
   Swift's, not a bug.
5. On iOS only, swipe a reminder away without tapping: the action is cancelled and the card reads
   "Reminder dismissed. Tap to take action." **Android does not report a swipe-away**, so nothing
   happens there. Expected.

### 5. The action screen

1. Title **Nexdo Action**, heading **"Time to contact Damien"**, then "How would you like to get in
   touch?" and three rows: Call, Message, Email.
2. At the bottom: **Remind me in 15 minutes** and **Dismiss**.
3. **Nothing else** — no "Mark task complete" until you have actually used a channel, and no "Choose a
   different contact" until a contact has been picked. Report it if you see either early.
4. Tap **Call**. The **Contacts** permission prompt appears — the first time only, and only here.
5. With a name that matches one contact who has one number, you go straight to a confirmation:
   **"Call Damien Hall?"** with the number. Cancel it.
6. With a name matching several people, **"Choose the correct contact"** lists them.
7. With a contact who has several numbers, **"Choose a phone number"** lists them with their labels.
8. A contact with no number at all: "This contact has no phone number. Add a number in Contacts or
   choose another person."
9. Once a contact is chosen, **Choose a different contact** appears at the bottom. Tap it and the
   lookup starts again.

### 6. Calling, messaging and emailing

1. **Call** → confirm → the **dialler opens with the number filled in**. Nexdo never dials. Come back:
   the screen says "Opened Phone. Nexdo can't verify whether the call connected…" and **Mark task
   complete** has appeared.
2. **Message** → the system SMS composer opens, addressed to the contact, pre-filled with
   "Hi <name>, just checking in." (or "…following up regarding <context>." if the task said "about
   …"). **Send nothing**: cancel. The screen reads "Cancelled. Nothing was sent."
3. **Email** → the mail composer opens with subject "Following up" (or "Follow-up: <context>") and the
   drafted body. Save it as a draft: "Draft saved. Nothing was sent."
4. Send one real message to yourself: "Submitted to the messaging app. Delivery isn't verified…"
5. On a phone with no SIM or no mail account: "This action isn't available on this device. Check
   Messages or Mail setup and try again."

**At no point should anything send without you tapping send in the system composer.**

### 7. The Today action queue

1. Make one contact task due now and another 10 minutes out.
2. Today shows an **Action Needed** card at the top of section 6: a pink bell, the time, "in N min" or
   "Due now" or "N min overdue", "Time to contact <name>", a contact row, a **Task context** row, then
   three big buttons — **Call**, **iMessage**, **Email** (iMessage, not Message — that is Swift's
   label) — and **Remind me later** / **Dismiss**.
3. With two or more overdue, an orange line reads "N actions need your attention".
4. Under it, **Next up** with a count and **View all**, listing at most three rows.
5. Tap **Task context** → the task detail opens.
6. Tap **Call** → the action screen opens with Call ticked and the lookup already running.
7. **Remind me later** → 5 / 10 / 15 / 30 minutes / 1 hour. Pick 30: the card's time updates.
8. **Dismiss** → the card disappears.
9. **View all** → the **Nexdo Actions** sheet, with **Due now** and **Upcoming** sections and a
   **Done** button. An account with none reads "No actions today".

### 8. The Daily Briefing branch

1. While an action is **due now**, the Weekly Summary card on Today is REPLACED by a compact row:
   **Daily Briefing** on the left, **Weekly Summary** on the right.
2. Tap **Daily Briefing** → Ask AI opens with the prompt already filled in: "Give me today's daily
   briefing, prioritizing my due contact actions and upcoming calendar commitments." It is not sent.
3. Dismiss the action. The full Weekly Summary card comes back.

### 9. The task detail card

1. Open the task behind an action. At the top, a **Nexdo Action** card: "Contact Damien",
   "Call • Message • Email", and one status line —
   - "Reminder: <date and time>" while it is scheduled,
   - "Reminder dismissed. Tap to take action." after a dismissal,
   - "Review the outcome or mark your task complete." after using a channel,
   - "Set a schedule to receive an action reminder." if the task has no date.
2. Tap it → the action screen.
3. The "What would you like to do about…" clarify card must **not** be there at the same time. The two
   are mutually exclusive.

### 10. "Contact someone" from the clarify card

1. Create a task called just **Roof** (vague, two words, no verb). Open it.
2. The clarify card appears. Choose **Contact someone**, type **Damien**, tap **Call**.
3. The task is retitled "Call Damien" AND the action screen opens immediately for the new action.

### 11. Persistence and sign-out

1. With actions on screen, force-quit and reopen: the same actions, the same reminders.
2. Start a Call, then kill the app from the recents list while the dialler is up. Reopen: the action is
   back at "awaiting approval", not marked done. Nexdo never assumes an interrupted call went through.
3. Sign out and back in: the actions rebuild from your tasks.
4. Sign in as a different account: no actions from the first one. They are stored per account.

### 12. The preview build

This is the build to hand to a teammate.

```
eas build --profile preview --platform android
```

1. EAS produces an **APK** with internal distribution. Open the build page and send the QR code or the
   direct link.
2. The tester installs the APK and opens it. **There is no dev server**: no Metro, no QR to scan, no
   `npx expo start` on anyone's machine, and no development menu. It points at the production API.
3. Confirm on the tester's phone: sign in, create a contact task, receive its reminder.
4. `eas build --profile production --platform android` produces an **AAB** for Play, with the version
   code incremented by EAS (versioning is remote — nothing to edit in `app.config.ts`).

### 13. What is NOT here

- Nothing is pushed from the server. The backend has no APNs or FCM path and the iPhone app registers
  no token either, so every reminder is scheduled on the device. See "Backend gaps" in the plan doc.
- The custom "Choose time…" snooze picker: the five fixed offsets are built.
- Sections 7 and 8 of the Today dashboard (protected time, persistent next action): Phase 9.
- Voice: Phase 9.

## Phase 9 on-device test plan

Live voice, and the last two Today sections. **A NEW DEVELOPMENT BUILD IS REQUIRED** — `expo-audio`
(and its peer `expo-asset`) landed for Read Loud.

Voice needs a **physical phone**. An emulator has no usable microphone and the WebRTC audio path will
not come up. Use headphones for the barge-in and mute steps so you can hear the reply stop.

### 1. Getting in, and the consent gate

1. Force-quit and reopen the app, so consent is unset.
2. Tasks → the microphone button. A full-screen page titled **Add by Voice**.
3. An alert appears at once: **"Use voice to manage tasks?"** with the OpenAI sharing paragraph, then
   **Not now** and **Allow and start**.
4. Tap **Not now** — the page closes and nothing connected.
5. Go back in and tap **Allow and start**. The microphone permission prompt appears the first time.
6. The status line runs **Connecting…** → **Listening…**.
7. Open it again in the same launch: no consent alert. Force-quit, reopen: the alert is back. Consent
   is per launch, like the iPhone app.

### 2. Capturing a task by voice, end to end

1. With the status on **Listening…**, say **"Call Damien tomorrow at eleven AM."**
2. The status moves **Listening to you…** → **Understanding…**, your words appear in the transcript
   card, then **Updating your tasks…** while the tool runs, then **Speaking…** as it confirms.
3. Under the orb, **Added this session** appears with **Call Damien** and its date and time.
4. Say **"Actually make that noon."** The same task updates; no second row appears.
5. Tap **Done**. You hear **"You're all set."** and the page closes on its own.
6. Open the Tasks tab: the task is there, at noon tomorrow.

**There is no "review" screen and no "Add this task" button.** The model saves as you speak. That is
what the iPhone app does; report it if you see a confirm step.

### 3. Barge-in

1. Start a session and ask something that gets a long answer: **"What should I focus on this week?"**
2. While it is **Speaking…**, start talking over it.
3. **Its audio must stop immediately**, and the status must switch to **Listening to you…**.
4. It should answer your new question, not finish the old one.

### 4. Mute

1. While **Listening…**, tap **Mute**.
2. The status reads **Muted**, the orb's icon becomes a struck-through microphone, and the button
   reads **Unmute**.
3. Talk. Nothing happens: no transcript, no reply.
4. Tap **Unmute** and talk again. It hears you.
5. Mute is disabled while connecting and after the session ends. Check both.

### 5. The inactivity timeout

1. Start a session and say nothing.
2. After about **45 seconds** it asks **"Are you still there?"**
3. Say nothing for about **20 seconds** more. It says **"I'll close voice mode for now."** and the
   page closes.
4. Repeat, but answer the "are you still there?" prompt. The session continues and the clock restarts.

### 6. Error recovery

1. Start a session, then turn off Wi-Fi and mobile data.
2. Within a few seconds the page shows **"The voice connection ended. Saved tasks are preserved. Close
   and try again."** and the status reads **Connection lost**.
3. **The page does NOT close itself** on a network failure — that is deliberate, so you can read the
   message. Close it yourself.
4. Anything saved before the drop is still in Tasks.
5. Turn the network back on and start a new session: it connects normally.

### 7. Ask by Voice

1. Ask AI → **Ask by Voice**.
2. The page reads **Ask by Voice** / **Ask Nexdo anything**, with its own three examples.
3. Ask **"What should I focus on today?"** It answers out loud.
4. **No text answer appears in the Ask screen afterwards.** The spoken reply is the answer; the iPhone
   app behaves the same way.

### 8. Calendar voice mode

1. Calendar → **Add by Voice**.
2. The page reads **Speak your appointment** with the appointment examples.
3. Say **"Dentist appointment tomorrow at eleven AM for thirty minutes."** The event is created; check
   the Calendar tab.
4. Now say **"Add a task to buy milk."** It must refuse: this screen creates appointments only.

### 9. Read Loud and the volume slider

1. Ask AI → **Free form Text**, ask something, then tap **Read Loud** on a section.
2. It speaks. **This is the server's voice** (`/api/speech`), not the phone's built-in speech.
3. While it is speaking, open Account → Settings → **App Voice** and drag the slider. The volume
   changes **mid-sentence**.
4. Set it to 0 and play again: silence. Set it back.
5. **Known gap**: the slider does NOT change the volume of a live voice CONVERSATION on Android — only
   Read Loud. The iPhone applies a ×3 gain to the realtime track; react-native-webrtc has no
   equivalent. Use the phone's own volume keys during a conversation.

### 10. Interruptions

1. Start a voice session and put the app in the background.
2. Within about five seconds the session ends. Come back: the page is closed or closing.
3. Start a session and receive a phone call. **Known gap**: the iPhone ends the session on an audio
   interruption; Android does not report one, so the session stays up and the audio may be mixed.
   Tap Done.

### 11. Today, section 7: protected time

Needs an account with a task postponed several times, so the server actually proposes a block.

1. On **Today**, below the action queue, a card reads **Make room for important work**.
2. It says **"You've postponed <task> N times."**, then **"Reserve N minutes at <date and time>?"**,
   then the grey line about replanning.
3. Tap **Not now**. The card disappears and nothing is scheduled.
4. Get it to propose again and tap **Reserve time**. The block appears in Tasks and Calendar at that
   time, and the card goes.
5. If the server returns warnings, they appear in an **Unable to complete request** alert.

### 12. Today, section 8: the persistent next action

Needs "Suggest my next action" ON in Settings, and an account the server has a recommendation for.

1. Below the protected-time card, a card reads **What should I do now?** with the task title and
   **~N min · <window> available**.
2. Tap **Other options** → the Do Now screen opens.
3. Go back and tap **Start Focus Session**. The focus strip appears with that task and its own
   duration, and the card refreshes.
4. Tap the **✕**. The card goes and does not come back on this account until the server offers a new
   one.
5. With the setting OFF, neither card appears.

### 13. What is NOT here

- The orb does not animate — the rings and bars are drawn at rest. See the plan doc.
- No "ready" chime when the session starts listening; the iPhone's `ListeningReady.wav` is not in this
  repository.
- Dictation into a text field (`/api/realtime/transcription-session`) is a separate iPhone screen that
  this migration has not been asked to build.
