import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { TodayBackdrop } from '../../components/TodayShell';
import { brand, useTheme } from '../../theme';
import { MomentConfetti, systemColors } from '../moments/components';
import { SHOPPING_GRADIENT } from './components';

/** `ShoppingCompletionSummary` (ios/App/ShoppingViews.swift:402-409). */
export type ShoppingCompletionSummary = {
  listName: string;
  purchased: number;
  total: number;
  remaining: number;
  /** The server answered `complete` with a list that is still open: next week's. */
  nextListReady: boolean;
};

/** `completeTrip()`'s summary (ShoppingViews.swift:357-363), from the list as it was when completed. */
export function completionSummary(finished: { title: string; items: { checked: boolean }[] }, next: { completedAt?: string | null }): ShoppingCompletionSummary {
  const remaining = finished.items.filter((item) => !item.checked).length;
  return {
    listName: finished.title,
    purchased: finished.items.length - remaining,
    total: finished.items.length,
    remaining,
    nextListReady: next.completedAt == null,
  };
}

/** `.font(.system(size: 32, weight: .bold, design: .rounded))`. Android has no rounded system face. */
const ROUNDED = Platform.select({ ios: 'ui-rounded', default: undefined });

function Metric({ value, label, icon, color, testID }: { value: number; label: string; icon: 'checkmark-circle' | 'basket' | 'bookmark'; color: string; testID: string }) {
  const theme = useTheme();
  return (
    <View style={styles.metric} testID={testID}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.metricValue, { color: theme.colors.ink }]}>{String(value)}</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={[styles.caption, { color: theme.colors.secondary }]}>
        {label}
      </Text>
    </View>
  );
}

/**
 * `ShoppingCompletionView` (ios/App/ShoppingViews.swift:411-480), presented `.fullScreenCover(item:)`
 * (`:304-306`) after Complete Shopping. `MomentConfetti` plays once unless Reduce Motion is on.
 */
