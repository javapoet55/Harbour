import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { brand, linearGradientStops, textStyles, useTheme } from '../theme';
import { withAlpha } from './SignInBackdrop';
import { Text } from './Text';

const GRADIENT = [brand.nexdoMagenta, brand.nexdoIndigo, brand.nexdoBlue] as const;

/**
 * Swift writes `.opacity(0.55)`, but SwiftUI also dims a disabled control on its own, and the two
 * multiply. Measured off the Swift app against both a white and a black background, the button ends
 * up at about 0.25 — and at that value a plain gamma blend matches, so no linear compositing is
 * needed here. Taking the 0.55 in the source at face value gives a button roughly twice too strong.
 */
const DISABLED_OPACITY = 0.25;

/** Android's disabled button (docs/android-polish.md §11): the full gradient at 40%, the label at 70%. */
export const ANDROID_DISABLED_GRADIENT_OPACITY = 0.4;
export const ANDROID_DISABLED_LABEL_ALPHA = 0.7;

export type GradientButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  /** `minHeight`: 62 on sign-in, 60 on sign-up and verify-email. */
  minHeight: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The primary auth button (ios/App/RootView.swift:362–378, 533–543, 754–763):
 *
 *   Text(...).font(.title3.bold()).foregroundStyle(.white)
 *     .frame(maxWidth: .infinity, minHeight: h)
 *     .background(LinearGradient(colors: [.nexdoMagenta, .nexdoIndigo, .nexdoBlue],
 *                                startPoint: .leading, endPoint: .trailing),
 *                 in: RoundedRectangle(cornerRadius: 20, style: .continuous))
 *     .disabled(!enabled).opacity(enabled ? 1 : 0.55)
 *
 * The Swift title carries the busy state ("Signing In…"), so the caller passes the finished string.
 */
export function GradientButton({ title, onPress, disabled = false, minHeight, style, testID }: GradientButtonProps) {
  const theme = useTheme();
  const colors = linearGradientStops(GRADIENT);

  if (Platform.OS === 'android') {
    // The whole-button 0.25 dimmed the label with the fill into a muddy block that read as broken.
    // Here only the gradient fades; the label stays legible, at 70% of white. Enabled is unchanged.
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        testID={testID}
        style={style}
      >
        <View style={[styles.fill, styles.frame, { minHeight }]}>
          <LinearGradient
            colors={colors}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[StyleSheet.absoluteFill, { opacity: disabled ? ANDROID_DISABLED_GRADIENT_OPACITY : 1 }]}
            testID={testID ? `${testID}-gradient` : undefined}
          />
          <Text style={[styles.label, { color: disabled ? withAlpha(theme.colors.onTint, ANDROID_DISABLED_LABEL_ALPHA) : theme.colors.onTint }]}>{title}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[disabled ? { opacity: DISABLED_OPACITY } : null, style]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.fill, { minHeight, borderRadius: 20 }]}
      >
        {/* .title3.bold() = 20pt semibold-to-bold; .foregroundStyle(.white) is fixed, not theme-aware. */}
        <Text style={styles.label}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { justifyContent: 'center', width: '100%', paddingHorizontal: 16 },
  // Android: the gradient is a layer, so the frame clips it to the 20pt corners.
  frame: { borderRadius: 20, overflow: 'hidden' },
  // `.frame(maxWidth: .infinity)` is on the *label* in Swift. Centring it with the parent's
  // `alignItems` instead sizes it to its own measured width, which Android then wraps and clips —
  // see docs/swift-to-rn-style-map.md §4.
  label: { ...textStyles.title3, fontWeight: '700', color: '#FFFFFF', alignSelf: 'stretch', textAlign: 'center' },
});
