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
It is ordered so each step builds on the last: 14 parts, 108 numbered steps.

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
10. The Weekly Summary card. Tap it → progress, focus time, accomplishments.
11. From Weekly Summary, **Plan next week with Nexdo AI →** opens Ask with the prompt filled in, not
    sent.
12. **Needs your attention**, if your account has anything overdue or conflicting. Tap a row.
13. The Schedule Intelligence card: appointments, usable minutes, the recommendation.
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
67. **Connect Google Calendar** — **expected to fail today**; see Known differences.
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

### Part 13 — Important Moments (16 steps)

Added in Phase 11 Run B. **Needs a new development or preview build** — it adds three native modules
(calendar, clipboard, sharing). The way in is the **Moments** tile in Today's Quick Access row, which
arrives with Run A; until then a Moments reminder notification is the only entry point.

Use a test moment named `Parity …`, as the iPhone captures did. Never confirm **Delete all** on real data.

79. Today → **Moments**. The page is titled **Important Moments**, with Upcoming / Scheduled / Sent as a
    gradient control, the search field and the type menu, the summary card ("N upcoming moments",
    wishes scheduled, wishes needing review) with **Manage** and **Create New**, then This Week / Next
    Week / This Month / Next Month / Later.
80. The type menu offers All, Birthday, Anniversary, Festival, Get Well Soon, Custom. Search a title.
81. **Scheduled** shows each wish card and the delivery menu (All / Automatic / Confirmation / Action
    needed). **Sent** shows delivered, copied and shared wishes. An empty Sent tab shows no message —
    the iPhone does the same.
82. **Manage** → **Manage Moments**. Open a birthday: **Manage Moment** with the header card (icon,
    name, type, the **Active** switch, "Send date · …") and the four steps.
83. Details: rename the moment, then tap **Contacts**. It saves first — "Moment changes saved." — and
    only then moves. Rename again and tap the back chevron: **Discard unsaved changes?**
84. Contacts: **Add Contact** opens the phone's contact picker (one person each time), then **Choose
    delivery address**. **Enter recipient manually** opens **Add Contact**; **Add recipient** stays
    greyed until there is a name and a phone or an email.
85. Wish Message: change the tone, edit the text (the counter reads n/500), tap **Regenerate** — it asks
    first once you have edited. **Personalize** opens its sheet. **Save Message** → "Message approved
    and saved. Nothing has been sent."
86. Greeting Card: **Create AI Greeting Card** opens the editor. Each generation is a paid AI call — do
    it once. **Use This Card**, then **Share Card**: the share sheet receives the artwork image.
87. Schedule: tap **Schedule Wish** with unsaved changes — "Save changes first." appears in red under
    the button. Save, then **Schedule Wish** → **Review schedule** → **Confirm Schedule** → **Schedule
    confirmed** with confetti. **Done** returns to Important Moments.
88. **Create New**: the type menu, the automatic title, the date (a past date is accepted, as on the
    iPhone), the February 29 note. **Save** is greyed while the title is empty. A new birthday opens
    straight into Manage Moment.
89. A **Custom** moment's **Review** opens **Review Wish**: the tone, **Personalize with AI** with the
    consent sentence, the 0/500 counter, **Try another**, **Edit**, **Approve & Continue**.
90. **Choose Delivery**: Messages reads "Nexdo opens Messages. You confirm the final send." **Open
    Messages**, then back out of the SMS app **without sending**. **View delivery status** appears.
91. On another custom wish choose **Schedule** → **Choose date & time** → **Schedule Reminder** →
    **Wish details** reading "Wish scheduled". **Edit Schedule** opens its sheet; **Cancel scheduled
    wish** asks first.
92. The gear → **Moments Settings**: **Choose a contact birthday** (an explanation, then the picker,
    then the editor as a sheet with Close), **Choose calendars and anniversary candidates** (Allow
    calendar access → a calendar → candidates), **Choose festivals** (India → Diwali, Holi, Eid,
    Pongal). **Connect / Reconnect Gmail** is greyed when the server has no Gmail configured.
