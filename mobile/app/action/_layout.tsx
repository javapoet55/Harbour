import { Stack } from 'expo-router';

import { useTheme } from '../../src/theme';

/**
 * `TaskActionView` is a `.sheet` everywhere it appears — from the coordinator's route
 * (ios/App/RootView.swift:60-62), from the Today action card (TodayActionsView.swift:40-43) and from
 * the queue (`:216-218`) — with `.presentationDetents([.large])`. `ActionQueueSheet` is a `.sheet`
 * too (`:44`). Both draw their own header, so the navigator header stays off.
 */
export default function ActionLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
      <Stack.Screen name="[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="queue" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
