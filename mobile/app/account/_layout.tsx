import { router, Stack } from 'expo-router';
import { Pressable } from 'react-native';

import { Text } from '../../src/components';
import { textStyles, useTheme } from '../../src/theme';

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
  // The reset sheet is a `.sheet` with its own NavigationStack, as from Sign in (app/(auth)/_layout.tsx).
  const sheet = useTheme({ elevated: true });
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
      <Stack.Screen name="index" options={{ presentation: 'modal' }} />
      <Stack.Screen name="settings" />
      {/* Phase 12 Run A: pushed from the Account menu (ProfileView.swift:66-69). */}
      <Stack.Screen name="help" />
      <Stack.Screen name="feedback" />
      <Stack.Screen name="change-password" />
      {/* Phase 13 Calendar run: the phone's calendars (AppleCalendarService.swift:68), pushed from three places. */}
      <Stack.Screen name="phone-calendars" />
      {/* 4185501: "Forgot password?" on Change password presents the same reset sheet as Sign in. */}
      <Stack.Screen
        name="reset-password"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Reset password',
          headerLeft: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => router.back()} hitSlop={8}>
              <Text style={{ ...textStyles.body, color: theme.colors.link }}>Cancel</Text>
            </Pressable>
          ),
          headerTintColor: theme.colors.link,
          headerTitleStyle: { color: theme.colors.ink, fontSize: 17, fontWeight: '600' },
          headerShadowVisible: false,
          headerTitleAlign: 'center',
          contentStyle: { backgroundColor: sheet.colors.groupedBackground },
          headerStyle: { backgroundColor: sheet.colors.groupedBackground },
        }}
      />
    </Stack>
  );
}
