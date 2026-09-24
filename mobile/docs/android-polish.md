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
- **Covered:** 219 places in 70 files. Most are `color:` style keys and `color={…}` icon props. The
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

---

## 7. One accent for tappable and active (2026-09-22)

JavaScript only; no new build needed. All changes are Android only, and only affect dark mode. iOS
and Android light are unchanged, and so are the text and behaviour.

### What was wrong

After §6, Android in dark mode had two accents for tappable and active things:
- **The Ask blue `#6BB8FF`** (`link`): links, text buttons, icon buttons and header actions.
- **§2's lighter indigo `#8F85FF`** (`accent`): the outlined secondary buttons, the focused-field
  border and the selected Settings Appearance segment (§5).

### What changed

In the dark palette, `accent`, `accentTint` and `accentBorder` are now the Ask blue.
`src/theme/colors.ts` keeps it in one constant, `ASK_BLUE_DARK`, shared by `askBlue` and `accent`:

| Token (dark) | Was | Now |
|---|---|---|
| `accent` | `#8F85FF` | `#6BB8FF` (same as `link`) |
| `accentTint` | `rgba(143, 133, 255, 0.10)` | `rgba(107, 184, 255, 0.10)` |
| `accentBorder` | `rgba(143, 133, 255, 0.45)` | `rgba(107, 184, 255, 0.45)` |

The light values are unchanged; they are the brand indigo, the same as `link` in light.

**On Android in dark**, the Ask blue now covers everything **tappable or active**:
- links and text buttons
- icon buttons, header back chevrons and actions, and the active tab
- outlined buttons ("Start a 25-minute focus session", "Start task", "Add", "Set date and start time")
- the focused-field border on every form (Task Details, New Task, New Event, New List, Settings)
- the selected Appearance segment

The brand indigo is left for **filled** controls only: switch-on tracks, selected chips, prominent
and gradient buttons.

**Guard tests** (`src/__tests__/android-links.test.tsx`):
- `accent` equals `link` equals `askBlue` on Android in dark.
- The outlined button, the focused field and the selected Appearance segment render in `#6BB8FF`.
- `#8F85FF` appears nowhere in `app/`, `src/` or the theme.

### Check it on a phone

Android in dark:

1. Task Details: "Start task" and "Add" are outlined in the same light blue as "Open Notification
   Center" in Settings.
2. Tap a field: its border turns that blue.
3. Settings → Appearance: the selected option is tinted that blue.
4. Switches and gradient buttons are still the brand indigo.

---

## Lint fix: MomentEditorView purity (2026-09-22)

This is not Android polish, but it shipped in the same commit.

`MomentEditorView` compared the picked date with `momentDay(Date.now(), zone)` during render.
eslint flags that as react-hooks/purity: an impure call in render. The current time now comes from a
small `useNow()` hook. It is taken on mount and refreshed once a minute from an effect, so the "This
date is in the past" / "The original date is kept" note shows for exactly the same dates as before.
The one difference is that "today" now also rolls over at midnight while the editor stays open,
where before it waited for something else to re-render.

---

## 8. Grocery image placeholder (2026-09-22)

JavaScript only; no new build needed. The tile is drawn on Android only. The fall-through fix beneath
it applies to both platforms, because the empty slot was a bug.

### What was wrong

Some grocery rows showed an empty gap where the picture belongs. In the reported list this was Milk
and Bananas.

**The name matching was not the fault.** `groceryAsset` lower-cases the name and matches whole
words, so "Milk" gives `milk.png` and "Bananas" gives `banana.png` on both platforms. It is now
pinned by a test.

The only path in `GroceryArtwork` that can leave the 40×44 slot empty for those names is the
**photo** branch:
- Any non-empty `imageData` was drawn as `data:image/jpeg;base64,…`, with no fallback.
- The server accepts any string shaped like JPEG base64 (`/^\/9j\/[A-Za-z0-9+/]*={0,2}$/`), so a value
  like `/9j/AA==` (which the server's and the app's own tests use) passes validation and decodes to
  nothing.
- Swift checks `UIImage(data:)` and falls through to the illustration when it is nil
  (ShoppingViews.swift:395-401). The React Native port drew an empty image instead; the old comment
  noted that "a non-empty string stands in" for the decode check.

