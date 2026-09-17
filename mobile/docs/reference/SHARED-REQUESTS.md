# Shared-file requests, from the Windows parity pass

Parity fixes found on branch `rn-ui-parity-win` (calendar, ask, account, reminders) that need a file
that session does not own: anything under `mobile/src/components/`, `mobile/src/theme/`,
`mobile/app/_layout.tsx`, `mobile/app/(tabs)/_layout.tsx` or the style map.

Each row: **file** — **what** — **why**. Nothing here has been applied.

## `src/components/TaskSymbol.tsx`

| What | Why |
| --- | --- |
| Add `'exclamationmark.triangle': 'warning-outline'`. | `CalendarView.swift:259` labels the Schedule Intelligence recommendation with the **outline** triangle, and `calendar-default.png` shows it outlined. Only `exclamationmark.triangle.fill` is mapped, so `app/(tabs)/calendar.tsx` currently draws the solid Ionicons `warning` as a stand-in. |
| Add `'chevron.up.chevron.down': 'chevron-expand-outline'`. | A `Picker(...).pickerStyle(.menu)` draws the up/down chevron pair, not a single chevron — visible in `calendar-event-editor-default.png` next to "Does not repeat" (`CalendarView.swift:541`). `app/calendar/event/new.tsx` uses `chevron.down` meanwhile. |

## `src/components/CalendarParts.tsx`

| What | Why |
| --- | --- |
| `styles.time` colour: use `theme.colors.ink`, not `theme.colors.secondary`. | `Text(row.time).font(.caption)` (`CalendarView.swift:440`) has no `.foregroundStyle`, so it inherits the view's `.foregroundStyle(Color.nexdoInk)` (`:137`). The time gutter is currently the only part of the row that is greyed. |
| `styles.subheadline` and `styles.segmentLabel`: `lineHeight` 20 → **21**. | `.subheadline` carries its own 21pt leading; `fontSize * 1.2` is the rule for `.system(size:)` only (style map §2). |
| `styles.badgeText`: `lineHeight` 14 → **13**. | `.caption2` is 11/13 (style map §2). |
