# Nexdo for Android — release candidate

This is Nexdo rebuilt in React Native (Expo), for Android. It talks to the **same server** as the
iPhone app and uses the **same account**, so whatever you do here shows up there and vice versa.

**The iPhone app is unchanged and stays the product.** This build exists so the team can check it
against the iPhone, screen by screen, before anything is decided about replacing it.

Version **1.0.0-rc.1**.

---

## For testers

### 1. Install the build

You will be sent a link or a QR code from the build page. On the phone:

1. Open the link and tap **Install**.
2. Android will warn about installing from an unknown source. Allow it for the browser you used.
3. Open **Nexdo** from the launcher.

There is **no dev server and nothing to run on a computer**. The APK is self-contained and points at
the production API. If someone tells you to scan a QR code from a terminal, that is the developer
build, not this one.

Requires **Android 8 or newer**. Voice needs a **physical phone** — an emulator's microphone will not
connect.

### 2. Sign in

Use your normal Nexdo account — the same email and password as the iPhone app. If your account needs
email verification you will be asked for the six-digit code exactly as on the iPhone.

**Sign in with Apple is not available on Android.** If that is the only way you have signed in
before, set a password on the web app first.

### 3. What to do

Work through the walkthrough below **with the iPhone app open next to you**, on the same account.
It is ordered so each step builds on the last: 12 parts, 78 numbered steps.

Anything in the **Known differences** table further down is already known — please do not report
those. Everything else is worth reporting.

---

## The walkthrough

### Part 1 — Signing in (6 steps)

1. Open the app cold. You see the Nexdo splash, then the sign-in screen.
2. The greeting names you if you have signed in on this phone before.
3. Enter a wrong password. The message matches the iPhone's.
4. Sign in properly. You land on **Today**.
5. Force-quit and reopen. You stay signed in — the session cookie persisted.
6. Compare the sign-in screen with the iPhone's side by side: field order, the eye toggle on the
   password, the "Forgot password?" link, the OR rule.

### Part 2 — Today (9 steps)

7. The top bar: the Nexdo mark, the weather chip, **+**, your avatar. Tap the weather chip → the
   five-day forecast.
8. The greeting line and today's date read the same as the iPhone's.
9. The range pills (Today / 5 days / All). Switch between them and compare the counts.
10. **Quick Access**: Weekly / Moments / Shopping. Tap **Weekly** → progress, focus time,
    accomplishments. (Moments and Shopping open a title-only placeholder in this build.)
11. From Weekly Summary, **Plan next week with Nexdo AI →** opens Ask with the prompt filled in, not
    sent.
12. **Needs attention**, if your account has anything overdue or conflicting: one row, then a
    half-height sheet you can drag to full height.
13. The "Your day, in focus" card: "X Tasks · Y Appointments · Z Moments", then **Focus next**.
14. Pull down to refresh. The spinner appears and the numbers reload.
15. Tap the avatar → **My Page** opens as a sheet over Today.

### Part 3 — Tasks and projects (10 steps)

16. The **Tasks** tab: search, the date pills, the task rows.
17. Tap a date pill and compare the count badge with the iPhone's.
18. Search for a word in a task title. The same tasks match.
19. Open a task. Compare the whole detail screen with the iPhone: the action card at the top, title,
    notes, PROJECT, SCHEDULE, REPEAT, the reminders checkbox, the focus button.
20. Change the title and save. It updates on the iPhone.
21. Complete a task from the list. It completes on the iPhone.
22. **+** → the creation form: title, notes, PROJECT, DATE pills, TIME ESTIMATE.
23. Type **Call Damien at 4 PM** as the title. A grey line appears: "Nexdo Action: contact Damien.
    Schedule: …". Save it.
24. Switch to the **Projects** segment. Open a project, then edit it.
25. Create a project, assign the task from step 23 to it, then delete the project.

### Part 4 — Reminders and native actions (9 steps)

Needs the task from step 23, timed a few minutes ahead. Edit it to "Call Damien at <four minutes from
now>".

