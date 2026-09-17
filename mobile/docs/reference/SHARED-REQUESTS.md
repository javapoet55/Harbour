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
