# Shared-file requests, from the Windows parity pass

Parity fixes found on branch `rn-ui-parity-win` (calendar, ask, account, reminders) that need a file
that session does not own: anything under `mobile/src/components/`, `mobile/src/theme/`,
`mobile/app/_layout.tsx`, `mobile/app/(tabs)/_layout.tsx` or the style map.

**Exception, by agreement:** `AskNexdoView.tsx`, `AskParts.tsx` and `AskResponse.tsx` are owned by
the Windows session, since the Mac is not touching Ask. Their requests were applied in
`mobile: parity ask (win) — component fixes`.

## Nothing outstanding

Every request on this list has been applied on the Mac side, each checked against the Swift line it
cited before being taken:

| File | Applied |
| --- | --- |
| `TaskSymbol.tsx` | `exclamationmark.triangle` (outline) added and adopted by the calendar recommendation; `chevron.up.chevron.down` was already added for the task-filters picker |
| `CalendarParts.tsx` | timeline time colour → `ink`; `subheadline`/`segmentLabel` leading → 21; `badgeText` → 13 |
| `ProfileParts.tsx` | `AccountMenuRow` glyphs 20 → 17 and 13 → 12; elevation solved app-wide (below) |
| `SettingsControls.tsx` | leading → 21; `label`/`secondaryLabel` colours; the Appearance picker rebuilt as a system segmented control; `.menu` picker in the accent colour with the chevron pair; slider glyphs 17 in `label` and a white thumb |
| `TodayActions.tsx` | `NextActionRow` leading → 21; `secondaryLabel` colours; trailing chevron 12, inheriting `ink` from `ActionGlass` |

### The elevation request needed a mechanism, not an edit

`AccountAvatar` and `ProfileCard` could not be fixed by changing those two components. A shared
component has no way to know it is inside a sheet, and `useTheme({ elevated: true })` is per-call, so
the screens were elevated while the components inside them were not.

On iOS a sheet installs an elevated trait collection and *every* descendant resolves
`.systemBackground` against it. `src/theme/elevation.tsx` is the equivalent: `<ElevatedSurface>`
wraps a screen presented as a sheet and `useTheme()` reads it as the default. `app/account/index.tsx`
and `app/account/settings.tsx` wrap their bodies in it, so every shared component below them — the
card, the avatar, the settings controls — now resolves the elevated palette without being passed
anything.

Any future sheet gets this right by wrapping itself; add new requests below.

### Run D (Windows): no shared-file requests

Run D needed no change to a Mac-owned shared file. It uses `ProfileCard`, `TaskSymbol`, `GlassCircle`,
`TodayBackdrop` and the theme as they are; the few glyphs `TaskSymbol` does not map (the waveform
badge, the shopping prompt icons, the star, the tree) are drawn or imported from `@expo/vector-icons`
inside the feature files. The only `src/components/` files it edited are `AskNexdoView.tsx` and
`AskParts.tsx`, which the exception above gives to the Windows session: a `shoppingContext` and an
`onClose` prop on `AskNexdoView`, and an optional leading `icon` on `AskExampleRow`.

---

# Requests the other way: Mac → Windows

Found while capturing the Android side of Ask. Both are in files the Windows session owns
(`AskNexdoView.tsx`, `AskParts.tsx`), so they were listed rather than applied — and both have since
been applied on the Windows side, in `mobile: parity ask (win) — indigo consent, android label fit`.
They are kept here with what was done, so the measurement behind each one is not lost.

## `src/components/AskNexdoView.tsx`

| What | Why |
| --- | --- |
| **Applied.** The consent sheet's "Allow sharing with OpenAI" capsule should be `theme.colors.tint`, not `theme.colors.askBlue`. Check "Approve changes" on the response card, which was given the same treatment. | `Button("Allow sharing with OpenAI") { … }.buttonStyle(.borderedProminent)` (AskNexdoView.swift:369-373) carries **no `.tint`**, so it fills with the inherited tint — `.tint(.nexdoIndigo)` applied at the root (RootView.swift:46). `AskStyle.blue` is only ever applied where Swift names it, such as the mic circle (`:356`). Measured off the two captures: iOS renders **(61, 41, 240)** = `#3D29F0` = `nexdoIndigo`; Android renders **(46, 89, 143)** = `#2E598F` = `askBlue`. |

## `src/components/AskParts.tsx`

