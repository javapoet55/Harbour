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

## Ask AI — the whole group lives in shared files

Screens 23 and 24 are three-line routes (`app/ask/index.tsx`, `text.tsx`, `voice.tsx`) over
`src/components/AskNexdoView.tsx`, `AskParts.tsx` and `AskResponse.tsx`, none of which this session
may touch. So the review is here in full rather than in the code. Read against
`AskNexdoView.swift:182-277` (`body`), `:58-87`, `:277-375`, `AskResponseView.swift:4-140`, and
`ask-default.png`. Screen 24's own capture does not exist — `ai-consent-default.png` shows the
**voice** consent alert on `AddTaskByVoiceView`, not `consentView`.

### The two rules that account for most of it

1. **`AskStyle.secondary` is `.secondaryLabel`, not `nexdoSecondary`** (`AskNexdoView.swift:51`), and
   **`AskStyle.ink` is `.label`, not `nexdoInk`** (`:50`). Every Ask file maps both onto
   `theme.colors.secondary` / `theme.colors.ink`, which are the brand colours. In dark mode
   `colors.secondary` already resolves to `.secondaryLabel`, so this is a **light-mode** error
   throughout — the same fault the style map §3 records for "New to Nexdo?" on sign-in.
2. **Named text styles carry their own leading** (style map §2). Every `subheadline` in these three
   files is `lineHeight: 20`; it is **21**. Every `footnote` is 18; it is **20**.

### `src/components/AskNexdoView.tsx`

| What | Why |
| --- | --- |
| `styles.subheadline` 20 → **21**; `styles.footnote` 18 → **20**; `styles.field` `lineHeight` 20 → 21. | Style map §2. |
| Tagline, "Type a question or tell Nexdo…", the question row, "Keep your question under 4,000 characters." and the consent footnote: `theme.colors.secondaryLabel`. | `AskStyle.secondary` / `.secondary` (`:211-213`, `:236-241`, `:329`, `:352`). |
| "What would you like help with?", the failure line, the voice-error line and the consent body: `theme.colors.label`. | None of these has a `.foregroundStyle` in Swift, so they are `Color.primary` (style map §3). |
| `useTheme({ elevated: !textPage })`, and `app/ask/_layout.tsx` gains a matching `contentStyle` for `index` only. | The suggestions page is a `.sheet` (RootView.swift:110) and iOS resolves its backgrounds one level up, so `AskStyle.background` is #1C1C1E there in dark mode, not black. "Free form Text" and the voice screen are `.fullScreenCover`s (`:270-271`), which do **not** elevate. Left alone here so the layout and the component cannot disagree; apply both together. |
| `field` placeholder: `theme.colors.placeholder`. | `.placeholderText`; `nexdoSecondary` is far too dark (style map §3). |
| `field` heights: `minHeight` 96 → **108**, and add `maxHeight: 192` for the text page. | `.lineLimit(4...8)` (`:336`) at a 21pt line box plus the 12pt padding either side. The 1…4 case is right at 44 because Swift states `.frame(minHeight: 44)`. |
| The "Ask Nexdo" button's disabled opacity 0.55 → **0.25**. | Swift writes `.disabled(...)` *and* `.opacity(0.55)` (`:365`); SwiftUI dims a disabled control on top of that, and the rendered result matches 0.25 (style map §5). |
| The mic glyph `size` 20 → **17**. | `Image(systemName:)` with no `.font` is `.body` (`:370`). |
| "Preparing voice reply…", "Stop speaking", "Retry voice reply" and the failure "Retry": `.body` (17/25), not `.subheadline`. | None carries a `.font` in Swift (`:314-320`). |
| The "Asking Nexdo…" row should stack: spinner above the label, centred. | `ProgressView(label)` with the default circular style puts its label underneath (`:250`). |
| `consentView`'s "Allow sharing with OpenAI": a content-sized capsule filled with `askBlue`, leading-aligned — not a full-width 12pt-radius block. "Not now" is a plain leading-aligned text button, not a centred full-width one. | `.buttonStyle(.borderedProminent)` and `Button(role: .cancel)` inside a `VStack(alignment: .leading)` (`:355-362`). |

### `src/components/AskParts.tsx`

| What | Why |
| --- | --- |
| `styles.subheadline` 20 → **21**; `styles.footnote` 18 → **20**. | Style map §2. |
| `AskSuggestionCard`: the title and the icon take `theme.colors.label`; the detail and the chevron take `theme.colors.secondaryLabel`. | `.foregroundStyle(AskStyle.ink)` on the row and `AskStyle.secondary` on the detail (`:70-74`). |
| `AskSuggestionCard`: the title/detail stack needs `gap: 3`. | `VStack(alignment: .leading, spacing: 3)` (`:69`). |
| `AskEntryCard`: the title/detail stack needs `gap: 4`, the detail takes `secondaryLabel`, and both labels need `adjustsFontSizeToFit` with `minimumFontScale={0.75}`. | `VStack(spacing: 4)` and `.minimumScaleFactor(0.75)` on both (`:300-303`). Roboto is ~9% narrower on a 4.5% narrower screen, so this is exactly where "Free form Text" runs out. |
| `AskExampleRow`: `.body` (17/25) for both the label and the `arrow.up.left` glyph, colour `theme.colors.label`, row `gap` 12 → 8. | The row carries no `.font` and no `.foregroundStyle`, and a bare `HStack` spaces by 8 (`:221-225`). |
| Drop the invented `opacity: disabled ? 0.55 : 1` on all three, or measure it. | Swift writes `.disabled(blocked)` with no `.opacity` on any of them; 0.55 is not from the source. |

### `src/components/AskResponse.tsx`

| What | Why |
| --- | --- |
| `styles.subheadline` 20 → **21**. | Style map §2. |
| The summary text takes `theme.colors.label`; "Tap to view the details." and a change's `reason` take `theme.colors.secondaryLabel`. | `AskStyle.ink` (`AskResponseView.swift:78`) and `AskStyle.secondary` (`:22`, `:55`). The card body is correctly `nexdoInk` — Swift names it explicitly there (`:124`). |
| "Approve changes": a content-sized capsule in the tint, not a full-width 12pt-radius block. | `.buttonStyle(.borderedProminent)` (`:58`). |

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
