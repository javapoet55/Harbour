import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '../theme';

export type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  /** Screens inside the tab bar should drop 'bottom'; the tab bar already insets it. */
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({ children, scroll = false, edges = ['top', 'right', 'bottom', 'left'], contentStyle }: ScreenProps) {
  const theme = useTheme();
  const padding = { padding: theme.spacing.lg, gap: theme.spacing.md };
  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: theme.colors.groupedBackground }]}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[padding, contentStyle]}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, padding, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
