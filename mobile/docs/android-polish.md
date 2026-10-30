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
| "Update Password" | The primary `GradientButton`, 52pt, full width, 24pt under the Verification group. It is disabled until the code has six digits and the new password is non-empty (RootView.swift:620), drawn in §11's disabled state: the gradient at 40% and the label at 70% |
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

## 17. Moments: several recipients on create, one editable recipient sheet (2026-09-24)

JavaScript only; no new build needed. Android only for the screens: iOS keeps the single recipient on
Create Moment and the inline Edit recipient and address menus in Manage Moment. The address-check fix
in `validatePickedContacts` is shared.

### Create Moment (`MomentEditorView.tsx`, new moments only)

- **Recipients** section replaces First name / Phone / Email: **Choose from Contacts** and **Enter
  recipient manually** both open the recipient sheet. Each person is a row: name, then
  `Mobile · ••• ••• 0300` and/or `Email · k••••@example.com`, with **Edit** and **Remove**.
- With nobody added, the caption reads **Add at least one recipient.** and Save is disabled.
- The first person's first name still sets the default title ("Kate’s Birthday").

### Recipient sheet (`RecipientSheet.tsx`)

Title **Add Recipient** / **Edit Recipient**, **Cancel** in the bar, fields **Name**, **Phone**,
**Email**, button **Add** / **Save** (disabled until there is a name and a phone or an email). A picked
contact pre-fills the fields; when it has several numbers or emails they appear as chips under the
field (each once, as `contactChoice` dedupes them), and anything can be typed. Errors show under the
fields:

- `Enter a valid phone number, 7 to 15 digits.`
- `Enter a valid email address.`
- `<Name> already has this phone number.` / `<Name> already has this email.` (same digits, or the
  same email ignoring case and spaces)

Manage Moment → Contacts uses the same sheet for **Add Contact** (after the picker), **Enter recipient
manually** and **Edit recipient** (now a link next to **Remove contact** instead of inline fields).

### Save flow

1. `save` creates the moment for the first person (name, phone, email).
2. One `festivalSave` stores everyone: `ids: [moment]`, each recipient with its own name, phone
   (digits, optional +) and email, all `selected`; `settings.channels` is `messages` when there is a
   phone and `email` when there is only an email; `settings.contactIDs` holds the picked contact's id
   (empty for a manual entry). The first person's key is the moment's id.
3. The list is refreshed and Manage Moment opens; Contacts shows everyone selected. A failed
   `festivalSave` keeps the created moment, and Save retries only step 2.
4. A **Custom** moment has no Manage Moment: one moment is saved per person.

### "A contact’s email changed" on a new moment

The warning comes from `validatePickedContacts` (`device.ts`), which runs on Save and Schedule for every
recipient with a stored contact id. On Android it always runs (the picker needs READ_CONTACTS); iOS
normally has picker-only access and skips it. It compared the contact's email untrimmed with the saved
address, which `persist` trims, and it also checked addresses the person had typed over the contact's
in Edit recipient, which keep the contact link. Now both sides are compared the same way (`samePhone`:
same digits; `sameEmail`: trimmed, case-insensitive), and a recipient whose phone or email is no longer
one the contact has is unlinked (`contactLinkFor`, `editedContactLink`), so only a real change to the
contact warns.

### Check it on a phone

1. Create Moment → Choose from Contacts → pick someone with two numbers: tap the second chip, Add.
   Enter recipient manually: a name and an email, Add. Both rows show; Save.
2. Manage Moment → Contacts: both are selected, no red warning. Change a name and Save Changes: still
   no warning.
3. Edit a row and type a phone already used by the other person: "<Name> already has this phone number."

## 18. Multi-recipient Create Moment aligned with iOS 94a2ecd (2026-09-24)

JavaScript only; no new build needed. Android only. Brings §17 in line with iOS
`swift-multi-recipient-create` (94a2ecd); §17's strings and rules below are superseded.

### Strings (as iOS)

- Row secondary line on one line: `Mobile · ••• ••• 1234 · Email · a••••@example.com`, or either alone
  (`maskedAddresses`). Row actions **Edit** / **Remove**, read as "Edit <name>" / "Remove <name>".
- **Add at least one recipient.** shows while the list is empty, and the privacy note ("Only the
  recipients and occasion you confirm here are saved to your Nexdo account. Your address book is never
  uploaded.") always shows under it.
- Partial save: **Your moment is saved, but not all of its recipients are. Tap Save again to finish.**
  The Recipients list is locked once the moment exists.
- Sheet footer **Add a phone number, an email, or both.**; quick choices read "Use phone <number>" /
  "Use email <address>".
- Validation: "Enter a name." / "Use a name of 80 characters or fewer." / "Enter a phone number or
  email." / "Enter a valid phone number." / "Enter a valid email address." / "This person is already a
  recipient." Add / Save is always enabled and shows the message on press; it clears when a field
  changes.

### Rules

- Every filled field must be valid: a bad phone is refused even when the email is fine.
- Duplicates: the same phone ignoring formatting (`FestivalValidation.phone`: digits, keeping a leading
  +) or the same email ignoring case.
- A picked contact pre-fills its first name, falling back to the full name. The first recipient's name
  is the moment's name ("Kate’s Birthday").
- Phones are saved as digits with an optional leading +, including in the first `save`; emails trimmed.
- An imported contact starts as the first recipient.

### Save flow

`save` creates the moment with the first recipient, then one `festivalSave` with `ids: [newID]` and
every recipient: the first with `id` and `key` newID, each other with no id and a new random key (§17
keyed a picked contact by its hash). Settings get a new `groupID`, each key's channel ("messages" with a
phone, else "email"), `selected: true` and the contact id. A failed `festivalSave` is retried alone,
with the same moment and group. A custom moment makes each other recipient its own custom moment, with
a new source key.

### Contact warning

§17 unlinked a recipient whose address was typed. Now, as iOS does, the contact id is always kept and
the device records which saved addresses were taken from the card (`contactLinks.ts`, AsyncStorage
`nexdo.moments.contactAddressLinks`, keys are one-way SHA-256 hashes of contact, field and address, so
no address or contact id is stored). Save and Schedule warn only when an address taken from the card is
no longer on it. A typed address is never compared, and an address saved before this existed is
recorded from the card as it is now, without a warning. A deleted contact warns only if one of its
addresses came from the card.

## 19. Reminders fire on time on Android 12+; dev reminder log (2026-09-24)

**Needs a native rebuild** (`app.config.ts` manifest change). The logs are JavaScript.

Report: on a Redmi Note 9 Pro dev build, "Remind me in 15 minutes" on the Nexdo Action screen for
"Call the plumber" (no schedule) showed no notification after 20 minutes.

### What the code does

- "Remind me in 15 minutes" (`app/action/[id].tsx`) calls `useCoordinator.snooze(actionID)`: the action
  gets `snoozedUntil = now + 15 min` and moves to `scheduled` (`src/actions/coordinator.ts` `snooze`),
  then `update` persists it and queues `schedule()`.
- `schedule()` builds the plan with `desiredNotifications` (`src/lib/taskAction.ts`), which uses
  `notificationDate = snoozedUntil ?? scheduledAt` (`src/lib/todayActionQueue.ts`), so a task with no
  schedule still gets a reminder once snoozed. `replaceScheduledNotifications`
  (`src/actions/notifications.ts`) then asks for permission if needed, creates the `reminders` channel
  (importance HIGH, `src/lib/notificationPermission.ts`) and calls `scheduleNotificationAsync` with a
  DATE trigger on that channel.
- Setting a task's Schedule gives the action a `scheduledAt` through `reconcileActions` (task
  `startAt ?? dueAt`); with neither, the card says "Set a schedule to receive an action reminder.",
  which it also says once a snooze time has passed.
- POST_NOTIFICATIONS comes from expo-notifications' own manifest and is requested (Android 13+) the
  first time a reminder is scheduled; below Android 13 it is not a runtime permission.

### The gap

expo-notifications fires a DATE trigger with `setExactAndAllowWhileIdle` only when
`AlarmManager.canScheduleExactAlarms()` is true; otherwise (Android 12+ without the permission) it uses
the inexact `setAndAllowWhileIdle` (`ExpoSchedulingDelegate.setupAlarm`). The app declared neither
SCHEDULE_EXACT_ALARM nor USE_EXACT_ALARM, so every reminder on Android 12+ was inexact and could be
deferred — MIUI defers aggressively. `app.config.ts` now declares SCHEDULE_EXACT_ALARM: granted at
install on Android 12/12L; on 13+ it starts off and can be allowed under Settings → Apps → Nexdo →
Alarms & reminders. USE_EXACT_ALARM is not declared (Play limits it to alarm-clock and calendar apps).

MIUI can also cancel an app's alarms when it is swiped away with its "clean" behaviour, or block them
without Autostart; no app change avoids that.

### Dev-only log (Metro)

`src/lib/reminderLog.ts`, silent in release builds. For every reminder:
`[reminders] scheduled action abcdef12 at 2026-09-24T10:15:00.000Z (in 15 min)` or
`[reminders] skipped action abcdef12: no schedule and no snooze` (also "reminder time has passed",
"status is …", "notifications are not allowed", "beyond the 48-reminder limit"), the same for wish
reminders, then `[reminders] after task-action scheduling: N pending` with each pending identifier
(shortened), trigger time and channel from `getAllScheduledNotificationsAsync`. No title, task,
contact or address is logged.

### Check it on a phone (after a rebuild)

1. Open a contact task's Nexdo Action, tap "Remind me in 15 minutes": Metro shows the "scheduled" line
   and the pending list with `channel=reminders`.
2. Android 13+: allow Settings → Apps → Nexdo → Alarms & reminders. Lock the phone; the notification
   arrives at the time logged.

## 20. Reminders proven on device; stuck actions; people and services (2026-09-24)

JavaScript only; no new build needed.

### Test reminder (development builds only)

`nexdo://debug/test-reminder` (also `exp+nexdo://…`) schedules one local notification on the
`reminders` channel 60 s ahead (`src/lib/debugReminder.ts`, handled in `app/+native-intent.tsx` only when
`__DEV__`; release builds ignore the link):

    adb shell am start -a android.intent.action.VIEW -d "nexdo://debug/test-reminder" com.pinslots.nexdo

Result on a OnePlus CPH2691, Android 16 (API 36), dev build: `appops SCHEDULE_EXACT_ALARM: allow`,
POST_NOTIFICATIONS granted. `dumpsys alarm` listed both Nexdo alarms as `RTC_WAKEUP`,
`exactAllowReason=permission`, allow-while-idle, with an OEM delivery window (+17 s and +45 s). Both
notifications were posted on channel `reminders`, importance 4 (HIGH): the task reminder 17 s after its
time, the test reminder 45 s after — inside those windows.

### Stuck `awaitingApproval`

Opening a Nexdo Action (from its card or the queue) moves it to `awaitingApproval`; closing the screen
without a choice left it there, so its future reminder was skipped. Now the action returns to
`scheduled` (and is rescheduled) when its Action screen closes before the reminder time, and on the next
sync unless its screen is open (`waitingBeforeItsTime`, `release`). A changed task date already rebuilds
the action as `pending` at the new time; that path is now covered by a test. Once the reminder time
has arrived, `awaitingApproval` stays: the person is being asked.

### People and services

Detection runs in the app (`src/lib/taskActionDetector.ts`, a port of iOS `TaskActionDetector.swift`),
not on the server. "Call the plumber" and "Call electrician" were both detected. A Today card also
needs a reminder time, so an action with no schedule or snooze has only its card in Task Details.
Changes:

- A name also ends at "to", "for", "by", "before" and "after" ("Call electrician to fix the wiring" names
  "electrician"; before, such titles could pass five words and get no action).
- Contacts are searched without a leading "the", "a", "an", "my", "our" or "your", so "the plumber"
  finds "Plumber". Cards and notifications keep the name as written.

---

## 21. Phase 12 Run C: Wellness chooser, module guides and Pomodoro (2026-10-05)

New screens, built from the Swift source (no captures existed for them yet). The deviations from Swift
are listed here, Android-only or not.

### Wellness chooser and module guides

- **Fixed light colours, in both modes.** Swift draws the chooser, the guides and Pomodoro on explicit
  white cards and gradients with an explicit ink (and `.preferredColorScheme(.light)` on the Pomodoro
  dashboard), so they stay light in dark mode on iOS. They stay light here too; the `link` token (the
  dark-mode tappable colour) does not apply, and every tappable keeps Swift's own colour — the module's
  colour on the guides, indigo on Pomodoro.
- **Sprite sheets are pre-cut.** Swift crops `wellness-menu-pack` and `module-guide-pack` at draw time.
  The same pixel rectangles were cut once into `assets/wellness/` (28 files, 788 KB in all), and drawn
  whole. `.blendMode(.multiply)` is `mixBlendMode: 'multiply'` (New Architecture), so the art's white
  sheet background drops out on the tinted cards as on iOS.
- **The tab bar's centre button** is `wellness-navigation` at 62×58 in the 58dp bar, between Tasks and
  Ask AI, with no title and no selection capsule, as Swift's. It opens the chooser as a full-screen
  modal.
- **Accessibility text size.** The guide stacks each step's picture under its text when the font scale is
  1.6 or more (iOS's AX1 is 1.65; Android 14's 1.8× and 2× settings qualify, "Largest" 1.3× does not).
- **The guide's bar** is drawn by the screen: a glass back circle in the module's colour and the inline
  title "How It Works", as on the other covers.

### Pomodoro (timer, dashboard, history, category insights)

- **Sound: the phone's default notification sound, for both.** The end-of-phase alert uses it, as in
  Swift (`content.sound = .default`). Swift's in-app chime is iOS system sound 1005, which has no file to
  ship, so the chime plays the default notification sound too: an immediate local notification that the
  foreground handler presents with sound only — no banner, no list entry — removed four seconds later.
  No sound file is bundled. Without notification permission the chime is silent, as the alert is. When a
  phase ends with Pomodoro on screen, the alert (banner and sound) and the chime both play, as on iOS.
- **Keep screen awake** is expo-keep-awake under one tag, held only during an unpaused focus on the timer
  screen in the foreground with "Distraction-free mode" on, and released on leaving — Swift's
  `isIdleTimerDisabled` rule. It needs no Android permission.
- **The notification tap** opens Pomodoro over the tabs (`from=notification`). With Ask open, Ask closes
  first; with the Wellness chooser or a guide open, the tap waits until they close; with Pomodoro already
  showing, nothing more opens (Swift would present a second cover once the chooser closed).
- **Charts and rings are drawn from Views** (no SVG or chart module): bars and the minute grid as views,
  the timer ring and the category donut as 180 short segments, the ring's angular gradient sampled per
  segment. A bar is picked by tapping, not by dragging along the chart. Axis labels are en-US ("3PM",
  "Mon", "Sep 26"), the format Swift's captures show.
- **Sheets** (history, session details) are React Native page sheets; the dashboard's "…" menu and the
  trend-period menu use the Moments popover, which follows the system theme while the screen stays light.
- **The timer counts from the stored deadline**, ticking once a second while shown, and catches up on
  return to the foreground, as Swift's `scenePhase` handler does.

---

## 22. Phase 12 Run D: Calorie Tracker (2026-10-05)

The Calorie Tracker (`CalorieTrackerView.swift`), built from the Swift source; no captures existed yet.
Deviations from Swift, Android-only or not:

- **One screen, Swift's own pages.** All eight pages live in `app/wellness/calories.tsx` under one header,
  moved between with Swift's `page` and `history` (Back pops, Back on the first page closes) rather than
  a navigation stack, so there are no push animations between pages — as on iOS.
- **Fixed light colours**, as Run C's covers: Swift draws the tracker on a white gradient with an explicit
  ink. Plain buttons take the app tint (`.tint(.nexdoIndigo)` from `RootView`), switches and pickers the
  system indigo (`.tint(.indigo)`); the `link` token does not apply.
- **Pickers.** The call time is `ClockField` in its 12-hour form-row style; the time zone, the agent voice
  and the editor's meal are the Moments `MenuPicker`; the calorie goal's `Stepper` is a − / + capsule; the
  dashboard's date is a pill opening the system-style month grid, limited to today and earlier; Period and
  Insights / Recommendations are segmented controls drawn from views.
