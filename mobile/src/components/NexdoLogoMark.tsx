import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { brand, linearGradientStops } from '../theme';

/**
 * Port of `NexdoLogoMark` (ios/App/RootView.swift:857–882): three rotated, gradient-filled capsules
 * forming the Nexdo "N". Every dimension is a fraction of the frame width, as in Swift, so the mark
 * scales with the 116x84 frame the sign-in screen gives it.
 */
export function NexdoLogoMark({ width, height }: { width: number; height: number }) {
  const stroke = width * 0.23;
  const capsuleHeight = width * 0.72;

  const capsule = (rotation: number, dx: number, dy: number) => ({
    position: 'absolute' as const,
    width: stroke,
    height: capsuleHeight,
    borderRadius: stroke / 2,
    transform: [{ translateX: dx }, { translateY: dy }, { rotate: `${rotation}deg` }],
  });

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      {/* RootView.swift:864–868 */}
      <LinearGradient colors={linearGradientStops([brand.nexdoIndigo, brand.nexdoBlue])} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={capsule(20, -width * 0.25, 0)} />
      {/* RootView.swift:869–874 */}
      <LinearGradient colors={linearGradientStops([brand.nexdoIndigo, brand.nexdoPurple])} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={capsule(-27, width * 0.01, width * 0.05)} />
      {/* RootView.swift:875–879 */}
      <LinearGradient colors={linearGradientStops([brand.nexdoMagenta, brand.nexdoPurple])} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={capsule(17, width * 0.26, 0)} />
    </View>
  );
}
