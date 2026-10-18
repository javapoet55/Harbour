# Friday App Store review requests

- Uses Apple's native SwiftUI `requestReview` screen, with no custom rating dialog or sentiment filtering.
- First eligible Friday is after seven local calendar days from first launch. iOS does not expose the actual App Store download time to this flow. Existing installations start this clock on their first launch of this update.
- Only request on Friday at/after 17:00 in the current device time zone, while authenticated and foregrounded. Check after 30 quiet seconds; defer while busy, typing, or displaying another modal.
- Five consecutive Friday opportunities, at most one request per opportunity. Missed Fridays expire. No notifications or background prompts.
- Persist the first-launch timestamp and last consumed week in app-container UserDefaults. App updates and sign-outs retain the schedule. Fresh app-data deletion resets it; backup restoration/offloading may retain it.
- Persist the opportunity before calling StoreKit because Apple provides no confirmation that a prompt appeared or a review was submitted.
- Apple controls display and caps prompts at three per 365 days; requests do not show in TestFlight. Five requested opportunities cannot guarantee five visible screens.
- No backend or database changes. An updated iOS build is required.

Validation: `swift test --package-path ios --filter AppReviewSchedule` covers seven-day delay, Friday 17:00 boundary, five-week expiry, DST, device time zones, duplicate suppression after persistence, missed weeks, and Friday evening first launch.
