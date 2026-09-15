import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createQueryClient } from '../src/query/client';
import { useMe } from '../src/query/useMe';
import { useSession } from '../src/store/session';
import { useTheme } from '../src/theme';

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);

  // Refetch stale queries when the app returns to the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <RootNavigator />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/**
 * Session gate. `GET /api/me` decides: a profile unlocks (tabs), `null` unlocks (auth). While it is unknown
 * neither group is available, so every route falls back to app/index.tsx, which shows loading or the error.
 */
function RootNavigator() {
  const theme = useTheme();
  const { data: profile } = useMe();
  const setProfile = useSession((state) => state.setProfile);
  const clear = useSession((state) => state.clear);

  useEffect(() => {
    if (profile) setProfile(profile);
    else if (profile === null) clear();
  }, [profile, setProfile, clear]);

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.groupedBackground } }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={profile != null}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={profile === null}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        {/* Reachable signed in or out: it exists to test signing in and out. */}
        <Stack.Screen name="dev/session-check" options={{ headerShown: true, title: 'Session check' }} />
      </Stack>
    </>
  );
}
