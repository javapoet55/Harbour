# Important Moments: "Connect me on the day"

On a moment's day, at a time and time zone the user chooses, Nexdo phones the user and asks
"It's Mom's birthday today. Want me to connect you to Mom now?". If they say yes, Nexdo dials the
recipient **showing the user's own verified number** and joins the two of them; the AI never speaks
to the recipient. The feature is off until `MOMENT_CALLS_ENABLED=true`.

## Setup (Manage Moment → Schedule → "Connect me on the day")

1. **Verify my number** (once per user): the app calls `callerIdStart`; Twilio's Outgoing Caller ID
   API returns a 6-digit code shown in the app and Twilio calls the number; the user types the code
   on the keypad. Twilio reports the result to `/api/moment-calls/caller-id-status`; the app also polls
   `callerIdStatus`. A number another Nexdo account verified cannot be claimed; a number already in
   the Twilio account (for example added in the console) is removed and must be proved again.
2. Per moment: toggle, **call time** and **time zone**. Defaults: 9:00 AM in the recipient's (moment's)
   time zone, or the nearest half hour inside both people's 8:00 AM–9:30 PM hours. The preview shows
   both local times. Save is refused if the time is outside the user's own calling hours; outside the
   recipient's hours is a warning only.
3. The recipient's phone must include a country code. A bare 10-digit number is read as +1 only
   when the moment's time zone is in the US/Canada, so an Indian mobile is never dialed as a US number.

## The call

1. The worker's minute tick calls `POST /api/moment-calls/tick` (with `HARBOR_CRON_SECRET`). On the
   moment day (in the chosen time zone), at the chosen time and up to 60 minutes late, one call is queued
   per moment and occurrence (unique index), and Twilio dials the user from `TWILIO_VOICE_NUMBER` with
   answering-machine detection.
2. `/api/moment-calls/twiml`: voicemail → hang up, status `MISSED`, push "Connect now". A person →
   `<Connect><Stream>` to the voice worker (token `moment:<id>`), then `<Redirect>` to
   `/api/moment-calls/after-agent`.
3. The agent (GPT Realtime, the user's chosen voice, 90 s cap) asks one question; tools: `connect_now`,
   `call_back_later` (10–120 min, same day, inside calling hours, up to 3 times), `decline`.
4. `after-agent`: if the answer was yes, `<Dial callerId="<user's verified number>">` to the recipient
   (30 s ring, `answerOnBridge`). If the number is no longer verified the call is **not** placed with
   Nexdo's number; the user is told and asked to verify again.
5. `/api/moment-calls/dial-result`: answered → `CONNECTED` (talk time saved); not answered →
   "Mom didn't pick up", `RECIPIENT_NO_ANSWER`, push notification.
6. "Connect now" in the app (`connectNow`) rings the user and bridges straight away, without the agent.

Statuses: `QUEUED, DIALING, IN_PROGRESS, CONNECTING, CONNECTED, DECLINED, CALL_BACK_SCHEDULED, MISSED,
RECIPIENT_NO_ANSWER, FAILED, CANCELLED, EXPIRED, ENDED`.

## Variables

- `MOMENT_CALLS_ENABLED=true` on the Harbour service (Develop first). Everything else is shared with the
  food check-in calls: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VOICE_NUMBER`, `APP_URL`,
  `NUTRITION_CALL_WORKER_URL`, `VOICE_WORKER_SECRET`, `HARBOR_CRON_SECRET`.
- The call workers redeploy automatically (their files changed) and start ticking the new endpoint;
  it answers 503 until `MOMENT_CALLS_ENABLED=true`.

## Costs

Twilio bills both legs: the call to the user and the bridged call to the recipient, $0.014/min each in
the US (international destinations vary), plus $0.0075 answering-machine detection and $0.004/min for
the ~20-second agent audio stream. The agent itself is a few cents per call. The one-time caller-ID
verification call is a normal short call.

## Tests

`src/server/moment-calls/rules.test.ts` (phones, time zones, defaults, TwiML) and
`src/server/moment-calls/moment-calls.integration.test.ts` (verification, settings, the tick, agent
decision, bridge with the user's number, no answer, call back, voicemail, refusing without a verified
number, removal).