- **Rings and charts from views.** The Today ring is 180 short segments with its blue → cyan → green
  gradient sampled along the bottom-left → top-right axis, round caps omitted; Week and Month bars are
  views. Neither chart is interactive in Swift, so there is nothing to tap. (Run C's Pomodoro charts are
  the ones where a bar is picked by tapping instead of dragging — §21.)
- **"What happens next?" numbers.** SF Symbols' `1.circle.fill` … `3.circle.fill` have no Ionicons
  equivalent: a filled circle in the step's colour with the number in white.
- **The checkmark on "All Set!"** is the gradient masked to the icon (`@react-native-masked-view`, already
  installed), as Swift's `.foregroundStyle(gradient)`.
- **Alerts** are React Native's: one titled "Calorie Tracker" (or "Calorie Tracker Preview") with OK, for
  every notice and error, as Swift's single `.alert`.
- **Sample preview.** Swift shows the sample data when no account is signed in or under the DEBUG
  `-calorie-design-preview` launch argument. The chooser is only reachable signed in, so a development
  build opens the preview with `nexdo:///wellness/calories?preview=1`; release builds are always live.
- **Art.** Only `calorie-design-pack` is drawn (the robot, 218×140 at 1305, 790), cut at its own size into
  `assets/wellness/calorie-agent.png` (31 KB). `nutrition-detail-pack` belongs to Shopping Alternatives,
  not this screen, so it was not copied.

## 23. Phase 12 prep: Wellness holds Moments and Shopping; the light design is enforced (2026-10-05)

JavaScript only; no new build needed.

### Moments and Shopping inside the Wellness cover

- **Supersedes §21's "Moments and Shopping open in the Today stack".** Their routes moved from
  `app/(tabs)/(today)/` to `app/wellness/moments/` and `app/wellness/shopping/`, pushed in the wellness
  stack with the same glass bar as before. "Got it!" replaces the guide with the module, as Swift's
  `WellnessModuleEntrance` swaps its content, so Back returns to the chooser rather than to Today.
- **No tab bar and no chooser bar inside a module**, as in Swift (`moments-date-filter-*`,
  `shopping-detail-store`): the module covers both. Before this, Moments and Shopping kept the tab bar
  because they were pushed in the Today tab.
- **Today's Quick Access is the one Weekly Summary button** (TodayQuickAccess.swift:3-18). The Moments
  and Shopping tiles are gone, so Wellness is their only entry, and Today no longer fetches shopping
  lists.
- Moments and Shopping still **follow the phone's theme**. Only the chooser and the guides are fixed light.

### The chooser and the guides stay light in dark mode

> **Superseded for the chooser by §33 (Phase 13 Run A):** Swift gave the chooser a real dark mode in 4185501, and the RN chooser now follows it. The guides stay fixed light, as Swift’s still are.

Swift's intent is a fixed light design (§21), but on iOS in dark mode its chooser and guides actually
lose text: subtitles, step text, "Back to Home" and the bar's labels turn white on white (`wellness-chooser-dark`,
`module-guide-shopping-dark`). That is a Swift bug, kept on the §22 "For the team" list. Android keeps the
design and not the bug. An audit for anything that still followed the theme found two leaks, now fixed:

- **The guide's Back button plate.** `GlassCircle` drew the theme's plate, a translucent grey in dark mode.
  It takes an optional `scheme` now, and the guides pass `"light"`. Every other caller is unchanged.
- **The status bar.** The root layout picks it from the theme, so dark mode drew a white clock over these
  white screens. `FixedLightStatusBar` asks for dark content while the chooser or a guide is focused,
  and only then: the chooser stays mounted under Moments and Shopping, which follow the theme.

Every text, icon and background on both screens was already a literal or a fixed light-palette value.
`src/features/wellness/__tests__/darkMode.test.tsx` renders the chooser and all four guides in Day and in
Night and requires the **drawn** trees (styles flattened) to be identical. A control case proves the
comparison catches a themed colour, and each render must contain the screen's text, so a blank render
cannot pass. Removing the `GlassCircle` fix makes five of its cases fail.

---

## 24. Phase 12 Run A: Account, Help, Feedback, Change password, Ask AI, Daily Brief, Appointment details (2026-10-05)

Built from the Swift source, then checked against the Mac's captures for these screens. Deviations from
Swift, Android-only or not:

### Account, Help, Feedback, Change password

- **Pushed screens draw their own inline bar** (`src/components/InlineNavBar.tsx`): a back chevron in the
  `link` colour (labelled "Back") and the centred title. iOS 26 draws the system back button as an ink
  chevron in a glass circle (`help`, `feedback-empty`); there is no glass here.
- **Help in dark mode.** Swift's cards are fixed white under adaptive ink — white on white. Light mode is
  Swift's; dark mode uses the theme surface for the cards and the search field.
- **Alerts** ("Thank you for your feedback!", "Change password and sign out?") are React Native's.

### Ask AI landing, Daily Brief, section pages

- **Fixed light colours** for the landing, the brief and its section pages. Swift's brief and pages use an
  explicit ink on white; the landing fades to `.white` under `nexdoInk`, which is white text on white in
  dark mode, so the landing keeps its light values too. The answer view and the composer stay adaptive.
- **The orb** is a diagonal cyan → blue → purple → pink gradient with the indigo core and the face drawn
  from views; Swift's angular gradient and its blur need a drawing library.
- **Symbols.** SF `scope` and `keyboard` have no Ionicons match: `locate-outline` and `keypad-outline`.
- **Artwork** is cut from `daily-brief-pack` and `brief-detail-pack` into `assets/brief/` (the robot
  scaled from 515 to 512 wide) and drawn with `mixBlendMode: 'multiply'`, as Swift's `.blendMode(.multiply)`.
- **"Working on it…"** sits on a translucent rounded card (no material blur).
- **The keyboard's "Done" bar** sits at the bottom of Ask and rides up with the keyboard.
- **Section pages are a full-screen route** (`app/ask/brief/[index]`), so Task Details and the action screen
  can open over them. The "…" menu is the Moments popover; "Share briefing" opens the system share sheet
  with the lines as text.
- **A section that has gone** (its last priority task completed on the page) keeps its title over "Nothing
  to report here today." Swift's cover renders nothing and has no way back (§22 "For the team").
- **Task Details from a section page**: "Add Note" focuses Notes; "Schedule" / "Reschedule" scrolls the
  SCHEDULE card into view, near the centre, as Swift's `proxy.scrollTo(_, anchor: .center)`.

### Appointment details and Calendar

- **A modal route** (`app/calendar/event/[id]`) rather than an inline sheet, with its own bar: back chevron,
  "Event Details", Edit (Nexdo events) and a "…" popover, without iOS 26's glass capsules
  (`event-details`). The Edit Event editor is a second modal.
- **Dates are en-US** ("Oct 5, 2026 at 1:27 PM"), as across the app; the capture's Mac shows its own
  region's "5 Oct 2026".
- **Dark mode.** Swift's cards are fixed white (`.white.opacity(0.94)`) under adaptive ink; dark mode uses
  the theme surface, and the status, action and delete colours take their dark-mode system values.
- **"Delete this event?"** is an alert with Cancel and Delete Event (Android has no confirmation dialog of
  SwiftUI's kind).
- **Open in Calendar.** iOS opens Swift's `calshow:` URL. Android opens the Calendar app's day view at the
  event's start with `content://com.android.calendar/time/<ms>`; no permission is needed.
- **Edit Event's dates** are the Moments `DateField` (date pill, month grid, hour and minute wheels; date
  only for an all-day event).
- **An empty day** in Schedule mode is a disclosure row with a chevron, as Swift's; Week and Month always
  show their day.

## 25. Phase 12 Run E: Moments (2026-10-05)

JavaScript only; no new build needed. The screens are listed in `docs/IOS_TO_REACT_NATIVE.md` §22 "Run E".
Deviations from Swift, Android-only or not:

- **Chips and capsules in dark mode.** The Today / Tomorrow / This Week / Later chips, the Manage Moments
  tabs and the Messages / Email / Copy / Share delivery tags keep Swift's light look (8% indigo, indigo
  text; filled indigo or the brand gradient when chosen). In dark mode an unchosen one's label is the
  `link` token, on that colour at 16%, as every other dark-mode tappable (§6).
- **The time zone menu lists each zone once, by its current name.** ICU spells India `Asia/Calcutta`; the
  menu shows `Asia/Kolkata` and a stored `Asia/Calcutta` selects it. Swift's row is blank for India (§22
  "For the team"); this is the fix, not a copy.
- **Edit Moment** is the shared form sheet (`MomentSheet`) with Cancel and Save in its bar; Type is a menu
  of the four greeting-card occasions; the date is the shared date field.
- **Prepare reminder** is a menu in the Send time card (None, 1/4/8 hours, 1/3/7/14 days before), as
  Swift's `Picker`.
- **Connect me on the day.** The call time is `ClockField` with `hourCycle="h12"` and the form-row look
  ("9:00 AM", hour, minute and AM/PM wheels), not a native time picker; the value stays `HH:mm` as the
  server wants it. The time zone is the same menu as above. Errors and notices are one alert titled
  "Connect me on the day", with OK, as Swift.
- **Show my number.** The code is drawn in the platform monospace face (`monospace` on Android, Menlo on
  iOS) for Swift's `.monospaced` design; the status is polled every 3 s, 60 times at most, and stops when
  the sheet closes.
- **How It Works** is its own full-height sheet in Swift's FIXED light design (it never follows dark
  mode), with the round glass back button; the four pictures are `moment-calling-pack`'s regions cut once
  into `assets/moments/` (176 KB). The title wraps where Swift truncates it.
- **Review schedule, Send now, Edit date & time, Edit recipient and Schedule confirmed** keep Swift's fixed
  light `ScheduleDesign` in both modes. A `FixedScheme scheme="light"` around them makes the shared date
  pill and fields light too. On Android each sheet is the rounded shape over a dimmed page that
  `MomentSheet` draws. Edit date & time uses the shared date field (month grid, hour and minute wheels)
  where Swift shows a wheel `DatePicker`; Send Now and Confirm Schedule sit side by side and wrap to a
  column when they do not fit (`ViewThatFits`).
- **Send Now on Android.** The SMS intent cannot report whether the person tapped Send — `expo-sms`
  answers `unknown` — so each opened wish is recorded `opened` ("delivery not confirmed"), as Choose
  Delivery does. iOS records `sent` only for a confirmed send, as Swift. A cancelled composer records
  nothing on either.
- **Schedule confirmed** has no back button, as Swift (`navigationBarBackButtonHidden`), and the back
  gesture is off: Done is the way out.

---

## 26. Phase 12 Run F: Shopping (2026-10-05)

Built from the Swift source and the Mac's `shopping-*` captures. Deviations from Swift, Android-only or not:

- **Stores Near You and Store Hours are pages of the List Settings sheet**, with Back, rather than pushes
  inside its own `NavigationStack`; the chosen store comes back to the sheet's draft as Swift's `onSelect`.
- **Share List → "Weekly email to store manager"** closes the sheet and pushes the weekly email on the
  list, instead of pushing inside the sheet.
- **Alternative Item Details** is a page of the alternatives sheet (Back returns to the list); the goal
  picker, Why these alternatives? and the Replace confirmation are sheets over it; "Item replaced!" and
  "Ask AI about this item" are full-screen.
- **Store logos** load through React Native's `Image`. iOS skips the URL cache (`cache: 'reload'`, Swift's
  "no persistent redistribution"); Android's image pipeline may keep its own cache. Only the server-named
  `cdn.brandfetch.io` URL is ever loaded.
- **Offer expiry** shows the store's own last day, not Swift's device-zone date (§22 "For the team").
- **The weekly email follows the theme in dark mode.** Swift draws it in fixed light colours; light mode
  here uses those exact values, but dark mode uses the theme so its menus, the 12-hour time picker and the
  date pill (theme-coloured shared controls) stay readable.
- **The settings gear on the weekly email** opens Account → Settings at the top; Swift's
  `ProfileSettingsView(openCalendarSettings: true)` scrolls to Calendars.
- **The photo preview** zooms with − / + on both platforms; pinching works on iOS only (Android's
  `ScrollView` has no zoom).
- **Swipe to delete on a completed list** does not open at all; Swift reveals a disabled Delete.
- **"Take a Picture"** stays enabled; Swift disables it, with "Camera is available on a supported
  device.", only where there is no camera (the simulator).
- **Shopping Detail's title** is the store name with "Open Now" under it in the stack header's title slot;
  the View Offers icon uses the `link` token (dark-mode tappables).
- **Copy kept unchanged**, including "…allow location access in iPhone Settings." on Android (§22 "For
  the team").

## 27. Phase 12 Run B: Tasks, Today and the Moments leftovers (2026-10-05)

JavaScript only; no new build needed. The screens are listed in `docs/IOS_TO_REACT_NATIVE.md` §22 "Run B".
Deviations from Swift, Android-only or not:

- **Tasks / Projects is a pill pair on Android too.** Swift replaced its segmented control with two capsules
  (white on the accent gradient when chosen, over 6% indigo); the Android `SegmentRow` this screen used
  (§9) is gone, so both platforms draw the same pills.
- **Tasks in dark mode.** Swift's new background gradient and the white 65% section headers are light-only
  (§22 "For the team"). In dark mode the screen keeps the subtle `TodayBackdrop`, the headers take the
  surface colour at 65%, and the task icon tints (pink, green, orange, purple) use their dark system
  colours. The icon tiles use Ionicons stand-ins for the SF Symbols (`construct-outline` for the wrench,
  `laptop-outline` for the laptop).
- **Task agent card in dark mode.** Swift's fixed white and lavender cards (the run card, the results
  header, the business cards and tabs, the Task Information card) take the theme surface in dark, as §24
  did; indigo and business-purple tappables and accents are the `link` token. Android draws no shadows, so
  the run and business cards get the 1px `fieldBorder` hairline instead.
- **Task agent card, Open in Messages on Android.** The SMS intent answers `unknown`, so no alert follows,
  as for a cancelled composer; only a confirmed send or a failure shows one.
- **Task agent card, layout.** The sliders menu ("Additional task details") is an inline one-item popover;
  the rating line wraps rather than switching to Swift's compact `ViewThatFits` form; the
  accessibility-size vertical layouts of the card are not ported. Polling carries on after a failed load
  (Swift stops) and a later good load clears the message; the first shortlist is preselected whenever it
  appears, not only on the load path.
- **Nexdo Action: Choose contact** opens the system contact picker. On Android `expo-contacts` reads the
  picked person back through the contacts provider, which needs READ_CONTACTS, so Android asks for it
  first (the Moments picker already does; no new permission). "Choose contact" is a filled capsule in the
  tint; the Contact details form is a page sheet on iOS and a full-screen modal on Android, with the form
  group chrome (§2).
- **Today, Remind later → Choose time…** uses the shared date field (month grid, hour and minute wheels) in
  a sheet titled "Remind later", where Swift shows a compact `DatePicker`.
- **Today, Previous / Next** are tinted capsules (`.bordered`); "Choose contact or enter details" keeps
  Swift's fixed lavender and ink, because the card it sits on (`glassSolid`) stays light in dark mode too.

## 28. UI-parity pass 3: Phase 12 on the phone (2026-10-05)

Every ticked §22 row checked on a OnePlus CPH2691 (Android 16, 360 dp wide) against the Mac's iPhone
captures; results row by row in `docs/reference/PARITY.md` "UI-parity pass 3". Fixes, Android-only or not:

- **Module guides: "Back to Home" is ink.** Swift's outer `.foregroundStyle(ink)` beats the `.tint`; it was
  the module colour. Both platforms.
- **Pomodoro cards lose `elevation` (Android only; iOS ignores it).** Android draws an elevation shadow at
  its own strength in `shadowColor` and ignores `shadowOpacity`, so Swift's 6% blue shadow became a blue
  ring, and the 92% white card let the shadow show through as a grey inner panel. The 1pt stroke carries
  the edge, as Swift's barely visible shadow does.
- **Pomodoro chart minute labels sit on their grid lines.** They were spread evenly top to bottom, but the
  domain is 1.3× the tallest bar, so "6m" sat ~20 dp above its line. Both platforms.
- **Pomodoro trend chart: the picked bar's label sits on the bar** (`.annotation(position: .top)`), not at
  the top of the chart. Both platforms.
