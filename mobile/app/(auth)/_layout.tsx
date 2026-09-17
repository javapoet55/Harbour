import { router, Stack } from 'expo-router';
import { Pressable } from 'react-native';

import { Text } from '../../src/components';
import { textStyles, useTheme } from '../../src/theme';

/**
 * Presentation matches the Swift app (ios/App/RootView.swift):
 *
 * - Sign-in is the root of the signed-out app, with no navigation bar.
 * - Sign-up and reset-password are `.sheet`s from sign-in, each wrapping a `NavigationStack` with an
 *   inline title and a Cancel button.
 * - Verify-email is a `navigationDestination` push from sign-up, and a `.sheet` from sign-in. One route
 *   cannot be both, so it pushes: that is exact for the sign-up path (the common one, straight after
 *   registering) and differs only in transition when reached from sign-in.
 *   TODO(phase2-decision): if the sheet-from-sign-in transition matters, split it into two routes.
 */
export default function AuthLayout() {
  const theme = useTheme();
  // Sign-up and reset-password are sheets, where iOS elevates the dark system backgrounds.
  const sheet = useTheme({ elevated: true });

  const cancelButton = () => (
    <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => router.back()} hitSlop={8}>
      <Text style={{ ...textStyles.body, color: theme.colors.tint }}>Cancel</Text>
    </Pressable>
  );

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.tint,
        headerTitleStyle: { color: theme.colors.ink, fontSize: 17, fontWeight: '600' },
        headerStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
        // Android left-aligns the title by default and it collides with the Cancel button.
        headerTitleAlign: 'center',
      }}
    >
      <Stack.Screen name="sign-in" />
      <Stack.Screen
        name="sign-up"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Create your account',
          headerLeft: cancelButton,
          contentStyle: { backgroundColor: sheet.colors.background },
          headerStyle: { backgroundColor: sheet.colors.background },
        }}
      />
      <Stack.Screen name="verify-email" options={{ headerShown: true, title: 'Verify email', headerLeft: cancelButton }} />
      <Stack.Screen
        name="reset-password"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Reset password',
          headerLeft: cancelButton,
          // The reset screen is a Form, so it sits on the grouped background, not systemBackground.
          contentStyle: { backgroundColor: sheet.colors.groupedBackground },
          headerStyle: { backgroundColor: sheet.colors.groupedBackground },
        }}
      />
    </Stack>
  );
}
