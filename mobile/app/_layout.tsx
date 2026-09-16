import { focusManager, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { onSignedOut } from '../src/api';
import { createQueryClient } from '../src/query/client';
import { queryKeys } from '../src/query/keys';
import { useMe } from '../src/query/useMe';
import { synchronizeDeviceTimeZone, TIME_ZONE_SYNC_ERROR } from '../src/query/useProfile';
import { useAppearance } from '../src/store/appearance';
import { useLastSignedIn } from '../src/store/lastSignedIn';
import { useSession } from '../src/store/session';
import { useTheme } from '../src/theme';

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);

  // Refetch stale queries when the app returns to the foreground, and re-assert the device time zone.
  //
  // `RootView` does both on `scenePhase == .active` (ios/App/RootView.swift:66-69): `model.refresh()`
  // (NexdoApp.swift:435-441) synchronizes the zone FIRST and abandons the refresh if that fails,
  // reporting it through the app-wide alert (`RootView.swift:63-65`).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
      if (state !== 'active' || useSession.getState().status !== 'signedIn') return;
      synchronizeDeviceTimeZone(queryClient).catch(() => {
        Alert.alert('Unable to complete request', TIME_ZONE_SYNC_ERROR);
      });
    });
    return () => subscription.remove();
  }, [queryClient]);

  // Device-backed state the first render needs: the sign-in greeting, and the Appearance and App
  // Voice choices, which are `@AppStorage` in Swift (ios/App/ProfileView.swift:127-128).
  useEffect(() => {
    void useLastSignedIn.getState().hydrate();
    void useAppearance.getState().hydrate();
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
 * Session gate. The launch `GET /api/me` decides: a profile unlocks (tabs), `null` unlocks (auth).
 * While it is undecided neither group is available, so every route falls back to app/index.tsx, which
 * shows the splash rather than a flash of the sign-in screen.
 */
function RootNavigator() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { data: profile } = useMe();
  const setProfile = useSession((state) => state.setProfile);
  const clear = useSession((state) => state.clear);

  useEffect(() => {
    if (profile) setProfile(profile);
    else if (profile === null) clear();
  }, [profile, setProfile, clear]);

  /**
   * A 401 from ANY request, on any screen, ends the session here. There is no navigation call: the
   * guards below flip to the auth group on their own, so this cannot start a redirect loop. It is also
   * idempotent — a burst of parallel 401s writes the same already-signed-out state.
   */
  useEffect(() => {
    onSignedOut(() => {
      if (useSession.getState().status === 'signedOut') return;
      useSession.getState().clear();
      queryClient.setQueryData(queryKeys.me(), null);
    });
  }, [queryClient]);

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
        <Stack.Screen name="dev/voice-check" options={{ headerShown: true, title: 'Voice check' }} />
      </Stack>
    </>
  );
}
