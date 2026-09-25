import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from './keyboard';
import { SignInBackdrop } from './SignInBackdrop';

/**
 * The frame every auth screen shares (ios/App/RootView.swift:271–274, 483–486, 701–704):
 *
 *   ZStack { Color(uiColor: .systemBackground).ignoresSafeArea(); SignInBackdrop(); ScrollView { ... } }
 *
 * The inner column is `.frame(maxWidth: 560).frame(maxWidth: .infinity)`: capped, then centred.
 */
export function AuthScreen({
  children,
  contentStyle,
  elevated = false,
  topInset = false,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** True when the screen is presented as a sheet; iOS elevates its dark background. */
  elevated?: boolean;
  /**
   * True when the screen has no navigation header, so it has to clear the status bar itself.
   * Only Android needs this: `contentInsetAdjustmentBehavior` below covers iOS, and a header
   * already clears the status bar on both platforms.
   */
  topInset?: boolean;
}) {
  const theme = useTheme({ elevated });
  const insets = useSafeAreaInsets();
  const android = Platform.OS === 'android';
  const androidTopInset = android && topInset ? insets.top : 0;
  // Android draws edge to edge and `contentInsetAdjustmentBehavior` is iOS-only, so the last lines of
  // a long screen (Create account's closing copy) sat under the navigation bar. Pad by its inset.
  const androidBottomInset = android ? insets.bottom : 0;
  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      <SignInBackdrop />
      {/* `.scrollDismissesKeyboard(.interactively)` has no RN equivalent; "on-drag" is the closest. */}
      {/* Android: the content sits above the backdrop (`zIndex` 1 over its 0). */}
      <KeyboardAvoidingView style={[styles.fill, android && styles.aboveBackdrop]} behavior="padding">
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // SwiftUI's ScrollView insets its content by the safe area while still drawing under it.
          // "always" is the UIScrollView behaviour that does the same, and it measures the screen's
          // own safe area, so it is correct both here and under a navigation header.
          contentInsetAdjustmentBehavior="always"
          contentContainerStyle={[styles.scroll, { paddingTop: androidTopInset, paddingBottom: androidBottomInset }]}
          testID="auth-scroll"
        >
          <View style={[styles.column, contentStyle]}>{children}</View>
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1 },
  aboveBackdrop: { zIndex: 1 },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center' },
});
