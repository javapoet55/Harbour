import { Stack } from 'expo-router';

import { stackHeaderOptions, useTheme } from '../../src/theme';

/**
 * Shopping Lists: `ShoppingHome` is pushed from Today's Quick Access tile (TodayQuickAccess.swift:72)
 * and `ShoppingDetail` is pushed from a row or after "Create List". Every other Shopping screen is a
 * `.sheet` of those two, presented in-screen with `MomentSheet`.
 *
 * PRESENTATION GAP, as for Moments: Swift pushes inside the Today tab, so the tab bar stays visible.
 */
export default function ShoppingLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{ headerShown: true, headerBackTitle: 'Back', ...stackHeaderOptions(theme, theme.colors.groupedBackground) }}>
      <Stack.Screen name="index" options={{ title: 'My Lists' }} />
      <Stack.Screen name="[id]" options={{ title: 'Shopping List' }} />
    </Stack>
  );
}
