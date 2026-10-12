import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from 'expo-router';

/**
 * Dark status-bar content while a fixed-light Wellness screen (a module guide) is in front. The chooser
 * follows the theme since 4185501, and with it the root layout's status bar.
 *
 * The root layout picks the status bar from the theme, so in dark mode it would draw a white clock over
 * these white screens. Swift keeps it dark there (`wellness-chooser-dark`, `module-guide-shopping-dark`).
 * Only while FOCUSED: `expo-status-bar` lets the last-mounted bar win, and the chooser stays mounted
 * under Moments and Shopping, which follow the theme.
 */
export function FixedLightStatusBar() {
  const focused = useIsFocused();
  return focused ? <StatusBar style="dark" /> : null;
}