26. Allow notifications when asked. The prompt appears when the first reminder is scheduled, not at
    launch.
27. Lock the phone and wait. The notification reads **"Time to contact Damien"** with four buttons:
    Call, Message, Email, Remind me later.
28. Tap the body. The app opens on the **Nexdo Action** screen for that task.
29. Tap **Call**. Allow Contacts access. A confirmation appears with the number; cancel it.
30. Snooze by 5 minutes, then use the **Message** button on the next notification. The SMS composer
    opens pre-filled. **Cancel — do not send.**
31. Try **Email**. The mail composer opens with a subject and body. Save as draft.
32. Back on **Today**, the **Action Needed** card appears at the top with Call / iMessage / Email.
33. **Remind me later** → 30 minutes. The card's time updates.
34. **View all** → the Nexdo Actions sheet, with Due now and Upcoming.

### Part 5 — Ask AI, text (7 steps)

35. Tap **Ask AI** in the tab bar. It opens as a **sheet over the tab you were on** — the tab does not
    change. Same as the iPhone.
36. The five suggestion cards, in the same order as the iPhone.
37. Tap one. The consent sheet appears the first time each launch. Allow it.
38. The answer: a summary bar, then cards with **Show N more**.
39. **Show suggestions** returns to the cards.
40. **Free form Text** → type a question and send it. A composer appears at the bottom for follow-ups.
41. Type **Who is Ada Lovelace?** It refuses immediately, with no network request — same as the
    iPhone's guard.

### Part 6 — Ask AI, voice (5 steps)

42. From Ask, tap **Ask by Voice**. Allow voice sharing and the microphone.
43. The status runs Connecting… → Listening…. Say **"What should I focus on today?"**
44. It answers out loud. Talk over it — **its audio must stop immediately**.
45. Tap **Mute**, talk, and confirm it hears nothing. Unmute.
46. Tap **Done**. It says "You're all set." and closes.

### Part 7 — Voice task capture (5 steps)

47. Tasks → the microphone button. The page reads **Add by Voice** / **Speak your task**.
48. Say **"Call Damien tomorrow at eleven AM."** Watch the transcript, then **Added this session**.
49. Say **"Actually make that noon."** The same task updates; no duplicate row.
50. Tap **Done**, then check the Tasks tab and the iPhone.
51. There is **no review step and no "Add this task" button** — the iPhone works the same way.

### Part 8 — Calendar (7 steps)

52. The **Calendar** tab: Schedule / Week / Month.
53. Compare a day's merged rows (tasks and synced events) with the iPhone's.
54. Tap an event → the event details sheet.
55. **Review conflicts** → the **Schedule review** sheet.
56. **Add Manually** → create an event. It appears on the iPhone.
57. **Add by Voice** → say **"Dentist appointment tomorrow at eleven AM for thirty minutes."**
58. In that voice page, ask for a task instead. It refuses — this screen makes appointments only.

### Part 9 — Account and settings (10 steps)

59. Avatar → **My Page**: your name, email, the menu rows, **Sign out**.
60. **Edit profile and settings**. Compare every card with the iPhone's Settings.
61. **Appearance** → Night. The whole app darkens immediately. Force-quit and reopen: still dark.
62. **App Voice** → drag the slider. The percentage changes.
63. **Change photo** → pick one. It appears here and on the Today and Tasks top bars, and on the
    iPhone.
64. Change the display name and the working hours. **Nothing saves until you press Save settings.**
65. Press **Save settings** → "Settings saved."
66. Set working hours to end before they start and save. It refuses, with the iPhone's message.
67. **Connect Google Calendar** opens Google's sign-in. Close it without choosing an account and the
    iPhone's "sign-in was cancelled or blocked" message appears.
68. **Synchronize now** works. Read the message it returns.

### Part 10 — Read Loud (3 steps)

69. Ask AI → Free form Text → ask something → **Read Loud** on a section.
70. It speaks. While it is speaking, change the App Voice slider — the volume changes mid-sentence.
71. Tap **Stop**.

### Part 11 — Failure states (4 steps)

