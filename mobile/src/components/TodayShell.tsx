import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { conditionSymbol } from '../lib/weather';
import { brand, useTheme } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NexdoLogoMark } from './NexdoLogoMark';
import { AccountAvatar } from './ProfileParts';
import { useHeaderInset } from './PushedHeader';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * The app-shell pieces the Tasks tab shares with Today. Ported now because `TasksView` draws them
 * (ios/App/RootView.swift:1645); Phase 4 builds the Today screen itself around the same components.
 */

/** `NexdoTheme.gradient` (RootView.swift:2119): magenta → indigo → blue, leading to trailing. */
export const NEXDO_GRADIENT = [brand.nexdoMagenta, brand.nexdoIndigo, brand.nexdoBlue] as const;

/**
 * `SoftBlob` — one of the backdrop's `.blur(radius: 18)` circles.
 *
 * React Native cannot blur a view's own content, and `expo-blur` only blurs what is *behind* a view,
 * so neither reproduces a blurred circle. Drawing the circle hard-edged left a visible hard ring on
 * every screen that uses the backdrop.
 *
 * A Gaussian blur of a flat disc is a radial ramp, so this stacks `RINGS` concentric circles from
 * `diameter + spread` down to `diameter - spread`, each at a low alpha. Where they overlap the alpha
 * accumulates, which gives a smooth falloff; the outermost ring contributes the faint edge. Solving
 * `1 - (1 - a)^RINGS = peak` for `a` makes the centre land on the opacity Swift asks for.
 */
const RINGS = 12;

function SoftBlob({
  color,
  diameter,
  spread,
  peak,
  x,
  y,
  opacity,
}: {
  color: string;
  diameter: number;
  /** How far the blur carries past the edge; Swift's `blur(radius: 18)` reads as about 2x that. */
  spread: number;
  peak: number;
  x: number;
  y: number;
  opacity: number;
}) {
  const alpha = 1 - Math.pow(1 - peak, 1 / RINGS);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      {Array.from({ length: RINGS }, (_, index) => {
        const size = diameter + spread - (index * (2 * spread)) / (RINGS - 1);
        return (
          <View
            key={index}
            style={[
              styles.blob,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: withAlpha(color, alpha),
                marginLeft: x - size / 2,
                marginTop: y - size / 2,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

/** `TodayBackdrop` (RootView.swift:1534-1546). */
export function TodayBackdrop({ subtle = false }: { subtle?: boolean }) {
  const theme = useTheme();
  const blobOpacity = subtle ? 0.25 : 1;
  // Under a transparent pushed bar (`pushedHeaderOptions`), reach up behind it so the gradient starts
  // at the top of the screen, as `.ignoresSafeArea()` does in SwiftUI. 0 on a screen with no bar.
  const headerInset = useHeaderInset();
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { top: -headerInset, backgroundColor: subtle ? theme.colors.background : theme.colors.groupedBackground },
      ]}
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
      {/* `Circle().fill(...).frame(width: 280).blur(radius: 18).offset(x: -170, y: -360)` */}
      <SoftBlob color={brand.nexdoBlue} diameter={280} spread={36} peak={0.12} x={-170} y={-360} opacity={blobOpacity} />
      <SoftBlob color={brand.nexdoMagenta} diameter={260} spread={36} peak={0.1} x={190} y={-250} opacity={blobOpacity} />
    </View>
  );
}

/**
 * `ProfileAvatar` (ios/App/ProfileView.swift:39-58) at its 44pt top-bar size.
 *
 * Swift draws `model.profile?.photo` when there is one (`:43-46, :51`) and the first initial
 * otherwise. Phase 7 added the photo; the shared implementation is `AccountAvatar` in
 * `src/components/ProfileParts.tsx`, and this keeps the top bar's own sizing default.
 */
export function ProfileAvatar({ name, photo, size = 44 }: { name: string; photo?: string | null; size?: number }) {
  return <AccountAvatar name={name} photo={photo} size={size} />;
}

/**
 * `TodayHeaderButton` (RootView.swift:1343-1356): a 44pt gradient circle.
 */
export function TodayHeaderButton({
  icon,
  label,
  onPress,
  testID,
  disabled = false,
}: {
  icon: 'plus';
  label: string;
  onPress: () => void;
  testID?: string;
  /** `.disabled(_:)` on the button (ProjectsView.swift:204); SwiftUI dims a disabled button. */
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={disabled ? { opacity: 0.3 } : undefined}
    >
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
 * The accessibility label names the forecast's place: San Ramon on iOS, where `WeatherClient`
 * hardcodes those coordinates, and the device's town on Android (see `resolveWeatherPlace`).
 */
export function WeatherChip({
  temperature,
  weatherCode,
  place = 'San Ramon',
  onPress,
  testID,
}: {
  temperature: number | null;
  weatherCode: number | null | undefined;
  /** The forecast's place, for the accessibility label. */
  place?: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={
        temperature === null ? 'Weather temporarily unavailable' : `${place} weather, ${temperature} degrees Fahrenheit`
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
  photo,
}: {
  name: string;
  onAccount: () => void;
  /** Omitted by the Tasks tab, which sets `showsWeather: false`. */
  weather?: { temperature: number | null; weatherCode: number | null | undefined; place?: string; onPress: () => void };
  /** Omitted by the Tasks tab, which passes `add: nil`. */
  onAdd?: () => void;
  /** `model.profile?.photo` — the stored `data:image/jpeg;base64,…` URL, when there is one. */
  photo?: string | null;
}) {
  const theme = useTheme();
  // SwiftUI insets a ScrollView's content by the safe area; React Native does not, and on Android
  // `contentInsetAdjustmentBehavior` is iOS-only, so the bar drew under the status bar and the
  // wordmark collided with the clock. Today and Tasks both render this bar, so insetting it here
  // fixes both. A screen that puts the bar inside a ScrollView still scrolls under the status bar,
  // which is what SwiftUI does too.
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.topBar, { paddingTop: insets.top }]}>
      <View accessible accessibilityLabel="Nexdo" style={styles.brandGroup}>
        <NexdoLogoMark width={40} height={30} />
        <View style={styles.brandText}>
          <View style={styles.brandRow}>
            {/* TODO(phase3-decision): `.design: .rounded` (SF Rounded) has no bundled equivalent —
                the same gap the style map records for the auth titles. */}
            <Text style={[styles.brandName, { color: theme.colors.ink }]}>Nexdo</Text>
            {/* `Image(systemName: "sparkles").font(.system(size: 17.28))` in indigo, 3pt after the
                wordmark (RootView.swift:1298-1299). */}
            <TaskSymbol name="sparkles" size={17} color={theme.colors.link} />
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
          place={weather.place}
          onPress={weather.onPress}
          testID="weather-chip"
        />
      ) : null}

      {onAdd ? <TodayHeaderButton icon="plus" label="Add a task" onPress={onAdd} testID="today-add" /> : null}

      <Pressable accessibilityRole="button" accessibilityLabel={`Open account for ${name}`} onPress={onAccount} testID="open-account">
        <ProfileAvatar name={name} photo={photo} size={44} />
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