I could not read the phone's data from here. So this is the one code path that explains a blank slot
for those two names, not a confirmed look at the stored values. If those items do have a real,
readable photo, the gap has another cause and needs a device to find it.

### What changed

- **Fall-through, both platforms** (`artworkFor` and `GroceryArtwork`): an image that fails to load
  falls to the next stage, as Swift's does. A photo that does not decode drops to the illustration,
  and an illustration that fails drops to the emoji. The failure is keyed by the photo data, so
  changing the photo tries again.
- **Placeholder, Android** (`GroceryArtwork`): until the picture has loaded, or if nothing can be
  drawn, the slot shows a neutral tile the same size as a photo:
  - 40×44, 8pt radius
  - `fieldSurface` fill and a hairline `fieldBorder`
  - Ionicons `basket-outline` at 20pt in `secondary`

  The tile disappears once the photo or illustration loads, so it never sits behind a transparent
  illustration. Rows with an emoji show no tile. Every row keeps the same artwork width, so the names
  line up.

### Check it on a phone

1. Shopping → a list with Milk and Bananas: each row shows the carton or the bananas. If a picture
   is slow, a grey basket tile fills its place first.
2. An item with a broken photo shows its illustration or emoji, not a gap.
3. iOS: no tile. A broken photo falls through to the illustration, as in Swift.

---

## 9. Segmented tabs size to their labels (2026-09-22)

JavaScript only; no new build needed. All changes are Android only. iOS is unchanged, and so are
the text, order and behaviour.

### What was wrong

- **Manage Moment's tabs** (Details / Contacts / Wish Message / Schedule) were four equal quarters,
  and each label shrank on its own (`FitText`, `minimumScale 0.7`) to fit its quarter. "Wish
  Message" came out smaller than its neighbours, and the short labels floated in wide segments.
- **The other segmented rows** split the row equally too, so a long label was squeezed or clipped
  while a short one had spare room. These were the Moments segments, Calendar's Schedule / Week /
  Month, Settings' Appearance, Tasks / Projects and the clarify card's "Work on it / Contact
  someone".

### What changed

There was no shared segmented control, so each row was its own implementation. They now share one
layout, **`SegmentRow`** (`src/components/SegmentRow.tsx`), used only on Android. The rule:

1. **One size for every label in the row**, with no per-segment shrink. The labels are measured once
   at the base size, off to the side and invisible.
2. **Each segment is its label's width plus 12pt each side.** If there is room to spare, the segments
   share it (`flexGrow: 1` from their own width), so the row still fills its track.
3. **If the row does not fit at the base size, every label drops one step together** on the type
   scale (15 → 13, 13 → 12).
4. **If it still does not fit, the row scrolls sideways**, with no scroll indicator. The segments keep
   their own widths, and the selected segment is scrolled into view when the row lays out and
   whenever the selection changes.

`SegmentRow` only lays the row out. Each control still draws its own segments:

