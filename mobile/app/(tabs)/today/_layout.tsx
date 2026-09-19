import { router, Stack } from 'expo-router';
import { Pressable } from 'react-native';

import { Text } from '../../../src/components';
import { stackHeaderOptions, useTheme} from '../../../src/theme';

/** `[.medium, .large]`, opening at `.medium`, with the drag indicator (iOS; Android draws its own). */
const SHEET_OPTIONS = {
  presentation: 'formSheet' as const,
  headerShown: false,
  sheetAllowedDetents: [0.5, 1.0],
  sheetInitialDetentIndex: 0,
  sheetGrabberVisible: true,
};

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
      {/*
        Needs attention and Reschedule all (Phase 11): `.sheet`s with `.presentationDetents([.medium,
        .large])` (RootView.swift:1188-1191, TodayAttentionSheet.swift:98). A native form sheet is the
        only real detent API here — Material `BottomSheetBehavior` on Android — and it needs no new
        dependency. Both draw their own bar, since a form sheet has no navigator header on Android.
      */}
      <Stack.Screen name="attention" options={SHEET_OPTIONS} />
      <Stack.Screen name="reschedule-all" options={SHEET_OPTIONS} />
      {/* The remaining `navigationDestination`s (RootView.swift:1193-1200) all PUSH. */}
      <Stack.Screen name="schedule-check" options={{ title: 'Schedule check' }} />
      <Stack.Screen name="overdue" options={{ title: 'Unfinished deadlines' }} />
      <Stack.Screen name="weekly-summary" options={{ title: 'Weekly Summary' }} />
      {/* The title follows the filter, so `weekly-tasks` sets its own. */}
      <Stack.Screen name="weekly-tasks" />
    </Stack>
  );
}
