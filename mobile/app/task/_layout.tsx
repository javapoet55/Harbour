import { router, Stack } from 'expo-router';
import { Pressable } from 'react-native';

import { Text } from '../../src/components';
import { stackHeaderOptions, useTheme} from '../../src/theme';

/**
 * Presentation matches `TasksView`'s modifiers (ios/App/RootView.swift:1697-1726):
 *
 * - `new` and `[id]` are `.sheet`s wrapping a `NavigationStack`, so both are modals with an inline
 *   title and a Close/Cancel button. `[id]` additionally carries `.presentationDetents([.large])`.
 * - `filters` is a `.sheet` with `[.medium, .large]` detents and a "Done" confirmation action. Expo
 *   Router has no detent API on Android, so it is a plain modal; see Visual gaps.
 * - `voice-capture` is a `.fullScreenCover` (RootView.swift:1698).
 */
export default function TaskLayout() {
  const theme = useTheme();

  const closeButton = (label: string) => {
    function CloseButton() {
      return (
        <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.back()} hitSlop={8}>
          <Text style={{ fontSize: 17, lineHeight: 22, color: theme.colors.tint }}>{label}</Text>
        </Pressable>
      );
    }
    return CloseButton;
  };

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        ...stackHeaderOptions(theme, theme.colors.groupedBackground),
      }}
    >
      <Stack.Screen name="new" options={{ presentation: 'modal', title: 'New Task', headerLeft: closeButton('Close') }} />
      <Stack.Screen name="[id]" options={{ presentation: 'modal', title: 'Task', headerLeft: closeButton('Close') }} />
      <Stack.Screen name="filters" options={{ presentation: 'modal', title: 'Task filters', headerLeft: closeButton('Cancel') }} />
      <Stack.Screen name="voice-capture" options={{ presentation: 'fullScreenModal', title: 'Add by Voice', headerLeft: closeButton('Cancel') }} />
    </Stack>
  );
}
