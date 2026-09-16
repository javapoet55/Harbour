import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
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
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** True when the screen is presented as a sheet; iOS elevates its dark background. */
  elevated?: boolean;
}) {
  const theme = useTheme({ elevated });
  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      <SignInBackdrop />
      {/* `.scrollDismissesKeyboard(.interactively)` has no RN equivalent; "on-drag" is the closest. */}
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // SwiftUI's ScrollView insets its content by the safe area while still drawing under it.
          // "always" is the UIScrollView behaviour that does the same, and it measures the screen's
          // own safe area, so it is correct both here and under a navigation header.
          contentInsetAdjustmentBehavior="always"
          contentContainerStyle={styles.scroll}
        >
          <View style={[styles.column, contentStyle]}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1 },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center' },
});
