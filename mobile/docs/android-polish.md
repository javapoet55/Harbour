# Android polish log

Android-only fixes to the React Native app, newest last. Each entry says what was wrong, what changed,
which screens it touches, and how to check it on a phone. iOS behaviour is left alone unless an entry
says otherwise.

---

## 1. Keyboard-aware inputs and bottom bars (2026-09-22)

**Needs a new development build.** It adds a native module, `react-native-keyboard-controller`
(1.21.9, the version `npx expo install` picks for SDK 57). A dev client or EAS build made before
this commit does not contain the native module and will fail on launch with this JavaScript. Rebuild
with `npx expo run:android` or `eas build --profile development --platform android`, and make a new
preview/production build before release. iOS needs a rebuild too, since the module links there as
well, but its behaviour does not change.

### What was wrong

When the keyboard opened on Android, fields and pinned buttons stayed where they were and the
keyboard covered them. This affected the Moment editor, the Manage Moment message, New List,
Shopping Detail's quick-add, the Ask composer, sign-in/sign-up and Task Details notes/steps.

Expo SDK 54 and later always draw Android edge to edge, and nothing opts a screen out of that. With
edge to edge, `windowSoftInputMode="adjustResize"` no longer shrinks the window, so the keyboard just
draws over it. React Native's `KeyboardAvoidingView` was being used on Android as a workaround, but it
measures its own frame against its parent rather than the window. On the test phone it recovered only
483px of a 730px keyboard.

### What changed

- `app.config.ts`: `android.softwareKeyboardLayoutMode: 'resize'`, set explicitly. It is Expo's
  default, but edge to edge means it no longer does the work alone.
- `app/_layout.tsx`: `KeyboardProvider` wraps the app. It detects edge to edge by itself
  (`react-native-is-edge-to-edge`), so it leaves the status and navigation bar insets alone and no
  layout moves. The package has no Expo config plugin; autolinking and the provider are all it needs.
- `src/components/keyboard.tsx`: the one place screens get keyboard behaviour from.

| Component | iOS | Android |
|---|---|---|
| `KeyboardAvoidingView` | React Native's, with the screen's `behavior`; a plain `View` if the screen passes none | keyboard-controller's, `padding`, measured against the window (`automaticOffset`) |
| `KeyboardAwareScrollView` | a plain `ScrollView` (UIKit already scrolls a focused field into view) | keyboard-controller's: scrolls the focused field 16pt clear of the keyboard, and of any footer inside the avoiding view (measured) plus any `bottomOffset` the screen adds |
| `KeyboardLift` | a plain `View` | keyboard-controller's `KeyboardStickyView`, for `position: 'absolute'` bottom bars; it moves only by the part of the keyboard that reaches the bar and can stop short (`aboveKeyboard`) |

The home-grown `KeyboardAwareScrollView`, which measured the field on `keyboardDidShow`, is removed.

### Screens

**Covered by a shared component**, so no change was needed in the screen itself:

| Shared piece | Screens |
|---|---|
| `AuthScreen` (avoiding view and aware scroll) | Sign in, Sign up, Verify email |
| `FormScroll` (Moments/Shopping `Form`) | Moment editor (new and edit), Manage Moment's Personalize and address sheets, Moment settings, Festivals, Calendar import, Wish, Shopping item editor, List settings, Share list |
| `MomentScroll` | no screen uses it yet |
| `StickyActionBar` (`KeyboardLift`) | Shopping Detail's Complete Shopping / AI Recommendations bar, the Alternatives sheet's bar |
| `KeyboardAwareScrollView` via `src/components` | Task Details, New Task, New Calendar Event (these already used the old component; they now import the shared `KeyboardAvoidingView` too) |
| `Screen` (`scroll`) | no screen uses it yet |

`FormScroll` and `MomentScroll` add the height of the Moments "Done" capsule (`KEYBOARD_DONE_BAR_HEIGHT`, 60) so a field is not left under it.

