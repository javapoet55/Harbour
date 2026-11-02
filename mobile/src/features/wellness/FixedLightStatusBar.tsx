import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';

import { claimFixedLight } from '../../components/StatusBarOwner';

/**
 * Dark status-bar content while a fixed-light screen (the Ask landing and Daily Brief, Pomodoro, the
 * Calorie Tracker, a module guide, calendar connect) is in front. The chooser follows the theme since 4185501.
 *
 * The root layout's `StatusBarOwner` picks the status bar from the app's Appearance, so at Night it
 * would draw a white clock over these white screens. Swift keeps it dark there (`wellness-chooser-dark`,
 * `module-guide-shopping-dark`). This claims dark icons from the owner only while FOCUSED: the chooser
 * stays mounted under Moments and Shopping, which follow the theme (docs/android-polish.md §45).
 */
export function FixedLightStatusBar() {
  const focused = useIsFocused();
  useEffect(() => (focused ? claimFixedLight() : undefined), [focused]);
  return null;
}
