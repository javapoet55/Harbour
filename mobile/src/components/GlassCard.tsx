import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

import { androidGroup, useTheme } from '../theme';

export type GlassCardProps = {
  children: ReactNode;
  /** `RoundedRectangle(cornerRadius:)`: 28 on sign-in, 26 on sign-up and verify-email. */
  radius: number;
  /**
   * The `.overlay(...stroke(...))` colour, when the caller's is not the auth one. The Weekly
   * Summary card strokes `Color.nexdoIndigo.opacity(0.12)` (RootView.swift:1085) where the auth
   * cards stroke `Color.white.opacity(0.8)`.
   */
  stroke?: string;
  /** Swift only shadows the auth cards; a `.ultraThinMaterial` card elsewhere carries none. */
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * The card holds a form (the auth screens). On Android it drops the glass — the blur and the bright
   * 1pt white stroke, far heavier than any other card — for the shared form group: `fieldSurface` and
   * a `fieldBorder` hairline, at the same radius (docs/android-polish.md §11). iOS ignores it.
   */
  formGroup?: boolean;
  testID?: string;
};

/**
 * The auth card treatment shared by `SignInView`, `SignUpView` and `EmailVerificationView`
 * (ios/App/RootView.swift:354–357, 521–524, 733–736):
 *
 *   .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: r, style: .continuous))
 *   .overlay(RoundedRectangle(cornerRadius: r, style: .continuous).stroke(Color.white.opacity(0.8)))
 *   .shadow(color: Color.purple.opacity(0.09), radius: 25, y: 12)
 */
export function GlassCard({ children, radius, stroke, shadow: withShadow = true, style, formGroup = false, testID }: GlassCardProps) {
  const theme = useTheme();
  if (formGroup && Platform.OS === 'android') {
    return (
      <View style={[{ borderRadius: radius, overflow: 'hidden' }, androidGroup(theme), style]} testID={testID}>
        {children}
      </View>
    );
  }
  const shadow = !withShadow
    ? null
    :
    Platform.OS === 'android'
      ? // Android draws an elevation shadow behind the view, and this card's fill is only 72%
        // opaque, so a strong shadow bleeds through its own edges as a dark inset band. The Swift
        // shadow is `Color.purple.opacity(0.09)` — barely there — so keep the elevation low and
        // tint it to match rather than leaving the default black.
        { elevation: 2, shadowColor: theme.colors.glassShadow }
      : { shadowColor: theme.colors.glassShadow, shadowOpacity: 1, shadowRadius: 25 / 2, shadowOffset: { width: 0, height: 12 } };

  return (
    <View style={[{ borderRadius: radius, backgroundColor: theme.colors.glassFill }, shadow, style]} testID={testID}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
        <BlurView intensity={40} tint={theme.scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      </View>
      <View
        pointerEvents="none"
        // SwiftUI's `.stroke()` is 1pt; a hairline (0.53dp on this phone) read visibly thinner on every card (pass 2).
        style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1, borderColor: stroke ?? theme.colors.glassStroke }]}
      />
      <View style={{ borderRadius: radius, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}
