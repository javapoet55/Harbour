import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useSignOut } from '../query/useAuth';
import { useTheme } from '../theme';
import { Text } from './Text';

/**
 * Development-only entry points, behind a long-press on the version text. Renders NOTHING in a
 * release build, so the screens that host it stay identical to Swift.
 *
 * Phase 4 moved sign-out here, off the Today dashboard, because `TodayView` has no sign-out control —
 * Swift signs out from `AccountView` (ios/App/ProfileView.swift:60), which is Phase 7.
 *
 * It is mounted on BOTH sign-in and Today. Sign-in alone would put sign-out behind the session gate,
 * where a signed-in person can never reach it, which would make the README's sign-out check
 * impossible to run until Phase 7 lands.
 */
export function DevMenu({ showsSignOut = false }: { showsSignOut?: boolean }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const signOut = useSignOut();

  if (!__DEV__) return null;
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Version ${version}`}
        accessibilityHint="Long press to open the developer checks"
        delayLongPress={600}
        onLongPress={() => setOpen((current) => !current)}
        testID="dev-version"
      >
        <Text style={[styles.footnote, { color: theme.colors.secondary }]}>{version}</Text>
      </Pressable>
      {open ? (
        <View style={styles.links}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/dev/session-check')}>
            <Text style={[styles.footnote, { color: theme.colors.tint }]}>Open session check</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/dev/voice-check')}>
            <Text style={[styles.footnote, { color: theme.colors.tint }]}>Open voice check</Text>
          </Pressable>
          {showsSignOut ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              accessibilityState={{ disabled: signOut.isPending }}
              disabled={signOut.isPending}
              onPress={() => signOut.mutate()}
              testID="sign-out"
            >
              <Text style={[styles.footnote, { color: theme.colors.danger }]}>
                {signOut.isPending ? 'Signing out…' : 'Sign out'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', gap: 8, paddingTop: 12 },
  links: { alignItems: 'center', gap: 10 },
  footnote: { fontSize: 13, lineHeight: 18 },
});
