import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { Text } from './Text';

/**
 * Development-only entry points, behind a long-press on the version text. Renders NOTHING in a
 * release build, so the screens that host it stay identical to Swift.
 *
 * SIGN-OUT IS NO LONGER HERE. Phase 4 parked it in this menu because `TodayView` has no sign-out
 * control and `AccountView` did not exist yet. Phase 7 built `AccountView`
 * (ios/App/ProfileView.swift:84-86, and its confirmation dialog at `:96-98`), so sign-out is at
 * app/account/index.tsx, where Swift puts it, and the Today mount of this menu is gone with it.
 *
 * It is now mounted on the sign-in screen only, which is where the session-check screen is useful.
 *
 * The voice-check screen is GONE. Phase 0 used it to prove the WebRTC path; Phase 9 built the real
 * Add by Voice screen on the same transport, which exercises everything the check did and shows the
 * live phase, transcript and reply besides.
 */
export function DevMenu() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

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
