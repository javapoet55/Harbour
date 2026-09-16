import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { brand, useTheme } from '../theme';
import { NexdoLogoMark } from './NexdoLogoMark';
import { Text } from './Text';

/**
 * The app-shell pieces the Tasks tab shares with Today. Ported now because `TasksView` draws them
 * (ios/App/RootView.swift:1645); Phase 4 builds the Today screen itself around the same components.
 */

/** `NexdoTheme.gradient` (RootView.swift:2119): magenta → indigo → blue, leading to trailing. */
export const NEXDO_GRADIENT = [brand.nexdoMagenta, brand.nexdoIndigo, brand.nexdoBlue] as const;

/**
 * `TodayBackdrop` (RootView.swift:1534-1546).
 *
 * VISUAL GAP: the two circles are `.blur(radius: 18)` in Swift and are drawn hard-edged here, for the
 * same reason as `NexdoTaskBackdrop` — React Native cannot blur a view's own content.
 */
export function TodayBackdrop({ subtle = false }: { subtle?: boolean }) {
  const theme = useTheme();
  const blobOpacity = subtle ? 0.25 : 1;
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: subtle ? theme.colors.background : theme.colors.groupedBackground }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* LinearGradient([nexdoBlue 0.10, nexdoMagenta 0.08, clear], topLeading → center) */}
      <LinearGradient
        colors={[withAlpha(brand.nexdoBlue, 0.1), withAlpha(brand.nexdoMagenta, 0.08), 'rgba(0,0,0,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.blob, { width: 280, height: 280, borderRadius: 140, backgroundColor: withAlpha(brand.nexdoBlue, 0.12), opacity: blobOpacity, marginLeft: -170 - 140, marginTop: -360 - 140 }]} />
      <View style={[styles.blob, { width: 260, height: 260, borderRadius: 130, backgroundColor: withAlpha(brand.nexdoMagenta, 0.1), opacity: blobOpacity, marginLeft: 190 - 130, marginTop: -250 - 130 }]} />
    </View>
  );
}

/** `ProfileAvatar` (ios/App/ProfileView.swift:39-58) at its 44pt top-bar size. */
export function ProfileAvatar({ name, size = 44 }: { name: string; size?: number }) {
  // `ProfileName.firstName(from:)?.prefix(1).uppercased() ?? "U"` (Models.swift:4-11).
  const initial = name.trim().split(/\s+/)[0]?.charAt(0).toUpperCase() || 'U';
  return (
    <LinearGradient
      colors={[...NEXDO_GRADIENT]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
      accessibilityLabel="Profile picture"
    >
      {/* TODO(phase3-decision): Swift draws `model.profile?.photo` when present; the profile photo
          is Phase 7, so this always shows the initial. */}
      <Text style={{ fontSize: size * 0.4, fontWeight: '700', color: '#FFFFFF' }}>{initial}</Text>
    </LinearGradient>
  );
}

/**
 * `TodayTopBar` (RootView.swift:1283-1341) as the Tasks tab configures it: no weather, no add button
 * (`TodayTopBar(name:temperature:showsWeather:false, add:nil, account:)`, RootView.swift:1645).
 *
 * TODO(phase3-decision): the weather button and the `add` button are not built, because Tasks passes
 * neither. Phase 4 adds them for Today.
 */
export function TasksTopBar({ name, onAccount }: { name: string; onAccount: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.topBar}>
      <View accessible accessibilityLabel="Nexdo" style={styles.brandGroup}>
        <NexdoLogoMark width={40} height={30} />
        <View style={styles.brandText}>
          <View style={styles.brandRow}>
            {/* TODO(phase3-decision): `.design: .rounded` (SF Rounded) has no bundled equivalent —
                the same gap the style map records for the auth titles. */}
            <Text style={[styles.brandName, { color: theme.colors.ink }]}>Nexdo</Text>
          </View>
          <Text numberOfLines={1} style={[styles.brandTag, { color: theme.colors.secondary }]}>
            GET MORE DONE WITH AI
          </Text>
        </View>
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel={`Open account for ${name}`} onPress={onAccount} testID="open-account">
        <ProfileAvatar name={name} size={44} />
      </Pressable>
    </View>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const int = parseInt(value, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

const styles = StyleSheet.create({
  blob: { position: 'absolute', left: '50%', top: '50%' },
  avatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50 },
  brandGroup: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  brandText: { justifyContent: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  brandName: { fontSize: 24, lineHeight: 28, fontWeight: '700' },
  brandTag: { fontSize: 8, lineHeight: 10, fontWeight: '700', letterSpacing: 0.35 },
});
