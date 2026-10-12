import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TaskSymbol } from '../../components/TaskSymbol';
import { Text } from '../../components/Text';
import { withAlpha } from '../../components/CalendarParts';
import { FixedScheme, palettes } from '../../theme';
import { FixedLightStatusBar } from '../wellness/FixedLightStatusBar';

/**
 * The fixed-light surface of the Connect Calendar screens (`CalendarConnectBackground`,
 * ios/App/CalendarConnectionView.swift:279-286, and `.environment(\.colorScheme, .light)` at `:68`,
 * `:182`): a gradient from the accent at 10 % through white to the accent at 12 %, with a faint circle
 * off the top-right corner. The inline toolbar is Swift's `navigationTitle("")` bar: a back chevron on
 * the left and, on the provider page, "Need help?" or "Cancel" on the right.
 */

/** `Color(red: 0.06, green: 0.05, blue: 0.25)`: the ink every label on these screens uses. */
export const CONNECT_INK = '#0F0D40';
/** `.purple` (the hub), `.blue` and `.pink` (the provider pages). */
export const CONNECT_PURPLE = '#AF52DE';
/**
 * Plain buttons and links on these fixed-light screens: the app tint (`.tint(.nexdoIndigo)` from
 * RootView), which "Need help?" (a toolbar `NavigationLink`), Retry and Open iPhone Settings take
 * (`calendar-connect-google-connected`). Only the Connect Now capsule is `Color.blue`.
 */
export const CONNECT_LINK = palettes.light.link;

export function ConnectSurface({
  accent,
  children,
  onBack,
  backHidden = false,
  trailing,
  testID,
}: {
  accent: string;
  children: React.ReactNode;
  onBack: () => void;
  backHidden?: boolean;
  trailing?: { title: string; onPress: () => void; testID?: string };
  testID?: string;
}) {
  return (
    <FixedScheme scheme="light">
      <View style={styles.fill} testID={testID}>
        <LinearGradient colors={[withAlpha(accent, 0.1), '#FFFFFF', withAlpha(accent, 0.12)]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={[styles.halo, { backgroundColor: withAlpha(accent, 0.04) }]} />
        <FixedLightStatusBar />
        {/* Transparent: a white SafeAreaView covered the gradient, so the 85% white cards vanished. */}
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.grow}>
          <View style={styles.bar}>
            <View style={styles.side}>
              {backHidden ? null : (
                <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={onBack} style={styles.back} testID={testID ? `${testID}-back` : 'nav-back'}>
                  <TaskSymbol color={CONNECT_INK} name="chevron.backward" size={22} />
                </Pressable>
              )}
            </View>
            <View style={styles.grow} />
            {trailing ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={trailing.onPress} style={styles.pill} testID={trailing.testID}>
                <Text style={styles.pillText}>{trailing.title}</Text>
              </Pressable>
            ) : null}
          </View>
          {children}
        </SafeAreaView>
      </View>
    </FixedScheme>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#FFFFFF' },
  grow: { flex: 1 },
  halo: { position: 'absolute', top: -130, right: -140, width: 280, height: 280, borderRadius: 140 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, minHeight: 50 },
  side: { width: 44 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.85)' },
  pill: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.85)' },
  pillText: { fontSize: 17, lineHeight: 22, color: CONNECT_LINK },
});