**Individual changes** (a screen's own `ScrollView` swapped for the shared one, or a wrapper added):

| Screen | Change |
|---|---|
| Reset password | its own `KeyboardAvoidingView` + `ScrollView` → the shared ones |
| Shopping Detail | aware scroll, clearing the action bar's measured height (the quick-add field) |
| New List sheet | aware scroll; the "Create List" footer lifts with `KeyboardLift`, stopping above the Done capsule, and the scroll clears both |
| Ask (suggestions, Free form Text, Shopping Recommendations) | body wrapped in the shared avoiding view with no `behavior` (a plain `View` on iOS, as before) so the composer and entry cards lift; aware scroll for the Free form field |
| Manage Moment | aware scroll for the name and message fields, clearing the Done capsule. Its "Save Changes" and "Schedule Wish" buttons are in the scroll, not a pinned bar, so they scroll up above the keyboard |
| Review wish, Greeting card editor, Voice sheet | aware scroll, clearing the Done capsule |
| Wish delivery, Do Now | aware scroll |
| Today (the intelligence card's field) | aware scroll |
| Account → Settings (display name) | aware scroll |
| Project editor (new and edit) | aware scroll |

**Left as they were:** the search fields at the top of Tasks, Calendar, Moments and a project's
task list. They sit at the top of their list, so the keyboard cannot reach them. Popover menus and
the date/time wheels have no text input.

### Bottom bars

- Task Details (Mark complete / Save), New Task and New Event: the footer is laid out below the scroll
  inside the avoiding view. On Android the avoiding view pads by exactly the part of the keyboard that
  overlaps it, so the footer sits on the keyboard. The scroll view measures the footer and keeps the
  focused field above it.
- Shopping Detail and Alternatives: `StickyActionBar` rides up with the keyboard.
- New List: "Create List" rides up and stops above the Done capsule.

### Check it on a phone

Use a fresh Android development build. For each screen below, focus the lowest field, type until a
multiline field grows, then close the keyboard.

1. Sign in, then Sign up: the password fields and the button below them stay visible above the keyboard.
2. Task Details: tap Notes, then a step. The field sits above the Mark complete / Save footer, which
   sits on the keyboard. Close the keyboard: the footer returns to the bottom with no gap left behind.
3. Shopping Detail: tap the quick-add field. The action bar rides on the keyboard and the field stays above it.
4. New List: tap the name. "Create List" sits above the Done capsule, which sits on the keyboard.
5. Ask → Free form Text: the field scrolls into view. After a reply, the composer rides on the keyboard.
6. Moment editor: the last field (the message or phone) stays above the Done capsule.
7. Manage Moment: the message field stays above Done, and Save Changes can be scrolled to while the
   keyboard is up.
8. Check the same screens once on iOS, to confirm nothing has moved.

---

## 2. Tasks and Task Details contrast (2026-09-22)

JavaScript only; no new build needed. Every change is behind `Platform.OS === 'android'`, so iOS keeps
the Swift layout. No text, order or behaviour changed.

### What was wrong

- **Tasks.** "Add by Voice" and "Add Manually" sat side by side and "Add Manually" was cut to one
  truncated line. The Today / Tomorrow / This Week / All chips were cut at the right edge of the
  screen's 20pt inset.
- **Task Details.** Inputs, dropdowns, cards and buttons were all filled with the page colour behind
  the same faint indigo hairline. On a dark Android screen they read as one set of flat dark
  rectangles: you could not tell a field from a button or a card.

### What changed

**New theme tokens** (`src/theme/colors.ts`, both schemes):

| Token | Light | Dark | Use |
|---|---|---|---|
| `fieldSurface` | `#F2F2F7` | `#1C1C1E` | fields and cards, one step above the page (black in dark) |
| `fieldSurfaceElevated` | `#F2F2F7` | `#2C2C2E` | the same step above an elevated (sheet) page; `useTheme` swaps it in as `fieldSurface` |
| `fieldBorder` | `rgba(0,0,0,0.12)` | `rgba(255,255,255,0.14)` | the 1px hairline on fields and cards, and on top of a bottom bar |
| `accent` | `#3D29F0` (nexdoIndigo) | `#8F85FF` | focused field border; outlined button border, tint and label. Dark is lighter because indigo text on black is about 2.6:1 |
| `accentTint` | accent at 10% | accent at 10% | outlined button fill |
| `accentBorder` | accent at 45% | accent at 45% | outlined button border |
| `barSurface` | `#FAFAFC` | `#242427` | a bottom bar, one shade above `fieldSurface` |

**Shared helpers** (`src/theme/androidForm.ts`, exported from `src/theme`). Each returns `null` on iOS:
`androidField(theme, focused)`, `androidCard`, `androidSecondaryButton` + `androidSecondaryLabel`,
`androidSectionLabel` and `androidBar`. Screens and components use these and do not hard-code colours.

| # | Where | Android change |
|---|---|---|
| 1 | `CreationCard` (`TaskListParts.tsx`), the Tasks creation row | The row becomes a column with a 12pt gap. Each card is full width (`flex: 0`, `alignSelf: 'stretch'`) with the same 72pt minimum height and the same icon, title and subtitle layout. The title has no `numberOfLines`, so it never truncates |
| 2 | Tasks date chips + `DatePill` | The horizontal `ScrollView` (indicator hidden) cancels the screen's 20pt inset (`marginHorizontal: -20`) and pads its content by 16, so it scrolls to the screen edges and the last chip scrolls fully into view. The gap is 8. Each chip is 36pt tall with 12pt inside, selected or not. The first chip now starts 16pt from the screen edge, 4pt left of the title above it |
| 3 | `detailInputStyle` (every `DetailTextInput`, `DetailMenu`, the schedule date/time fields and step rows), `ProjectAssignmentField` | `fieldSurface` fill, 1px `fieldBorder`, 12pt radius, 14pt vertical and 16pt horizontal padding. A focused input's border turns `accent`; it stays 1px, where iOS uses 2px, so the text does not shift. Chevrons were already `secondary`. The open `DetailMenu` and project lists use the same surface and hairline |
| 4 | `SectionLabel` | `secondary`, 12pt, letter-spacing 0.6. `DetailField` keeps the 8pt gap to its field; Task Details' scroll gap goes from 24 to 20, which puts 20pt above every label |
| 5 | `DetailOutlineButton` (not the green Mark complete) | Outlined: 1px `accentBorder`, `accentTint` fill, `accent` label, 48pt minimum height, 12pt radius. This covers "Start a 25-minute focus session", "Start task", "Add" beside Add a step, and "Set date and start time" |
| 6 | `TaskActionCard` ("Nexdo Action"), `DetailCheckbox` ("Important reminders") | `androidCard`: `fieldSurface` fill, 1px `fieldBorder`, 16pt padding |
| 6a | Task Details SCHEDULE block | This was a card with the page fill and an indigo hairline. On Android it is laid out like the other sections: a label, then the date and time fields. A card on `fieldSurface` would have hidden the fields inside it |
| 7 | Task Details footer, `StickyFooter` | `barSurface` fill and a 1px `fieldBorder` top line. The two buttons (green Mark complete, gradient Save changes) are unchanged |

### Which screens picked it up

Through shared components, so no change was needed in the screen:

| Shared piece | Screens |
|---|---|
| `TaskDetailParts` (fields, labels, outlined buttons, checkbox) | Task Details, including the clarify card's "Person or business to contact" and "First step" inputs |
| `TaskActionCard` | Task Details |
| `ProjectAssignmentField` | Task Details, **New Task** (the PROJECT field) |
| `StickyFooter` | **New Task** (Create Task bar), **New Calendar Event** (its save bar) |
| `FormSection` (`src/features/moments/form.tsx`): a 1px `fieldBorder` round each section card | **Moments**: Moment editor (new and edit), Manage Moment (contacts, Shared message, per-recipient sections, manual recipient sheet), Moment settings, Festivals, Calendar import, Wish. **Shopping**: item editor, List settings, Share list. (This entry first listed Reset password here too. That was wrong: Reset password has its own local `FormSection`. It is covered in §3.) |

**Not picked up yet:** the text inputs and choice buttons on New Task and New Event have their own
styles in the screen files and do not use `TaskDetailParts`. The Moments/Shopping `Form` rows are
inset-grouped rows inside a section card, not standalone fields, so they get the section hairline but
not the field treatment. To bring them in line, switch their inputs to `androidField(theme, focused)`.

### Check it on a phone

Android, in dark mode first and then in light:

1. Tasks: "Add by Voice" and "Add Manually" are stacked, full width and the same height, 12pt apart,
   and both titles show in full. Swipe the chips: All scrolls fully into view with space after it.
2. Task Details: each field (Task, Priority, Estimate, Project, date, time, Repeat, Add a step, Notes)
   is a slightly lighter box with a thin light outline. Tap Notes: the outline turns indigo.
3. The labels (TASK, PRIORITY…) are grey, spaced out, 8pt above their field and 20pt below the one before.
4. "Start a 25-minute focus session", "Start task" and "Add" are indigo-outlined with indigo text, so
   they read as buttons, not fields.
5. The Nexdo Action card and the Important reminders row have the same outline and fill as the fields.
6. The footer bar has a thin line on top and sits a shade above the content scrolling under it.
7. New Task: the PROJECT field and the Create Task bar match. Moments / Shopping forms: each section
   card has a thin outline.
8. iOS: Tasks and Task Details look exactly as before.

---

## 3. Field style on the remaining forms (2026-09-22)

JavaScript only; no new build needed. Follows §2. All changes are Android only. iOS is unchanged,
and so are the text, order and behaviour. Colours come from the §2 tokens.

### What was wrong

§2 left three kinds of input on the Swift look:
- New Task's and New Event's own inputs and choice buttons.
- The Moments/Shopping `Form` rows.
- Reset password's form. §2 wrongly said it was covered.

There was also a problem with §2 itself. In dark mode, New Task's PROJECT field was `fieldSurface`
(#1C1C1E) on a card that is also #1C1C1E, so only its hairline separated it from the card.

### The grouped-form choice

For inputs inside a grouped card, the options were a border on every row or a styled group. This
entry **keeps the group card**: `fieldSurface` fill and a 1px `fieldBorder` round the group, with a
1px `fieldBorder` separator between rows (the 16pt leading inset is kept). Rows carry no border.
- A bordered field inside a bordered card doubles every line.
- These groups also hold toggles, links, pickers and read-only values. A field border round a toggle
  row would suggest the row itself can be typed into.

Every grouped form uses this. Standalone fields (Task Details, New Task, New Event) keep the §2
field. There is one trade-off: a row inside a group shows focus by its caret and the keyboard only,
with no accent border.

### What changed

**Helpers** (`src/theme/androidForm.ts`):
- `androidField(theme, focused, { raised, padded })` takes two new options:
  - `raised`: for a field on a card, not on the page. It uses `fieldSurfaceElevated` (#2C2C2E dark),
    one step above the card's `surface`.
  - `padded: false`: for choice buttons, value capsules and control groups that keep their own
    padding and take only the surface, hairline and 12pt radius.
- New `androidGroup(theme)` (the group card) and `androidSeparator(theme)` (1px `fieldBorder`).
- No new tokens.

| Where | Android change |
|---|---|
| **New Task** (`app/task/new.tsx`) | TASK NAME and Notes: raised field, 14/16 padding, accent border while focused. Date and time-estimate choice buttons: raised surface, hairline and 12 radius when unselected; the selected gradient takes the same 12 radius. The Custom estimate stepper: raised surface and hairline. The PROJECT field: raised (the new `raised` prop on `ProjectAssignmentField`) |
| **New Event** (`app/calendar/event/new.tsx`) | Title, Location and Notes: raised field, accent while focused. The Starts / Ends / Repeat until value capsules, the open Repeat list and unselected weekday chips: raised surface and hairline, keeping their own padding. A chosen weekday keeps its solid accent fill |
| `FormSection` / `FormRow` (`src/features/moments/form.tsx`) | The group card and separators described above. This replaces §2's border-only change |
| `MomentSheet` (`src/features/moments/components.tsx`) | The sheet body is wrapped in `ElevatedSurface`, so a form inside takes `fieldSurfaceElevated` and sits a step above the sheet's elevated background. Before this, a section and its sheet were the same #1C1C1E in dark mode |
| `MomentCard grouped` | New prop. On Android the card drops the glass for `androidGroup`, keeping its 22 radius and 18 padding |
| Manage Moment (`ManageMomentView.tsx`) | The six cards that hold form rows are `grouped`: Moment Details, Reminder & Repeat, Recipients, Send time, Delivery, Notify. Their dividers use `androidSeparator` |
| Reset password (`app/(auth)/reset-password.tsx`) | Its local `FormSection` gets `androidGroup`, which already resolves elevated here (#2C2C2E on the #1C1C1E sheet). Its `FormRow` separators use `fieldBorder` |

### Screens

| Screen | How |
|---|---|
| New Task, New Event | screen changes above |
| Moment editor, Moment settings, Festivals, Calendar import, Wish | `FormSection` / `FormRow` |
| Manage Moment | `grouped` cards and separators; the Personalize, address and manual-recipient sheets through `FormSection` inside `MomentSheet` |
| Shopping item editor, List settings, Share list | `FormSection` / `FormRow` inside `MomentSheet` |
| Reset password | its own section and row |

**Side effect of the `MomentSheet` change.** On Android, everything inside any `MomentSheet` now
resolves the elevated palette, not only forms. That means `background`, `groupedBackground`,
`surface` and `fieldSurface` are one level up. iOS already treats these as sheets, so this matches
it. The sheets affected: the greeting card editor, Manage Moment's sheets, the wish email
confirmation, the Wish sheet, and Shopping's New List, List settings, Share list, item editor and
Voice sheets.

**Left on the Swift look:**
- New Event's Repeat picker: accent text and chevron on the card, which is Swift's `.menu` picker style.
- The value capsules on Moments' `DateField` and `MenuPicker`.
- Manage Moment's wish-message card: a gradient card, already stroked.
- The New List sheet's name field: its own `TextInput` and dividers, not a `Form` row.

### Check it on a phone

Android, dark mode first, then light:

1. New Task: TASK NAME and Notes are lighter than the card, with a thin outline that turns indigo
   while typing. Unselected date and estimate buttons, the Custom estimate row and PROJECT match
   them. The selected button keeps its gradient.
2. New Event: Title, Location and Notes are the same. The Starts / Ends values, the Repeat list and
   (under "Particular days of the week") the weekday chips have the outline.
3. Moment settings, Festivals, a Moment editor, Wish: each section is a lighter card with a thin
   outline and a line between rows.
4. Manage Moment → Details, Contacts and Schedule: the form cards match. The summary and greeting
   cards keep their glass.
5. Shopping → an item, then List settings and Share list: each section sits a shade above the sheet.
6. Reset password: both sections are outlined cards above the sheet.
7. iOS: all of the above look as before.


---

## 4. Chip rows and one field label (2026-09-22)

JavaScript only; no new build needed. All changes are Android only. iOS is unchanged, and so are
the text, order and behaviour. Colours come from theme tokens.

### What was wrong

- **Chip rows.** New Task's DATE (Today / Tomorrow / Select Date) and TIME ESTIMATE (15m–60m) rows
  split the card width equally, so "Select Date" wrapped or was squeezed. New Event's weekday grid
  wrapped onto two lines.
- **Field labels.** Each form had its own caption style:
  - New Task's icon labels were in the indigo tint, 2.2:1 on the dark card.
  - New Event's were in its editor accent.
  - Task Details used plain secondary text.
  - The Moments/Shopping forms, Reset password and the project editor used sentence-case body text.
  - New List and Manage Moment used large headings.

  None of them matched, and the New Task ones were hard to read.
- **New Task NOTES.** The collapsed "Add a note (optional)" row was plain text on the card, so it
  did not read as something to tap.
- **Flat inputs left.** New List's name field, the date/time and menu value pills on the Moments
  forms, and New Event's Repeat dropdown still had no field surface.

### New tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `fieldLabel` | `#575C80` | `#A1A1AA` | every Android field label. It is opaque, so its contrast does not depend on what sits behind it. Dark measures 8.2:1 on black, 6.6:1 on #1C1C1E and 5.4:1 on #2C2C2E. Light measures 6.5:1 on white and 5.8:1 on #F2F2F7. A test checks it is at least 4.5:1 on every page, card, sheet and field surface in both themes |
| `fieldOnGroup` / `fieldOnGroupElevated` | `#FFFFFF` / `#FFFFFF` | `#2C2C2E` / `#3A3A3C` | a value pill or input inside a group card, which is already on `fieldSurface`. `useTheme` swaps in the elevated one inside a sheet |

### Shared pieces (`src/theme/androidForm.ts`)

- **`androidLabel(theme)`** is the one field label: 12pt, weight 600, letter-spacing 0.6,
  `textTransform: 'uppercase'`, in `fieldLabel`. The uppercase is drawing only: the string, and what
  a screen reader says, are unchanged. With an icon, the icon is `ANDROID_LABEL_ICON` (14pt) in
  `fieldLabel`, 6pt from the text (`androidLabelRow`). The spacing is 8pt to the field
  (`ANDROID_LABEL_GAP`) and 20pt above (`ANDROID_SECTION_GAP`). It replaces §2's
  `androidSectionLabel`.
- **`androidChipScroll(inset)` and `androidChip`** are the chip row from §2's Tasks filter chips,
  now shared:
  - The row is a horizontal `ScrollView` with no indicator, 8pt between chips and 16pt of content
    padding. It cancels its container's inset so it scrolls edge to edge.
  - A chip is 36pt tall with 12pt inside, as wide as its label, with `numberOfLines={1}`.
  - The Tasks screen now uses these too, with the same values as §2.
- **`androidField(…, { inGroup })`** puts a field inside a group card, using `fieldOnGroup`.
- **`FieldGroupContext` and `androidPill(theme, placement)`** handle the value pills. A group card
  (`FormSection`, `MomentCard grouped`) provides `'group'`, and New List's card provides `'card'`.
  The Moments `MenuPicker` and `DateField` read it, so their pills take the field look inside a form
  and stay as they were anywhere else, such as the Moments filter menu.

### Where

| Screen / component | Android change |
|---|---|
| **New Task** | TASK NAME, NOTES, PROJECT, DATE, TIME ESTIMATE use the shared label, 8pt above their field; a divider is still 20pt above each label. DATE and TIME ESTIMATE are chip rows: they bleed to the card's edges, so the first chip starts 16pt from the card edge, 4pt left of the labels. "Select Date", and the date that replaces it, stay on one line. **NOTES**: the label now sits above a field like the others. The collapsed "Add a note (optional)" preview *is* that field, a raised, outlined row with its chevron; tapping it expands the notes. While expanded, the label row shows the down chevron and collapses them, as the disclosure did |
| **New Event** | APPOINTMENT / EVENT, SCHEDULE, REPEAT, LOCATION, NOTES use the shared label, 8pt above the first field under each. The weekday chips (under "Particular days of the week") are a chip row. The Repeat dropdown is now a raised field, keeping its accent value and chevron |
| **Task Details** | `SectionLabel` uses the shared label (weight 600 instead of 700, `fieldLabel`, uppercase) |
| Moments/Shopping `FormSection` header | shared label, 20pt above, 8pt to the group. This covers the Moment editor, Moment settings, Festivals, Calendar import, Wish, Manage Moment's sheets, and the Shopping item editor, List settings and Share list |
| Moments `MenuPicker`, `DateField` | inside a form, the value (and chevron) or the date and time pills get the field surface for where they sit: `fieldOnGroup` in a group, raised on a card. Padding is 12 for the menu pill, and the date pills keep theirs |
| Manage Moment | the headings over the form cards (Reminder & Repeat, Send time, Delivery) use the shared label, 8pt above their card. "Greeting Card" and the page titles stay as headings, because they are not labels on a form field |
| Shopping **New List** | "List Name" uses the shared label, 20pt above and 8pt to its card. The name input is a raised field with an accent border while focused, the Shopping date pill takes the raised surface, and the card's dividers use the §3 separator |
| Reset password | its section headers use the shared label, 20pt above and 8pt to the group |
| Project editor (new and edit) | its section headers use the shared label. Each section is now the §3 form group, which it did not have before |

### Left as they were

- The Moments/Shopping `FormField` text rows inside a group. They stay borderless rows, per §3.
- Manage Moment's gradient wish-message card.

### Check it on a phone

Android, dark mode first, then light:

1. New Task: every label is the same light grey, small and spaced caps, with a 14pt icon, sitting
   just above its field. Swipe DATE and TIME ESTIMATE sideways; "Select Date" is one line. Pick a
   date, and the chip shows it on one line. Tap "Add a note (optional)" to open notes; tap NOTES to
   close them.
2. New Event: the same labels. Repeat is a filled field. Choose "Particular days of the week": the
   days scroll sideways as chips.
3. Task Details: the labels match New Task's, without icons.
4. Moment settings, a Moment editor, Shopping item editor: each section header is the same small
   grey caps label above its card. Date and menu values sit in outlined pills.
5. Manage Moment → Details and Schedule: Reminder & Repeat, Send time and Delivery are labels, not
   large headings.
6. Shopping → New List: "LIST NAME" above the card, the name an outlined field, the date an
   outlined pill.
7. Reset password, then Projects → New Project: labels and grouped sections match.
8. iOS: all of the above look as before.

---

## 5. Settings rows and fields (2026-09-22)

JavaScript only; no new build needed. All changes are Android only. iOS is unchanged, and so are
the text and behaviour. Colours come from the §2–§4 tokens; nothing new was added. The changes are
in `src/components/SettingsControls.tsx`; `app/account/settings.tsx` itself did not change.

### What was wrong

- **"AI confirmation" wrapped one letter per line** ("AI / co / nfi / rm / ati / on"). In
  `SettingsPicker` the label was `flex: 1` (a zero basis) and the value had no flex at all, so the
  long value "Confirm changes and deletions" kept its full width and the label got what was left.
  "Protect my current focus / Balanced" was cramped for the same reason.
- The Display name, Working hours and Quiet hours fields were a faint indigo tint on the card.
- Toggle rows floated with nothing between them.
- The cards and the selected Appearance segment were grey on grey.

### What changed

| Piece | Android change |
|---|---|
| `SettingsPicker`, `SettingsToggle`, `SettingsLabeledValue` (every label+value, label+picker and label+switch row) | The label is `flex: 1`, `flexShrink: 1`, `minWidth: '40%'`, so it keeps at least 40% of the row and wraps by word. The value is `numberOfLines={1}` and `flexShrink: 1`, so it ellipsises. The chevron and switch keep their size. "AI confirmation" and "Protect my current focus" now read on one or two lines, with the choice cut short if it has to be |
| `SettingsCard` | The §3 form group: `fieldSurface` and a 1px `fieldBorder`. It also inserts the shared 1px separator between two **adjacent rows** (toggle, picker or labelled value), but not where a `SettingsDivider` already sits, and not between fields, captions or buttons |
| `SettingsDivider` | the shared 1px separator |
| `SettingsField` (Display name) | The field style: surface, 1px hairline, 12pt radius, accent border while focused. It keeps its padding. Its title uses the shared field label (§4) |
| `SettingsHours` / `ClockField` (Working hours and Quiet hours, Start and End) | The same field surface and hairline. Each keeps its half-row width, 40pt height and padding. The titles and the Start/End captions use the shared field label |
| Time zone (Automatic) | A read-only `SettingsLabeledValue`, not tappable, so it stays a row. It only gets the row layout fix |
| `SettingsSegments` (System / Day / Night) | The selected segment is `accentTint` with a 1px `accentBorder`, and its title is `accent`, semibold. The track and the unselected segments are unchanged |

**Why the fields use the in-group surface, not "raised".** A settings card is now a form group,
and Settings is an elevated sheet. In the elevated palette the raised surface and the group are the
same colour (#2C2C2E in dark), so a raised field would have disappeared into its card. The fields
take `fieldOnGroup` instead: `#3A3A3C` on the `#2C2C2E` card in dark, and white on the `#F2F2F7`
card in light. That is the same one-step-above-the-card rule, correct for a group.

**Left as they were:**
- The App Voice volume row (icon, label, percentage) in `settings.tsx`. Its value is at most four
  characters.
- The calendar connection boxes in "Calendars and privacy".

### For Sri (copy, not changed)

- **Appearance caption:** "Day uses a light view. Night uses a dark view. **System follows your
  iPhone.** Changes apply immediately and are saved on this device." Android users see
  iPhone-specific copy. This is the same family as bug #18. The text is left as it is, as asked.

### Check it on a phone

Android, dark mode first, then light:

1. Settings → Voice and confirmation: "AI confirmation" reads as words on the left, and "Confirm
   changes and deletions" is on one line, cut with "…" if it has to be. The same goes for
   Notifications and focus → "Protect my current focus / Balanced".
2. Each settings card has a thin outline and sits a shade above the page. Toggle rows have a thin
   line between them.
3. Display name and the four time fields are outlined boxes, lighter than the card. Tap Display name
   and the outline turns indigo. The time fields are still half the row each.
4. Appearance: the selected option is tinted indigo with indigo text.
5. iOS: Settings looks as before.

---

## 6. Links and icons in dark mode (2026-09-22)

JavaScript only; no new build needed. All changes are Android only. iOS is unchanged, and so are
the text and behaviour. Colours come from tokens only.

### What was wrong

- **Links and icons.** Tappable text and icons used the deep brand indigo `#3D29F0`, on dark as well
  as light. This covered text links, text buttons, icon buttons, header back chevrons and actions,
  and spinners: "Open Notification Center", "Synchronize now", "Change photo", "Connect another
  calendar", "Connect / Reconnect Gmail", "Choose a contact birthday", and similar. On dark the
  indigo is 2.2:1 on `#1C1C1E` and 1.8:1 on `#2C2C2E`, so it read as muddy.
- **Switches.** The on track was solid brand indigo and glowed against the grey cards. The off track
  was a translucent grey that nearly vanished.
- **Shopping Detail quick-add.** The "Add an item (e.g. eggs, milk, bread)" placeholder wrapped to a
  second line and was clipped.

### What changed

**Tokens** (`src/theme/colors.ts`):

| Token | Light | Dark | Use |
|---|---|---|---|
| `link` | brand indigo | brand indigo, but see below | every tappable text colour and icon tint |
| `switchOn` | brand indigo | `rgba(61, 41, 240, 0.85)` | Android switch track, on |
| `switchOff` | `rgba(120, 120, 128, 0.5)` | `#48484A` | Android switch track, off, with a hairline border |

**How `link` resolves** (`useTheme`):
- **Android, dark:** `askBlue`, `#6BB8FF`. This is the blue the Ask screen already uses for "Read
  Loud", "Show suggestions" and its section labels (Swift's `AskStyle.blue`), so no new colour is
  added. It measures 9.9:1 on black, 8.0:1 on `#1C1C1E`, 6.6:1 on `#2C2C2E` and 5.4:1 on `#3A3A3C`.
- **Android, light:** the brand indigo.
- **iOS, both schemes:** `tint`, the brand indigo, so iOS is unchanged by construction.

A first pass of this change used the lighter indigo `accent` (`#8F85FF`). It was switched to the
Ask blue before commit.

**The audit.** Every text colour and icon tint in `mobile/app` and `mobile/src` that read the brand
indigo or `colors.tint` now reads `colors.link`:
- **Covered:** 211 places in 70 files. Most are `color:` style keys and `color={…}` icon props. The
  rest are ternaries and variables such as `TintButton`, `BorderedButton`, `FormButton`, the Calendar
  and Moments segment labels, the Manage Moment tabs, "today" in `MonthCalendar`, the wheel pickers,
  `Button`'s secondary and plain titles (via a new `link` text tone), `CalendarBadge` and the
  Calendar timeline.
- **Headers and tabs:** header back chevrons and actions (`headerTintColor` in
  `stackHeaderOptions`, `pushedHeaderOptions` and the auth stack) and the active tab icon
  (`tabBarActiveTintColor`).
- **A guard test** in `src/__tests__/android-links.test.tsx` scans the sources and fails if a text or
  icon colour on the raw brand indigo or `tint` comes back.

**Left on the brand indigo, as asked:**
- **Filled controls:** switch-on tracks, selected chips and segments, prominent and gradient buttons,
  "Save next step" (a filled button), the month calendar's selected day, and the slider fill.
- **Tints, borders and gradients:** `withAlpha(brand.nexdoIndigo, …)` tints, outline borders and
  gradients.

**Destructive text** (Disconnect, Delete account, Remove) stays `danger` red.

**Switches:**
- **`IOSSwitch` on Android:** the on track is `switchOn`, which is the brand indigo at 85% in dark.
  The off track is `switchOff` with a hairline `fieldBorder`, so it stays visible on a card.
- **The two native `Switch`es** (Settings' calendar writes, Task filters): they take the same track
  colours. Android's native switch cannot draw a border on its track.

**Shopping Detail quick-add** (`app/(tabs)/(today)/shopping/[id].tsx`): the field is
`numberOfLines={1}`. React Native cannot ellipsise a `TextInput` placeholder on Android, so while the
field is empty the same text is drawn as a one-line overlay with `ellipsizeMode="tail"` that ends in
"…". The field keeps "Add an item (e.g. eggs, milk, bread)" as its accessibility label.

### Not changed

- **The §2 `accent` (`#8F85FF`)** is still the focused-field border, the outlined secondary buttons
  ("Start a 25-minute focus session", "Start task", "Add", "Set date and start time") and the
  selected Settings Appearance segment (§5). These are outlined or selected controls, not links.
  Moving them to the Ask blue is a one-token change if wanted.
- **Decorative colour roles** keep their own colours: category and project colours, the Shopping
  list tiles, and `scheduleBlue`.

### Check it on a phone

Android in dark:

1. Settings: "Change photo", "Open Notification Center", "Connect another calendar" and "Synchronize
   now" are a clear light blue. "Disconnect" and "Delete account" are red.
2. Any pushed screen: the back chevron and header actions are the same blue.
3. The tab bar: the selected tab's icon and label are blue.
4. Toggles: on is a softer indigo that does not glow. Off is a grey pill with a thin outline.
5. Shopping → a list: the quick-add placeholder is one line ending in "…"; typing replaces it.
6. Switch to light: links are the brand indigo again. iOS: unchanged in both.
