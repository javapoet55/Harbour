import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type KeyboardAvoidingViewProps,
  type ScrollViewProps,
  type ViewProps,
} from 'react-native';
import {
  KeyboardController,
  KeyboardAvoidingView as KCKeyboardAvoidingView,
  KeyboardAwareScrollView as KCKeyboardAwareScrollView,
  KeyboardStickyView,
  useWindowDimensions,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';

/**
 * Keyboard handling, in one place (mobile/docs/android-polish.md, entry 1).
 *
 * iOS keeps exactly what it had: UIKit already scrolls a focused field into view, and React Native's
 * `KeyboardAvoidingView` stays wherever a screen asked for one.
 *
 * Android draws edge to edge (always, since SDK 54), so `adjustResize` no longer resizes the window:
 * the keyboard simply overlays it. Measured on the device before this change — the Task Details notes
 * field and its pinned footer stayed at their full-height positions while the keyboard covered
 * everything below its top edge. React Native's own `KeyboardAvoidingView` recovered only part of the
 * height (483px of 730px), because it measures its frame against the parent, not the window.
 * react-native-keyboard-controller reads the real IME insets and animates with the keyboard, so on
 * Android every piece here is its component instead.
 */

/** The gap left between a focused field and whatever sits on top of the keyboard. */
export const KEYBOARD_GAP = 16;

const isAndroid = () => Platform.OS === 'android';

/** The window-space bottom edge of the enclosing Android `KeyboardAvoidingView`, once measured. */
const AvoidingContext = createContext<number | null>(null);

type Measurable = { measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void } | null;

/**
 * The height of whatever sits between a scroll view's bottom and its `KeyboardAvoidingView`'s — the
 * pinned footer the keyboard will push up under the focused field. 0 until both are measured.
 */
export function footerBetween(avoidingBottom: number | null, scrollBottom: number | null): number {
  return avoidingBottom === null || scrollBottom === null ? 0 : Math.max(0, avoidingBottom - scrollBottom);
}

/**
 * `KeyboardStickyView`'s "opened" offset for a bar whose bottom edge is `barBottom` in a window
 * `windowHeight` tall: it moves by the keyboard's height less the room already below the bar, and
 * stops `aboveKeyboard` short of the keyboard's top edge.
 */
export function liftOffset(windowHeight: number, barBottom: number, aboveKeyboard = 0): number {
  return Math.max(0, windowHeight - barBottom) - aboveKeyboard;
}

/** The window-space bottom edge of `view`, measured only while the keyboard is down. */
function measureBottom(view: Measurable, onBottom: (bottom: number) => void) {
  if (KeyboardController.isVisible()) return;
  view?.measureInWindow?.((_x, y, _width, height) => onBottom(y + height));
}

/**
 * Lifts a screen's pinned footer above the keyboard by shrinking its content.
 *
 * iOS: React Native's `KeyboardAvoidingView` with the given `behavior` — a screen that passes none
 * gets a plain `View`, which is what it had before. Android: keyboard-controller's, always `padding`,
 * measured against the window (`automaticOffset`), so a header above or a tab bar below is accounted
 * for. It also tells any `KeyboardAwareScrollView` inside how tall the footer under it is.
 */
export function KeyboardAvoidingView({ behavior, keyboardVerticalOffset, children, ...props }: KeyboardAvoidingViewProps) {
  if (!isAndroid()) {
    if (behavior === undefined) return <View {...props}>{children}</View>;
    return (
      <RNKeyboardAvoidingView behavior={behavior} keyboardVerticalOffset={keyboardVerticalOffset} {...props}>
        {children}
      </RNKeyboardAvoidingView>
    );
  }
  return <AndroidAvoidingView {...props}>{children}</AndroidAvoidingView>;
}

function AndroidAvoidingView({ children, onLayout, ...props }: ViewProps & { children?: ReactNode }) {
  const view = useRef<View>(null);
  const [bottom, setBottom] = useState<number | null>(null);
  return (
    <AvoidingContext.Provider value={bottom}>
      <KCKeyboardAvoidingView
        {...props}
        automaticOffset
        behavior="padding"
        onLayout={(event) => {
          onLayout?.(event);
          measureBottom(view.current as Measurable, setBottom);
        }}
        ref={view}
      >
        {children}
      </KCKeyboardAvoidingView>
    </AvoidingContext.Provider>
  );
}

export type KeyboardAwareScrollViewProps = ScrollViewProps & {
  children?: ReactNode;
  /**
   * Android only: extra room to keep clear above the keyboard, for something that floats on top of it
   * (the Moments "Done" capsule) or over the list (Shopping's action bar). A footer inside a
   * `KeyboardAvoidingView` is measured and added on its own.
   */
  bottomOffset?: number;
};

/**
 * A `ScrollView` that keeps the focused field above the keyboard.
 *
 * iOS: a plain `ScrollView` — UIKit already scrolls a focused field into view. Android:
 * keyboard-controller's, which scrolls by exactly the overlap as the keyboard animates, on focus and
 * as a multiline field grows.
 */
export function KeyboardAwareScrollView({ bottomOffset = 0, children, ...props }: KeyboardAwareScrollViewProps) {
  if (!isAndroid()) return <ScrollView {...props}>{children}</ScrollView>;
  return (
    <AndroidAwareScrollView bottomOffset={bottomOffset} {...props}>
      {children}
    </AndroidAwareScrollView>
  );
}

function AndroidAwareScrollView({ bottomOffset = 0, children, onLayout, ...props }: KeyboardAwareScrollViewProps) {
  const avoidingBottom = useContext(AvoidingContext);
  const view = useRef<KeyboardAwareScrollViewRef>(null);
  const [bottom, setBottom] = useState<number | null>(null);
  // keyboard-controller places the field against the keyboard's top edge in WINDOW space. Inside a
  // `KeyboardAvoidingView` the footer is lifted to sit on that edge, so the field has to clear the
  // footer too: whatever lies between this view's bottom and the avoiding view's.
  const footer = footerBetween(avoidingBottom, bottom);
  return (
    <KCKeyboardAwareScrollView
      {...props}
      bottomOffset={KEYBOARD_GAP + footer + bottomOffset}
      onLayout={(event) => {
        onLayout?.(event);
        measureBottom(view.current as Measurable, setBottom);
      }}
      ref={view}
    >
      {children}
    </KCKeyboardAwareScrollView>
  );
}

type KeyboardLiftProps = ViewProps & {
  children?: ReactNode;
  /** Android only: how far above the keyboard's top edge to stop, e.g. to clear the Moments "Done" capsule. */
  aboveKeyboard?: number;
};

/**
 * A bar pinned to the bottom of its screen (`position: 'absolute'`) that rides up on top of the
 * keyboard on Android. iOS keeps a plain `View`, as before.
 */
export function KeyboardLift({ aboveKeyboard = 0, children, ...props }: KeyboardLiftProps) {
  if (!isAndroid()) return <View {...props}>{children}</View>;
  return (
    <AndroidLift aboveKeyboard={aboveKeyboard} {...props}>
      {children}
    </AndroidLift>
  );
}

function AndroidLift({ aboveKeyboard = 0, children, onLayout, ...props }: KeyboardLiftProps) {
  const view = useRef<View>(null);
  const window = useWindowDimensions();
  const [barBottom, setBarBottom] = useState<number | null>(null);
  // `KeyboardStickyView` moves by the whole keyboard height; a bar that already sits above a tab bar
  // or a navigation inset only needs to move by the part of the keyboard that reaches it.
  const opened = liftOffset(window.height, barBottom ?? window.height, aboveKeyboard);
  const offset = useMemo(() => ({ closed: 0, opened }), [opened]);
  return (
    <KeyboardStickyView
      {...props}
      offset={offset}
      onLayout={(event) => {
        onLayout?.(event);
        measureBottom(view.current as Measurable, setBarBottom);
      }}
      ref={view}
    >
      {children}
    </KeyboardStickyView>
  );
}