72. Turn off Wi-Fi and mobile data. Pull to refresh on Today. Compare the message with the iPhone's.
73. With the network off, try to save a task edit. Compare the failure with the iPhone's.
74. Start a voice session, then turn the network off mid-conversation. You see "The voice connection
    ended. Saved tasks are preserved." **The page stays open so you can read it.**
75. Turn the network back on. Everything recovers without a restart.

### Part 12 — Signing out (3 steps)

76. **My Page** → **Sign out** → confirm. You land on sign-in.
77. The greeting still remembers your first name.
78. Sign back in. Your data is all there.

---

## Known differences

Please **do not report** anything in this table. It is either a platform limit, a deliberate
decision, or a server-side gap.

| What you will see | Why |
| --- | --- |
| **No Sign in with Apple** on the Android build. | Apple's SDK is iOS-only. Use email and password. |
| **The voice orb does not animate.** The rings and bars are drawn still. | The iPhone animates them at 24 frames a second; a per-frame loop in JavaScript costs more than it shows. |
| **No chime when voice starts listening.** | The iPhone plays a short `ListeningReady.wav`; that file is not in this repository. |
| **The App Voice slider does not change a live voice conversation** — only Read Loud. | The iPhone applies a ×3 gain to the realtime audio track; the Android WebRTC library exposes no per-track gain. Use the phone's volume keys. |
| **A phone call during a voice session does not end it.** | The iPhone ends the session on an audio interruption; Android raises no equivalent event. Tap Done. |
| **Swiping a reminder away does nothing.** | iOS reports a dismissal; Android does not. Use the buttons. |
| **Most sheets are full-height** rather than the iPhone's part-height cards. **Needs attention** and **Reschedule all** are the exception: they open half-height and drag to full, as on the iPhone. | Only those two were moved to the native form sheet so far (Phase 11). |
| **The tab bar stays visible under the Needs attention sheet**, and **Reschedule all replaces it rather than stacking on top**. | Android's bottom-sheet presentation; the content and detents match. |
| **Blurred "frosted" panels are flat.** | `.ultraThinMaterial` has no Android equivalent. |
| **Some icons differ slightly** — the diagonal "opens elsewhere" arrow, the calendar-with-a-clock, the sunrise. | The icon set has no exact match; the closest glyph is used. |
| **Fonts are the system font,** not the iPhone's SF Rounded in headings. | SF Rounded is an Apple font. |
| **Date and time pickers look different** — a list of hours and minutes rather than iOS's wheel. | Hand-built, so the layout matches the surrounding screen rather than an Android dialog. |
| **Text does not re-flow at the largest accessibility sizes.** | The iPhone re-lays several cards vertically; not ported. |
| **No "Updating…" pill** at the top during a save. | The iPhone shows an app-wide busy pill; each screen shows its own progress here. |
| **Reminders are local, not pushed.** They fire even with the phone offline. | The iPhone works the same way: the server has no Android or iOS push path, only web push for browsers. |

---

## Reporting a bug

Send these, in this order:

1. **What you did** — the part and step number from the walkthrough, or the exact taps.
2. **What the Android app showed** — a screenshot.
3. **What the iPhone app showed for the same thing** — a screenshot.
4. **Your account email** and roughly **when** (the time and your time zone).
5. **The app version**: Android **Settings → Apps → Nexdo → App details**. It should read
   `1.0.0-rc.1`.
6. Whether it happens **every time** or only sometimes.

If the app closed itself, say so — that is the most useful single fact.

---

## For developers

### Requirements

- Node 20 or newer, npm 10 or newer.
- A physical Android phone for voice; an emulator is fine for everything else.
- No Xcode is needed. Builds run on EAS.

### Install and run