- **Pomodoro timer ring has no seams.** The ring's 180 segments overlap to close their gaps; the fading end
  of Swift's gradient is translucent, so every overlap doubled up into a visible stripe. Each segment is now
  its colour flattened over the 22% track on white. Both platforms.
- **Pomodoro plain buttons are ink.** "Back to Tasks", "Retry sync" and the bar's back, history and "…"
  glyphs were indigo; Swift's `.foregroundStyle(ink).tint(.indigo)` draws them in the ink. Both platforms.
- **Pomodoro menu glyphs.** `PopoverItem` takes an optional leading `icon` (+ `iconColor`), for
  `Button(_:systemImage:)`; the dashboard's Refresh and About these metrics use it. Callers without one are
  unchanged.
- **Pomodoro session details** sit below the status bar on Android (a `pageSheet` `Modal` is full screen
  there) and title their section as written ("Focus time"), as iOS 26 does.
- **Pomodoro keeps a dark status bar in dark mode**, as the chooser and guides do (§23): the dashboard is
  `.preferredColorScheme(.light)` and the timer is drawn light, so white icons vanished.
- **Pomodoro period chips are single-line.** After a reload "This Week" drew as "This" even with `Text`'s
  1 dp slack (3 px at this phone's density): this phone's variable system font let the draw pass break at
  the space. `numberOfLines={1}` keeps Android's layout on one line.
- **Text's Android slack adds to the caller's padding and margin (shared, Android only).** `Text` gives every
  label one device pixel each side (§ global fix 6) as `paddingHorizontal: 1` / `marginHorizontal: -1`, and
  React Native lets the axis props beat the `padding` / `margin` shorthand whatever the order, so a label
  styled `padding: 16` lost its horizontal padding. It now reads the caller's sides and adds the pixel to
  them; a side in percent or `auto` is left as the caller set it.
- **Calorie Tracker plain buttons and glyphs are ink**, as Pomodoro's: text buttons, the bar's back and close,
  the day chevrons, the Add-to-log circles, the summary icons and View Insights. Pickers and switches keep
  the system indigo (`.tint(.indigo)` on those controls).
- **Calorie Tracker numbers are grouped** ("2,000 kcal", goal fields "1,000") as SwiftUI's localized
  `Text("\(n)")` and `.number` print them; strings Swift builds as plain `String`s (the chart's
  accessibility label, the Insights averages) stay ungrouped, as in Swift.
- **Calorie ring gradient follows the ring's rotation.** Swift strokes the gradient and then rotates the
  ring −90°, so the gradient turns too; the arc runs teal at 12 o'clock to blue at 3 o'clock.
- **Calorie charts centre their bars** in the 155-tall frame; **the robot art is full width** (centred);
  **the Stepper is a capsule**; **cards lose `elevation`** (Android only, as Pomodoro's); the setup's Time zone
  and Agent voice pickers show only their value, as Swift's.
- **Add Food** sits below the status bar on Android and titles its section "Food" / "Sample meal".
- **Calorie Tracker keeps a dark status bar in dark mode** (`FixedLightStatusBar`).
- **A disabled `FormToggle` dims only its switch** (shared). The row and the switch were both at 40%, so the
  switch was dimmed twice and the label greyed out, where iOS keeps a disabled Toggle's label at full colour.
  **A disabled `IOSSwitch` thumb has no `elevation`** (Android only): Android drew the shadow at full strength
  through the translucent thumb as a grey smudge.
- **Review schedule stacks its two buttons when a label wraps.** Swift's `ViewThatFits` measures each button
  at its one-line width; at 360 dp "Confirm Schedule" needs two lines at half the row, so the pair stacks,
  each full width. Detected from the laid-out line count (`onTextLayout`).
- **Schedule confirmed's bar takes the page colour** (`#F7FAFF`) instead of showing the Moments backdrop.
- **Choose Festivals region cards**: the radio mark sits over the card's top-right corner instead of taking
  its own column, so "celebrations" keeps its width at 360 dp (Android broke it mid-word); the cards are white
  (`.secondarySystemGroupedBackground`); "All regions" is ink.
- **Ink, not the tint, under an outer `.foregroundStyle`**: the Manage Moment info glyph and the calling
  guide's "Back to settings".
- **A module's first screen has the tinted back** (Important Moments, My Lists): Swift leaves the module with
  a toolbar `Button`, which takes the root's indigo tint; pushes deeper keep the system back in ink.
- **My Lists draws its large title** as content (`headerLargeTitle` is iOS-only).
- **Shopping Detail's options menu is the shared popover** (anchored, no dimming, the Share glyph);
  `PopoverItem` gains `disabled`, drawn in `.tertiaryLabel`, and a glyph column is kept for every item when
  any item has one. Offer badges carry the row's disclosure chevron.
- **Glass circles** on the Shopping "…", the alternatives sheets' xmark, and Item Details' back and star (ink).
- **Item editor's large title** is pulled up into the bar on iOS only; on Android the bar sits above it.
- **Weekly email**: Time is a captioned box with a pill (`ClockField variant="pill"`), and a `DateField` with
  an empty label draws only its pill, at the leading edge.
- **List Settings' pages have the system back** (`SheetButton` `icon: 'back'`): an ink chevron on a glass
  circle, as a push inside Swift's sheet `NavigationStack`, so the title stays centred.
- **`arrow.up.left` points up-left** (`TaskSymbol` turns Ionicons' up arrow −45°): Ask's suggestion rows.
- **Ask landing: two cards per row on narrow phones.** 48.8% + gap + 48.8% overflowed below ~330 dp and the
  grid fell to one column; 45% with `flexGrow` fits any phone.
- **`FittedText` measures explicit lines and keeps the ellipsis** (shared): a label with a line break must
  fit line by line; `adjustsFontSizeToFit` is iOS-only now, because on Android it fitted nothing and
  switched off the trailing ellipsis, so a label too wide at the minimum scale was clipped silently.
- **Ask landing in dark mode** sits on white with a dark status bar: it keeps its fixed light text (§24),
  which was invisible on the dark page behind its translucent gradient.
- **No `elevation` under translucent cards** on Help, Event Details and the brief section pages (Android
  only): it showed through as a lighter inner panel. iOS keeps Swift's faint shadow.
- **`GradientButton gradient="save"`** draws `NexdoTheme.saveGradient` (blue → indigo → magenta), which
  `NexdoGradientButtonStyle` uses: Feedback's Submit and Change password. Auth keeps the brand gradient.
- **`StatusBarScrim`** (Android only) on Today and Calendar: the page's own backdrop, cut to the status-bar
  height and drawn over the scroll, so scrolled text no longer runs through the clock. iOS 26 does this with
  its scroll-edge effect.
- **A hairline instead of a shadow** on Help, Event Details and the brief section cards (Android only):
  without the elevation (above) the near-white cards vanished into the page's white end.
- **Event Details' "…" menu** carries Swift's glyphs.
- **Task Details has no stack bar** (both platforms): Swift hides it and closes with the header's xmark; the
  bar's Close duplicated it. Android insets the content below the status bar.
- **Nexdo Action's link buttons are ink** (`.foregroundStyle(Color.nexdoInk)`), and **Contact details** has a
  large title over the form instead of a bar title.
- **Today's action card and pager buttons are ink** (`ActionGlass`'s `.foregroundStyle(Color.nexdoInk)`);
  **"Find my next task"** draws the save gradient (`NexdoGradientButtonStyle`).

## 29. Android bug pass: the §22 "For the team" bugs fixed in RN first (2026-10-07)

Bugs the RN app copied from Swift on purpose (`docs/IOS_TO_REACT_NATIVE.md` §22 "For the team"); the owner
decided Android fixes them first. Every item here is **Android ahead of iOS**: the code is shared, so iOS RN
gets the fix too, and the Swift app is to mirror it. Each fix has a test that fails without it.

- **Android ahead of iOS: editing a logged food keeps its nutrients.** The food editor sent `kcal` on every
  Save, and the server treats any `kcal` as a manual correction (source MANUAL, every macro and micronutrient
  cleared), so renaming "Salmon" or moving it to another meal lost its protein and vitamin D. An edit now sends
  `kcal` only when the number changed (`CalorieTracker.tsx`, `onSave`).
- **Android ahead of iOS: Send Now checks Messages only for the recipients set to Messages.** With Messages
  unavailable, any recipient with a phone stopped the whole send, so a recipient set to Email was not sent
  either. Now only the recipients whose channel is Messages need it: the others are sent, the composer is not
  opened on a device without one, and the error names who was left out ("Messages is not available on this
  device. No greeting has been sent to Lee." — new text, Swift's sentence with the names added). When every
  recipient needs Messages, Swift's message is unchanged (`ScheduleReview.tsx` `sendNow`,
  `sendImmediately(skip)`).
- **Android ahead of iOS: Send Now and Schedule confirmed wait for their sheet to close.** "Send email & open
  Messages" started sending while the Send now sheet was still sliding away, so the Messages composer could
  collide with it; and a confirmed schedule swapped the screen for Schedule confirmed under the open review
  sheet. Both now wait for the sheet to be gone: `LightSheet` takes `onClosed`, which is the Modal's
  `onDismiss` on iOS and, on Android (no `onDismiss`; the dialog is gone once the hide is committed), an
  effect on the hide. The jest Modal mock now calls `onDismiss` when an iOS Modal hides, and a test can hold
  those calls (`modalDismissals`, `jest.setup.js`).
- **Android ahead of iOS: the task agent card's "Phone number copied." and "Draft copied." are confirmations.**
  Swift puts them in `error`, so they read as errors, hid the search spinner while a run was searching, and
  turned the retired-question step's spinner into "Retry search". They now have their own line
  (`agent-notice`), in the same place and style, cleared by the next action or load (`TaskAgentCard.tsx`).
- **Android ahead of iOS: the task agent card's search sends the key the question asks for.** The search button
  always sent `key: "location"`; it now sends `question.key`. "Use …" still sends `location`, since it is only
  shown for that question. Swift's dead `question.key == "urgency"` title test was never ported (the card
  shows `question.text`), so there is nothing to remove in RN.
- **Already right on Android: an agent action fires no extra GET.** Swift keys its polling task on the run's
  status, so every action that changes it reloads at once. RN never copied that: the update writes its answer
  into the shared query and React Query's `refetchInterval` only re-arms the 4 s timer. A test now pins it
  (`TaskAgentCard.test.tsx`, "an action does not fire an extra load"); no code change.
- **Android ahead of iOS: a NO_RESULTS or CANCELLED agent run offers "Search again".** Both were dead ends: Swift
  offers nothing, and the server refused every action. The server now starts a new search from either
  (`f12ef09`, on develop since this pass began), so the controls row offers "Search again", which sends `retry`
  (`runControls` in `lib/taskAgent.ts`). A run cancelled because the task is no longer a business task is still
  refused, and the card shows the server's message.
- **Android ahead of iOS: "Search again" can search a new area.** On the phone, Search again re-ran the same
  failed search: it sent `retry`, and the server repeats the stored area. A NO_RESULTS or CANCELLED run now shows
  the existing "City or ZIP code" field, prefilled with the last area searched, and Search again sends `search`
  with the area in the field (accepted from either state since f12ef09); it is disabled while the field is
  empty. No new strings (`runControls`, `SEARCH_AGAIN_STATUSES` in `lib/taskAgent.ts`, `TaskAgentCard.tsx`).
- **Android ahead of iOS: the Calorie phone check says what the server did.** Swift always says it is calling and
  shows the code field. The server sends the code by voice or SMS (`channel`) and sends none for a number it
  has already verified (`alreadyVerified`). Now: by voice, Swift's words; by SMS, "We’ve texted a 6-digit code
  to …", "Text me again with a code" and a caption that says it texts; already verified, "… is already
  verified.", no code field, and the settings reload so the number shows verified (new text in each case).
  Before the first send the app cannot know the channel, so the caption and the first button still say
  "call" (`CalorieTracker.tsx`, `useCalorieStore.sendCode`, `useSendNutritionCode`).
- **Android ahead of iOS: "Call me now to try it" reports the real status.** Swift drops the answer's `status` and
  always says "Calling you now.". Now `dialing` keeps that text, `cancelled` says "The call was cancelled. Check
  that daily calls are on, then try again." and `failed` / `not_claimed` say "The call could not be placed. Try
  again in a few minutes." (new text; `callNowNotice` in `model.ts`).
- **Android ahead of iOS: "Read aloud" on a brief section page says why it did nothing.** With OpenAI sharing
  off, Ask sets its voice error, but that line is in the composer, which the brief hides, so nothing happened
  on screen. The brief's `read` handler now answers that message and the section page shows it under the
  items (`brief-detail-read-error`), in Ask's existing words ("Allow OpenAI sharing in Account to use Read
  Loud."). A playback failure later on still shows only in Ask (`briefHandlers.ts`, `BriefSectionDetail.tsx`).
- **Android ahead of iOS: Event Details shows Mark Complete or Mark Incomplete, whichever applies.** Swift's action
  row always shows both; the row now shows Mark Incomplete for a completed event and Mark Complete otherwise,
  as the ⋯ menu already did (`EventDetailsScreen.tsx`). The delete-with-warnings alert that dismisses twice
  (same §22 item) is Swift-only: RN's alert dismisses once.
- **Android ahead of iOS: Item Alternatives shows no zero differences.** Swift counts any change over 0.0001, so a
  few tenths of a gram showed as "↑ 0 g" in the comparison table and earned a label such as "Higher protein"
  (and passed that filter). A change that rounds to 0 at the table's whole units is now "= Same" and earns no
  goal (`difference` in `productFacts.ts`).
- **Android ahead of iOS: Item Alternatives does not offer the item itself.** The server's answer can include the
  item ("2% milk" for 2% milk); an alternative with the item's own name, ignoring case and spacing, is left out,
  and the empty states count only what is offered (`isOriginalItem` in `productFacts.ts`).
- **Android ahead of iOS: Nexdo Action tells "no contact", "Contacts access refused" and "lookup failed" apart,
  above the buttons.** Swift reads every lookup failure as "No contact selected. Choose a contact or enter
  details below.", so the "Allow Nexdo to access Contacts in Settings, then try again." guidance never showed,
  and the line sat under the buttons it calls "below". No match keeps Swift's text, refused access shows the
  Contacts guidance, any other failure says "Couldn’t look up this contact. Choose a contact or enter details
  below." (new text); the message line now sits above Choose contact / Enter contact details
  (`app/action/[id].tsx`, `lookupMessage`).
- **Android ahead of iOS: offline, a personal Nexdo Action does not need the business check.** With no saved
  contact, Swift asks the task agent endpoint first and stops at "Couldn’t check this task" when that fails,
  even for a plain "Call Asha". Now a failed check only stops a task whose business was already chosen; any
  other task goes on to Contacts, and only when nobody is found (it may still be a business) does it ask for
  the retry as before (`loadDestination`).
- **Android ahead of iOS: Nexdo Action's Contact details form prefills the name, not the phrase.** With no contact
  found it prefilled the task's words ("the plumber"); it now prefills the name as searched ("plumber",
  `contactSearchName`).
- **Android ahead of iOS: a contact picked for a Nexdo Action keeps its own labels.** Swift labels every picked
  address "Phone" or "Email", so "Choose a phone number" listed "Phone: …" twice for a mobile and a work number.
  A picked contact now maps as a contact found by name does ("mobile", "work"; "Phone" / "Email" only when
  unlabelled) (`selectedActionContact`). Swift's email composer ignoring the business draft (same §22 item) does
  not apply: a business has no email in RN or Swift (`businessActionContact`).
- **Android ahead of iOS: a cancelled or failed research run does not make a person task a business task.**
  Swift's Today card (and the Nexdo Action screen) counted any run, so a person task whose research was once
  cancelled showed "Find a business to contact". A business is now a chosen business, an eligible task, or a
  run that is not CANCELLED or FAILED (`isBusinessAction` in `lib/taskAgent.ts`, used by both screens so they
  agree).
- **Android ahead of iOS: Today's Dismiss and Remind later name the chosen recipient.** Their accessibility labels
  read the task's `contactName` ("Dismiss the plumber action") after a business or person had been chosen; they
  now use the chosen recipient ("Dismiss Ace Plumbing action"), as the card's title does (`TodayActions.tsx`,
  `SnoozeMenu recipient`). The other Today card items in §22 (a queue row whose task is not loaded, overdue
  minute rounding) were not in this pass.
