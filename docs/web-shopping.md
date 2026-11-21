# Web Shopping Lists

Pages: `/shopping` (My Lists, New List) and `/shopping/[id]` (one list). Side menu entry: Shopping, after Calendar.
The web uses the same endpoints as the phones (`GET/POST /api/shopping`); no server change.

## What is in v1
- Create (blank, or copy of last week's / a chosen list with every item unchecked), rename, date, weekly repeat.
- Add items (typed; several at once with commas, parsed by the server with a local fallback), edit, delete, check off, check/uncheck all, grouped by category.
- Alternatives for food items (Replace in place, or Add to list).
- Share as text, or a view-only link (`/s/<token>`, shows checked items) that can be revoked.
- Complete Shopping: weekly lists open next week's unchecked list. Completed lists are read-only; "Use this list again" copies them.
- Delete list.

## How saving works
Edits change a local draft at once and are saved ~0.4 s later, one write at a time, against the last revision the server returned. Edits made during a save go out in the next pass. A failed save (including a 409 from another device) keeps the draft and shows Retry save / Discard local edits and reload. Every save sends all item keys, store fields, brand, barcode, favourites and photo data back so nothing set on the phone is lost.

## Web-only decisions (not built)
Voice / Add by Voice, store picker and logos, offers, photos / AI images / camera / barcode scan, email schedule, AI recommendations, goal-ranked nutrition comparison.

## Tests
`src/lib/shopping.test.ts` covers the pure list logic (no database needed).
