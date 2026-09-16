import { Stack } from 'expo-router';

import { useTheme } from '../../src/theme';

/**
 * `AccountView` is presented as a `.sheet` from both entry points — Today's avatar
 * (ios/App/RootView.swift:1181) and the Tasks account button (`:1702`) — and it wraps its own
 * `NavigationStack`, which `ProfileSettingsView` is PUSHED onto with a `NavigationLink` (`:75`, `:82`).
 *
 * So: `index` is a modal, `settings` is a push inside it. Both draw their own header — Swift's are
 * `navigationTitle`s inside a stack the sheet owns — so the navigator header stays off.
 */
export default function AccountLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
      <Stack.Screen name="index" options={{ presentation: 'modal' }} />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
