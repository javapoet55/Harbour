# Shared-file requests, from the Windows parity pass

Parity fixes found on branch `rn-ui-parity-win` (calendar, ask, account, reminders) that need a file
that session does not own: anything under `mobile/src/components/`, `mobile/src/theme/`,
`mobile/app/_layout.tsx`, `mobile/app/(tabs)/_layout.tsx` or the style map.

**Exception, by agreement:** `AskNexdoView.tsx`, `AskParts.tsx` and `AskResponse.tsx` are owned by
the Windows session, since the Mac is not touching Ask. Their requests were applied in
`mobile: parity ask (win) — component fixes` and are no longer listed here.

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

## `src/components/ProfileParts.tsx`

Read against `ProfileView.swift:39-58`, `:104-123` and `account-default.png`.

| What | Why |
| --- | --- |
| `AccountMenuRow`: the leading glyph `size` 20 → **17**, and the trailing chevron/arrow 13 → **12**. | `Image(systemName: icon)` carries no `.font`, so it is `.body` (`:105`); the trailing one is `.font(.caption)` (`:108`). |
| `AccountAvatar` and `ProfileCard` should take the **elevated** palette when rendered inside the account sheet, or accept the colours from the caller. | `AccountView` is a `.sheet` (RootView.swift:1181, `:1702`). `app/account/index.tsx` and `settings.tsx` now pass `useTheme({ elevated: true })` for their own colours; these two still resolve their own non-elevated palette, so in dark mode the card is `#1C1C1E` where the screen around it is also `#1C1C1E`, and the card stops reading as a card. |

## `src/components/SettingsControls.tsx`

Read against `ProfileView.swift:146-270`, `:274-295`.

| What | Why |
| --- | --- |
| `styles.subheadline` 20 → **21**. | Style map §2. |
| The card title, `SettingsField`'s label, `SettingsToggle`'s label and `SettingsLabeledValue`'s label take `theme.colors.label`; `SettingsLabeledValue`'s value takes `theme.colors.secondaryLabel`. | None carries a `.foregroundStyle` in Swift, so all are `Color.primary` / `LabeledContent`'s own secondary (style map §3). The screen currently paints them `nexdoInk` / `nexdoSecondary`, which is visible in light mode. |
| **`SettingsSegments`: use `colors.segmentTrack` and `colors.segmentSelected`, with the selected label in `colors.label`** — not a `tint`-filled segment with white text. | `.pickerStyle(.segmented)` (`:154`) is a system segmented control: a translucent track with a raised light capsule and label-coloured text. This is the same fault PARITY global fix 5 already closed for the Tasks screen's picker; the Appearance picker never got it, so Day/Night/System renders as an indigo block. |
| `SettingsPicker`: the current value takes `theme.colors.tint`, and the indicator is the up/down chevron pair. | `.pickerStyle(.menu)` (`:202`) draws the selection in the accent colour with `chevron.up.chevron.down`. |
| `SettingsSlider`: the two speaker glyphs `size` 15 → **17** and colour `theme.colors.label`; the thumb is white with a shadow, not `tint`. | `Image(systemName: "speaker.fill")` has no `.font` and no `.foregroundStyle` (`:168-172`), and a system `Slider` thumb is white in both appearance modes. |

## `src/components/TodayActions.tsx`

Only `NextActionRow` (`TodayActionsView.swift:165-186`) was reviewed here — the action queue renders
it. `ActionNeededCard` belongs to the Today screen, which the Mac session owns.

| What | Why |
| --- | --- |
| `styles.subheadline` 20 → **21**. | Style map §2. `NextActionRow`'s title is `.subheadline.weight(.semibold)` (`:175`). |
| The relative label and the context line take `theme.colors.secondaryLabel`. | Both are `.foregroundStyle(.secondary)` (`:172`, `:176`), which is `.secondaryLabel`, not `nexdoSecondary`. |
| The trailing `chevron.right` is `.font(.caption)` — 12, and both trailing glyphs inherit `nexdoInk` from `ActionGlass` rather than taking a colour of their own. | `:181-182` carry no `.foregroundStyle`; the enclosing `ActionGlass` sets `Color.nexdoInk` (`:49`). |