93. Schedule a Messages wish a few minutes ahead. At that time the notification reads **Important
    Moment** — "Your wish is ready. Open Nexdo, then tap Send in Messages."
94. Tap it. Important Moments opens with **Close**, and that wish's details on top.

### Part 14 — Shopping Lists (14 steps)

Added in Phase 11 Run C. Needs the same new build as Part 13 (it also re-enables the camera
permission). The way in is the **Shopping** tile in Today's Quick Access row, which arrives with Run A.
Use a test list named `Parity …`.

95. Today → **Shopping** → **My Lists**: **Create New List**, then **Recent Lists** with each list's
    item count, "· Completed" on finished ones, and the date. With no lists at all it reads "Your next
    trip starts here".
96. **Create New List** (or the ⊕ at the top): Start from Scratch / Use Last Week's List, the name, the
    date, **Repeat every week**. Clear the name — **Create List** greys out. Create it: the new list
    opens.
97. The list: the cart header, "N remaining · N items", the progress bar, the **Add an item** box with
    a separate **+** and **mic**, and "Try “2 bottles of milk 1 gallon” or tap the mic."
98. Type **ch** — up to three suggestions appear (Cheese, Cherry Tomatoes). Type **2 bottles of milk 1
    gallon** and tap **+**: **Review Items** opens with the server's parse. Edit it, then **Add 1
    Items**. The item appears under Dairy & Eggs with the milk illustration.
99. Tap the **+** alone and then the **mic** alone: each does only its own thing. (On the iPhone a tap
    on that row can fire both — a known iPhone defect, not reproduced here.)
100. Check an item: it strikes through and "remaining" drops. It is checked on the iPhone too.
101. Check an item on the iPhone, then check a different one here without refreshing: the save is
     refused with "This list changed on another device. Refresh before saving." and **Retry Save** /
     **Discard local edits and reload** appear. Discard reloads the iPhone's version.
102. Tap an item → **Item**: name, category, quantity, size, notes. Clear the name — **Save** greys out.
     **Choose from Photos**, then **Take a Picture** (allow the camera): the photo shows in the row.
103. On an item, turn on **Allow AI image generation** and tap **Generate with AI** once (six per hour).
     Save.
104. **Mic** → **Add by Voice**: "Ready when you are", the bell, "Listening — keep going". Say "six
     bananas, one gallon of milk". Tap **Review Items**: "Finishing transcription…", then **Review your
     items**. **Add 2 Items**.
105. Turn **Allow live voice transcription** off: the mic greys out and the status reads "Enable live
     transcription below to start". Close and reopen — it is still off. Turn it back on.
106. ⋯ → **List settings** (Save only, greyed with an empty name), **Uncheck all**, **Edit** (delete
     and reorder controls), **Copy list**.
107. Share → **Share List**: **Share list as text**, **Create Share Link**, **Share Link**, **Revoke
     Link**. Open the link in a browser before revoking: it shows the list read-only.
108. **Complete Shopping Trip** → "Complete this trip and create next week’s list?" → **Complete trip**:
     the screen switches to next week's list, every item unchecked. The old list is read-only with **Use
     This List Again**.

---

## Known differences

Please **do not report** anything in this table. It is either a platform limit, a deliberate
decision, or a server-side gap.

