import { useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { brand } from '../theme';

/**
 * Port of `SignInBackdrop` (ios/App/RootView.swift:833–855): three offset, gradient-filled circles
 * behind every auth screen. SwiftUI sizes them from a GeometryReader over the whole screen, so the
 * window dimensions are used here. Offsets and diameters are copied point for point.
 */
export function SignInBackdrop() {
  const { width, height } = useWindowDimensions();

  // Swift places circles by centre offset; React Native positions by top-left, hence the -size / 2.
  const circle = (size: number, dx: number, dy: number) => ({
    position: 'absolute' as const,
    width: size,
    height: size,
    borderRadius: size / 2,
    left: width / 2 - size / 2 + dx,
    top: height / 2 - size / 2 + dy,
  });

  const topLeft = Math.min(width * 0.75, 380);
  const topRight = Math.min(width * 0.5, 260);
  const bottomRight = Math.min(width * 0.72, 360);

  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
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
    </View>
  );
}

/** `Color.opacity(_:)` on a six-digit hex brand colour. */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
