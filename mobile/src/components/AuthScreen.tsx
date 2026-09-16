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
export function AuthScreen({ children, contentStyle }: { children: ReactNode; contentStyle?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      <SignInBackdrop />
      {/* `.scrollDismissesKeyboard(.interactively)` has no RN equivalent; "on-drag" is the closest. */}
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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
