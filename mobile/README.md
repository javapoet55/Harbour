# Nexdo mobile (React Native, Expo)

The React Native replacement for the SwiftUI app in `../ios`. It uses the same Railway API and the same `harbor_session` cookie. The migration plan is in [`../docs/IOS_TO_REACT_NATIVE.md`](../docs/IOS_TO_REACT_NATIVE.md).

**Status:**
- Phase 1 (setup) is done. Screens are placeholders, except the session check at `app/dev/session-check.tsx`.
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

The app opens on the sign-in placeholder, or on Today if a session already exists.

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
  (auth)/sign-in.tsx     placeholder (Phase 2)
  (tabs)/                Today, Tasks, Ask AI, Calendar placeholders
  dev/session-check.tsx  cookie session test (below)
src/
  api/client.ts          port of ios/Sources/NexdoCore/APIClient.swift
  api/types.ts           port of Models.swift, compared with src/lib/types.ts
  api/index.ts           app-wide client and endpoints
  query/                 QueryClient, query keys, useMe, useTasks
  store/session.ts       Zustand session store
  theme/                 colours from ios/App/RootView.swift, spacing, type, radii, useTheme
  components/            Screen, Text, Button, Card, TextField, LoadingView, ErrorView
```

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
