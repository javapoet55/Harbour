# Moments and Shopping acceptance checks — September 18, 2026

## Scope and environment

Native iOS simulator flows use isolated URLProtocol fixtures; backend integration tests use a temporary SQLite database. No production wishes, contacts, lists, or reminders were modified, and no messages were sent. These automated acceptance checks supplement, rather than replace, UAT on a physical device.

## Bugs addressed

- Shopping quantity parsing treated `g` and `ml` as part of item names and parsed “half a gallon of milk” as an item named “1 gallon of milk.” A regression test reproduced the failure before the fix. Metric abbreviations and the spoken article now parse into the correct name, quantity, and size.
- Copying a shopping list from its detail screen saved a copy but left the original open. The copy completion callback now opens the new unchecked list in that screen. A UI regression checks that a checked source item becomes unchecked in the displayed copy.
- The older Moments delivery tests still attempted to open Birthday’s retired Review screen. Their fixture now uses Custom moments, which retain that flow. Birthday, Anniversary, Festival and Get Well Soon have separate four-tab/greeting-card tests. This is a test maintenance correction, not a production behavior change.

## Validation

- Backend: 64 passing tests across Moments, Shopping, greeting artwork, and shared Ask AI module actions.
- Native domain: 20 passing tests covering selected Moments/Festival/Shopping models.
- TypeScript: passed.
- Simulator acceptance suite: **35 passed, 0 failures** (30 Moments and 5 Shopping), including the new copy-from-detail regression. Native app build succeeded.
- No additional Moments product defects reproduced in this run.
- Xcode emitted an optional simulator-diagnostics collection warning after the successful test run; test results were saved in the xcresult bundle.

## Device-only checks remaining

- Continuous speech capture using a physical microphone, interruption/reconnection and OS permission prompts.
- Camera/photo-library capture on a physical phone.
- Live paid image generation, authenticated email-provider delivery, push notification arrival while the app is closed, and the system Messages composer’s final Send action.

Provider behavior is mocked in automated tests; no live delivery or paid image generation is claimed by these results.
