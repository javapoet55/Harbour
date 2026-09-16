import { Platform, type StyleProp, type TextStyle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { Text as RNText } from 'react-native';

export type GradientTextProps = {
  children: string;
  colors: readonly [string, string, ...string[]];
  style: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Shadow is painted under the mask, matching `.shadow(color:radius:y:)` on the SwiftUI Text. */
  shadow?: { color: string; radius: number; offsetY: number };
};

/**
 * `Text(...).foregroundStyle(LinearGradient(...))` — SwiftUI fills glyphs with a gradient directly.
 * React Native has no gradient text fill, so the gradient is masked by the text.
 */
export function GradientText({ children, colors, style, numberOfLines, shadow }: GradientTextProps) {
  const shadowStyle: TextStyle =
    shadow && Platform.OS !== 'android'
      ? { textShadowColor: shadow.color, textShadowRadius: shadow.radius, textShadowOffset: { width: 0, height: shadow.offsetY } }
      : {};

  return (
    <MaskedView
      // The mask is the text itself; the gradient shows only where glyphs are.
      maskElement={
        <RNText numberOfLines={numberOfLines} style={[style, { backgroundColor: 'transparent' }]}>
          {children}
        </RNText>
      }
    >
      {/* Keeps the masked view the same size as the text it fills. */}
      <RNText numberOfLines={numberOfLines} style={[style, { opacity: 0 }, shadowStyle]}>
        {children}
      </RNText>
      <LinearGradient colors={colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
    </MaskedView>
  );
}
