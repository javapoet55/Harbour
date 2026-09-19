import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { Text } from '../../src/components';
import { useTheme } from '../../src/theme';

/**
 * PLACEHOLDER for `ShoppingHome` (ios/App/ShoppingViews.swift:82-137), reached from
 * the Today Quick Access "Shopping" tile (TodayQuickAccess.swift:72). It renders the screen's title
 * (`.navigationTitle("My Lists")`, `:128`) and nothing else.
 *
 * TODO(phase11-run-c): Run C replaces this file with the My Lists screen.
 */
export default function ShoppingPlaceholder() {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.groupedBackground }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.label }]}>
        My Lists
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600', textAlign: 'center', paddingVertical: 14 },
});
