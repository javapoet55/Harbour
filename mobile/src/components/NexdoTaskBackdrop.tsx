import { StyleSheet, View } from 'react-native';

import { brand, useTheme } from '../theme';

/**
 * Port of `NexdoTaskBackdrop` (ios/App/RootView.swift:2231-2242): the grouped background with three
 * blurred brand circles behind the task editor.
 *
 * VISUAL GAP: SwiftUI's `.blur(radius:)` has no React Native equivalent for a plain view. The circles
 * are drawn at the same sizes, offsets and opacities but with hard edges. `expo-blur` blurs what is
 * BEHIND a view, not the view itself, so it cannot stand in here.
 */
export function NexdoTaskBackdrop() {
  const theme = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.groupedBackground }]} pointerEvents="none">
      {/* Circle().fill(Color.nexdoBlue.opacity(0.13)).frame(width: 310).offset(x: -185, y: -330) */}
      <Blob size={310} x={-185} y={-330} color={brand.nexdoBlue} opacity={0.13} />
      {/* Circle().fill(Color.nexdoMagenta.opacity(0.11)).frame(width: 270).offset(x: 190, y: -170) */}
      <Blob size={270} x={190} y={-170} color={brand.nexdoMagenta} opacity={0.11} />
      {/* Circle().fill(Color.nexdoIndigo.opacity(0.10)).frame(width: 330).offset(x: 170, y: 420) */}
      <Blob size={330} x={170} y={420} color={theme.colors.link} opacity={0.1} />
    </View>
  );
}

/**
 * One circle. SwiftUI offsets a `ZStack` child from the CENTRE of the stack, while React Native
 * positions from the top-left, so each circle is pinned to the centre with `50%` and then pulled back
 * by its own radius before the Swift offset is applied.
 */
function Blob({ size, x, y, color, opacity }: { size: number; x: number; y: number; color: string; opacity: number }) {
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: withAlpha(color, opacity),
          marginLeft: x - size / 2,
          marginTop: y - size / 2,
        },
      ]}
    />
  );
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const int = parseInt(value, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

const styles = StyleSheet.create({
  circle: { position: 'absolute', left: '50%', top: '50%' },
});
