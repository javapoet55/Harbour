import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

import { useTheme } from '../theme';

export type GlassCardProps = {
  children: ReactNode;
  /** `RoundedRectangle(cornerRadius:)`: 28 on sign-in, 26 on sign-up and verify-email. */
  radius: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * The auth card treatment shared by `SignInView`, `SignUpView` and `EmailVerificationView`
 * (ios/App/RootView.swift:354–357, 521–524, 733–736):
 *
 *   .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: r, style: .continuous))
 *   .overlay(RoundedRectangle(cornerRadius: r, style: .continuous).stroke(Color.white.opacity(0.8)))
 *   .shadow(color: Color.purple.opacity(0.09), radius: 25, y: 12)
 */
export function GlassCard({ children, radius, style }: GlassCardProps) {
  const theme = useTheme();
  const shadow =
    Platform.OS === 'android'
      ? { elevation: 8 }
      : { shadowColor: theme.colors.glassShadow, shadowOpacity: 1, shadowRadius: 25 / 2, shadowOffset: { width: 0, height: 12 } };

  return (
    <View style={[{ borderRadius: radius, backgroundColor: theme.colors.glassFill }, shadow, style]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
        <BlurView intensity={40} tint={theme.scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      </View>
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.glassStroke }]}
      />
      <View style={{ borderRadius: radius, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}
