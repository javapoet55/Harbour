import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { conditionSymbol } from '../lib/weather';
import { brand, useTheme } from '../theme';
import { TaskSymbol } from './TaskSymbol';
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
 * `TodayHeaderButton` (RootView.swift:1343-1356): a 44pt gradient circle.
 */
export function TodayHeaderButton({ icon, label, onPress, testID }: { icon: 'plus'; label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} testID={testID}>
      <LinearGradient colors={[...NEXDO_GRADIENT]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.headerButton}>
        <TaskSymbol name={icon} size={20} color="#FFFFFF" />
      </LinearGradient>
    </Pressable>
  );
}

/**
 * The weather chip (RootView.swift:1310-1325): a 44pt gradient circle carrying the condition glyph
 * over the temperature in Fahrenheit, or an en dash when the forecast has not loaded.
 *
 * The accessibility label names San Ramon because `WeatherClient` hardcodes those coordinates; it is
 * not derived from the account.
 */
export function WeatherChip({
  temperature,
  weatherCode,
  onPress,
  testID,
}: {
  temperature: number | null;
  weatherCode: number | null | undefined;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={
        temperature === null ? 'Weather temporarily unavailable' : `San Ramon weather, ${temperature} degrees Fahrenheit`
      }
      accessibilityHint="Opens the five-day forecast"
      onPress={onPress}
      testID={testID}
    >
      <LinearGradient colors={[...NEXDO_GRADIENT]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.headerButton}>
        <TaskSymbol name={conditionSymbol(weatherCode)} size={12} color="#FFFFFF" />
        <Text style={styles.temperature}>{temperature === null ? '\u2013\u00b0' : `${temperature}\u00b0`}</Text>
      </LinearGradient>
    </Pressable>
  );
}

/**
 * `TodayTopBar` (RootView.swift:1283-1341). The Tasks tab passes `showsWeather: false` and no `add`
 * (RootView.swift:1645); Today passes both (`:1027-1032`), so they are optional here.
 */
export function TasksTopBar({
  name,
  onAccount,
  weather,
  onAdd,
}: {
  name: string;
  onAccount: () => void;
  /** Omitted by the Tasks tab, which sets `showsWeather: false`. */
  weather?: { temperature: number | null; weatherCode: number | null | undefined; onPress: () => void };
  /** Omitted by the Tasks tab, which passes `add: nil`. */
  onAdd?: () => void;
}) {
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

      {weather ? (
        <WeatherChip
          temperature={weather.temperature}
          weatherCode={weather.weatherCode}
          onPress={weather.onPress}
          testID="weather-chip"
        />
      ) : null}

      {onAdd ? <TodayHeaderButton icon="plus" label="Add a task" onPress={onAdd} testID="today-add" /> : null}

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
  headerButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', gap: 1 },
  temperature: { fontSize: 13, lineHeight: 15, fontWeight: '700', color: '#FFFFFF' },
});
