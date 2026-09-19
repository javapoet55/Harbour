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
 * `/today/…`, and Important Moments and Shopping — which Swift PUSHES from the Quick Access tiles into
 * this same `NavigationStack` (TodayQuickAccess.swift:68, :72), keeping the tab bar — still serve
 * `/moments/…` and `/shopping/…`. They are declared here rather than in stacks of their own for the
 * reason `(tasks)` gives: Swift has one `NavigationStack` per tab.
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
          <Text style={{ fontSize: 17, lineHeight: 22, color: theme.colors.tint }}>Done</Text>
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
      {/* `.sheet(isPresented:)` on the weather chip (RootView.swift:1338). */}
      <Stack.Screen name="today/weather" options={{ presentation: 'modal', title: 'Weather', headerRight: doneButton() }} />
      {/* The remaining `navigationDestination`s (RootView.swift:1193-1200) all PUSH. */}
      <Stack.Screen name="today/schedule-check" options={{ ...pushed, title: 'Schedule check' }} />
      <Stack.Screen name="today/overdue" options={{ ...pushed, title: 'Unfinished deadlines' }} />
      <Stack.Screen name="today/weekly-summary" options={{ ...pushed, title: 'Weekly Summary' }} />
      {/* The title follows the filter, so `weekly-tasks` sets its own. */}
      <Stack.Screen name="today/weekly-tasks" options={pushed} />

      {/*
        Important Moments (Run B): every screen is a push with an `.inline` title, over the grouped
        background. The editor is registered twice: `editor` is a push, `import-editor` is the `.sheet`
        Moments Settings uses for a picked contact (MomentEditor.swift:242).
      */}
      <Stack.Screen name="moments/index" options={{ ...pushed, title: 'Important Moments' }} />
      <Stack.Screen name="moments/manage-list" options={{ ...pushed, title: 'Manage Moments' }} />
      <Stack.Screen name="moments/editor" options={{ ...pushed, title: 'Create Moment' }} />
      <Stack.Screen
        name="moments/import-editor"
        options={{ ...stackHeaderOptions(theme, theme.colors.groupedBackground), title: 'Create Moment', presentation: 'modal' }}
      />
      <Stack.Screen name="moments/manage" options={{ ...pushed, title: 'Manage Moment' }} />
      <Stack.Screen name="moments/review" options={{ ...pushed, title: 'Review Wish' }} />
      <Stack.Screen name="moments/delivery" options={{ ...pushed, title: 'Choose Delivery' }} />
      <Stack.Screen name="moments/schedule-wish" options={{ ...pushed, title: 'Schedule Wish' }} />
      <Stack.Screen name="moments/wish" options={{ ...pushed, title: 'Wish details' }} />
      <Stack.Screen name="moments/settings" options={{ ...pushed, title: 'Moments Settings' }} />
      <Stack.Screen name="moments/calendar-import" options={{ ...pushed, title: 'Calendar Moments' }} />
      <Stack.Screen name="moments/festivals" options={{ ...pushed, title: 'Choose Festivals' }} />

      {/* Shopping Lists (Run C): `ShoppingHome` and `ShoppingDetail` push; everything else is a
          `.sheet` of those two, presented in-screen with `MomentSheet`. */}
      <Stack.Screen name="shopping/index" options={{ ...pushed, title: 'My Lists' }} />
      <Stack.Screen name="shopping/[id]" options={{ ...pushed, title: 'Shopping List' }} />
    </Stack>
  );
}