| Row | Base size | Selected segment (unchanged) |
|---|---|---|
| Manage Moment (Details / Contacts / Wish Message / Schedule) | 15 | filled indigo pill, white label |
| `MomentSegments` (Moments' Upcoming / Scheduled / Sent, the review and tone rows) | 15 | brand-gradient fill, white label |
| `CalendarSegments` (Schedule / Week / Month) | 15 | save-gradient fill, white label |
| `SettingsSegments` (Appearance, and Moments delivery's row) | 15 | accent tint and border, accent label (§5, §7) |
| Tasks / Projects | 13 | raised segment |
| Clarify card (Work on it / Contact someone) | 13 | surface segment |

Which of the three outcomes a phone gets depends on its width and system font size. It has not
been measured on a device yet.

### Check it on a phone

1. Moments → a birthday → Manage Moment: all four tab labels are the same size. "Wish Message" is not
   smaller than "Details", and each segment hugs its label.
2. With the system font size set to Largest: the four labels drop together and, if they still do
   not fit, the row scrolls. Tapping Schedule keeps it in view.
3. Calendar, Settings → Appearance, Tasks / Projects: the segments size to their labels at one size.
4. iOS: every row is still equal widths, as before.

---

## 10. Calendar timeline rows (2026-09-22)

JavaScript only; no new build needed. All changes are Android only. iOS is unchanged, and so are
the text and behaviour. Colours come from tokens only.

### What was wrong

- **Chevron.** Each timeline row was top-aligned, so its `>` chevron sat at the top-right and
  seemed to float between rows.
- **Divider.** The divider was drawn inside the text column above a 4pt bottom pad, so it read as a
  short line hanging between rows.
- **Tile.** The glyph tile was 32×36 on a tint and did not line up with the rail's dot.
- **Cards.** Schedule Intelligence, the summary card and "Unscheduled & overdue" each had their own
  tint instead of the shared card look.
- **"Review conflicts"** could be clipped by the header row.
- **Day headers** sat tight on the previous day's rows.

### What changed

**Timeline row** (`CalendarTimelineRow`, `src/components/CalendarParts.tsx`):
- **Layout.** A row of centred columns with 12pt of padding above and below:
  - **Time:** 72pt wide, left-aligned.
  - **Rail:** the 8pt rail, whose line runs through the row padding so it is continuous. Its dot
    sits on the icon's centre.
  - **Icon:** a 44×44 tile on `fieldSurface` with a hairline `fieldBorder`, glyph 22.
  - **Text:** title 17 in `ink`, detail 14 in `secondary`. The badges, including "Deadline", are
    unchanged.
  - **Chevron:** centred vertically in `secondary`, 16pt from the row's right edge.
- **Tapping.** The whole row is the target, with a `fieldSurface` fill while pressed and a ripple.
- **Separator.** One 1px separator (`androidSeparator`) along the row's bottom, from the text
  column's left edge (`ANDROID_TEXT_INSET` = 72 + 8 + 44 + 3 gaps of 10 = 154) to the row's right
  edge. The short line inside the text column is gone on Android.

**Screen** (`app/(tabs)/calendar.tsx`):

| Part | Android change |
|---|---|
| Day sections | 20pt above each day header, 8pt below it. "Nothing scheduled. Room to breathe." (and "No items match your filters.") stays in `secondary`, with 12pt above and 24pt below |
| Schedule Intelligence card | The shared group (`fieldSurface`, 1px `fieldBorder`). "Schedule Intelligence" takes `flex: 1` and can shrink. "Review conflicts" can shrink to half the row and wrap, right-aligned, so it is never clipped |
| Add by Voice / Add Manually in that card | Both titles are measured at the base size. The cards stay two-up only if each title fits on one line in half the row (the row less the gap, halved, less padding, border, the 38pt icon and its gap: `creationTitlesFit`). Otherwise they stack full width, 12pt apart, like Tasks. The per-title auto-shrink is off on Android |
| Summary card (`CalendarSummaryCard`), "Unscheduled & overdue" | The shared group |

### Check it on a phone

1. Calendar: in each row the time, dot, tile, text and chevron line up on one centre line. The
   chevron is in its row, 16pt from the edge. Rows are separated by a thin line that starts under
   the text, not under the time.
2. Press and hold a row: it fills lightly. Release and it opens the task or event.
3. Each day header has clear space above it. An empty day's "Room to breathe." line has space below
   it.
4. Schedule Intelligence, the summary card and "Unscheduled & overdue" have the thin outline and
   field surface. "Review conflicts" wraps instead of clipping.
5. On a narrow phone or with a large font, Add by Voice and Add Manually stack instead of squeezing.
6. iOS: the Calendar looks as before.

---

## 11. Auth screens (2026-09-22)

JavaScript only; no new build needed. All changes are Android only. iOS is unchanged, and so are
the text and behaviour. Colours come from tokens only.

### What was wrong

- **Card border.** Sign in, Create account and Verify email drew their form card as glass: a blur, a
  72% fill and a bright 1pt white stroke (`glassStroke`), far heavier than any other card.
- **Backdrop blobs.** The gradient circles showed through the translucent card and crowded the Sign
  In button.
- **Disabled button.** It dimmed the whole button, label and all, to 25%, so it read as a broken,
  muddy block.
- **Active field.** Nothing marked the field being edited.
- **Create account's closing copy** could not be reached. Android draws edge to edge, and
  `contentInsetAdjustmentBehavior` only insets the scroll on iOS, so the last lines sat under the
  navigation bar.

### What changed

| Piece | Android change |
|---|---|
| `GlassCard formGroup` (the Sign in, Create account and Verify email cards) | The shared form group: `fieldSurface` and a 1px `fieldBorder` hairline. No blur, no white stroke, no shadow. Each card keeps its radius: 28 on Sign in, 26 on Create account and Verify email |
| `SignInBackdrop` | Explicitly behind the content (`zIndex` 0 under the content's 1) and at 60% of its opacity (`opacity: 0.6` on the whole backdrop) |
| `GradientButton` disabled ("Sign In", "Create Account", "Verify Email" before the form is valid) | The full gradient drawn at 40% as a layer, and the label at 70% of `onTint` (white), so it reads as "not yet". The button itself is not dimmed. Enabled is unchanged: the full gradient and a white label |
| `AuthFieldRow` / `SignInFieldIcon` | The icon tiles stay. The row being edited borders its tile in `accent`, which is the Ask blue in dark (§7) and the brand indigo in light. Idle tiles keep a transparent 1pt border, so focusing shifts nothing. Each screen tracks the focused field from its inputs' `onFocus`/`onBlur` |
| `AuthFieldDivider` | The group separator (`androidSeparator`: 1px `fieldBorder`) |
| `AuthScreen` | The scroll pads its bottom by the navigation bar's inset |
| Create account | The closing spacer is 24pt, on top of the navigation-bar inset, so the copy under Create Account scrolls clear and ends 24pt above the bar. The title may wrap |
| Sign in | Unchanged: the subtitle ("Your day is clearer with Nexdo.") and the trust line already used the `secondary` token, with no hard-coded grey anywhere in the auth screens. A test pins it |

**Reset password** does not use these components. Its form is the Moments-style `FormSection`,
which already has the group look (§3, §4).

### Check it on a phone

1. Sign in: the form card has a thin, quiet outline like every other card. The background circles
   are soft and never show through the card.
2. With the fields empty, Sign In is a faded gradient with a readable, slightly dimmed label. Fill
   both fields and it is full strength.
3. Tap the email field: its envelope tile gets a blue outline in dark (indigo in light). Tap the
   password field: the outline moves to the lock tile.
4. Create account: close the keyboard and scroll to the bottom. The copy under Create Account is
   fully visible, with space below it.
5. iOS: the auth screens look as before.

---

## 12. Reset password actions (2026-09-22)

JavaScript only; no new build needed. All changes are Android only. iOS keeps the Swift `Form` rows,
and the text and behaviour are unchanged. Colours come from tokens only.

### What was wrong

Reset password is a Swift `Form`, so its actions were grey list rows inside a group. "Send
Verification Code", then "Update Password" with "Send a new code", read as settings rows rather than
the screen's main action. The email field was a plain row, unlike the other auth screens.

### What changed (`app/(auth)/reset-password.tsx`)

| Piece | Android change |
|---|---|
| Email | The auth screens' field row (`AuthFieldRow`): the envelope tile, bordered in the focus accent while editing (§11). It stays in its group, with its helper text ("We'll email a six-digit code…") kept as the footer |
| "Send Verification Code" (before a code is sent) | The primary `GradientButton`, 52pt, full width inside the sections' 16pt inset, 24pt under the email group. This row was not in the request, but it is the same kind of action; leaving it grey would have given the two stages different primary buttons |
| "Update Password" | The primary `GradientButton`, 52pt, full width, 24pt under the Verification group. It is disabled until the code has six digits and the new password has at least 12 characters (RootView.swift:620), drawn in §11's disabled state: the gradient at 40% and the label at 70% |
| "Send a new code" | A centred text link in `link`, 16pt under the button, dimmed while a request is running |
| Verification group | Unchanged group style. The 6-digit code was already `number-pad`, and `sanitizeCode` already stripped non-digits and capped it at six. Android now also sets `maxLength={6}` |

An error ("The passwords do not match.", or a server error) still shows in its own group above the
button.

### Check it on a phone

1. Sign in → Forgot password?: the email field has the envelope tile, which gets the accent outline
   while typing. "Send Verification Code" is the gradient button below it.
2. After the code is sent: "Update Password" is a faded gradient until the code and password are
   valid, then full strength. "Send a new code" is a centred link under it.
3. The code field opens the number pad and stops at six digits.
4. iOS: the screen looks as before.

---

## 13. Notification permission is requested, not assumed (2026-09-23)

JavaScript only; no new build needed. POST_NOTIFICATIONS is already in the merged manifest —
expo-notifications declares it. iOS behaviour is unchanged except that the denial now comes with a
dialog offering Settings, which it did not have on either platform before.

### What was wrong

On a fresh install, scheduling a wish with "Notify me 1 hour before" went straight to the
"notifications are off, enable them in Settings" error. The system prompt never appeared, so there
was no way to turn reminders on from inside the app.

Android 13+ guards notifications with the POST_NOTIFICATIONS runtime permission, and
`expo-notifications`' `getPermissionsAsync` has no `undetermined` to report it with:
`NotificationPermissionsModule` resolves `status: 'denied'` whenever
`NotificationManagerCompat.areNotificationsEnabled()` is false, which it is until the permission is
granted. `reminderAuthorization()` mapped that `denied` to `denied`, so
`ImportantMomentsStore.authorizeNotifications`' `notDetermined` branch — the one that asks — was
unreachable on Android and every path fell through to the denial.

`canAskAgain` is the field that separates the states: it is `true` while Android will still show the
prompt (never asked, or refused once) and `false` once the person has blocked it or switched
Nexdo's notifications off in Settings.

Two smaller things went with it: nothing created a notification channel, so a scheduled reminder
would have been dropped by Android 8+ even after the permission was granted; and the Moments list's
`prepareDefaultReminders` would have spent the install's one prompt on a screen the person was only
browsing.

### What changed

`src/lib/notificationPermission.ts` is new and is now the only place either reminder path reads,
requests or explains notification permission.

| Piece | What it does |
|---|---|
| `classifyNotificationPermission` | Android decides on `status === 'granted'` for authorized and on `canAskAgain` for undetermined vs denied; iOS keeps `UNAuthorizationStatus`, provisional and ephemeral included |
| `requestNotificationPermission` | Creates the channel, then shows the system prompt. Called only from the three places below |
| `ensureReminderChannel` / `reminderChannel()` | The `reminders` channel at `AndroidImportance.HIGH`, created before any `scheduleNotificationAsync` and named on every `DATE` trigger. No-ops on iOS |
| `alertNotificationsOff` | The "Scheduled notifications are off" dialog, with **Open Settings** (`Linking.openSettings()`) and **Not now**. Shown only for denied or blocked |

Where the prompt now comes up, all three at the moment the person asks for a reminder:

1. **Scheduling a wish** with "Notify me 1 hour before" or a manual send —
   `schedule-wish.tsx` already called `authorizeNotifications()` there, and Manage Moment does the
   same through `manageModel.ts`.
2. **"Enable wish reminders"** in Moment settings (`enableWishReminders`).
3. **A task reminder** — `ensureNotificationPermission()` inside `replaceScheduledNotifications`,
   which Swift also runs there rather than at launch.

`prepareDefaultReminders` still refreshes the status on both platforms, but on Android it stops
there and does not prompt. Nothing at launch asks, and a rebuild of the reminder set
(`replaceMomentNotifications`) never asks either — it schedules only when already authorized.

### Check it on a phone

1. Fresh install, Android 13+. Open Moments: no prompt.
2. Schedule a wish with "Notify me 1 hour before" → Android's notification prompt appears. Allow it:
   the wish is scheduled and the reminder shows up under Settings → Notifications → Nexdo →
   Reminders.
3. Repeat with Don't allow: the "Scheduled notifications are off" dialog appears; **Open Settings**
   goes to Nexdo's settings page.
4. Turn notifications off in Settings, come back and schedule again: the dialog appears with no
   system prompt in front of it.
5. Moment settings shows "Allow notifications to enable wish reminders" with the **Enable wish
   reminders** button before the answer, and "off in your phone's Settings" after a block.
6. iOS: the prompt appears when it always did; a denial now also opens the dialog.

## 14. Writing a wish holds the Wish Message controls (2026-09-24)

JavaScript only; no new build needed. iOS is unchanged: its screens draw no loading state and, as
before, a second tap during a request sends nothing (the model's `busy` guard).

### What changed

While a wish draft is being written, on the Manage Moment **Wish Message** tab (Regenerate) and on
**Review wish** (Try another):

- The button shows a small spinner in place of its sparkles icon and reads **"Writing your wish…"**,
  and it is disabled.
- The tone chips (Warm / Personal / Short / Fun) and the AI toggle ("Use AI for this draft", "Use AI
  to draft my wish") are disabled and dimmed.
- The current message stays on screen at half opacity and read-only until the new draft replaces it.
- A burst of taps sends one request.

When the reply arrives, or the request fails, everything re-enables. Manage Moment shows its
existing notice ("AI draft ready for review.", "AI unavailable; an editable fallback draft is
ready.", or "Offline fallback — review before saving."); Review wish shows its existing error.

| Where | Change |
|---|---|
| `manageModel.ts` | `generatingWish`, set with `busy` before the first await and cleared in `finally` |
| `ManageMomentView.tsx` | `writingWish = isAndroid() && state.generatingWish` drives the button, chips, toggle and editor |
| `review.tsx` | a ref guard plus `writing` state around `perform`; the same four controls |
| `components.tsx` | `BorderedButton` `loading` (spinner, `accessibilityState.busy`); `MomentSegments` `disabled` |

The request can't leave the screen stuck: `generate` goes through `momentsApi.post`, which aborts
after 50 s (`operationTimeout`, `src/api/moments.ts`), and the failure path releases the controls.

### Check it on a phone

1. Manage Moment → Wish Message, turn on "Use AI for this draft", tap **Regenerate** several times
   quickly: one spinner, "Writing your wish…", chips and toggle dimmed, the old text faded.
2. The new draft replaces the text and "AI draft ready for review." appears; the controls work again.
3. Airplane mode, tap Regenerate: the controls come back with "Offline fallback — review before
   saving."
4. Moments → Create wish on a moment → Personalize with AI → tap **Try another**: the same
   behaviour.

## 15. Writing a wish holds only the wish controls; parity with iOS c86e8c0 (2026-09-24)

JavaScript only; no new build needed. Follows iOS `c86e8c0` (`WishGenerationGate`).

### What changed

- **Regenerate is no longer a save.** `generate()` sets `generatingWish` only, not `busy`, so on
  Android the Wish Message tab no longer shows "Saving…" or blocks the whole screen while a draft is
  written. Only the wish controls are held (§14), now including **Edit** and **Save Message**.
- **Nothing saves while a draft is being written.** In `manageModel.ts`, `save`, `approve`,
  `saveGreetingCard` and `changeTab` (which auto-saves) return without a request while
  `generatingWish` is set, so the old text is never saved over the incoming draft and no tab change is
  left pending.
- **Review wish, first draft.** When the screen opens without a reusable draft, the draft it writes
  shows the same state: "Writing your wish…" with a spinner on Try another, and the tone chips, AI
  toggle, Edit and the message held. Edit is now held on every Try another too.

iOS (React Native) is unchanged: the view still holds the screen behind "Saving…" while a draft is
written (`screenBusy = busy || (!isAndroid() && generatingWish)`), exactly as before.

### Check it on a phone

1. Manage Moment → Wish Message, AI on, tap **Regenerate**: no "Saving…"; Edit and Save Message are
   dimmed with the other wish controls; the header and the rest of the screen still respond.
2. Tap another step tab while it writes: nothing happens until the draft lands.
3. Moments → Create wish on a moment with no draft: Try another reads "Writing your wish…" until the
   first draft appears.

## 16. A contact with a repeated number or email no longer crashes the address menus (2026-09-24)

JavaScript only; no new build needed. A crash fix, so it applies on iOS as well.

Picking a contact whose number or email is saved twice filled "Choose delivery address" with two
menu rows sharing one React key ("Encountered two children with the same key"), and the list broke.

- `contactChoice` (`src/features/moments/device.ts`) now offers each address once, keeping the first
  as written: phone numbers compare with spaces, dashes and brackets removed, so "+1 (555) 010-0200"
  and "+1 555-010-0200" are one number; emails compare trimmed and case-insensitively.
- `PopoverMenu` (`form.tsx`) keys its rows through `uniqueKeys`, so any two items that still share a
  value render as `value` and `value#row` instead of colliding.

### Check it on a phone

1. Give a contact the same number twice (once with brackets and dashes) and the same email in two
   cases.
2. Manage Moment → Contacts → Add Contact, pick them: the Phone and Email menus list each once.
