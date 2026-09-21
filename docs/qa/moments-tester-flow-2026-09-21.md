# Moments tester-flow validation — September 21, 2026

Source: `/Users/sri/Desktop/NexDo_Moments_Tester_Flow.pdf`, both pages. Scope: festival Moments, with cross-category isolation checks. Baseline `41d39f4`; iPhone 17 Pro simulator, iOS 26.5.

The backend tests use an isolated temporary SQLite database and simulated external providers. Simulator UI tests use `-moments-design-preview` and festival fixtures. No production recipients, messages, schedules, or user records were changed. No real email or Messages delivery was initiated. “Happy Diwali” is synthetic fixture data: the simulator uses a date 30 days ahead, not a claim about the actual festival date; backend fixtures use October 20, 2030 in America/Los_Angeles.

## Confirmed defect

### MOM-UAT-01 — Festival fallback ignores tone (medium)

Flow: Create Wish / Warm, Personal, Short, Fun / generation failure.

Reproduction:
1. Create a festival Moment titled Happy Diwali.
2. Request a draft separately for Warm, Personal, Short, and Fun without AI generation, or reach the backend fallback after an AI failure.
3. Compare the returned bodies.

Expected: the selected tone affects the fallback, especially Short versus the longer tones.
Actual: all four return the same sentence: “Happy Diwali! Wishing you and your family a joyful celebration filled with happiness and new beginnings!” The stored tone changes, but the body does not.

Cause: `src/server/moments/service.ts`, `generateDraft`, constructs one fixed festival fallback and does not use the tone. The Swift offline fallback does handle tones, so the experience differs depending on where the failure occurs. The backend reproduction uses `aiConsent:false` to exercise this branch deterministically without sending information externally.

Evidence: `src/server/moments/tester-flow.integration.test.ts`, the explicitly marked known-failure test. Expected-failure results are not counted as working product checks. Reproduces consistently. Correlation ID: not applicable to the local service test.

## Coverage

| PDF scenario | Result and evidence |
|---|---|
| Open Important Moments / festival manager | Native simulator navigation and four-tab tests. Preview launches at Important Moments; Home/Today entry is outside this run. |
| Festival name, date, reminder, time zone | Simulator edits and persistence checks; Swift date/DST validation and backend catalog tests. |
| Active toggle / disabling | Backend requires explicit cancellation of existing plans; disabling cancels pending plans and preserves draft. |
| Delete | Simulator cancellation confirmation; backend archival, sent-history retention, and prevention of stale-editor restoration. |
| Contacts | Swift masking, invalid contact, no recipients and duplicate-address checks; backend duplicate rejection; simulator Contacts controls. OS permission-denied and deleted-device-contact behavior not exercised live. |
| Festival-only scope | Mixed festival/birthday group saves rejected and birthday record unchanged. Swift grouping tests prevent merging other occasions. Supporting birthdays elsewhere in Important Moments is intentional, not leakage. |
| Wish edit, approve, regenerate | Blank approval rejected; approved edited draft survives generating another draft; simulator empty-message validation and autosave checks. |
| Tone | Swift local fallback supports all tones; confirmed backend fallback defect above. Live AI tone quality is not assessed. |
| Recipient personalization | Exact personalized body survives Copy and Share plan creation. Simulator review checks recipient count. Actual multi-recipient AI quality is not assessed. |
| Greeting image | Backend consent/ownership, malformed art, provider failure, and concurrency checks. Simulator generation uses explicitly labeled sample artwork. No real image-provider request made. |
| Catalog dates / recurrence / DST | Verified catalog-only updates; lunar dates are not extrapolated. Date changes cancel affected plans. Swift rejects nonexistent DST wall times and chooses the first occurrence for repeated wall time. |
| Future/past schedule and approval | Backend rejects past dates and unapproved drafts. Swift rejects disabled Moments, no recipients, unavailable email readiness, and unsupported scheduled images. |
| Messages safety | Backend forbids automatic Messages sends. Opening the composer does not mark the plan sent; manual confirmation is required. Actual iPhone composer/notification delivery not tested. |
| Email scheduling | Concurrent worker claim, provider result, throttling, permanent/ambiguous failures, cancellation, and crashed-claim recovery pass with simulated provider responses. Live connected-provider delivery is unverified. |
| Copy / Share | Exact personalized text and line breaks preserved; statuses become COPIED/SHARED, not SENT. Future Copy/Share is correctly rejected; these are immediate actions. OS share completion/cancellation and clipboard contents not verified on-device. |
| Idempotency | Same key returns the same plan; second active plan through another draft rejected; concurrent workers send only once in integration tests. |
| Live availability | Production `/api/moments` returns JSON HTTP 401 when signed out, not the previous route-missing 404. Authenticated production load remains unverified. |

