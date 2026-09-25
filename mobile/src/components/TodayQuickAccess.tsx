import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { brand, useTheme } from '../theme';
import { GlassCard } from './GlassCard';
import { withAlpha } from './SignInBackdrop';
import { TaskSymbol, type TaskSymbolName } from './TaskSymbol';
import { Text } from './Text';
import { NEXDO_GRADIENT } from './TodayShell';

/**
 * Port of `TodayQuickAccessContent.body` (ios/App/TodayQuickAccess.swift:41-62) and its `shortcuts`,
 * `separator` and `tile(_:subtitle:symbol:color:gradient:)` (`:63-97`). Reference pattern 11.
 *
 * NOT ported: `QuickAccessDirectory` (`:99-113`). It is private and never instantiated, and the
 * "See all" link that would have opened it was removed in 86a2b49.
 *
 * The accessibility-size branch (`typeSize.isAccessibilitySize`, `:48-52`) that stacks the tiles is not
 * ported, like every other Dynamic Type re-layout in this app (see §20 "Deferred").
 */
export function TodayQuickAccess({
  momentsSubtitle,
  shoppingSubtitle,
  onWeekly,
  onMoments,
  onShopping,
}: {
  /** `"\(upcomingCount) upcoming"` (`:69`). */
  momentsSubtitle: string;
  /** `shoppingSubtitle` (`:32-40`). */
  shoppingSubtitle: string;
  onWeekly: () => void;
  onMoments: () => void;
  onShopping: () => void;
}) {
  const theme = useTheme();
  return (
    // `VStack(alignment: .leading, spacing: 14)`
    <View style={styles.section} testID="today-quick-access">
      {/* `Text("Quick Access").font(.title2.bold())` */}
      <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.ink }]}>
        Quick Access
      </Text>
      {/* `.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))` with an indigo 18%
          stroke and no shadow (`:56-57`). */}
      <GlassCard radius={24} shadow={false} stroke={withAlpha(brand.nexdoIndigo, 0.18)}>
        <View style={styles.row}>
          <Tile
            accessibilityLabel="Weekly Summary"
            gradient
            onPress={onWeekly}
            subtitle="Summary"
            symbol="chart.bar.xaxis"
            testID="quick-access-weekly"
            tint="#FFFFFF"
            title="Weekly"
          />
          <Separator />
          {/* `color: .purple` — the system purple. */}
          <Tile
            onPress={onMoments}
            subtitle={momentsSubtitle}
            symbol="gift.fill"
            testID="quick-access-moments"
            tint={theme.scheme === 'dark' ? '#BF5AF2' : '#AF52DE'}
            title="Moments"
          />
          <Separator />
          {/* `color: .green` — the system green. */}
          <Tile
            onPress={onShopping}
            subtitle={shoppingSubtitle}
            symbol="cart.fill"
            testID="quick-access-shopping"
            tint={theme.scheme === 'dark' ? '#30D158' : '#34C759'}
            title="Shopping"
          />
        </View>
      </GlassCard>
    </View>
  );
}

/** `Rectangle().fill(Color.nexdoIndigo.opacity(0.14)).frame(width: 1, height: 100)` (`:80`). */
function Separator() {
  return <View style={[styles.separator, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.14) }]} />;
}

function Tile({
  title,
  subtitle,
  symbol,
  tint,
  gradient = false,
  onPress,
  accessibilityLabel,
  testID,
}: {
  title: string;
  subtitle: string;
  symbol: TaskSymbolName;
  tint: string;
  gradient?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  testID: string;
}) {
  const theme = useTheme();
  // `Image(systemName:).font(.system(size: 28, weight: .semibold)).frame(width: 54, height: 54)` on a
  // 17pt rounded rectangle: the brand gradient, or the tile colour at 14%.
  const icon = <TaskSymbol color={tint} name={symbol} size={28} />;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? `${title}, ${subtitle}`}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.tile}
      testID={testID}
    >
      {gradient ? (
        <LinearGradient colors={[...NEXDO_GRADIENT]} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.iconTile}>
          {icon}
        </LinearGradient>
      ) : (
        <View style={[styles.iconTile, { backgroundColor: withAlpha(tint, 0.14) }]}>{icon}</View>
      )}
      {/* `VStack(spacing: 3)`: `.subheadline.bold()` title, `.caption` subtitle. */}
      <View style={styles.labels}>
        <Text style={[styles.tileTitle, { color: theme.colors.ink }]}>{title}</Text>
        <Text style={[styles.tileSubtitle, { color: theme.colors.secondary }]} testID={`${testID}-subtitle`}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: 14 },
  // `.title2.bold()`: 22/28.
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  // `HStack(alignment: .top, spacing: 0)` with `.padding(.vertical, 22).padding(.horizontal, 8)`.
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 22, paddingHorizontal: 8 },
  separator: { width: 1, height: 100 },
  // `.frame(maxWidth: .infinity).padding(.horizontal, 4)` around `VStack(spacing: 8)`.
  tile: { flex: 1, alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  iconTile: { width: 54, height: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  labels: { alignItems: 'center', gap: 3 },
  tileTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  tileSubtitle: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
});
