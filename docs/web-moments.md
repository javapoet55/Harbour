# Important Moments on the web

Page: `/moments` (nav entry "Moments"). Server API is the existing `GET/POST /api/moments`; no server change.

## What the web covers
- **List**: Upcoming / Scheduled / Sent tabs, occasion filter, search. Each row shows the occasion, next date, how far away it is and where it stands (needs a wish, wish ready, auto-send scheduled, failed, reminders off). Moments the phone app archived show only under Sent.
- **Add / edit moment**: occasion (birthday, anniversary, festival, get well soon, custom), title, date, repeat yearly, time zone, first name, email, phone. Edit is refused by the server (409) while a wish for the moment is scheduled or sending; the web disables Edit and says to cancel the email first.
- **The wish**: write a draft (`generate`, tone Warm / Personal / Short / Fun, optional note up to 500 characters, explicit "Let Nexdo's AI write it" consent; without consent the server fills a template), edit the text (max 500), approve it (`approve`). Approval is per text: editing after approval needs a new approval.
- **Schedule the email**: automatic email only. Recipient, day, time, time zone, repeat yearly, one-hour reminder. The idempotency key is fixed per attempt so a double click or retry cannot send twice.
- **After scheduling**: Move (`reschedule`), Send now, Cancel (returns the wish to approved), Retry a failed email, and for "Check Sent mail" (UNCERTAIN) the customer says whether it was sent or not.

## Rules mirrored from the phone app
`src/lib/moments.ts` ports `typeLabel`, `isArchived`, `latestDraft`, `allPlans`, `planEditable`, plan status labels, `upcomingDelivery`, `readyToSchedule` and `needsWishReview` from `mobile/src/features/moments/domain.ts`. Date/zone math uses `Intl` only (DST-gap times are refused). Tests: `src/lib/moments.test.ts` (27).

## Deliberately not on the web (yet)
- **Connecting Gmail.** The OAuth callback (`src/app/api/moments/email/callback/route.ts`) finishes by redirecting to the `nexdo://moments-email` deep link, so a browser cannot complete it. The web uses a Gmail account already connected in the phone app and otherwise tells the customer to connect it there. Making this work needs a server/OAuth change (a web return URL) and a security review; it was not touched here.
- Messages/SMS, copy and share channels (they hand off to the phone), greeting cards, festival management and catalog, "Connect me on the day" calls and caller ID, importing from device contacts or calendar, local reminders.
- Non-automatic email plans: the server only lets the provider mark an email sent, so the web offers automatic email only. Automatic scheduling also needs the server flag `MOMENTS_SCHEDULER_ENABLED=true`; when it is off the page says so instead of failing.
