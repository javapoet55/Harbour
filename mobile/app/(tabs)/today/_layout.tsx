import { router, Stack } from 'expo-router';
import { Pressable } from 'react-native';

import { Text } from '../../../src/components';
import { stackHeaderOptions, useTheme} from '../../../src/theme';

/**
 * The Today tab's navigation stack.
 *
 * It lives **inside** `(tabs)` so that a pushed screen keeps the tab bar, which is what SwiftUI does:
 * `.navigationDestination` pushes within the selected tab's `NavigationStack`
 * (RootView.swift:1187-1196), and `WeeklySummaryView`'s `NavigationLink`s (`:104`, `:110`) push
 * again from there. Route groups are stripped from the URL and `today` is a real segment, so every
 * path is unchanged by the move.
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
          <Text style={{ fontSize: 17, lineHeight: 22, color: theme.colors.tint }}>Done</Text>
        </Pressable>
      );
    }
    return DoneButton;
  };

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        ...stackHeaderOptions(theme, theme.colors.background),
      }}
    >
      {/* The tab's own root draws `TodayTopBar`, so it takes no navigation header. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="do-now"
        options={{ presentation: 'modal', title: 'What should I do now?', headerRight: doneButton() }}
      />
      {/* `.sheet(isPresented:)` on the weather chip (RootView.swift:1338). */}
      <Stack.Screen name="weather" options={{ presentation: 'modal', title: 'Weather', headerRight: doneButton() }} />
      {/* The four `navigationDestination`s (RootView.swift:1191-1196) all PUSH. */}
      <Stack.Screen name="attention" options={{ title: 'Needs your attention' }} />
      <Stack.Screen name="schedule-check" options={{ title: 'Schedule check' }} />
      <Stack.Screen name="overdue" options={{ title: 'Unfinished deadlines' }} />
      <Stack.Screen name="weekly-summary" options={{ title: 'Weekly Summary' }} />
      {/* The title follows the filter, so `weekly-tasks` sets its own. */}
      <Stack.Screen name="weekly-tasks" />
    </Stack>
  );
}
