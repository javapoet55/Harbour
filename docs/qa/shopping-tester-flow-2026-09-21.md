# Shopping List tester-flow validation — September 21, 2026

Source: `/Users/sri/Desktop/NexDo_Shopping_List_Tester_Flow.pdf` (both pages).
Baseline: `41d39f4`. iPhone 17 Pro simulator, iOS 26.5. Server integration tests use an isolated temporary SQLite database; UI tests use the app's preview transport. No customer lists, orders, or messages were modified.

## Findings

### SHOP-01 — Invalid quantities can be saved (medium)

Step 3 / critical invalid-item handling. Submit an item with quantity `""`, `"0"`, `"-2"`, or `"abc"`. All four values pass backend validation; the editor only validates the item name before enabling Save. Expected: reject invalid/nonpositive quantities or apply an explicit documented default. The quantity is persisted as an unconstrained string. Reproduced at the validation layer; known-failure regression cases are in `src/server/shopping/tester-flow.test.ts`. This is a confirmed validation defect, not a simulator limitation.

### SHOP-02 — Static fallback presented as AI recommendations (medium)

Steps 4–5. The preview's alternatives response cannot decode, so the app uses its local fallback (`usedAI=false`). The screen still says “AI Recommended Alternatives.” Production network/provider failures use the same fallback path. Expected: identify these as suggested/offline alternatives, and distinguish them from a successful AI request. The original item remains available and replacements still work. Evidence: `ShoppingStore.alternatives`, `ShoppingAlternativesView`, and the simulator alternatives test.

### FLOW-01 — Cannot specify the desired alternative in the item sheet (functional gap)

Step 5A describes asking for lower calorie, lower fat, healthier, or similar replacements. The item alternatives sheet has selection/replacement controls but no preference selector or text input. The API input contains only name/category/quantity/size. The general AI recommendations chat is a separate action; it does not establish this item-specific flow. This is a missing flow capability rather than a crashed feature.

## Coverage and limits

| Flow | Result / evidence |
|---|---|
| Open existing list | Simulator Shopping home/detail navigation. Home/Today entry itself is not exercised by preview launch. |
| Create empty list; reuse prior list; copy unchecked | Simulator cases. Weekly rollover also covered by real database integration tests. |
| Manual add/edit/check/delete | Typed input and editor simulator coverage; delete and fresh-read persistence through database tests. |
| Invalid names / duplicate IDs | Rejected without changing stored items or revision. |
| Duplicate names | Allowed as separate rows; the flow does not define merge vs rejection. Not classified as a defect without a product rule. Retry idempotency prevents duplicate lists; repeated transcript final events are deduplicated. |
| Voice correction | Editable transcript and add flow in simulator; Swift transcript sequencing tests. Actual microphone, accent accuracy, bell, and live Realtime connection are not verified. |
| Alternatives keep/replace | Original retained when closing; selected replacement targets one item and keeps other items. Simulator uses local fallback, not a live AI response. |
| Persistence | Fresh database reads after edit/check/replacement/deletion/completion pass. Phone terminate/relaunch against an authenticated backend is not verified: preview resets its fixture on launch. |
| Shop Myself | Existing list check-off mode; no separate destination required to exercise it. |
| Share | Share token creation, reuse, revocation, ownership, and weekly link isolation covered. UI share controls covered; no email/SMS was sent. OS recipient selection, delivery cancellation, and network failure after dispatch remain unverified. |
| Instacart | No enabled integration or handoff found in Shopping source. Not applicable to the PDF's “when integration is enabled” condition. |
| Nearby Store | No dedicated store/contact/pickup confirmation workflow found. Generic OS text sharing exists, but is not equivalent. Missing capability, not a passing handoff test. |
| Live server | Signed-out `/api/shopping`: 401 (expected); invalid public share token: 404 (expected). Does not prove signed-in data access. |

## Test evidence

All 9 simulator scenarios passed across the final targeted reruns. Quantity editing required selecting the existing text before replacement; the failed cursor-insertion assertion was a test automation issue. Initial UI failures were caused by obsolete test selectors (“Item”, “Add an item”, and “Review Items”) following prior product changes. Tests were updated to current “Edit Item”, the stable quick-add identifier, and “Add to List”; these selector failures are not reported as app bugs.

No product fixes, commits, or deployments were made during this testing request.

Automated results:
- 14 normal backend cases passed (11 existing + 3 added flow cases).
- 4 quantity-rejection cases reproduce the known defect. They are explicitly marked `it.fails` so an expected failure is not mistaken for valid product behavior.
- 9 simulator UI cases passed across reruns (create, copy/reuse, edit/check, typed add, transcript add, voice preference, alternatives, sharing).
- 7 Swift core cases passed (transcript deduplication/order, quantities/sizes, images, alternative decoding/fallback).
- Simulator test artifacts: `/tmp/nexdo-shopping-uat-rerun-20260921.xcresult`, `/tmp/nexdo-shopping-uat-final-20260921.xcresult`, and `/tmp/nexdo-shopping-uat-edit-20260921.xcresult`.
- Screenshots: `shopping-20260921/my-lists.png`, `shopping-20260921/new-list.png`, `shopping-20260921/replacement.png`.

Test commands:
```sh
npx vitest run src/server/shopping
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test --package-path ios --filter shopping
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild test -project ios/Nexdo.xcodeproj -scheme Nexdo -destination 'platform=iOS Simulator,id=451515D3-D367-4E41-9CCC-1F0FD93E296B' -only-testing:NexdoMomentUITests/ShoppingUITests -parallel-testing-enabled NO
```
