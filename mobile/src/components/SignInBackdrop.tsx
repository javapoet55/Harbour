import { useState } from 'react';
import { Platform, View, type LayoutRectangle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { brand } from '../theme';

/**
 * Port of `SignInBackdrop` (ios/App/RootView.swift:833–855): three offset, gradient-filled circles
 * behind every auth screen. Diameters and offsets are copied point for point.
 *
 * Two things about the SwiftUI original are easy to get wrong:
 *
 * 1. **The circles are not centred on the screen.** They live in a bare `ZStack` inside a
 *    `GeometryReader`, and neither fills the reader: a `ZStack` sizes to its largest child and a
 *    `GeometryReader` pins its content to the top-leading corner. So each circle is centred on a box
 *    of the largest diameter — `min(width * 0.75, 380)` — sitting at (0, 0), and `.offset` moves it
 *    from there. Centring on the screen puts all three hundreds of points out of place.
 *
 * 2. **The size is the container's, not the window's.** A `GeometryReader` reports the space its
 *    parent gives it, which on a sheet is the sheet. Using `useWindowDimensions` put the third
 *    circle far out of place on sign-up and reset-password, which are both sheets.
 */
export function SignInBackdrop() {
  const [layout, setLayout] = useState<LayoutRectangle | null>(null);
  const width = layout?.width ?? 0;
  const height = layout?.height ?? 0;

  const topLeft = Math.min(width * 0.75, 380);
  const topRight = Math.min(width * 0.5, 260);
  const bottomRight = Math.min(width * 0.72, 360);

  // The ZStack's own size: its largest child, which is always the first circle.
  const stack = topLeft;

  // Swift places circles by centre offset; React Native positions by top-left, hence the -size / 2.
  const circle = (size: number, dx: number, dy: number) => ({
    position: 'absolute' as const,
    width: size,
    height: size,
    borderRadius: size / 2,
    left: stack / 2 - size / 2 + dx,
    top: stack / 2 - size / 2 + dy,
  });

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(event) => setLayout(event.nativeEvent.layout)}
      // Android (docs/android-polish.md §11): kept strictly behind the screen's content, and at 60% of
      // the Swift opacity so the form card and the primary button read cleanly over it.
      style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, Platform.OS === 'android' ? ANDROID_BACKDROP : null]}
      testID="sign-in-backdrop"
    >
      {layout === null ? null : (
        <>
          {/* RootView.swift:836–841 */}
          <LinearGradient
            colors={[withAlpha(brand.nexdoBlue, 0.22), withAlpha(brand.nexdoIndigo, 0.08)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={circle(topLeft, -width * 0.38, -height * 0.42)}
          />
          {/* RootView.swift:842–846 */}
          <LinearGradient
            colors={[withAlpha(brand.nexdoMagenta, 0.14), 'rgba(255, 255, 255, 0.02)']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={circle(topRight, width * 0.48, -height * 0.28)}
          />
          {/* RootView.swift:847–851 */}
          <LinearGradient
            colors={[withAlpha(brand.nexdoIndigo, 0.16), withAlpha(brand.nexdoBlue, 0.12)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={circle(bottomRight, width * 0.38, height * 0.48)}
          />
        </>
      )}
    </View>
  );
}

/** Android: behind everything (`zIndex` 0 under the content's 1), at 60% of the circles' own opacity. */
export const ANDROID_BACKDROP = { zIndex: 0, opacity: 0.6 } as const;

/** `Color.opacity(_:)` on a six-digit hex brand colour. */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
