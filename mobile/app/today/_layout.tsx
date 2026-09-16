import { router, Stack } from 'expo-router';
import { Pressable } from 'react-native';

import { Text } from '../../src/components';
import { useTheme } from '../../src/theme';

/**
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
        headerTintColor: theme.colors.tint,
        headerTitleStyle: { color: theme.colors.ink, fontSize: 17, fontWeight: '600' },
        headerStyle: { backgroundColor: theme.colors.background },
        contentStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
      }}
    >
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
      <Stack.Screen name="weekly-tasks" options={{ title: 'Tasks' }} />
    </Stack>
  );
}
