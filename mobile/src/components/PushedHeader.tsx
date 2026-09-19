import { router } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/build/react-navigation/elements';
import type { ReactNode } from 'react';
import { useContext } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import type { Theme } from '../theme/useTheme';
import { useTheme } from '../theme';
import { TaskSymbol } from './TaskSymbol';

/**
 * The iOS 26 navigation bar on a PUSHED screen (UI-parity pass 2).
 *
 * On iOS 26 a pushed screen's bar is transparent — the page's backdrop runs up behind the title — and
 * its buttons are round "glass" plates: a 44pt circle for the back chevron and for an icon button,
 * a capsule for a text button. Measured off the Swift captures (`moments-default`,
 * `moment-manage-details`, `wish-details`): the plate reads (230, 245, 255) over the light backdrop
 * and (20, 40, 63) over the dark one, with a soft shadow. React Navigation draws an opaque band with
 * a Material arrow instead, which is most of the difference at the top of every pushed screen.
 *
 * `pushedHeaderOptions` makes the bar transparent and puts the glass back button in it. The screen's
 * content is moved down by the bar's height through `contentStyle`, and `TodayBackdrop` extends back
 * up under the bar (it reads `HeaderHeightContext`), so the gradient starts at the top of the screen
 * as SwiftUI's does.
 */

/** The bar's height on this platform: the status bar plus Android's 56dp toolbar (iOS: 44pt). */
export function pushedBarHeight(topInset: number): number {
  return topInset + (Platform.OS === 'android' ? 56 : 44);
}

export function pushedHeaderOptions(theme: Theme, topInset: number) {
  return {
    headerTransparent: true,
    headerStyle: { backgroundColor: 'transparent' },
    headerShadowVisible: false,
    headerTitleAlign: 'center' as const,
    headerTintColor: theme.colors.tint,
    headerTitleStyle: { color: theme.colors.ink, fontSize: 17, fontWeight: '600' as const },
    contentStyle: { backgroundColor: theme.colors.groupedBackground, paddingTop: pushedBarHeight(topInset) },
    // Only ever spread onto PUSHED screens, so there is always somewhere to go back to.
    headerLeft: () => <GlassBackButton />,
  };
}

/** How far a backdrop must reach up to sit under a transparent bar; 0 anywhere else. */
export function useHeaderInset(): number {
  return useContext(HeaderHeightContext) ?? 0;
}

function plate(theme: Theme) {
  return {
    // Dark: a neutral translucent grey — it reads (40, 40, 42) on a dark sheet and picks up the blue of
    // the Moments backdrop, as the measured plates do.
    backgroundColor: theme.scheme === 'dark' ? 'rgba(120, 120, 128, 0.2)' : 'rgba(255, 255, 255, 0.78)',
    ...(Platform.OS === 'android'
      ? { elevation: 3, shadowColor: 'rgba(61, 41, 240, 0.35)' }
      : { shadowColor: '#3D29F0', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }),
  };
}

/** The round glass back button: `chevron.backward` in the label colour, or the tint when given. */
export function GlassBackButton({ tint }: { tint?: string }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={6} onPress={() => router.back()} testID="glass-back">
      <View style={[styles.circle, plate(theme)]}>
        <TaskSymbol color={tint ?? theme.colors.ink} name="chevron.backward" size={22} />
      </View>
    </Pressable>
  );
}

/** A round glass plate for a trailing icon button (the gear on Important Moments, "…" menus). */
export function GlassCircle({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.circle, plate(theme)]}>{children}</View>;
}

/** A glass capsule for a text bar button ("Close", "Cancel", "Done"). */
export function GlassCapsule({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.capsule, plate(theme)]}>{children}</View>;
}

const styles = StyleSheet.create({
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  capsule: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
