import { useEffect, useRef } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';

/** How much of a gap to leave between the focused field and the top of the keyboard. */
const GAP = 16;

/**
 * A `ScrollView` that keeps the focused `TextInput` above the keyboard on Android.
 *
 * SwiftUI scrolls a focused field into view on its own, so the Swift app needs nothing here.
 *
 * Android does not, and `windowSoftInputMode="adjustResize"` in the manifest is not doing it either.
 * Measured on the device: with the keyboard up, the notes field stayed at y 1161 and the pinned
 * footer at y 1402 — exactly where they sit with no keyboard — while the keyboard covered everything
 * below y 705. The window is not being resized; the keyboard simply overlays it, which is what
 * drawing edge to edge does to `adjustResize`.
 *
 * Two things are needed, and neither is enough alone:
 *
 * - The screens wrap in a `KeyboardAvoidingView` with `behavior="padding"` — on **both** platforms,
 *   not just iOS — which lifts the pinned footer. It recovers only part of the height this keyboard
 *   occupies, though (483px of 730px on the test device), so it cannot be trusted to place a field.
 * - This, which places the field exactly: on `keyboardDidShow`, measure the focused input against
 *   the keyboard's top edge and, if they overlap, scroll by that overlap and no more.
 *
 * iOS is left alone — it already scrolls a focused field into view.
 */
export function KeyboardAwareScrollView({ children, onScroll, ...props }: ScrollViewProps & { children?: React.ReactNode }) {
  const ref = useRef<ScrollView>(null);
  const offset = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = Keyboard.addListener('keyboardDidShow', (event) => {
      const input = TextInput.State.currentlyFocusedInput();
      if (!input) return;
      // `measureInWindow` runs after the resize, so `y` is already in the shrunken window and
      // `endCoordinates.screenY` is the keyboard's top edge in the same space.
      input.measureInWindow((_x, y, _width, height) => {
        const overlap = y + height + GAP - event.endCoordinates.screenY;
        if (overlap > 0) ref.current?.scrollTo({ y: offset.current + overlap, animated: true });
      });
    });
    return () => subscription.remove();
  }, []);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  };

  return (
    <ScrollView {...props} ref={ref} onScroll={handleScroll} scrollEventThrottle={16}>
      {children}
    </ScrollView>
  );
}