export function ShoppingCompletionView({ summary, onDone, onUseAgain }: { summary: ShoppingCompletionSummary | null; onDone: () => void; onUseAgain: () => void }) {
  const theme = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" visible={summary !== null} onRequestClose={onDone}>
      {summary ? (
        <View onLayout={(event) => setSize(event.nativeEvent.layout)} style={[styles.fill, { backgroundColor: theme.colors.background }]} testID="shopping-completion">
          <TodayBackdrop />
          {/* The two soft circles, offset from the centre (`:420-421`). */}
          <View pointerEvents="none" style={[styles.circle, { width: 300, height: 300, borderRadius: 150, left: size.width / 2 - 150 - 155, top: size.height / 2 - 150 - 310, backgroundColor: withAlpha(brand.nexdoBlue, 0.08) }]} />
          <View pointerEvents="none" style={[styles.circle, { width: 260, height: 260, borderRadius: 130, left: size.width / 2 - 130 + 170, top: size.height / 2 - 130 - 220, backgroundColor: withAlpha(systemColors.pink, 0.08) }]} />

          {/* `.ignoresSafeArea(edges: .bottom)`: the top inset is kept, the bottom is not. */}
          <SafeAreaView edges={['top', 'left', 'right']} style={styles.fill}>
            <View style={styles.topSpacer} />
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.badgeWrap}>
              <LinearGradient colors={SHOPPING_GRADIENT} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={[styles.badge, { shadowColor: brand.nexdoIndigo }]}>
                <View style={styles.badgeRing} />
                <View style={styles.badgeFace}>
                  <MaterialCommunityIcons name="tree" size={62} color={systemColors.green} />
                </View>
              </LinearGradient>
            </View>

            <Text style={[styles.title, { color: theme.colors.ink }]}>Great job for saving a branch on a tree!</Text>
            <Text style={[styles.completed, { color: brand.nexdoIndigo }]}>Completed</Text>
            <Text style={[styles.listName, { color: theme.colors.secondary }]} testID="completion-list-name">
              {summary.listName}
            </Text>

            <View style={[styles.metrics, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.1), shadowColor: theme.colors.ink }]} testID="completion-metrics">
              <Metric value={summary.purchased} label="Purchased" icon="checkmark-circle" color={systemColors.green} testID="metric-purchased" />
              <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
              <Metric value={summary.total} label="Total items" icon="basket" color={brand.nexdoBlue} testID="metric-total" />
              {summary.remaining > 0 ? (
                <>
                  <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
                  <Metric value={summary.remaining} label="Saved" icon="bookmark" color={systemColors.orange} testID="metric-saved" />
                </>
              ) : null}
            </View>

            <Text style={[styles.message, { color: theme.colors.secondary }]}>
              {summary.remaining === 0 ? 'Everything on your list is taken care of.' : 'Your unchecked items are safely kept in this list.'}
            </Text>

            <View style={styles.bottomSpacer} />

            <View style={styles.buttons}>
              <Pressable accessibilityRole="button" onPress={onDone} testID="shopping-completion-done">
                <LinearGradient colors={SHOPPING_GRADIENT} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.button}>
                  <Text style={[styles.headline, { color: '#FFFFFF' }]}>Done</Text>
                </LinearGradient>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onUseAgain}
                style={[styles.button, styles.buttonRow, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.18), borderWidth: 1 }]}
                testID="shopping-completion-use-again"
              >
                {/* `arrow.counterclockwise`: Ionicons' circular arrow, mirrored. */}
                <Ionicons name="refresh" size={19} color={brand.nexdoIndigo} style={styles.mirrored} />
                <Text style={[styles.headline, { color: brand.nexdoIndigo }]}>{summary.nextListReady ? 'View Next Shopping List' : 'Use This List Again'}</Text>
              </Pressable>
            </View>
          </SafeAreaView>
          <MomentConfetti width={size.width} height={size.height} />
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  circle: { position: 'absolute' },
  // `Spacer(minLength: 44)` above and `Spacer(minLength: 32)` below share the free height.
  topSpacer: { flexGrow: 1, minHeight: 44 },
  bottomSpacer: { flexGrow: 1, minHeight: 32 },
  badgeWrap: { alignItems: 'center', paddingBottom: 28 },
  // 132 gradient circle, `.shadow(color: nexdoIndigo.opacity(0.24), radius: 24, y: 12)`.
  badge: { width: 132, height: 132, borderRadius: 66, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.24, shadowRadius: 12, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  badgeRing: { position: 'absolute', width: 116, height: 116, borderRadius: 58, borderWidth: 2, borderColor: 'rgba(255,255,255,0.42)' },
  badgeFace: { width: 108, height: 108, borderRadius: 54, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: ROUNDED, fontSize: 32, lineHeight: 38, fontWeight: '700', textAlign: 'center', paddingHorizontal: 28 },
  // `.title3.weight(.semibold)`, `.subheadline`
  completed: { fontSize: 20, lineHeight: 25, fontWeight: '600', textAlign: 'center', paddingTop: 10 },
  listName: { fontSize: 15, lineHeight: 20, textAlign: 'center', paddingTop: 5 },
  metrics: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    marginHorizontal: 24,
    marginTop: 30,
    borderRadius: 24,
    borderWidth: 1,
    shadowOpacity: 0.07,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  metric: { flex: 1, alignItems: 'center', gap: 5 },
  // `.title2.bold()`, `.caption`
  metricValue: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 16 },
  divider: { width: StyleSheet.hairlineWidth, height: 62 },
  message: { fontSize: 15, lineHeight: 20, textAlign: 'center', paddingHorizontal: 38, paddingTop: 18 },
  buttons: { gap: 12, paddingHorizontal: 24, paddingBottom: 28 },
  button: { minHeight: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  buttonRow: { flexDirection: 'row', gap: 8 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  mirrored: { transform: [{ scaleX: -1 }] },
});
