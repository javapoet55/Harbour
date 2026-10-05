import { router, Stack } from 'expo-router';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '../../../src/components';
import { pushedHeaderOptions } from '../../../src/components/PushedHeader';
import { stackHeaderOptions, useTheme } from '../../../src/theme';

/**
 * The Today tab's navigation stack.
 *
 * It lives **inside** `(tabs)` so that a pushed screen keeps the tab bar, which is what SwiftUI does:
 * `.navigationDestination` pushes within the selected tab's `NavigationStack`
 * (RootView.swift:1187-1196), and `WeeklySummaryView`'s `NavigationLink`s (`:104`, `:110`) push
 * again from there.
 *
 * `(today)` is a **route group**, like `(tasks)`, so it adds nothing to a URL: `today/…` still serves
 * `/today/…`. Important Moments and Shopping used to be pushed here from the Quick Access tiles; since
 * Phase 12 Swift reaches them only through the Wellness cover (TodayQuickAccess.swift:3-18), so they
 * live in `app/wellness/` instead.
 *
 * Needs attention and Reschedule all are NOT here: they are sheets that cover the tab bar, so they
 * are presented from the root stack (`app/attention.tsx`, `app/reschedule-all.tsx`).
 *
 * `TodayView` presents Do Now as a `.sheet` with `[.large]` detents and a drag indicator
 * (RootView.swift:1180), titled "What should I do now?" with a "Done" confirmation action
 * (DoNowView.swift:95-96).
 */
export default function TodayLayout() {
  const theme = useTheme();

  const doneButton = () => {
    function DoneButton() {
      return (
        <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={() => router.back()} hitSlop={8}>
          <Text style={{ fontSize: 17, lineHeight: 22, color: theme.colors.link }}>Done</Text>
        </Pressable>
      );
    }
    return DoneButton;
  };

  // Every PUSH in this stack gets the iOS 26 bar: transparent over the page's backdrop, with the round
  // glass back button (UI-parity pass 2, `src/components/PushedHeader.tsx`). Sheets keep the opaque bar.
  const insets = useSafeAreaInsets();
  const pushed = pushedHeaderOptions(theme, insets.top);

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        ...stackHeaderOptions(theme, theme.colors.background),
      }}
    >
      {/* The tab's own root draws `TodayTopBar`, so it takes no navigation header. */}
      <Stack.Screen name="today/index" options={{ headerShown: false }} />
      <Stack.Screen
        name="today/do-now"
        options={{ presentation: 'modal', title: 'What should I do now?', headerRight: doneButton() }}
      />
      {/* The remaining `navigationDestination`s (RootView.swift:1193-1200) all PUSH. */}
      <Stack.Screen name="today/schedule-check" options={{ ...pushed, title: 'Schedule check' }} />
      <Stack.Screen name="today/overdue" options={{ ...pushed, title: 'Unfinished deadlines' }} />
      <Stack.Screen name="today/weekly-summary" options={{ ...pushed, title: 'Weekly Summary' }} />
      {/* The title follows the filter, so `weekly-tasks` sets its own. */}
      <Stack.Screen name="today/weekly-tasks" options={pushed} />
    </Stack>
  );
}
