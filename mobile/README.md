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