| What | Why |
| --- | --- |
| **Applied** by measuring and scaling by hand: `FittedText` in `AskParts.tsx` keeps `adjustsFontSizeToFit` for iOS and, on Android, lays a copy of the label out in an over-wide absolute layer to read its ink width off `onLayout`, then scales `fontSize` by available/ink, clamped at `minimumFontScale`. `onTextLayout` is not used, for the reason in style map §4. — `AskEntryCard` sets `adjustsFontSizeToFit` + `minimumFontScale={0.75}` for `.minimumScaleFactor(0.75)`, but **`adjustsFontSizeToFit` is iOS-only in React Native** — it does nothing on Android. "Type your prompt" is clipped to "Type your" on the device: the label's box is 83.7 dp and the string needs about 90 dp. It needs a real fix — a smaller `fontSize` for the detail line, more width for the text column, or measuring and scaling by hand. | `AskNexdoView.swift:301-302`. Confirmed on the device from `uiautomator`: the node's text is the full "Type your prompt" while only "Type your" is painted. |
| **Applied** — the comment now cites the 18 dp narrower screen alone. While editing that file: the comment above those labels says "Roboto sets ~9% narrower than SF Pro on a 4.5% narrower screen". **That is wrong** and the style map entry it came from has been corrected — it was the test phone's `font_scale` of 0.9, not the typeface. At font scale 1.0 Roboto is within 1% of SF Pro. The screen really is 18 dp narrower, which is enough on its own here. | Style map §2. |

## `app/(tabs)/calendar.tsx`

| What | Why |
| --- | --- |
| Present Event Details at full height, the way the app's other sheets are presented, instead of a bottom-anchored `Modal` about 45% tall. | Now that both sides have a capture, this is the whole of the 59.79% on screen 26: the content matches line for line — "Event Details" with Done trailing, the title card, the sentence-case "Calendar commitment" header, the Starts/Ends rows and the time-zone footer — but Swift's sheet covers most of the screen and Android's sits in the bottom 45%, so every row is displaced. Unlike Ask and the consent sheet, this is not a detent gap: Swift is at a large detent, which Android *can* match. `calendar-event-details-default.png` now exists on both platforms. |

## Parity pass 2, Windows (`rn-ui-parity-2-win`): requests for the Mac

Shopping and Account → Calendar are this session's; the Moments form pieces they borrow are the Mac's.
Found while comparing the `shopping-*` captures; **not edited here**.

| File | Request | Evidence |
| --- | --- | --- |
| `src/features/moments/form.tsx` — `DateField` | The date pill formats as `Sep 19, 2026` (fixed `en-US`, from `sendDayLabel`). SwiftUI's compact `DatePicker` follows the device locale: the captures read **`19 Sep 2026`**. Format with `Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(date)`. **Hermes check (Windows, after the RelativeTimeFormat crash):** a `locales` of `undefined` resolves to the device locale and the `timeZone` option works — `taskQuery.ts` has relied on both on the SM-A055F since Phase 3. Use `.format()`, not a string assembled from `formatToParts`, because the part ORDER is what changes between locales. Do not reach for `Intl.RelativeTimeFormat`, `Intl.supportedValuesOf` or `timeZoneName: 'longGeneric'` without a fallback: Hermes's documented Intl surface does not include them. Affects New List and List Settings here, and every Moments date field. | `shopping-new-list.png`, `shopping-list-settings.png` |
| `src/features/moments/form.tsx` — `FormRow` | A `List`/`Form` row that starts with a glyph (a `Label`, or a check circle and artwork) has its separator start under the TEXT, not at the row inset. `FormRow` always draws it from 16. An optional `separatorInset` prop would let callers match; Shopping draws its own for the grocery rows meanwhile. | `shopping-detail-default.png`, `shopping-item-editor.png`, `shopping-share-list-link.png` |
| `src/features/moments/form.tsx` — `MenuPicker` | SwiftUI's menu `Picker` opens a popover anchored under the row with a checkmark on the LEADING side of the current value; `MenuPicker` opens a centred list with the checkmark trailing. | `shopping-item-editor-category-menu.png` |
| `src/features/moments/form.tsx` — `FormButton` | A disabled `Button` with a `Label` in a `Form` keeps its glyph in the tint and draws the title in `.label`; `FormButton` dims the whole row to 0.4. Shopping's Item editor uses its own `ImageAction` for this. | `shopping-item-editor.png` ("Take a Picture", "Generate with AI") |
