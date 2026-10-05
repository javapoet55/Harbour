# NexDo Google OAuth verification demo

Target: 3–4 minutes, English narration, real staging/production build with the audited patch. Use a designated Google test account and disposable events; no real customer data. Do not show secrets, cookies, access tokens or refresh tokens. Show the client ID in the authorization request as required by Google's verification instructions. Confirm the actual client/project matches the submission.

Before recording: verify public legal pages, use a fresh/revoked test grant so old broad permissions do not contaminate consent, enable write access to the connected primary calendar, and rehearse the actual approval flow. If the app does not show confirmation, do not fake it: stop and correct that path before recording. Saved voice-event editing is not supported; use the supported task/local-event editor for rescheduling.

| Time | Screen / action | Narration |
| --- | --- | --- |
| 0:00–0:20 | Open NexDo homepage; follow Privacy and briefly show Terms link | “NexDo helps users organize their schedule and prepare next steps. These pages explain its data use.” Only claim disclosures actually present. |
| 0:20–0:40 | Sign into NexDo; Profile → Calendar settings (or web Settings for a supported test build); select Connect Google Calendar | “Calendar access is optional and starts when I choose to connect.” |
| 0:40–1:10 | Show real Google authorization URL/client ID, then consent screen and all permissions | “NexDo reads account identity, reads calendar metadata, and reads and changes events on my own calendar. It does not request calendar sharing or permission to delete entire calendars.” Explain the actual displayed permissions, not a replacement mockup. |
| 1:10–1:25 | Grant both Calendar permissions and return to NexDo; display an existing test event | “My primary calendar is connected. NexDo imports events so I can see my schedule.” |
| 1:25–1:45 | Ask voice/Ask AI for free time on a specific test day; show returned availability | “NexDo calculates available time from synced events. It does not need a separate Google FreeBusy permission.” Do not claim real-time completeness if the calendar has not just synced. |
| 1:45–2:25 | Request a uniquely named 30-minute test appointment at an available time; show proposal/read-back; explicitly confirm; show actual tool success | “I review the title, date and time before confirming. NexDo now writes the event.” Check actual result, including any sync warning. |
| 2:25–2:45 | Open Google Calendar and show the matching appointment | “This is the event I approved on my primary calendar.” |
| 2:45–3:10 | Use the supported local appointment or linked task edit screen to change time and save; show Google Calendar updated | “I can reschedule a linked event.” Do not use unsupported saved-event editing through voice. If the available UI cannot edit this event, omit this optional demonstration and explain supported task rescheduling in the submission notes. |
| 3:10–3:30 | Show calendar visibility/write controls and disconnect; optionally delete only the named disposable event via an explicit user action | “I control this connection. Disconnect removes NexDo's local connection; it does not delete my Google calendar.” Never delete a whole calendar. |
| 3:30–3:50 | Google Account → third-party connections → NexDo → remove access; show reconnect state after sync | “I can revoke Google's grant here. NexDo then asks me to reconnect instead of repeatedly requesting consent.” Note shared Gmail authorization can also be affected. |

Use the real UI and exact permissions in the submitted build. Keep account credentials off-screen. Upload the completed recording using the visibility/access requested by Google's verifier (commonly an unlisted video), and include its link in Console. This file is a recording script, not evidence that the live flow has been tested or verified by Google.
