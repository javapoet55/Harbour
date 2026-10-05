import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';
import { NEXDO_GRADIENT } from './TodayShell';

/**
 * Port of `TodayQuickAccess.body` (ios/App/TodayQuickAccess.swift:3-18): the "Quick Access" title and
 * ONE gradient Weekly Summary button.
 *
 * Phase 12: Swift dropped the Weekly / Moments / Shopping tile card. Moments and Shopping are now
 * reached only through the Wellness chooser (app/wellness/), so there are no tiles, counts or shopping
 * store here any more. (`onPlanWeek` in Swift's signature is unused by its body.)
 */
export function TodayQuickAccess({ onWeekly }: { onWeekly: () => void }) {
  const theme = useTheme();
  return (
    // `HStack { Text … ; Spacer(); Button … }`
    <View style={styles.row} testID="today-quick-access">
      {/* `Text("Quick Access").font(.title2.bold()).foregroundStyle(Color.nexdoInk)` */}
      <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.ink }]}>
        Quick Access
      </Text>
      {/* `.buttonStyle(.plain).accessibilityLabel("Weekly Summary")`, id `quick-access-weekly`. */}
      <Pressable accessibilityLabel="Weekly Summary" accessibilityRole="button" hitSlop={4} onPress={onWeekly} testID="quick-access-weekly">
        {/* `Image(systemName: "chart.bar.xaxis").font(.system(size: 24, weight: .semibold))` in white,
            `.frame(width: 48, height: 48).background(NexdoTheme.gradient, in: RoundedRectangle(cornerRadius: 15))`. */}
        <LinearGradient colors={[...NEXDO_GRADIENT]} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.button}>
          <TaskSymbol color="#FFFFFF" name="chart.bar.xaxis" size={24} />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // `.title2.bold()`: 22/28.
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  button: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
