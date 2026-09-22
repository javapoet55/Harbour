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
