import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';

import { Text } from './Text';

/**
 * SwiftUI's `.lineLimit(1).minimumScaleFactor(scale)`: one line, shrunk as far as `minimumScale` to fit
 * its width, then truncated (UI-parity pass 2).
 *
 * The style map records why this is a component: `adjustsFontSizeToFit` does nothing on Android. The
 * label's natural width is measured once by an invisible, unconstrained copy; the visible one is set
 * at `fontSize × min(1, available ÷ natural)`, never below `minimumScale`.
 */
export function FitText({
  children,
  style,
  fontSize,
  lineHeight,
  minimumScale = 0.7,
  testID,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
  fontSize: number;
  lineHeight: number;
  minimumScale?: number;
  testID?: string;
}) {
  const [available, setAvailable] = useState(0);
  const [natural, setNatural] = useState(0);
  const scale = fitScale(available, natural, minimumScale);
  return (
    <View onLayout={(event) => setAvailable(event.nativeEvent.layout.width)} style={styles.box}>
      <Text numberOfLines={1} style={[style, { fontSize: fontSize * scale, lineHeight: lineHeight * scale }]} testID={testID}>
        {children}
      </Text>
      <View pointerEvents="none" style={styles.measure}>
        <Text onLayout={(event) => setNatural(event.nativeEvent.layout.width)} style={[style, styles.natural, { fontSize, lineHeight }]}>
          {children}
        </Text>
      </View>
    </View>
  );
}

/** The scale SwiftUI would apply: 1 when it fits, else the ratio, floored at `minimumScale`. */
export function fitScale(available: number, natural: number, minimumScale: number): number {
  if (available <= 0 || natural <= 0 || natural <= available) return 1;
  return Math.max(minimumScale, available / natural);
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch' },
  // Laid out off to the side, at any width, so its own width is the text's natural one.
  measure: { position: 'absolute', left: 0, top: 0, width: 1000, opacity: 0 },
  natural: { alignSelf: 'flex-start' },
});
