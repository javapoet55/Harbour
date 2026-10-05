import { Image, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { WELLNESS_NAVIGATION } from '../features/wellness/art';

/**
 * The tab bar's centre button (ios/App/RootView.swift:174-182): `Image("wellness-navigation")` at
 * 62×58, between Tasks and Ask AI, with no title and no selection capsule — it opens the Wellness
 * chooser and is never a selected tab. Expo Router's `onPress` fires the `tabPress` the layout
 * intercepts.
 */
export function WellnessTabButton({ onPress, onLongPress, testID }: PressableProps & { children?: React.ReactNode }) {
  return (
    <Pressable
      accessibilityLabel="Wellness menu: Calorie Tracker, Pomodoro, Moments and Shopping"
      accessibilityRole="button"
      onLongPress={onLongPress}
      onPress={onPress}
      style={styles.button}
      testID={testID ?? 'tab-wellness'}
    >
      <Image accessible={false} resizeMode="contain" source={WELLNESS_NAVIGATION} style={styles.image} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: 62, height: 58 },
});