## Supported limits, not bugs

- Scheduled wishes currently send text only. The app explicitly says so, and the backend rejects image attachment scheduling. Greeting cards can be shared separately from the editor. The PDF's optional scheduled-image expectation is not implemented; it must not be marked passed.
- Artwork is stored on the creating device. The editor discloses this. Cross-device artwork persistence is not supported or tested.
- Copy/Share are immediate actions; choosing them for a future schedule yields a specific explanation. This is an intentional channel rule, not a server failure.
- The native Contacts picker permits selecting individual contacts without granting whole-address-book access. Denial of broad Contacts permission alone should not be classified as a failure of this privacy-preserving picker.

## Evidence and results

96 working checks passed: 62 backend, 17 Swift core, and 17 distinct native simulator UI scenarios across targeted runs and reruns. One expected-failure regression reproduces MOM-UAT-01 and is excluded from that total. Existing UI tests referring to old labels or native controls were updated as test maintenance. Product source is unchanged; nothing is committed or deployed.

Commands:
```sh
npx vitest run src/server/moments
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test --package-path ios --filter 'festival|moment|wish|greeting|Greeting'
```
The initial simulator run selected 14 `testFestival…` methods plus empty-message and failed-autosave cases in `MomentUITests`. A new regeneration-cancellation scenario brings the final coverage to 17 distinct passing UI scenarios. Initial failures caused by outdated labels, picker queries, and popover assumptions passed after test maintenance and targeted reruns.

Artifacts: `/tmp/nexdo-moments-uat-20260921.xcresult`, `/tmp/nexdo-moments-uat-20260921.log`, `/tmp/nexdo-moments-core-20260921.log`, `/tmp/nexdo-moments-flow-backend.log`.

Screenshots are saved under `docs/qa/moments-20260921/`: all four tabs, the greeting-card preview, and the card editor. The saved card screenshot confirms the editable signature is visible. [Saved-date evidence](moments-20260921/saved-date.png) visually confirms that the edited October 20, 2026 date persists after saving and reopening Schedule: both the header and native picker agree. The compact picker exposes no accessibility value on this runtime, so the test checks the persisted header and picker existence, supplemented by this visual check.

Backend/Swift totals:
- 58 existing backend tests passed.
- 4 additional flow tests passed: reject blank approval/preserve edits, exact Copy body/status, exact Share body/status, and cross-category isolation.
- 1 expected-failure test reproduces MOM-UAT-01. It is deliberately excluded from the passing-product count.
- 17 Swift core tests passed.
- 17 distinct native simulator UI scenarios passed across targeted runs and reruns.

Final rerun artifacts: `/tmp/nexdo-moments-uat-rerun-20260921.xcresult`, `/tmp/nexdo-moments-uat-final-20260921.xcresult`, and `/tmp/nexdo-moments-uat-date-visual-20260921.xcresult`. The last verifies saved-date navigation and supplies the screenshot above.

UI test maintenance: updated old Messages wording and the festival date control, now a button opening a Select Date sheet. Native regeneration confirmation appears as a dismissible popover on this runtime rather than an action sheet with a Cancel button. The test uses its dismissal region to keep the original text.
