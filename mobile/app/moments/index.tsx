import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { Text } from '../../src/components';
import { useTheme } from '../../src/theme';

/**
 * PLACEHOLDER for `ImportantMomentsView` (ios/App/ImportantMomentsView.swift:219-307), reached from
 * the Today Quick Access "Moments" tile (TodayQuickAccess.swift:68). It renders the screen's title
 * (`.navigationTitle("Important Moments")`, `:304`) and nothing else.
 *
 * TODO(phase11-run-b): Run B replaces this file with the Important Moments screen.
 */
export default function MomentsPlaceholder() {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.groupedBackground }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.label }]}>
        Important Moments
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600', textAlign: 'center', paddingVertical: 14 },
});