- **Android ahead of iOS: closing Tasks search restores the filters it reset.** Opening search sets All dates,
  All time, All statuses and All priorities; Swift's close only clears the term, so the list stayed there. The
  store now keeps the filters from before the search, and closing (the magnifier or the field's xmark) puts each
  back unless it was changed during the search (`endSearch` in `lib/taskQuery.ts`, `useTaskQuery`).
- **Android ahead of iOS: a Tasks section caption no longer repeats its title.** For any day but Today, Yesterday
  and Tomorrow the title is already the date, and Swift drew it again underneath ("Friday, Sep 18" twice). The
  caption is now left out when it equals the title (`tasks.tsx`).
- **Android ahead of iOS: the Tasks row icon matches whole words.** Swift's keyword test is a substring test, so
  "Recall the order" got the phone and "contactless" the phone too. A keyword now matches a whole word or the
  word with a common ending (s, es, ed, ing, er, ers), so "Calling", "plumber" and "meetings" still match
  (`taskIcon` in `TaskCard.tsx`).
- **Android ahead of iOS: Schedule confirmed lists send times in time order.** Swift sorts the formatted labels, so
  a group with several times listed "Oct 10" before "Oct 6"; the plans are now sorted by their instant before
  labelling (`ScheduleSuccess`).
- **Android ahead of iOS: a yearly moment shows this year's occurrence.** Manage Moment read the stored
  `occurrenceDate`, so a birthday saved with the birth year read "Thu, Oct 6, 1990" in the header, the Moment
  card and Edit Moment. A yearly moment stored in an earlier year now shows its day in this year (29 February
  as the 28th in a common year); one stored for this year or later, and a one-off, show their own date. Edit
  Moment opens on the shown date, and a Save that leaves the date alone keeps the stored date and year
  (`shownMomentDate` in `dates.ts`).
- **Android ahead of iOS: Feedback's keyboard can be put away, so the rating and Submit are reachable.** Swift's
  form has no Done, no tap-outside and Return adds a line, so the keyboard covered the rating and Submit. The
  shared `KeyboardDoneBar` capsule now rides on the keyboard, as on the Moments and Shopping forms (and
  `FormScroll` already keeps the focused field clear of it); Return in the description still adds a line
  (`FeedbackScreen.tsx`).
- **Already right on Android: the list id is encoded in the offers and weekly email requests.** Swift's
  `ShoppingOffersView` and `ShoppingEmailView` put `listId` in the query raw; RN's `shoppingOffersApi.offers` and
  `shoppingEmailApi.get` already `encodeURIComponent` it. A test now pins both (`src/api/shoppingListId.test.ts`);
  no code change.
- **Android ahead of iOS: Stores Near You says "your phone’s Settings", not "iPhone Settings".** Now
  "Location is unavailable. Enter a city or ZIP code, or allow location access in your
  phone’s Settings." (`LOCATION_UNAVAILABLE` in `StorePages.tsx`).

## 30. Android bug pass 2: the remaining §22 items (2026-10-07)

The rest of `docs/IOS_TO_REACT_NATIVE.md` §22 "For the team", fixed in RN first. Every item is **Android ahead of
iOS**: the code is shared, so iOS RN gets it too, and the Swift app is to mirror it. Where `fix/ios-bug-pass`
already had the fix, its Swift wording is copied; any other new text is listed in §22 "Android wording for iOS to
match". Logic fixes have a test that fails without them.

- **Android ahead of iOS: Moments weeks start on Monday.** The date chips (This Week, Later) and the Upcoming
  groups (This Week, Next Week) used Swift's `Calendar.current` week, Sunday-first on en-US, while Pomodoro and the
  Calorie Tracker are Monday-first. Both now start on Monday, so a Sunday moment is "this week" (`daysSinceMonday`
  in `features/moments/dates.ts`).
- **Android ahead of iOS: Daily Brief section counts count items, not "nothing" bullets.** The badge and the page
  subtitle counted every bullet, so "Upcoming Deadlines 2" sat over "No deadlines appear to fall today". Ported from
  iOS 9f32f13: a bullet that only says there is nothing ("No …", "None.", "Nothing …", "There are no …", "You have
  no …") is shown but not counted; the badge is hidden at zero and the page says "Nothing to review" / "Nothing to
  focus on" (iOS wording) (`briefItemCount` in `lib/dailyBrief.ts`).
- **Android ahead of iOS: "Connect me" says at the switch when the number is unverified.** The switch was disabled
  with no reason for an unverified caller ID; only the card above said to verify. It now says "Verify your phone
  number above to turn this on." in orange under the switch while the number is unverified and the moment has not
  passed (iOS 15e82f7 wording and condition) (`MomentConnectSection.tsx`).
- **Android ahead of iOS: Stores Near You says "no stores" only about a finished search.** An empty result shared
  the grey "No stores found. Try another location or store name." line with "no search yet", and it showed during
  the 600 ms wait too, so it flashed before every result. As iOS 118ede8: a search that came back empty shows a
  card, "No stores found near <area>" (or "near you") and "Check the city or ZIP code, or try a nearby one." ("…
  and the store name, or try a nearby area." with a store name); before any area or location the prompt shows; and
  nothing shows while a search is pending (`StorePages.tsx`).
- **Android ahead of iOS: Item Alternatives shows a clear error state with Try again.** A load that failed before
  any result showed one red line and a small "Try again". As iOS 3400481: a card with a warning glyph, "Couldn’t
  load alternatives", the reason and a full-width Try again; with alternatives already on screen the error is a
  failed save, which a reload would not fix, so it stays an inline message without Try again
  (`AlternativesSheet.tsx`). The local fallback stays removed (a product decision; open).
- **Android ahead of iOS: the Calorie Tracker guide promises only what the tracker does.** "Quickly add what you eat
  by search, scan, or voice" and "Choose a goal like maintain, lose, or gain" described a food search, a barcode
  scan, in-app voice entry and a goal type that do not exist. Step 1 now reads "Add what you eat to your food log,
  or tell us on your daily check-in call. We estimate calories and nutrition from the call." and step 2 "Personalize
  your daily calorie and macro targets."; the rest is unchanged (`WellnessModuleGuide.tsx`; new text, in §22's
  wording table).
- **Android ahead of iOS: Shopping Recommendations promises no approval step.** The intro said "Suggestions only—your
  list changes after you approve them.", but the answer has no approve or add control and never edits the list. It
  now says "Suggestions only—your list is not changed." (`AskNexdoView.tsx`; new text, in §22's wording table).
- **Android ahead of iOS: Pomodoro's labels.** The third tab read "Insights" until selected, then "Categories"; it is
  always "Insights" (iOS ae4e5f2). The completion screen said "Back to Tasks" even when Pomodoro was opened from
  Wellness; there it now says "Done" and only closes Pomodoro, back to the chooser, and "Back to Tasks" stays for
  the only other entrance, a tapped Pomodoro alert (iOS f6d6452 wording) (`PomodoroDashboard.tsx`,
  `PomodoroView.tsx`, `app/wellness/pomodoro.tsx`).
- **Android ahead of iOS: Today action times round one way and read in days past 48 hours.** Future times rounded
  up and overdue ages truncated (90 seconds: "in 2 min" before, "1 min overdue" after), and old actions read "257 hr
  1 min overdue". As `ActionTimeLabel` on fix/ios-bug-pass (bfedbd6, 0d7e89f): both round to the nearest minute,
  under a minute late is still "Due now", and from 48 hours an age reads "N days overdue" (`actionTimeLabel` in
  `TodayActions.tsx`).
- **Android ahead of iOS: Calendar says "1 calendar commitment today", singular** (iOS c8da5cb) (`calendar.tsx`).
- **Android ahead of iOS: the Replace confirmation ends at its question mark**, without the trailing space (iOS
  6129004) (`AlternativesSheet.tsx`).
- **Android ahead of iOS: "Item replaced!" keeps one button.** Done and View in Cart both only closed the screen;
  Done stays (iOS 77c3d93) (`AlternativesSheet.tsx`).
- **Android ahead of iOS: Task Details in business mode has one way out on screen, Close.** Its header had Back and
  Close, which did the same thing. Close stays, as iOS now does; Back is gone (an empty slot keeps "Task Details"
  centred), and the system Back gesture still closes the page (`BusinessHeader` in `app/task/[id].tsx`).
- **Android ahead of iOS: all four Account menu rows sit inside the card.** Only Change password had the card; Help,
  Feedback and "Edit profile and settings" sat bare on the background. The four share one card (iOS 6343e11)
  (`app/account/index.tsx`).
- **Android ahead of iOS: the task agent card's "Show more" appears only for a review that is cut off.** It showed
  under any review, however short. An invisible, unclamped copy of each review measures its lines
  (`onTextLayout`), and "Show more" shows only past three lines, or to collapse an expanded one
  (`TaskAgentCard.tsx`; fixed from code, needs a look on the phone).
- **Android ahead of iOS: Today then All during a Tasks search keeps the search's status.** Choosing All after
  another chip narrows to this month's open tasks; during a search that reset the search's All status to Open, so
  completed matches disappeared. As `TaskQuery.selectDate` on fix/ios-bug-pass (7fbc8f9), the narrowing is skipped
  while a search is open (`selectDate` in `lib/taskQuery.ts`, `tasks.tsx`).
- **Android ahead of iOS: Nexdo Action's unreachable Contacts search is gone.** `resolve()` kept Swift's search for
  an unknown recipient, but every caller has one (the channel buttons exist only once there is a recipient), so it
  could not run; its "Finding contact…" spinner could only have shown, wrongly, while completing the task. Both are
  removed; no behaviour change, so no new test (`app/action/[id].tsx`).
- **Already right on Android: Nexdo Action's "Choose contact" is white on its indigo fill.** Swift drew it black on
  dark indigo (the screen's ink foreground); RN's `ProminentButton` already uses `onTint` (#FFFFFF) on `tint` (indigo)
  in both palettes, as iOS a2c1699 now does. A test pins it in day and night; no code change (fixed from code, not
  yet seen on device).
- **Android ahead of iOS: during a Tasks search the tab bar does not sit above the keyboard.** iOS's bar rode up
  with the keyboard (iOS ac9c619 now keeps it under on Tasks). On Android edge to edge should already keep the window
  from resizing, but that varies by version and OEM, so the Tasks tab sets `tabBarHideOnKeyboard`: the bar is hidden
  while the keyboard is up; other tabs are unchanged (`app/(tabs)/_layout.tsx`; fixed from code, not yet seen on
  device).
- **Android ahead of iOS: Share List has a Done button.** It had no close button; only a swipe (or the system Back)
  closed it. A bold Done in the sheet's bar closes it (iOS 6e17c47 wording) (`ShareListSheet` in `sheets.tsx`; fixed
  from code, not yet seen on device).
- **"Item replaced!" is centred, as in Swift** (found on the phone during this pass). The success column stretches
  its children, so the title sat at the left while the message under it was centred; Swift's VStack centres both
  (`AlternativesSheet.tsx`).
- **The Read aloud consent message says "Read aloud", as iOS 29c0f0b.** With OpenAI sharing off, reading an answer
  or a brief section said "Allow OpenAI sharing in Account to use Read Loud."; it now says "…to use Read aloud."
  The Ask answer's own button still reads "Read Loud", as on iOS (`AskNexdoView.tsx`).
- **The Ask answer's read button says "Read aloud", as iOS 5ed717c.** It said "Read Loud"; "Stop" while reading is
  unchanged, and so is its accessibility label ("Read <section> aloud"). This replaces the note above that the button
  still read "Read Loud" (`AskResponse.tsx`).

## 31. Leftovers: the unloaded queue row (2026-10-07)

The last Android item in `docs/IOS_TO_REACT_NATIVE.md` §22 (Run B, Today card), ported from iOS b4fd9b6 with its
wording.

- **A Nexdo Actions row whose task is not loaded refreshes the tasks and opens it.** The row looked its task up in
  the loaded list and did nothing when it was not there. It now refetches the tasks and opens Task Details, or, if
  the task is still missing, says "Task not available" / "This task may have been completed, deleted or moved. Your
  task list has been refreshed." with OK (`open` in `app/action/queue.tsx`). The sheet builds its rows from the same
  loaded list, so on Android a row normally arrives with its task; the test injects a row ahead of its task to cover
  the gap (fixed from code, not seen on device).

## 32. Phase 13 plumbing (Windows) (2026-10-12)

Part 1 of Phase 13, built on `rn-phase-13` from `git diff 1938c7c origin/main -- ios/ src/ prisma/` (26 commits,
none in `mobile/`). Server trace and RN data layer only: no reference captures exist yet, so no screen was built or
restyled. These notes are for the Mac to fold into `docs/IOS_TO_REACT_NATIVE.md` §23. Jest 2,406 → 2,545; `tsc`
and ESLint clean; `src/api/phase12Nulls.test.ts` now also covers the follow-up save and reschedule, the bug report
(with and without a screenshot), the settings PATCH with `workingDays`, and the shopping save with `storeLogoData`.

### What each module added

1. **Follow-up preparation (6f079c0).** `api/followUp.ts`, `features/followUp/model.ts`, `query/useFollowUp.ts`.
   `GET/PUT /api/tasks/{id}/preparation` is compare-and-set on `revision`; a stale save is 409 "This preparation
   changed on another device. Reopen it before saving." unless the preparation is byte-identical, which answers the
   stored envelope. `useSaveFollowUp` is Swift's `save(then:)`: save first, then complete or reschedule (schedule
   warning retry included); `recordOutcome` appends the outcome once so a retry does not duplicate it. Also from the
   same commit: `TaskAction.preparation` survives a reschedule, and the detector strips one lead-in ("I need to",
   "I have to", "I want to", "please", "remind me to").
2. **Bug reports (d511fef, a13461a, da57b57).** `features/bugReport/model.ts`, `bugReportApi` in `api/feedback.ts`,
   `useSubmitBugReport`. The frozen first request is resent on retry (idempotent on `id`, same `BR-000000`
   reference). Caps: body 2,850,000 bytes (413 "Screenshot is too large."), base64 2,800,000 characters, decoded
   image 2,000,000 bytes, PNG/JPEG only, re-encoded by the server to ≤1170×2532 JPEG; kept 7 days (report 90).
   `screenshot` is omitted, never null. `bugFailureMessage` is a13461a: 404 → "not available on this server yet",
   SIGNED_OUT → "sign in again before sending your report", NETWORK → "check your connection", other API errors →
   the server's text, anything else → "try again later". `bugDiagnostics` clamps values to `bugSchema`'s regexes.
   Shake-to-report needs an accelerometer module the app does not have (expo-sensors); only the gate and the
   `bug.shake.<owner>` key are ported.
3. **Moments in Calendar and Tasks (bb57e09).** `features/calendar/momentSchedule.ts` (read-only `moment:<id>:<day>`
   projections, never saved; 29 February on the 28th in common years; off and archived moments hidden) and
   `features/calendar/dayIndex.ts` (`CalendarDayIndex`: every task and event filed by day once per refresh).
4. **Calendar events, readiness and retries (bdb68ce, b61801c, 08be688).** `lib/deviceCalendarEvent.ts`,
   `lib/permissionAccess.ts`. A device all-day event is read in its own zone by `eventOccursOn`; device events have
   no server record (`eventHasServerRecord`). `useCalendarConnections` now treats a failed refresh as an error that
   KEEPS the accounts on screen (15 s, one attempt, "Could not refresh calendar connections. Please try again."),
   where it used to blank the list. Server retry safety, documented on the client: a second DELETE of a
   tombstoned event answers 200 and pushes again; a POST repeated with the same `requestId` only conflict-checks
   occurrences not yet saved, so a retry after a dropped response must resend the same id.
5. **Tasks ordering and spacing (d568989).** `features/tasks/displayOrder.ts` (per-account
   `nexdo.taskDisplayOrders`, display only, Moments never move), `creationSpacing.ts` (15 minutes either side of
   open scheduled tasks, new tasks only, a time from the title wins), `workingDays.ts`. New fields:
   `ProfilePreferences.workingDays`, `DoNowNext.outsideWorkingDay`. `mobile/src/api/tasks.ts` does not exist (task
   endpoints live in `api/index.ts`) and `/api/tasks` gained no field, so nothing changed there.
6. **Shopping (bdb68ce, bb57e09).** `offerPricing.ts` (before-discount price only from an exact USD price and a
   fixed USD discount, in cents), `storeHoursDay.ts` (today by the store's `utcOffsetMinutes`, now returned by the
   hours route), `listLogo.ts`. `storeLogoData` is now sent on every save as Swift does — the logo, or `""` to
   clear — and List Settings drops the logo when the store name is typed or a store is picked (a one-field state
   change in `ListSettings.tsx`, no layout change). The logo editor waits for captures; `StoreBrandLogo.tsx` does
   not yet prefer the custom logo.
7. **Guides once per sign-in (8f7e492, 2edb3f0).** `store/wellnessGuides.ts`: in memory, emptied by
   `finishAuthentication` and whenever the signed-in account changes or signs out, kept through a profile refresh.
   `enter(kind)` decides once per entrance. The guide screens do not call it yet.
8. **Profile and settings (08be688, 12bb9d4, 4185501).** `parseCalendarCallback`: only `nexdo://calendar-connected`
   (or Android's `nexdo:///…`) with `calendar=<provider>-connected` is connected; anything else is "Unexpected
   calendar sign-in response" or "Calendar connection was not confirmed". A password reset confirmed while signed in
   ends the session. `morningEmailExplanation` (6 a.m. in the profile zone). Two Settings test fixtures used
   callbacks the stricter rule rejects and were corrected.
9. **Pomodoro and voice (bb57e09, 94da063).** `personalWork` category (blue, last in the list, so it now shows in the
   picker) and `tick()`, which never chimes twice for one boundary. The monthly voice limit: a 429
   `VOICE_MONTHLY_LIMIT_REACHED` is an `ApiError` with that code and the usage receipt; voice start shows the server's
   message instead of "Couldn't start voice…" (Swift shows `localizedDescription`), and `/api/speech` reports it.

### Native requirements (recorded, not added)

- **Crashlytics (4185501, `ios/CRASHLYTICS.md`, `NexdoCrashReporting.swift`).** Swift enables collection at launch
  when Firebase is configured, sets one custom key `build_configuration` = `debug`/`release`, and (Debug only) a
  `-nexdo-crashlytics-test-crash` launch argument that crashes after 5 s with `controlled_test` = true. No account
  ids, descriptions, screenshots or tokens are attached; bug reports stay separate. Android needs
  `@react-native-firebase/crashlytics` (same major as the `app`/`analytics` 26.x already present) and its config
  plugin, which adds the `com.google.firebase.crashlytics` Gradle plugin; `google-services.json` is already wired.
  Then: `setCrashlyticsCollectionEnabled(true)` and the same custom key at startup, mapping-file upload for R8
  release builds, a debug-only crash trigger, and per-member Firebase alert subscriptions for the Android app.
  Needs a new native build.
- **Device calendar (`ios/App/AppleCalendarService.swift`).** iOS reads EventKit with FULL access (write-only asks
  again), lists calendars sorted by account then title, keeps a per-account selection
  (`nexdo.apple-calendar.selection.<owner>`; none saved = all, empty = none), reads events in the visible range,
  skips cancelled ones, dedupes by id, and shows them read-only beside server events with "Edit this event in Apple
  Calendar". It also refreshes on foreground and on store changes. expo-calendar (already present) can supply this
  on Android: `requestCalendarPermissionsAsync`, `getCalendarsAsync(EntityTypes.EVENT)`, `getEventsAsync(ids, start,
  end)` (cancelled events by `status`), feeding `makeDeviceCalendarEvent`. Android only needs READ_CALENDAR;
  WRITE_CALENDAR stays blocked. Open points: the label ("Apple Calendar" is iOS copy), and whether to keep the
  `apple-device` source string on Android (the code keys on it). No change-notification equivalent to EKEventStoreChanged
  — re-read on focus.
- **Bug report screenshot.** react-native-view-shot (already present): `captureRef` of the app root with
  `{ format: 'jpg', quality: 0.7, result: 'base64', width: min(1170, window width) }`, the report sheet hidden first,
  refused while a `secureTextEntry` input is mounted, and `screenshotFits` checked before `includeScreenshot`. No new
  native module. Shake-to-report (with iOS's new `NSMotionUsageDescription`) would need expo-sensors.

### Server findings for the team list

- `src/server/feedback/bugs.ts:16` — `deviceModel` accepts only `[A-Za-z0-9, ._-]` and the OS field is named
  `iosVersion`. Android model names can carry `+`, parentheses or non-Latin letters, and any miss is answered with
  the unrelated "Enter a description of 1–2,000 characters and review screenshot consent." (`route.ts:21`). The RN
  client clamps to work around it.
- `src/server/feedback/bugs.ts:80` — `BUG_REFERENCE_UNAVAILABLE` falls through `jsonError` to 500 "Request failed."
- `src/app/api/tasks/[id]/preparation/route.ts:14` — a malformed JSON body throws a `SyntaxError` that is neither a
  `ZodError` nor `FOLLOW_UP_CHANGED`, so it is 500 "Request failed." instead of 400.
- `src/app/api/speech/route.ts:21` — read-aloud of Ask answers is blocked once realtime minutes run out, although
  TTS is not counted toward those minutes. Possibly intended; worth confirming.
- `src/app/api/settings/route.ts:29` — `workingDays` accepts duplicates and any order ("1,1,5,0"). Harmless today.

### Outside the nine modules

Server/admin/web only, no client change: Ask Nexdo analytics (Firebase/Amplitude grounding, funnels, prompts —
28dbd98, 56047fc, 6539021, a5eb75b, 4325e57), AI API cost receipts and the admin pages (94da063, migration
`20261010140000_ai_api_receipts`), the admin bug-report pages (3c47d20, 058ae50, 9e3a3ae), the Inbox palette
(978f61a), morning summary and welcome/bug emails (375f28e, 71c0de4, 12bb9d4), `/reset-password` page. With client
impact but no RN change needed: the temporary Google unverified-app notice (105146f) — the calendar and Gmail OAuth
starts may show a notice page first; its Cancel lands on `nexdo://calendar-connected?calendar=error&detail=Connection
cancelled.` or `nexdo://moments-email?status=error`, which the existing callback handling already treats as a
failure; Gmail connect now also fails when `gmail.send` was not granted. iOS UI only, for the captures pass:
calendar connection onboarding (08be688), Today attention sheet, Ask landing, dark-mode Wellness chooser
(4185501), Today's schedule now three items with in-place "View N more" / "Show less" (helpers in
`features/tasks/workingDays.ts`), Do Now's "Today isn't a selected working day", Settings "Working days", "Forgot
password?" under Change password, and the account-deletion overlay. The voice prompt gained follow-up guidance
(server only).

## 33. Phase 13 Run A (Windows): small screens from Swift source (2026-10-12)

Built from `git diff 1938c7c origin/main -- ios/` on `rn-phase-13`, on top of the §32 plumbing. No reference
captures exist; each item follows the Swift source's strings, states and order. Jest 2,545 → 2,572; `tsc` and
ESLint clean. **Item 10 adds a native module: a new Android build is required** (see its row).

| # | Swift source | Built | Deliberate Android difference |
|---|---|---|---|
| 1 | RootView.swift:1502 (`scheduleExpanded`), :1507-1515 (`visibleSchedule`), :1624-1633 (button), :1645 (`.onChange(of: range)`) | Today's schedule card shows three rows; "View N more" expands it in place and "Show less" folds it (was seven rows and a jump to Calendar). Hints "Shows all schedule items here" / "Shows the first three schedule items". Changing the range folds it. Search still shows every match. `TodayIntelligenceCard.tsx` | None. The 0.2 s ease is a `LayoutAnimation` (opacity); 44 pt touch target as Swift's `minHeight: 44`. |
| 2 | DoNowView.swift:50 | Do Now's window line: "Today isn't a selected working day" before "Outside your working hours" before "You have … free now" (`doNowWindowTitle`). | None. |
| 3 | ProfileView.swift:320, :658 (`WorkingDaysField`) | Settings → Profile and time: "Working days" heading, seven `SettingsToggle` rows Sunday first, the caption "Choose at least one day. Find my next task uses these days and your working hours.", between Time zone and Working hours. The last day on is disabled. Unset reads as Mon–Fri; `workingDays` is only sent once a day is toggled. `SettingsToggle` gained `disabled`. | Swift uses toggles, so the shared toggle row is reused rather than a chip row. On Android the heading takes the shared field-label style (§4, §5), like "Working hours" under it. |
| 4 | ProfileView.swift:192-195 (`Forgot password?`), :204-206 (`.sheet { PasswordResetView(initialEmail:) }`); NexdoApp.swift:228 (`if profile != nil { await reset() }`); RootView.swift:711 (`PasswordResetView`) | "Forgot password?" row under Change password's fields opens the existing reset screen as a modal in the Account stack (`app/account/reset-password.tsx`), prefilled with the account email. Signed in, a confirmed reset closes the presented screens, ends the session, opens Sign in and shows "Password updated" / "You can now sign in with your new password." Signed out, unchanged. | Swift's alert sits in a sheet the reset tears down; here it is shown over Sign in, so it is actually seen. |
| 5 | ProfileView.swift:433-444, :682-697 (`AccountDeletionPresentation`) | "Deleting account…" with a spinner on a material card over Settings while the delete runs; the screen is disabled and cannot be dismissed (already true), a second Delete is ignored, and a failure alerts "Couldn't delete account" with the reason (or "Please try again."). | The material is the same opaque stand-in Ask's "Working on it…" uses. |
| 6a | RootView.swift:2297-2302; TaskCreationSpacing.swift:6-21 | New Task: the date pill's time moves to the first opening with 15 minutes either side of open, scheduled tasks; a time in the title is used as written. TODO removed. | None. |
| 6b | AddTaskByVoiceView.swift:50, :97-104, :225, :278-289; PermissionAccess.swift (`VoicePermissionGate`) | Voice asks for the microphone BEFORE requesting a session; a refusal shows "Microphone access is off. Enable it in Settings to use voice, or close this screen to type." with an "Open Settings" button; closing during the prompt cancels quietly; going to Settings while idle no longer backgrounds the session. | The permission comes from expo-audio (already installed); "Open Settings" opens the app's Android settings page. The button is a filled capsule standing in for `.borderedProminent`. |
| 7 | WellnessChooserView.swift:46-49; WellnessModuleGuide.swift:139; NexdoApp.swift:374, :872 | A module card opens its guide only the first time this sign-in enters that module, then the module itself (`openModuleGuide` + `useWellnessGuides.enter`). Leaving a guide with Back still counts as seen; each module is separate; a new sign-in shows them all again. | None. |
| 8 | WellnessChooserView.swift:8-17 (`isDark`, `ink`), :63-75 (hero moon), :83-118 (cards), :119-126 (`darkAccent`), :127-137 (bar); WellnessModuleGuide.swift:102 | The chooser follows the theme as Swift now does: near-black gradient, white ink, `darkAccent` colours (#59E59E, #FFA861, #B8A6FF, #FF7AB3), system-surface cards and bar, a lilac moon instead of the pack art (which is multiplied onto white), and no forced-dark status bar. Light is unchanged. New theme token `tertiaryBackground`. **Supersedes §23's "fixed light in both themes" for the chooser.** The module guides stay fixed light: Swift still forces `.light` on them (:102). | Swift raises the card stroke to 0.65 under Increase Contrast; Android has no such setting, so it stays 0.32. The moon is Ionicons `moon`, which has no stars; checked against the Mac’s `wellness-chooser-v3-dark.png` (2a587c7), which otherwise matches. |
| 9 | StoreBrandLogo.swift:15, :32, :63-65; ShoppingViews.swift:109, :241 | `StoreBrandLogo` shows the list's own logo (`storeLogoData`) first, labelled with the store name, without asking for the brand; one that can't be drawn falls back to the brand lookup. Passed from My Lists and the list header. The logo editor waits for captures. | None. |
| — | CalendarEventDetailsView.swift:21, :44 | Device-calendar decision, label only: Android names it "Phone calendar" and the note "On this phone · Edit this event in Phone calendar."; iOS keeps Swift's. The source value stays `apple-device`. The expo-calendar reader waits for the Calendar run. | The label, by decision. "On this iPhone" also became "On this phone" so the line is not iPhone-specific (**for Sri**). |
| 10 | NexdoCrashReporting.swift:1-23; NexdoApp.swift:19; ios/CRASHLYTICS.md | `@react-native-firebase/crashlytics` 26.4.0 (same as app/analytics) and its config plugin. At launch (`app/_layout.tsx`, module scope): collection on and one custom value, `build_configuration` = "debug"/"release" — no user id or account details. `firebase.json` sets `crashlytics_debug_enabled: true` so debug builds report, as Swift's Debug builds do. Debug-only test crash: developer menu "Crashlytics test crash" → `controlled_test` = "true", a log line, and a native crash 5 s later; compiled out of release. `src/lib/crashReporting.ts`. | React Native has no launch arguments, so the test crash is a developer-menu item instead of `-nexdo-crashlytics-test-crash`. RNFB also records fatal JS errors (its default); Swift has no JS layer. |

### Item 10: what the native build changes

- **A new Android build is required**; an OTA/JS update does not add the SDK.
- `expo prebuild` adds, via the plugin, `classpath 'com.google.firebase:firebase-crashlytics-gradle:3.0.8'` to
  `android/build.gradle` and `apply plugin: 'com.google.firebase.crashlytics'` to `android/app/build.gradle`
  (checked by running the plugin's own transforms on the current generated files; `android/` is not tracked).
- **R8 mapping upload:** release builds are not minified today (`android.enableMinifyInReleaseBuilds` defaults to
  false in `android/app/build.gradle:69`), so there is no mapping file and stack traces are readable as is. If
  minify is turned on, the Crashlytics Gradle plugin uploads the R8 mapping for each minified release build by
  default (`mappingFileUploadEnabled`), which needs network access and the Firebase project credentials at build
  time; keep the mapping files of every distributed build. NDK symbol upload is not enabled (no native crash
  code of our own).
- Verification on a device, mirroring CRASHLYTICS.md: install a debug build, open the developer menu, choose
  "Crashlytics test crash", wait for the crash, relaunch to upload, and look for it under the Android app in
  Firebase project `nexdoapp-19f07` with `build_configuration = debug` and `controlled_test = true`. Alert
  subscriptions are per member and per app, so the Android app needs its own.

### Needed a capture after all

None of the ten items. Not built, as asked: the shopping logo editor and the expo-calendar device reader. The
bug-report screen tags (`.bugReportScreen`) on the Wellness destinations wait with the bug-report screen.

## 34. Phase 13 Run B (Windows): Bug report (2026-10-12)

Report Bugs, built from the Swift source (d511fef, a13461a, da57b57) and the Mac's `bug-report-*` captures
(2a587c7) on top of the §32 data layer. Jest 2,572 → 2,615; `tsc` and ESLint clean. The submit with and
without a screenshot was already in `phase12Nulls.test.ts` (§32). **Item 7 adds `expo-sensors`, a native
module; the new Android build Crashlytics already requires (§33) covers it.** No report was sent to any
server: the tests mock the client.

| # | Swift source | Built | Deliberate Android difference |
|---|---|---|---|
| 1 | ProfileView.swift:84-89, :103 | Account card in Swift's order: Edit profile and settings, Feedback, Help, **Report Bugs** (`ladybug`), Change password. Report Bugs opens the report over My Page, tagged `settings`. `app/account/index.tsx` | None. (The row order had been the pre-6f079c0 one.) No signed-in capture exists for this row; built from source. |
| 2 | BugReportView.swift:22-80 (`body`), :82-101 (`introduction`), :200-211 (`BugArtwork`) | Introduction as captured (`bug-report-intro`, `-dark`): NexDo header with the calendar badge, the bug artwork, "Report a bug?", the explanation, the **Shake iPhone to report a bug** toggle, the heart card, "Together we make NexDo better!", **Report Bug** in the capsule bar, ×. `src/features/bugReport/BugReportScreen.tsx` | The artwork regions are cropped once from Swift's `bug-report-pack` (same rects, `assets/bug-report/`) rather than shipping the 1.5 MB atlas. Ionicons has no radio-waves phone, so the toggle's glyph is a plain phone. **For Sri:** "Shake iPhone…" is kept word for word. |
| 3 | BugReportView.swift:103-162; BugReportCoordinator.swift:80-87 | "Report app issue": "What happened?", the guidance, the editor capped at 2,000 UTF-16 units with "N / 2000", the screenshot toggle, "What we'll include" (app version and build, device model, OS version, current screen, timestamp, correlation id — exactly what is sent), the retention note, **Contact support** (`mailto:support@nexdoapp.com`), Back, × with "Discard this report?" (**Discard Report** / Keep Report), **Send** grey until the description is non-blank. | Device values come from `Platform.constants` (Android `Build.MODEL`, `Build.VERSION.RELEASE`) and expo-constants (version, build): expo-device and expo-application are not installed and are not needed for these four values. The model is cleaned to the server's characters (§32); this app's "1.0.0-rc.1" is sent as "1.0.0" (the server refuses pre-release versions). The discard confirmation is an alert (iOS 26 shows a popover). Android's back acts as Back on the form and × elsewhere. **For Sri:** the "iOS version" label is kept word for word. |
| 4 | BugReportCoordinator.swift:52-65; BugReportView.swift:72-75, :180-183 | The screenshot: consent alert ("Include a screenshot?", **Include Screenshot** / Cancel), then the 145×260 preview, "Screenshot captured", "Review for private information before sending.", **Retake**, **Remove Screenshot**; on a secure screen, "Screenshot unavailable on this screen. You can still send your description." `react-native-view-shot` of the app root, JPEG 0.7, `scale = min(2, 1170 / width)`, behind `screenshotFits`. | **Captured before the modal opens**, held, and attached only on consent: a React Native modal hides the screen beneath, which Swift draws by hiding its own overlay. Retake therefore re-attaches that same capture. Secure screens are a flag (`useSecureScreen`), not a tree search. |
| 5 | BugReportView.swift:64-70, :144-147, :165-178, :183-195; BugReport.swift:35-42, :54-69 | "Sending report..." over a dimmed screen; on failure the red message and "Your report is preserved. Retry sends the same report safely.", the editor and toggle locked, **Retry Send** resending the frozen request and id; success with the artwork, "Thanks for helping improve NexDo!", "Your bug report has been received.", the Reference ID card, **Copy reference** → **Reference copied**, **Done**. Every a13461a message through `bugFailureMessage`; a server rejection (for example its description/consent message for a bad device model) shows the server's own words, as Swift's `localizedDescription` does. | Android's clipboard has no local-only or expiring item, so the reference is cleared after 120 s if it is still what is on the clipboard. |
| 6 | BugReportCoordinator.swift:41-79, `BugScreenTag` :83-92; RootView.swift:97-120 | `app/bug-report.tsx`, a `fullScreenModal` inside the signed-in guard with gestures off, opened by `openBugReport` over any screen and closed back to it; one at a time, only signed in. Screen tags from the route (`screenForPath`): today, tasks, calendar, askAI, wellness (chooser and guides), shopping, moments, calories, pomodoro, settings (Account); an untagged route keeps the last tag. `src/features/bugReport/coordinator.ts`, `useBugReportHost.ts`. | Tags follow routes rather than view modifiers. On iOS a native modal presented over another is not part of the root capture (iOS ships Swift). |
| 7 | BugReportCoordinator.swift:16-39; BugReport.swift:44-51; Nexdo-Info.plist:5-6 | Shake to report: expo-sensors accelerometer at 10 Hz, a jolt over 2.7 g at most once every 8 s, only while the intro toggle (`bug.shake.<owner>`, off by default, per account) is on, the app is active, someone is signed in, no report is open and this is not a sign-in screen. | `AppState` stands in for `scenePhase`. Android needs no permission at 10 Hz; iOS gets Swift's motion usage string through the expo-sensors plugin. |

**Secure routes flagged** (`useSecureScreen`, every screen with a password field): `/sign-in`, `/sign-up`,
`/reset-password`, `/account/reset-password`, `/account/change-password`. Only the last two can host a report
(the others are signed out, where neither the menu nor the shake opens one).

**Needed a capture that was not available:** the Account menu with the Report Bugs row is "needs sign-in" in §23
and was not captured; it is built from `ProfileView.swift:84-89`. Every bug-report screen had its capture.

## 35. Phase 13 Run C (Windows): Wellness & Shopping (2026-10-12)

The rest of the §23 Wellness and Shopping rows, from the Swift source and the Mac's captures (2a587c7), on the
§32 model code. §33 items 7–9 (guides once per sign-in, the chooser's dark mode, the custom logo in
`StoreBrandLogo`) were not redone. Jest 2,615 → 2,632; `tsc` and ESLint clean. No new native module: the
editor uses expo-image-picker, expo-clipboard and expo-image-manipulator, all already installed. The logo save
was already in `phase12Nulls.test.ts` (§32: `storeLogoData` is the logo or `""`, never null).

| # | Swift source | Built | Deliberate Android difference |
|---|---|---|---|
| 1 | ShoppingListLogoEditor.swift:5-113; ShoppingViews.swift:660, :670-674 | The 48-pt logo with a pencil badge beside List Settings' Store name (`HStack(spacing: 14)`) opens **Store Logo**: the logo at 100 over the store name ("Store logo" without one); **Search Google Images** (`google.com/search?tbm=isch&q=<name> logo`, off without a name) and its hint; **Choose from Photos**; **Paste copied image** ("Copy an image first, or save it to Photos and choose it above." when there is none); **Use automatic store logo** (only with a custom logo); the footer; "Loading image…" and the failure each in a card of their own; **Done**, off while loading. The image goes to at most 384 px, onto white, JPEG 0.85 → 0.65 → 0.45 → 0.25 until ≤ 67,500 bytes, and into `storeLogoData`, saved with the list. Swift's "could not be opened / loaded" and "too large" failures. `src/features/shopping/LogoEditor.tsx`, `ListSettings.tsx`, `listLogo.ts` | A **page** of the List Settings sheet (like Stores Near You and Store Hours) rather than a second sheet, which Android cannot stack on this modal. The white canvas comes from the item-image encoder (`image.ts`: upng-js flattening, then the manipulator's JPEG), since Android's JPEG encoder turns transparency black and the manipulator has no fill. A pasted image is read as PNG and goes through the cache. |
| 2 | StoreBrandLogo.swift:15, :32, :63-65; ShoppingViews.swift:109, :241 | Swift shows the logo in exactly three places — My Lists rows (48), the list header (56, tap to expand) and the editor (48, 100) — and RN matches; there is no logo on a Today card or the share sheet in Swift. Fallback order as §33 item 9. Pinned by tests, including a custom logo on a list with no store. | A custom logo on a list without a store name is labelled "Store logo" — Swift's `?? "Store"` — rather than " logo". |
| 3 | ShoppingOffersView.swift:125-158; ShoppingOfferPricing.swift | `OfferSummary`: **Before discount** (struck through when worked out, else "Not published"), the **Discount** box (red savings on red 0.06, or "Not published"), **Final price** (title2 bold, or "Not published"), "Before-discount price calculated from the final price and discount." only when derived, then the unit price; on the list and on Offer details (`shopping-offers-price-breakdown`, `shopping-offer-detail-price-breakdown`). The offer's "Valid through" was already on Offer details. | None. |
| 4 | ShoppingStoreHoursView.swift:7, :27-34; ShoppingStoreHoursDay.swift | Store Hours bolds the row for the store's own today and reads it as "Today, …", from the hours' `utcOffsetMinutes` (the phone's zone without one), re-checked every minute. **Built from source**: §23 marks this screen "needs sign-in" and no capture exists. | `useMinuteTick` stands in for `TimelineView(.everyMinute)`. |
| 5 | AskAILandingView.swift:71-72; AskNexdoView.swift:220, :265 | The composer card's minimum height 268 (was 300); "Powered by Nexdo AI" 6 above and 2 below (was 12 and 12); 4 below the landing instead of 20, so it fills the viewport as Swift's `viewport − 4`. Strings unchanged (`ask-ai-cards-v3`). | None. |
| 6 | Pomodoro.swift:4-10; PomodoroView.swift:83; PomodoroDashboard.swift:258 | Personal Work is the seventh and last setup choice (`pomodoro-setup-personal-work`), and shows in the Sessions history and Time by Category on Insights: every surface reads the same category maps, so part 1's model change already reached them. Pinned by a test. | The glyph is Ionicons `person` on the blue tile; SF's `person.crop.square.fill` has no Ionicons equivalent. |
| 7 | — | Nothing else in the §23 Wellness or Shopping rows was left. `ImportantMomentsStore.scheduleRevision` (bb57e09) only feeds the Moment rows in Calendar and Tasks, which belong to the Calendar run. | — |

## 36. Phase 13 Run D (Windows): Follow-ups and Profile (2026-10-12)

The §23 follow-up rows and the Profile remainder, from the Swift source, on the §32 plumbing (`followUp.ts`,
`model.ts`, `useSaveFollowUp`). Items 1–3 were built before the Mac's signed-in captures arrived (0bb8212),
then re-checked against them (6ede29a); items 4–7 used them from the start. §33's Working days, Forgot
password, Deleting account overlay and Account menu order were not redone; the new Do Now, Change password
and Working days captures agree with them. Jest 2,632 → 2,652; `tsc` and ESLint clean. No new native
module. The outcome save was already in `phase12Nulls.test.ts` (§32), and Run D adds no other write.

| # | Swift source | Built | Capture used / source only | Deliberate Android difference |
|---|---|---|---|---|
| 1 | FollowUpPreparationView.swift:4-131; FollowUpPreparation.swift | **Follow-up preparation** (`app/action/preparation.tsx`, `src/features/followUp/FollowUpPreparationScreen.tsx`): Close (off while busy); "Loading preparation…"; Follow-up (company, purpose, phone, email, Scheduled, **Set or change follow-up time**, Follow-up time), Preparation notes (3–8 lines), Checklist (toggle per step, editable title, **Add**, off when blank or at 30), Editable message draft, **Create draft from purpose** and its caption, **Save preparation** (needs loaded, company and purpose), Record outcome for open tasks (Result, notes, then Next follow-up + **Record and schedule next follow-up** or **Record and complete task**), Outcome history newest first, the error with **Retry loading**. A retry keeps the appended outcome's id; a failed complete or reschedule keeps the saved revision. Button rows and Close are ink, not the tint: the sheet inherits TaskActionView's `.foregroundStyle(Color.nexdoInk)`, and only the Result picker keeps the indigo | Captures: `follow-up-preparation-new`, `-filled`, `-filled-scrolled`, `-saved`, `follow-up-record-outcome`, `-result-menu`, `-record-resolved`, `-outcome-history`, `-history-completed`, `-history-completed-scrolled` (re-check: ink buttons, the 3-line notes) | A modal route over the Nexdo Action screen, not a sheet over a sheet; the action screen reloads when it regains focus (`onDismiss: loadDestination`). Swipe-to-delete on a checklist step is a red remove icon. Back closes only when Close would. The completed task's sheet stays as editable as Swift's (§23 For the team asks whether it should be read-only; not changed here). |
| 2 | TaskActionView.swift:158-171, :234-236, :273-280, :325-327, :348-355, :424 | Under "Contact <name>": the **Prepare and follow up** card (clipboard, the saved purpose or "Add the purpose, notes, checklist and message draft.", "N of M steps ready · Record outcome" once saved), **Complete or record outcome**, the task title as a caption. **Mark task complete** became **Record outcome and complete** (opens the sheet). On open the saved preparation is loaded onto the action; one with a valid company/phone/email is the contact and skips the search; its draft is the composer body (`emailDraft(…body:)`) and its purpose the context. Close, Complete or record outcome and Record outcome and complete are ink | Captures: `task-action-prepare-card`, `task-action-prepare-card-saved` | None. As in Swift, a reschedule from the sheet does not move the action screen's own reminder line until it reloads (§23 For the team). |
| 3 | TaskActionView.swift:37-41 | A completed task whose title still matches the detector shows **Follow-up preparation and outcome history** (ink, plain) on Task Details; it opens the sheet with an action made from the title, so the saved outcomes show | Capture: `task-details-followup-history-button` | None. |
| 4 | ProfileView.swift:343-344 (12bb9d4, 4185501) | "Morning summary" is now **Daily morning email · 6:00 a.m.** with "Today’s tasks, calendar events and conflicts, sent to <email> at 6:00 a.m. in <profile zone>. Email notifications must also be enabled." (`morningEmailExplanation`, falling back to "your profile email" and the device zone). This also settles the §23 For the team note on the morning email's footer | Captures: `settings-v3-scrolled-2`, `-scrolled-3`, `-scrolled-3-dark` | On Android the caption splits morning and evening, so the form group draws three separators in Notifications, not four. |
| 5 | ProfileView.swift `.toggleStyle(SwitchToggleStyle(tint: .green))` (4185501) | Every Settings switch is green: `IOSSwitch tone="green"`, used by `SettingsToggle` (so Working days, the voice, prediction and notification toggles) and the per-calendar "Add my scheduled tasks and events here", which was React Native's `Switch` and is now an `IOSSwitch` like the rest. iOS draws `success` (the system green, #34C759 / #30D158) | Captures: `settings-v3-scrolled-1`…`-4`, `settings-v3-dark`, `-scrolled-1-dark`…`-3-dark` | New token `switchOnGreen`: #34C759 in light, **green at 85% in dark** — the rule `switchOn` already follows (§6: a full-strength track glows on a grey card). The brief called this "the §12 rule"; §12 is Reset password actions, and the switch rule is §6. The off track keeps `switchOff` and its hairline. |
| 6 | RootView.swift:767-781; NexdoApp.swift:213-230 | A failed request or confirm shows the request's message, or "Could not send the reset code. Please try again." / "Could not reset the password. Please try again." when it has none, inline under the fields; the screen stays (`resetFailure`, `RESET_CODE_FAILED`, `RESET_PASSWORD_FAILED`). **Swift bug, for Sri:** `perform` sets `model.error`, RootView turns that into the global "Unable to complete request" alert, and the alert dismisses the Reset password sheet, so Swift's inline line is never seen | Captures: `password-reset-error-invalid-email` (Swift's bug, not the target), `password-reset-from-change-password` | Android ahead of iOS: the inline message is actually shown. |
| 7 | ProfileView.swift:349-368, :478-560 (6f079c0) | **Calendars & Privacy** with "Connect your calendar to keep your plans and important moments together."; each connection shows its provider's icon (`CalendarProviderIcon`: Google and Microsoft cut from `calendar-connect-pack`, Apple's logo, NexDo's mark, else an indigo calendar) with an orange triangle at its corner when unhealthy; a failed load shows its error and **Retry connection status**, and "No calendars connected yet." waits for a load that succeeded; Reconnect on a Microsoft row signs in with Microsoft, and every connect line names the provider ("Microsoft Calendar reconnected and synchronized.", "Choose the same account on Microsoft’s sign-in page.") | Captures: `settings-v3-scrolled-3`, `-scrolled-4`, `-scrolled-3-dark` | The pack's cells are drawn with `.multiply` in Swift; RN has no blend mode, so the white was unmixed into transparency when cutting them (`assets/calendar/`), which gives the same pixels on white and no white square in dark. **Not built:** the Apple Calendar card and the **Connect Calendar** row, which opens the calendar chooser (`CalendarConnectionView`). Both need the Provider connection page and Apple Calendars rows of §23 (new screens, not in this run); until then the card keeps its direct **Connect Google Calendar** row, and "No calendars connected yet." shows whenever the list is empty, as Swift does without Apple access. |

Also checked, no change needed: Swift's Contacts and notification permission changes in the same commits (limited Contacts access counts, provisional and ephemeral notifications count) already match RN (`src/actions/contacts.ts`, `src/actions/notifications.ts:97`).

## 37. Phase 13 Calendar run (Mac) (2026-10-12)

The §23 Calendar rows — the Connect Your Calendar hub, the provider pages, the phone's calendars, the
Calendar tab, Event Details for a device event, Settings' phone-calendar card and the permission model —
on the part-1 plumbing (`deviceCalendarEvent.ts`, `permissionAccess.ts`, `dayIndex.ts`, `momentSchedule.ts`,
`eventDetails.ts`, `useCalendar.ts`). Branch `rn-phase-13-mac`, cut from `rn-phase-13` at 0bb8212 and merged
with Windows' Run D (034c639) before item 6, whose Calendars & Privacy remainder (§36 item 7) this run builds
on. Captures matched for layout, Swift for strings, states and order; the Microsoft page and the phone
provider's empty states were not captured (§23) and come from the source. Jest 2,652 → 2,711; `tsc` and
ESLint clean. Native: only expo-calendar, already installed, with its `READ_CALENDAR` permission
(`WRITE_CALENDAR` stays blocked, `app.config.ts`); the plugin's usage string is Swift's full-access string.
Nothing new is written to the server — the chosen calendars stay on the phone, as in Swift — so
`phase12Nulls.test.ts` is unchanged.

Everywhere Swift says **Apple Calendar** / **iPhone**, Android says **Phone calendar** / **phone** (§33);
iOS keeps Swift's words (`deviceCalendarCopy`, `providerPageCopy`). The event `source` stays `apple-device`
and the provider key stays `apple`, so the §23 captures, the server strings and the ids all line up.

| # | Swift source | Built | Capture used / source only | Deliberate Android difference |
|---|---|---|---|---|
| 1 | CalendarConnectionView.swift:5-84, :279-286, :322-371; Assets.xcassets/calendar-connect-pack | **Connect Your Calendar** (`app/account/calendar-connect/index.tsx`, `CalendarConnectHub.tsx`): fixed light over the purple gradient and its corner halo (`ConnectSurface`), the hero, "Connect Your Calendar" and its subtitle, the three cards in Swift's order with artwork, title, caption and a chevron — **Connected** (green check; Google/Microsoft from a healthy connection, the phone from calendar access) or **Needs reconnecting** (orange) — the connections error with **Retry connection status**, and "Your data stays private". Reloads `/api/calendar/connections` on mount and the phone's access on focus and foreground (`useDeviceCalendarAccess`). The nine regions of `calendar-connect-pack` are cut once at Swift's rectangles (`connectArt.ts`, `assets/calendar-connect/`, 448 KB in all: icons 160 px, step pictures 180 px, hero 300 px) | `calendar-connect-hub`, `-hub-live` (Google and the phone connected), `-hub-apple-connected` | "Phone calendar" / "Connect your phone’s calendars". Swift draws the crops with `.multiply`; RN has no blend mode, so the hub and provider pages place them on their white cards and the white cells vanish there (the row-sized icons use Run D's transparent cuts in `assets/calendar/`). Pushed inside the account stack (Swift: a `NavigationLink` in the same stack). |
| 2 | CalendarConnectionView.swift:86-277; NexdoApp.swift:311-322; ProfileView.swift:539-563 | **Provider page** (`app/account/calendar-connect/[provider].tsx`, `CalendarProviderScreen.tsx`): the progress capsule (30 → 100 when connected; pink for the phone, blue otherwise), the 66-pt icon, "Connect <Provider> Calendar", the subtitle, the three numbered steps with their artwork ("Allow access" under the phone's icon for step 1), the privacy label, the connected state ("<Provider> Calendar connected.", the footnote, each account's name and `lastSyncedDescription`, **Connect another account** for OAuth providers), `failure` (red) and `statusMessage`, **Open Settings** once the phone's access is denied, **Connect Now** → **Connecting…** (spinner, back hidden, swipe and hardware back blocked, toolbar **Cancel**) → **Done** / **Choose calendars**, black button for the phone, **Learn more** → the privacy policy, toolbar **Need help?** → Help. `useConnectCalendar({ provider, reconnecting })` fetches that provider's connect token, opens `/api/calendar/oauth/<provider>/start?native=1&connect_token=…`, and the callback must say `calendar=<provider>-connected`; `connectOutcome` names the provider. After a connection the list is reloaded; when that fails the page says "Calendar connected, but its latest status could not be loaded. Retry from Calendars & Privacy." A closed browser says "Connection cancelled. Your existing calendars are unchanged."; Cancel says "Connection cancelled." and ignores the late answer. The phone provider requests READ_CALENDAR and opens the calendar list with "Calendar access allowed. Choose calendars to display in NexDo.", or reports "Calendar access is needed to display events. Enable it for NexDo in Settings." | Google: `calendar-connect-google`, `-google-bottom`, `-google-connected`, `-google-connected-scrolled`; phone: `-apple`, `-apple-permission`, `-apple-connected`; `-help`. **Microsoft: source only** (`calendar-connect-microsoft` shows the page, its OAuth could not be run) | Cancel while the browser is open: iOS dismisses the auth session (`dismissAuthSession`); Android cannot close the Custom Tab from the app, so Cancel marks the attempt cancelled and the answer is dropped when the tab closes. Android reports `dismiss` when the app turns active, so the late `nexdo://calendar-connected` link is awaited (`waitForOAuthCallback`), as Settings already did. A deep link that lands after Android dropped the session completes on Settings (`OAUTH_LANDING`), with the provider read from `calendar=` (`oauthProviderFromCallback`). The step pictures are laid out by width with Swift's aspect. |
| 3 | AppleCalendarService.swift:11-121; PermissionAccess.swift:4-18 | **Phone calendars** (`app/account/phone-calendars.tsx`, `DeviceCalendarsScreen.tsx`, `deviceCalendars.ts`, `deviceCalendarSelection.ts`): the intro text, **Allow calendar access** and **Open Settings** without access, "Loading calendars…", the two failure lines, **Calendars to show** with a toggle per calendar and its account caption (sorted by account then title), "No calendars are available on this phone…" / "All calendars are hidden…", **Import birthdays and anniversaries into Moments**. The request goes through the decision table (`requestDeviceCalendarAccess`: allow → read, deny → no prompt, else prompt); the selection is per account in AsyncStorage under Swift's key (`nexdo.apple-calendar.selection.<owner>`, absent = all, empty = none); cancelled occurrences are skipped and the rest go through `makeDeviceCalendarEvent`; reloads on focus, foreground and after a request. Reached from the phone provider page, Settings' card and the Calendar filters menu | `apple-calendars`, `-one-hidden`, `calendar-apple-calendars-sheet` (layout); **empty and denied states: source only** (§23) | "Phone calendars", "Add a calendar account in your phone’s Settings." Pushed from the filters menu rather than presented as a sheet with Done. No `EKEventStoreChanged` or selection notification: expo-calendar has no change listener (§32), so every reader re-reads on focus, foreground, selection save and pull-to-refresh. `WRITE_CALENDAR` is blocked, so there is no `writeOnly` state. |
| 4 | CalendarView.swift:12-21, :67-77, :89-100, :165-167, :176-181, :201-207, :233-258, :406, :496-510, :535-558, :596-657; CalendarDayIndex.swift; MomentSchedule.swift | **Calendar tab** (`app/(tabs)/calendar.tsx`, `CalendarParts.tsx`, `useDeviceCalendarEvents.ts`): the phone's events from the chosen calendars are read for the visible days (padded one day before and two after) beside the server's agenda, and shown on their own when the server fails; **Moments** project as all-day rows with the moment's icon in pink and "<type> · Moment", and a tap routes to the moment (`momentsStore.routeTo`, opened by `useMomentsLifecycle`); tasks and events are bucketed **once** per load into `CalendarDayIndex` with the day keys keyed by content, so a day pick is a lookup (a test counts the builds); each event row shows its provider icon (`CalendarProviderIcon`); the header **gear** opens Settings scrolled to Calendars & Privacy (`openCalendarSettings` → the `calendars` param); the filters menu gains **Phone calendars…** above Reset; the Week card drops "· 0 min planned"; the failure line is "Couldn’t refresh online calendars and tasks." with " Available calendar data is still shown." when something is; the dark accent `Color(red: 0.70, green: 0.64, blue: 1.0)` and white separators at 32 %; pull-to-refresh also refreshes Moments and the phone's events. The 3/5/7-day ranges keep their existing day arithmetic (`visibleDays`); the attention-card range bug is Swift's and was not copied | `calendar-v3`, `-dark`, `-live`, `calendar-filters-menu`, `calendar-month-device-events`, `-scrolled`, `-dark`, `calendar-moment-row`, `-dark`, `-opened`, `calendar-device-event-row` | Android keeps its one dark accent (`link`, §6/§7) where iOS takes the lavender; separators follow Swift in both. **Swift reindexes twice per load** (`dataRevision` changes before and after the server answers); RN builds the index once per change — on the §23 For the team list. The gear is a push of `/account/settings` (Swift: a `NavigationLink` into the Account stack). No `-calendar-stress-preview`. |
| 5 | CalendarEventDetailsView.swift:21, :43-55, :93-100, :112 | **Event Details for a device event** (`EventDetailsScreen.tsx`): read-only — no `GET` (`useCalendarEvent(id, { enabled: false })` keeps the row's copy), the line "On this phone · Edit this event in Phone calendar." in place of Mark Complete / Add to Tasks, no ⋯ menu, no Edit, no Delete; the calendar reads "Phone calendar"; **Open in Calendar** opens THAT event in the phone's calendar app (`openDeviceEvent` → expo-calendar `openEventInCalendarAsync`, the Android `ACTION_VIEW` intent with the occurrence start; the EventKit view on iOS), falling back to the day link | `event-details-apple-device`, `-dark`, `-live` | "On this phone · Edit this event in Phone calendar." (iOS keeps Swift's words). Swift's Open in Calendar opens the DAY (`calshow:`) even for a device event; both platforms here open the event itself, as the line promises. |
| 6 | ProfileView.swift:143-144, :349-368, :451-477, :478-485, :522 | On Run D's card: the **Phone calendar** card once calendar access is allowed (provider icon, "Connected on this phone", "N calendars selected" / "No calendars selected" from the saved selection, **Manage phone calendars** → the list, the read-only footnote; `useDeviceCalendarSummary` re-reads on focus, foreground and selection save), the **Connect Calendar** row (`calendar.badge.plus`, chevron) → the hub, in place of the direct "Connect Google Calendar" row, and "No calendars connected yet." only without phone access. Settings' own OAuth flow is now **Reconnect** on a row that needs it (its tests start from one); the Calendar tab's gear lands here scrolled to the card | `settings-v3-scrolled-3`, `-scrolled-3-dark`, `-scrolled-4` | "Phone calendar" / "Connected on this phone" / "Manage phone calendars" / "…in your phone’s Settings. NexDo does not add tasks or events to Phone calendar." The Appearance caption above the card still says "System follows your iPhone" on Android (pre-existing, not this run's). |
| 7 | Sources/NexdoCore/PermissionAccess.swift:4-18; TaskActionContacts.swift:27-29; TaskActionNotifications.swift:20-31; AppleCalendarService.swift:15-27 | `decisionFromExpo(resource, permission)` in `src/lib/permissionAccess.ts`: one table from an Expo permission answer to allow / deny / request, used by the calendar reader (`requestDeviceCalendarAccess`), the hub, the provider page and Settings. Mapping: **calendar** → `READ_CALENDAR` via expo-calendar (`WRITE_CALENDAR` blocked, so no `writeOnly`); **contacts** → `READ_CONTACTS` via expo-contacts (`limited` is iOS 18 only); **notifications** → `POST_NOTIFICATIONS` via `classifyNotificationPermission` (`provisional` / `ephemeral` are iOS only); **microphone** → `RECORD_AUDIO` via expo-audio (`authorizeMicrophone`) | source only (a model, no screen) | Android 13+ asks for `POST_NOTIFICATIONS` at runtime where iOS has provisional delivery; below 13 notifications are granted at install. `restricted` does not exist on Android; `canAskAgain: false` is read as denied. |

For the team (added to §23's list by this run): Swift's double reindex per Calendar load (item 4); Swift's
Open in Calendar opening the day rather than the device event (item 5); the Appearance caption's "iPhone"
on Android (item 6). Rows left unbuilt: none. Built from the source alone, awaiting a capture: the Microsoft
provider page's OAuth states (item 2) and the phone-calendar list's empty and denied states (item 3).

## 38. Phase 13 Tasks & Today run (2026-10-12)

The §23 Tasks tab, Task editor, Today and Needs attention sheet rows, on part 1's model code (§32: Moment
projections, manual order, creation spacing). Captures are the Mac's (0bb8212); Swift source decides
strings, states and order. §33 items 1, 2 and 6a (the three-item schedule, the working-day line on Do Now,
the new-task default time) were not redone. Jest 2,652 → 2,662; `tsc` and ESLint clean.

**New native module: react-native-gesture-handler ~2.32.0** (the version Expo SDK 57 pins; `npx expo install`).
It was already in `node_modules` through expo-router, but undeclared packages are not autolinked, so the
Android build needs it added. The rebuild that §33 item 10 (Crashlytics) and Run C's expo-sensors already
require covers it: no separate build. The app root is now a `GestureHandlerRootView`. Reanimated (already
declared and linked) is used for the first time, for the completion animation; Jest loads its and the
worklets runtime's mocks. The manual order is stored on the device only, so no new server write and nothing
to add to `phase12Nulls.test.ts`.

| # | Swift source | Built | Android difference | Capture used |
|---|---|---|---|---|
| 1 | RootView.swift:1787-1796, :1966-1981, :1927, :1964 (bb57e09); MomentSchedule.swift | `momentTasks` projections join the Tasks snapshot, rebuilt when the moments, the zone or the day change, and draw in their date group as a pink row: the type's glyph on a pink 10% 44pt tile, the title, "All day · <type> · Moment", a chevron; no checkbox, no drag. A tap sets `momentsStore.route`, the route a Moments notification takes, which opens the moment's wish, Manage Moment or Review Wish. Group headers and the date pills count **items**. Pull-to-refresh also refreshes Moments | None | `tasks-v3-moment-row`, `-dark` |
| 2 | RootView.swift:1983-2014 (d568989); TaskDisplayOrder.swift | Drag to reorder within a date group: a long press (400 ms) lifts the card (slightly larger, above its neighbours), it follows the finger, and letting go over another card in the group puts it there (`reorderTasks`); letting go elsewhere does nothing. The list does not scroll while a card is held. **Move up** / **Move down** accessibility actions and Swift's hint "Touch and hold to reorder within this date. Scheduled time stays the same." Moments never move and are never a target. The order is per account in AsyncStorage `nexdo.taskDisplayOrders`, read on open, applied with a 0.2 s ease | An in-repo `ReorderableGroup` on gesture-handler's `Gesture.Pan().activateAfterLongPress` instead of iOS drag and drop (react-native-draggable-flatlist would also need FlatLists inside the Tasks `ScrollView` and Reanimated worklets for the drag). The hint is added to the open button's "Opens task editor" rather than replacing it | Source only: §23 notes reorder was not capturable |
| 3 | RootView.swift:2297-2302, :2195 (d568989); TaskCreationSpacing.swift | Nothing new to draw. Swift's editor only moves the default start, and the one place the time shows is the "Nexdo Action: contact … Schedule: …" line, which New Task already draws from the spaced time (§33 6a). The editor has no working-day text. A test pins the capture: 12:22 PM for 30 minutes, then a new task at 1:07 PM. Note for §23: Swift spaces an explicitly picked time too (only a time read from the title skips it); the row's "an explicitly chosen date/time … bypass it" does not match the source, and RN follows the source | None | `tasks-creation-spacing` |
| 4 | RootView.swift:2026-2075, :1772-1773 (bdb68ce) | Completing a task on Tasks: the circle fills and grows to 1.12 on Swift's spring (response 0.25, damping fraction 0.6 → stiffness 632, damping 30.2), the title strikes through, other toggles wait and the row does not open while the save runs; once it succeeds the row slides 80 right and fades over 0.25 s (easeInOut, (0.42, 0, 0.58, 1)), then the list closes up. The row keeps its place until then, although the cache already says done; a failed save leaves it as it was. Reduce Motion: no growth and no slide, a 0.15 s fade. Restoring a done task has no exit. Swift animates only the Tasks rows; Today has no completable rows, so nothing was added there | Swift's `.animation` on the list's ids also animates filter switches and refreshes; RN animates the completion and reorder changes (`LayoutAnimation`), not those | Source only (an animation) |
| 5 | RootView.swift:1210-1223, :1301, :1483-1647; TodayAttentionSheet.swift:53-54, :66-70, :90-91 | Today's intelligence card is a 12-apart stack: the gradient summary as its own 24pt card (the "N things need attention" capsule and "Nothing needs attention" are gone), the orange **Needs attention** card (48pt triangle tile on orange 12%, "N overdue task(s) · M schedule check(s)", chevron, orange 7% fill and 50% stroke, Swift's hint), and the schedule as its own 24pt card. The separate attention row lower on Today is removed. The card shows on every range: Swift's `showsSummary` is always true, so the §23 For the team reading (dropped on 3/5 days) was not copied. Needs attention: overdue rows padded to Swift's 97pt and Reschedule all on systemGray5, 24 between sections, and Reschedule all as `NexdoGradientButtonStyle` (save gradient capsule, calendar icon, 72pt), which RN had drawn as a flat indigo button since Phase 12. The sheet opens at the `.fraction(0.65)` edge with a 36pt corner | The sheet's detent is 0.63 of the height below the status bar, which puts the edge where the capture has it (39.8% down), by the same rule as the 0.54 `.medium`. Android in dark keeps §6's `link` blue for the Close and row tints where Swift tints indigo | `today-v3-attention-card`, `-dark`, `today-attention-sheet-v3` |
| 6 | RootView.swift (the rest of the diff) | Nothing else in these rows: the remaining RootView hunks are the bug report's screen tags and coordinator (§34). Ticked too, as built in Run A: Do Now (0edb349), Add by Voice (bcf6848), Crash reporting (fc10824) | — | — |

## 39. Phone parity pass 4 (2026-10-12)

All 31 §23 rows checked on the OnePlus CPH2691 (Android 16, 360 dp, light; dark only for the shared Wellness
chooser) against the Mac's iPhone captures, with the dev build of `401eb48` and then a rebuilt one (below), Metro in
watch mode against app-dev, signed in as visakan. Android captures are `mobile/docs/reference/android/p4-*.png`
(gitignored). Method as pass 2/3: one screenshot per screen, fix what is broken or clearly wrong; §1–§38's deliberate
Android choices are kept. Branch `rn-ui-parity-4-win`. Jest 2,721 → 2,727; `tsc` and ESLint clean.

**A new dev APK was needed** (the brief's one exception): Phone calendars could not work without WRITE_CALENDAR in the
manifest. Rebuilt with the same route (prebuild, `assembleDebug`, arm64), reinstalled over USB as an update.

### Two blockers found and fixed

- **Phone calendars never worked on Android** (rows 7, 12, 13; also Moments' calendar import). Two causes:
  1. In this expo-calendar the function API on the package root (`getCalendarPermissionsAsync`,
     `requestCalendarPermissionsAsync`, `getCalendarsAsync`, `getEventsAsync`, …) is a set of stubs that throw
     "… is deprecated". `deviceCalendars.ts` and `moments/device.ts` imported the root, caught the throw as
     "denied", and so Android never asked and nothing was read: "Open Settings" showed before the app had ever asked.
     Both now import `expo-calendar/legacy` (as contacts already uses `expo-contacts/legacy`). JavaScript only.
  2. The legacy Android module grants access and reads only when READ_CALENDAR **and** WRITE_CALENDAR are both held
     (`CalendarModule.kt` `checkPermissions()`), and the app blocked WRITE_CALENDAR. It is now declared, which matches
     Swift (`requestFullAccessToEvents`, full access). **The app still never writes**: `readOnly.test.ts` fails on any
     expo-calendar create/update/delete call and on any import of the throwing root. Play's Data safety form already
     declares Calendar, and the app never writes to it.
  After both: Android asks once, the Phone calendars list loads the phone's calendars, a device event ("Parity device
  event", created with `adb content insert` in the phone's local calendar) shows in Calendar with the phone glyph and
  opens Event Details, and Settings shows the Phone calendar card ("16 calendars selected").
- **Saving a follow-up preparation crashed the screen** (`IllegalStateException: addViewAt: … View already has a parent`,
  the dev build's red screen). Reproduced on a cold start with Metro running normally, so not a hot-reload artefact.
  Cause: the sheet wraps its `KeyboardAwareScrollView` in `<View pointerEvents={disabled ? 'none' : 'auto'}>`. With
  `'auto'` and only a flex style Fabric flattens that View away; saving turns it `'none'`, so Fabric creates it and
  moves the scroll view's keyboard-controller `ClippingScrollViewDecoratorView` into it, which it refused. Loading went
  the other way (none → auto, a removal), which is why opening never crashed. Fix: `collapsable={false}` keeps the
  wrapper real. Moments settings, the Moment editor and the shopping list had the same wrapper and got the same fix.
  Two saves after the fix: no error; a test pins the wrapper.

### By screen

| # | §23 row | Result | Android capture | What was off | What changed |
|---|---|---|---|---|---|
| 1 | Bug report: intro | checked | `p4-bug-intro`, `-scrolled` | — ("Shake iPhone…" kept word for word, §34 for Sri; the tagline sits below the fold at 360 dp) | — |
| 2 | Bug report: form | fixed | `p4-bug-form`, `-top`, `-screenshot`, `-preview` | Opened scrolled to where the intro had been, "What happened?" under the bar | The ScrollView is keyed by stage, so each opens at its top (Swift pushes the form) |
| 3 | Bug report: sending, failure, success | checked | `p4-bug-sending`, `p4-bug-success` | — One real report to app-dev: **BR-540506** | — |
| 4 | Bug report: coordinator | checked | — | — Screen tag "settings" from Account, as Swift tags the sheet; shake left for the manual check | — |
| 5 | Connect Your Calendar (hub) | fixed | `p4-calendar-hub` | Plain white page: no gradient, halo or row cards | `ConnectSurface`'s SafeAreaView carried the white fill over the gradient; it is transparent now |
| 6 | Provider connection page | fixed | `p4-calendar-google`, `-scrolled`, `p4-calendar-microsoft`, `p4-calendar-phone` | "Need help?" (and the hub's Retry, the page's Open Settings) in system blue | The app tint, as Swift's toolbar link and plain buttons. Microsoft from source: matches its capture. A real connect is a manual check |
| 7 | Apple Calendars (selection) | fixed | `p4-calendar-phone-permission`, `p4-phone-calendars` | Never asked; "Open Settings" before asking; nothing loaded. Then: green switches | The two fixes above; the list keeps the app tint (`SettingsToggle` gains `tone`; Settings stays green) |
| 8 | Calendar provider icon and artwork | fixed | `p4-settings-calendars` | Settings' Google icon on a jagged black square | `CalendarProviderIcon` uses the Calendar run's transparent crops; Run D's had opaque black corners (removed) |
| 9 | Follow-up preparation (sheet) | fixed | `p4-follow-up-new`, `-record-outcome`, `-result-menu`, `-history-*` | Checklist titles showed their end ("…urpose and desired result"); "Result" squeezed to a sliver; a long menu choice cut to "Unresolved / waiting f…"; **the save crash** | Step titles parked at their start until focused; `MenuPicker` keeps its label's width (shared); `PopoverMenu` titles wrap to two lines (shared); the crash fix above |
| 10 | Nexdo Action contact screen | fixed | `p4-action-prepare-card`, `-saved`, `p4-action-after-contacts` | "No contact selected…" sat below the prompt | Moved above it, as Swift draws the error first (TaskActionView.swift:172-183) |
| 11 | Task Details action card | checked | `p4-task-details-history-button` | — | — |
| 12 | Calendar tab | fixed | `p4-calendar-tab`, `-week`, `-moment-row`, `p4-calendar-device-event` | No phone events (the calendar blocker) | Fixed with row 7. The Moment row opens the Moment. Its gift sits on §10's neutral Android tile (kept) |
| 13 | Event Details | fixed | `p4-event-details-device` | Unreachable for a device event (same blocker) | Fixed with row 7; matches `event-details-apple-device-live` with §33's "Phone calendar" wording |
| 14 | Settings | checked | `p4-settings-working-days`, `-morning-email`, `-calendars`, `-phone-calendar-card`, `-delete-confirm` | — Delete-account dialog opened and cancelled; the "Deleting…" overlay needs a confirm, so not reached | — |
| 15 | Account menu | checked | `p4-account` | — | — |
| 16 | Change password | checked | `p4-change-password` | — | — |
| 17 | Password reset sheet | checked | `p4-password-reset-from-change`, `-error` | — Inline error shown with airplane mode on ("Nexdo could not reach the server…"), the sheet stays | — |
| 18 | Tasks tab | checked | `p4-tasks-moment-row`, `p4-tasks-reordered` | — Drag-to-reorder works on the device (`input draganddrop`) | — |
| 19 | Task editor | checked | `p4-task-new`, `p4-tasks-creation-spacing` | — "Parity spacing check" 3:56 PM, then "… two" 4:41 PM: the 15-minute gap | — |
| 20 | Today | checked | `p4-today`, `p4-today-attention-card` | — Three items, View 1 more / Show less, the orange card | — |
| 21 | Needs attention sheet | checked | `p4-attention-sheet`, `-bottom` | — | — |
| 22 | Do Now | checked | `p4-do-now-not-working-day` | — Monday switched off, the line shown, Monday restored (`1,2,3,4,5`) | — |
| 23 | Wellness chooser | fixed | `p4-wellness-chooser-dark` | Dark hero: a bare moon, no stars | `moon.stars.fill` drawn as the moon plus two four-point stars |
| 24 | Pomodoro | checked | `p4-pomodoro-setup` | — Personal Work last, blue | — |
| 25 | Shopping: List Settings store logo | checked | `p4-shopping-list-settings`, `p4-shopping-store-logo-editor` | — | — |
| 26 | Shopping: offers | checked | `p4-shopping-offers` | — | — |
| 27 | Shopping: Store Hours | checked | `p4-shopping-store-hours` | — The store's Monday bold (Monday 3:34 AM in San Francisco) | — The store name is semibold in code but this phone's system font has no 600 face, so it draws regular |
| 28 | Ask AI landing | fixed | `p4-ask-ai-landing`, `-bottom` | Card captions cut off ("your next mo…", "Free time around…") | Android lets the caption take a third line |
| 29 | Add by Voice / Ask by Voice | fixed | `p4-voice-consent`, `p4-voice-allowed`, `p4-voice-mic-denied`, `-scrolled` | Two title bars ("Cancel" above "× Close") | The stack header is hidden. Denied: the message and **Open Settings** (below the fold at 360 dp, scrolls into view), which opens the app's Android settings; no session was requested while denied. Allowed: "Listening…". adb cannot revoke on this phone, so the mic was switched off in the app's settings page |
| 30 | Crash reporting | checked | `p4-dev-menu-crashlytics` | — "Crashlytics test crash" is in the React Native dev menu; not fired | — |
| 31 | Permission decisions | checked | — | — Contacts asked on first use (allowed), Calendar asked once now (allowed), Microphone asked before any session (denied, then allowed), Notifications not determined | — |

**Totals by group:**

| Group | Rows | Fixed | Already matched | Not reached |
|---|---|---|---|---|
| 1 Calendar (5–8, 12, 13, 31) | 7 | 6 | 1 | 0 |
| 2 Bug report (1–4) | 4 | 1 | 3 | 0 |
| 3 Follow-ups (9–11) | 3 | 2 | 1 | 0 |
| 4 Tasks & Today (18–21) | 4 | 0 | 4 | 0 |
| 5 Wellness & Shopping (23–28) | 6 | 2 | 4 | 0 |
| 6 Profile/Account (14–17) | 4 | 0 | 4 (the delete overlay itself not reached) | 0 |
| 7 Remaining (22, 29, 30) | 3 | 1 | 2 | 0 |
| **All** | **31** | **12** | **19** | **0** |

### Manual checks left

- Shake to report (the dev build's shake opens the dev menu first).
- The Crashlytics test crash (dev menu → "Crashlytics test crash", relaunch, check Firebase).
- A real Google calendar connect and disconnect.
- The completion animation's feel (spring, slide, fade) and drag-to-reorder's feel.
- The "Deleting account…" overlay (needs a confirmed delete on a throwaway account).

### Found for the team (not fixed)

- **The same event shows up to three times in Calendar** when the phone also syncs the connected Google account: the
  Nexdo task, the event Nexdo wrote to Google (31 icon), and the same Google event read again from the phone's calendar
  (phone glyph). Swift appends device events to server events without de-duplicating (`CalendarView.swift:77`), so an
  iPhone with the same Google account added would show the same. Matching on title and time, or hiding phone calendars
  that belong to a connected account, would fix it on both.
- **expo-calendar's root API now throws.** Anything else still importing it from the root breaks silently; the guard test
  covers this app. The legacy import will itself go away in a later Expo; moving to the object API is a separate change.
- The Phone calendars list wraps a long account name a letter at a time ("karpagamsures / hkumar@gmail / .com") when
  the calendar's title is the address; iOS would do the same with a long enough name.

## 40. QA M-01: New Event explains an end before the start (2026-10-30)

When Ends is at or before Starts, Create Event was only greyed out with no reason given. It stays disabled, and a
caption in `danger` now sits under the Ends row: "The end time must be after the start time." (`event-end-error`,
`app/calendar/event/new.tsx`). It goes away as soon as the end is moved after the start. Test: `calendar.test.tsx`
"says why Create Event is disabled when Ends is before Starts".

## 41. QA M-02: Add Food wording and the calories range message (2026-10-30)

- The note under the form now reads "This will be saved to your food log for <date>." (was "Saved to your food log
  for <date>."), since nothing is saved until Add / Save is tapped (`src/features/nutrition/FoodEditor.tsx`).
- Calories that are typed but not a whole number from 0 to 5,000 (e.g. -500, 6000, 1.5) now show "Enter calories
  from 0 to 5,000." in red under the Calories field (`caloriesOutOfRange`, `calorie-editor-calories-error`). Nothing
  is shown while the field is empty. The red is the light `danger` token (`palettes.light.danger`), as the editor is
  a fixed-light sheet. Add / Save stays disabled as before.
- Tests: `calorieTracker.test.tsx` (the new wording; -500, 6000, abc, 5000 and empty in the editor) and
  `route.test.tsx` (`caloriesOutOfRange`).

## 42. QA M-03: No "iPhone" or "iOS" in Android copy (2026-10-30)

- Settings → Appearance caption: "System follows your iPhone." is now "System follows your phone’s setting."
  (`app/account/settings.tsx`), on both platforms. The apostrophe is the curly ’ the rest of the app's copy uses.
- A sweep of `app/` and `src/` for user-facing "iPhone"/"iOS" found two more strings Android was showing, both in
  Report a bug (`src/features/bugReport/BugReportScreen.tsx`). On Android they now read **Shake phone to report a
  bug** (label and accessibility label) and **Android version** (in "What we’ll include"; the value was already the
  Android release). iOS keeps "Shake iPhone to report a bug" and "iOS version".
- Everything else the sweep found is a code comment, or copy already branched by platform so Android never sees it
  (`deviceCalendarCopy.ts`, `calendarProviders.ts`, `eventDetails.ts`).
- Tests: `account.test.tsx` (the caption), `bugReport/__tests__/screen.test.tsx` (Android: shake label and Android
  version; the existing iOS tests keep the iPhone/iOS copy).

## 43. QA M-04: Night mode status bar icons stay dark after Ask AI (2026-10-30)

In night mode the clock and battery stayed dark on Settings, Today and elsewhere once Ask AI had been opened.
`AskNexdoView` drew `<StatusBar style="dark" />` on its fixed-light landing and Daily Brief with no focus check.
`expo-status-bar` lets the last-mounted bar win, so an Ask screen left mounted under another one kept overriding the
root bar (`app/_layout.tsx`, light content in dark mode). Ask now uses `FixedLightStatusBar`, which draws the dark bar
only while its screen is focused, as Wellness and Connect calendar already do. The landing still gets dark icons
while it is in front.

Audit of every `<StatusBar` in `mobile/`: the only one outside `app/_layout.tsx` is inside `FixedLightStatusBar`
(`src/features/wellness/FixedLightStatusBar.tsx`), which is focus-gated. It is used by Ask, `app/wellness/calories.tsx`,
`app/wellness/guide/[kind].tsx`, `app/wellness/pomodoro.tsx` and `src/features/calendar/ConnectSurface.tsx`.
`StatusBarScrim` (Today, Calendar) only draws a backdrop and sets no style. No code calls `setStatusBarStyle` or sets a
screen's `statusBarStyle`.

Tests: `ask.test.tsx` "the Ask AI status bar": dark while Ask is focused, none while it is not, none on a themed page.
