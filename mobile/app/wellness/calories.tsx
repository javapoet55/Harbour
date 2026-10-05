import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassCircle } from '../../src/components/PushedHeader';
import { TaskSymbol } from '../../src/components/TaskSymbol';

/**
 * `CalorieTrackerView` (ios/App/CalorieTrackerView.swift), reached from the Wellness chooser's Calorie
 * Tracker card after its guide. The route is in place for Phase 12 Run D, which builds the screen on
 * the Nutrition plumbing from part 1; until then it holds only a way back, and no copy of its own.
 */
export default function CalorieTrackerScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, { paddingTop: insets.top }]} testID="calorie-tracker">
      <View style={styles.bar}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={6} onPress={() => router.back()} testID="calorie-tracker-back">
          <GlassCircle>
            <TaskSymbol color="#0F1247" name="chevron.backward" size={22} />
          </GlassCircle>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#FFFFFF' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 50 },
});
