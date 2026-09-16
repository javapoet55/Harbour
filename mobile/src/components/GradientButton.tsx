import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { brand } from '../theme';
import { Text } from './Text';

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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[{ opacity: disabled ? 0.55 : 1 }, style]}
    >
      <LinearGradient
        colors={[brand.nexdoMagenta, brand.nexdoIndigo, brand.nexdoBlue]}
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
  fill: { alignItems: 'center', justifyContent: 'center', width: '100%' },
  label: { fontSize: 20, lineHeight: 25, fontWeight: '700', color: '#FFFFFF' },
});