| What you will see | Why |
| --- | --- |
| **Connect Google Calendar fails.** A blank page, then "authorization was cancelled." | A server fix is pending: the OAuth route needs the account's session cookie, which no in-app browser sends. **The iPhone app fails in exactly the same way.** |
| **No Sign in with Apple** on the Android build. | Apple's SDK is iOS-only. Use email and password. |
| **The voice orb does not animate.** The rings and bars are drawn still. | The iPhone animates them at 24 frames a second; a per-frame loop in JavaScript costs more than it shows. |
| **No chime when voice starts listening.** | The iPhone plays a short `ListeningReady.wav`; that file is not in this repository. |
| **The App Voice slider does not change a live voice conversation** — only Read Loud. | The iPhone applies a ×3 gain to the realtime audio track; the Android WebRTC library exposes no per-track gain. Use the phone's volume keys. |
| **A phone call during a voice session does not end it.** | The iPhone ends the session on an audio interruption; Android raises no equivalent event. Tap Done. |
| **Swiping a reminder away does nothing.** | iOS reports a dismissal; Android does not. Use the buttons. |
| **Sheets are full-height** rather than the iPhone's part-height cards with a grab handle. | Android has no detent API. |
| **Blurred "frosted" panels are flat.** | `.ultraThinMaterial` has no Android equivalent. |
| **Some icons differ slightly** — the diagonal "opens elsewhere" arrow, the calendar-with-a-clock, the sunrise. | The icon set has no exact match; the closest glyph is used. |
| **Fonts are the system font,** not the iPhone's SF Rounded in headings. | SF Rounded is an Apple font. |
| **Date and time pickers look different** — a list of hours and minutes rather than iOS's wheel. | Hand-built, so the layout matches the surrounding screen rather than an Android dialog. |
| **Text does not re-flow at the largest accessibility sizes.** | The iPhone re-lays several cards vertically; not ported. |
| **No "Updating…" pill** at the top during a save. | The iPhone shows an app-wide busy pill; each screen shows its own progress here. |
| **Reminders are local, not pushed.** They fire even with the phone offline. | The iPhone works the same way: the server has no Android or iOS push path, only web push for browsers. |
| **Important Moments hides the tab bar.** | Its screens sit outside the tab group so a Moments reminder can open them over any tab. On the iPhone they push inside the Today tab. |
| **A sent text message is recorded as failed.** After **Open Messages**, the wish shows "Failed" even when you sent it. | Android's SMS app reports no result to the app that opened it. The iPhone's Messages sheet does, and Nexdo maps an unknown result to failed exactly as the iPhone maps its own. |
| **Dismissing the share sheet still records "Shared".** | Android's share sheet always reports that something was shared. |
| **Share Card shares the artwork only**, without the greeting and signature drawn on it. | Drawing the finished card into an image needs a further native module. The greeting stays in the app. |
| **The contact pickers take one person at a time**, including "Choose multiple contacts". | Android's contact picker returns a single contact. Pick again to add more. |
| **"Done" rides on a bar above the keyboard** in the Moments editors. | Android has no keyboard accessory bar. |
| **Some Moments text says "iOS"** ("Open iOS Settings", "iOS does not allow Nexdo to send Messages automatically"). | The copy is the iPhone's, word for word, pending a decision on Android wording. **Open iOS Settings** opens Android's app settings. |
| **The greeting card's typeface differs.** | The iPhone uses New York (serif); Android uses its own serif. |
| **Shopping Lists hides the tab bar**, like Important Moments. | The same reason: the screens sit outside the tab group. |
| **No swipe to delete or drag to reorder** on a shopping list. Use ⋯ → **Edit**, which shows a delete button and up/down arrows; Review Items has a delete button on each row. | React Native has no built-in swipe row or drag reorder; adding one needs a further native module. |
| **"+" and the mic are separate buttons.** | On the iPhone one tap on that row can trigger both — an iPhone defect deliberately not copied. |
| **Share Link sends the link as a text message** to the share sheet. | Android's share sheet takes text only. |

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
  moments/            Important Moments (Phase 11 Run B)
  shopping/           Shopping Lists (Phase 11 Run C)
src/
  api/                the HTTP client and wire types
  query/              TanStack Query hooks, one file per feature
  store/              Zustand: session, consent, focus, appearance, task filters
  lib/                pure logic ported from NexdoCore, each with tests
  components/         shared views
  actions/            reminders: coordinator, notifications, contacts, composers
  features/moments/   Important Moments: model, store, reminders, device services, shared views
  features/shopping/  Shopping Lists: model, store, voice, image pipeline, sheets
  voice/              the realtime conversation, its transport and Read Loud
docs/swift-to-rn-style-map.md   how SwiftUI idioms were translated
```

Every ported file names the Swift view and line range it came from. Start there.

### Where the migration is documented

`docs/IOS_TO_REACT_NATIVE.md` — the screen inventory, the per-phase status sections with `body`
ranges, the backend gaps, and what is deferred.