```
cd mobile
npm install
npm start          # Metro, for a development build
npm test           # Jest
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

Expo Go **cannot** run this app: WebRTC, notifications, contacts and the image picker are native
modules. You need a development build.

### Builds

```
eas build --profile development --platform android   # dev client, for daily work
eas build --profile preview --platform android       # the APK testers install, no dev server
```

`production` builds an AAB for Play; nothing needs it yet.

Versioning is **remote**: `cli.appVersionSource` is `"remote"` in `eas.json`, so EAS owns
`android.versionCode` and the `production` profile increments it. `app.config.ts` sets only the
marketing `version`.

### API address

`extra.apiUrl` in `app.config.ts`, overridable with `EXPO_PUBLIC_API_URL`. Restart Metro after
changing it. The client refuses any non-HTTPS origin.

### Layout

```
app/                  routes (expo-router); the folder tree is the navigation tree
  (auth)/             sign in, sign up, verify email, reset password
  (tabs)/             today, tasks, ask (opens a sheet), calendar
  task/ project/      task and project screens
  today/              do now, overdue, weekly summary, weather, attention
  ask/ action/        Ask AI, reminder actions
  account/ calendar/  settings, calendar sheets
src/
  api/                the HTTP client and wire types
  query/              TanStack Query hooks, one file per feature
  store/              Zustand: session, consent, focus, appearance, task filters
  lib/                pure logic ported from NexdoCore, each with tests
  components/         shared views
  actions/            reminders: coordinator, notifications, contacts, composers
  voice/              the realtime conversation, its transport and Read Loud
docs/swift-to-rn-style-map.md   how SwiftUI idioms were translated
```

Every ported file names the Swift view and line range it came from. Start there.

### Phase 11 Run A test plan

Run on the phone with the iPhone next to it, same account. Automated coverage is in the suites named.

| # | Check | Expect | Automated |
| --- | --- | --- | --- |
| A1.1 | Today, top to bottom | Quick Access, "Your day, in focus", Action Needed (if due), protected time (if proposed), Focus next, Needs attention row. No Weekly Summary card, no Daily Briefing, no "What should I do now?" | `today-screen`, `today-actions` |
| A1.2 | Quick Access statuses | "N upcoming" and "N items · Fri" match the iPhone; airplane mode + reopen → Shopping reads "View lists" | `today-screen`, `lib/todayQuickAccess` |
| A1.3 | Moments / Shopping tiles | Open the title-only placeholders "Important Moments" / "My Lists" | `today-screen` |
| A1.4 | Summary line | "X Tasks · Y Appointments · Z Moments"; the total includes today's moments; 3/5 days shows 0 Moments | `today-screen`, `lib/todayQuickAccess` |
| A1.5 | Focus next | With a suggestion: title, "N min · Fits your free time", Start focus, Other options; "…" → Other options / Dismiss suggestion. Without: "Find my next task" | `voice-screens` |
| A1.6 | Attention row | "N overdue tasks · N other" and the count badge; tap → half-height sheet, drag to full | `today-screen`, `attention-sheet` |
| A1.7 | Needs attention sheet | Complete a task with the circle; the calendar button opens the task; a schedule check opens inside the sheet with a back chevron; Close | `attention-sheet` |
| A1.8 | Reschedule all | Start at defaults to an hour from now; "Reschedule N tasks" moves them back to back; a failure stops and shows the red line | `attention-sheet`, `lib/rescheduleAll` |
| A2 | Ask by Voice | "Ask about tasks, calendar, important moments, or shopping lists…", examples "What birthdays are coming up?" and "Add two gallons of milk to my shopping list" | `voice-screens` |
| A3.1 | Connect Google Calendar | Opens Google's account chooser (not "Sign in required"); the label reads "Connecting…" and the screen is locked until the browser closes | `account` |
| A3.2 | Cancel the sign-in | The long "sign-in was cancelled or blocked…" alert | `account` |
| A3.3 | With a connected calendar | Name, detail, "Synchronized … ago"; the toggle and its read-only caption; Disconnect → "Disconnect X?" / Keep it. **Not captured on iOS — check against the iPhone.** | `account`, `lib/calendarConnections` |

### Where the migration is documented

`docs/IOS_TO_REACT_NATIVE.md` — the screen inventory, the per-phase status sections with `body`
ranges, the backend gaps, and what is deferred.
