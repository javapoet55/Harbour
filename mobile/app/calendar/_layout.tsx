import { router, Stack } from 'expo-router';
import { Pressable } from 'react-native';

import { Text } from '../../src/components';
import { useTheme } from '../../src/theme';

/**
 * `CalendarView` presents the editor as a `.sheet` wrapping a `NavigationStack`
 * (ios/App/CalendarView.swift:162), titled "New Appointment / Event" with a "Close" cancellation
 * action (`:576-577`).
 *
 * There is no event detail route: Swift's event detail is an inline `.sheet(item:)` on the tab
 * (`CalendarView.swift:168-180`), so it is built as a modal inside `app/(tabs)/calendar.tsx`.
 * There is no edit route either: `CalendarEventEditor` is create-only.
 */
export default function CalendarLayout() {
  const theme = useTheme();

  const closeButton = () => {
    function CloseButton() {
      return (
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={8}>
          <Text style={{ fontSize: 17, lineHeight: 22, color: theme.colors.tint }}>Close</Text>
        </Pressable>
      );
    }
    return CloseButton;
  };

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: theme.colors.tint,
        headerTitleStyle: { color: theme.colors.ink, fontSize: 17, fontWeight: '600' },
        headerStyle: { backgroundColor: theme.colors.groupedBackground },
        contentStyle: { backgroundColor: theme.colors.groupedBackground },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="event/new"
        options={{ presentation: 'modal', title: 'New Appointment / Event', headerLeft: closeButton() }}
      />
    </Stack>
  );
}
