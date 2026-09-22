import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GroceryItem, GroceryList, ShoppingAlternative } from '../../api/shopping';
import { GlassCircle } from '../../components/PushedHeader';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { TodayBackdrop } from '../../components/TodayShell';
import { brand, useTheme } from '../../theme';
import { systemColors } from '../moments/components';
import { GroceryArtwork, SHOPPING_GRADIENT, StickyActionBar } from './components';
import { alternativeId, alternativeItem, amountLabel } from './model';
import { useShoppingAlternatives } from './useAlternatives';

/**
 * `ShoppingAlternativesView` (ios/App/ShoppingViews.swift:511-609), opened from a row's star as
 * `.sheet(item: $alternativesFor)` at the `.large` detent with a drag indicator (`:300-303`).
 *
 * Loading (`:525`) is a plain sheet with a labelled spinner; the error (`:526-528`) is reachable only
 * with an expired session, because `ShoppingStore.alternatives` answers every other failure with the
 * local fallback (ShoppingStore.swift:36-42). Replace keeps the original's id and checked state; Add
 * to Cart Instead appends (`:344-352`). Both close the sheet.
 */
export function ShoppingAlternativesSheet({
  list,
  original,
  save,
  onClose,
}: {
  list: GroceryList;
  original: GroceryItem | null;
  save: (next: GroceryList) => void | Promise<void>;
  onClose: () => void;
}) {
  const theme = useTheme({ elevated: true });
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'android' ? insets.top + 8 : 0;
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      statusBarTranslucent
      transparent={Platform.OS === 'android'}
      visible={original !== null}
    >
      {Platform.OS === 'android' ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim]} /> : null}
      <View style={[styles.sheet, { backgroundColor: theme.colors.background, marginTop: top }, Platform.OS === 'android' && styles.sheetShape]} testID="shopping-alternatives">
        {original ? <AlternativesBody key={original.id} list={list} original={original} save={save} onClose={onClose} /> : null}
      </View>
    </Modal>
  );
}

function AlternativesBody({ list, original, save, onClose }: { list: GroceryList; original: GroceryItem; save: (next: GroceryList) => void | Promise<void>; onClose: () => void }) {
  const theme = useTheme({ elevated: true });
  const insets = useSafeAreaInsets();
  const state = useShoppingAlternatives({ list, original, save });

  const bar = (
    <View style={styles.bar}>
      {/* `.presentationDragIndicator(.visible)` */}
      <View style={[styles.grabber, { backgroundColor: theme.colors.placeholder }]} />
      <View style={styles.side} />
      <Text accessibilityRole="header" style={[styles.headline, styles.barTitle, { color: theme.colors.ink }]}>
        Item Alternatives
      </Text>
      <View style={[styles.side, styles.trailing]}>
        <Pressable accessibilityLabel="Close alternatives" accessibilityRole="button" hitSlop={6} onPress={onClose} testID="alternatives-close">
          <GlassCircle>
            <Ionicons name="close" size={24} color={theme.colors.link} />
          </GlassCircle>
        </Pressable>
      </View>
    </View>
  );

  if (state.loading) {
    return (
      <View style={styles.fill}>
        {bar}
        <View style={styles.center} testID="alternatives-loading">
          <ActivityIndicator color={theme.colors.link} />
          <Text style={[styles.body, { color: theme.colors.secondaryLabel }]}>Finding useful alternatives…</Text>
        </View>
      </View>
    );
  }

  if (state.error !== null || !state.result) {
    return (
      <View style={styles.fill}>
        {bar}
        <View style={[styles.center, styles.errorBody]} testID="alternatives-error">
          <Ionicons name="cloud-offline-outline" size={48} color={theme.colors.secondaryLabel} />
          <Text style={[styles.errorTitle, { color: theme.colors.label }]}>Couldn’t load alternatives</Text>
          <Text style={[styles.body, styles.centered, { color: theme.colors.secondaryLabel }]}>{state.error ?? ''}</Text>
        </View>
        {/* `.buttonStyle(.borderedProminent).tint(.nexdoBlue).padding(.bottom, 34)` */}
        <View style={[styles.retryWrap, { paddingBottom: 34 + insets.bottom }]}>
          <Pressable accessibilityRole="button" onPress={() => void state.load()} style={[styles.retry, { backgroundColor: brand.nexdoBlue }]} testID="alternatives-retry">
            <Text style={[styles.body, styles.retryText]}>Try Again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const result = state.result;
  const selected = state.selected;
  return (
    <View style={styles.fill}>
      <TodayBackdrop />
      {bar}
      <ScrollView contentContainerStyle={styles.content} testID="alternatives-scroll">
        {/* `originalCard` (:559-571) */}
        <View style={[styles.card, styles.originalCard, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.1) }]} testID="alternatives-original">
          <View style={styles.originalArt}>
            <GroceryArtwork item={original} />
          </View>
          <View style={styles.originalText}>
            <Text style={[styles.headline, { color: theme.colors.ink }]}>{original.name}</Text>
            <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>{amountLabel(original)}</Text>
            <View style={[styles.originalBadge, { backgroundColor: withAlpha(brand.nexdoBlue, 0.09) }]}>
              <Text style={[styles.captionSemibold, { color: brand.nexdoBlue }]}>Original Item</Text>
            </View>
          </View>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Ionicons name="star" size={25} color={brand.nexdoBlue} />
          </View>
        </View>

        {/* Heading (:533-536) */}
        <View style={styles.heading}>
          <Text style={[styles.title3, { color: theme.colors.ink }]}>AI Recommended Alternatives</Text>
          <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>Practical swaps based on the item in your list.</Text>
        </View>

        {/* The rows (:537-544, row :572-588) */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.1) }]} testID="alternatives-list">
          {result.alternatives.map((alternative, index) => (
            <View key={alternativeId(alternative)}>
              <AlternativeRow alternative={alternative} selected={state.selectedId === alternativeId(alternative)} onSelect={() => state.select(alternativeId(alternative))} />
              {index < result.alternatives.length - 1 ? <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} /> : null}
            </View>
          ))}
        </View>

        {/* Nexdo Tip (:545-549) */}
        <View style={[styles.tip, { backgroundColor: withAlpha(brand.nexdoBlue, 0.08) }]} testID="alternatives-tip">
          <Ionicons name="sparkles" size={24} color={brand.nexdoBlue} />
          <View style={styles.tipText}>
            <Text style={[styles.subheadlineBold, { color: brand.nexdoBlue }]}>Nexdo Tip</Text>
            <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>{result.tip}</Text>
          </View>
        </View>
      </ScrollView>

      {/* `actionBar` (:589-600) */}
      <StickyActionBar style={[styles.actionBar, { paddingBottom: 8 + insets.bottom }]} testID="alternatives-actions">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: selected === null }}
          disabled={selected === null}
          onPress={() => {
            if (state.replace()) onClose();
          }}
          style={selected === null && styles.half}
          testID="alternatives-replace"
        >
          <LinearGradient colors={SHOPPING_GRADIENT} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.replace}>
            <Text style={[styles.headline, { color: '#FFFFFF' }]}>Replace with Selected Item</Text>
          </LinearGradient>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: selected === null }}
          disabled={selected === null}
          onPress={() => {
            if (state.addInstead()) onClose();
          }}
          style={styles.add}
          testID="alternatives-add"
        >
          <Text style={[styles.subheadlineSemibold, { color: brand.nexdoBlue }]}>Add to Cart Instead</Text>
        </Pressable>
      </StickyActionBar>
    </View>
  );
}

/** `alternativeRow(_:)` (ShoppingViews.swift:572-588). The whole row selects; the pill is its state. */
function AlternativeRow({ alternative, selected, onSelect }: { alternative: ShoppingAlternative; selected: boolean; onSelect: () => void }) {
  const theme = useTheme({ elevated: true });
  return (
    <Pressable
      accessibilityLabel={`Select ${alternative.name} as replacement`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={styles.row}
      testID={`alternative-${alternative.name}`}
    >
      <GroceryArtwork item={alternativeItem(alternative, alternativeId(alternative))} />
      <View style={styles.rowText}>
        <Text style={[styles.subheadlineSemibold, { color: theme.colors.ink }]}>{alternative.name}</Text>
        {/* `Label(reason, systemImage: "leaf.fill").font(.caption)` in green. */}
        <View style={styles.reason}>
          <Ionicons name="leaf" size={12} color={systemColors.green} style={styles.reasonIcon} />
          <Text style={[styles.caption, styles.shrink, { color: systemColors.green }]}>{alternative.reason}</Text>
        </View>
        <Text numberOfLines={2} style={[styles.caption, { color: theme.colors.secondary }]}>
          {alternative.detail}
        </Text>
      </View>
      <View style={[styles.pill, selected ? { backgroundColor: brand.nexdoBlue } : { borderColor: withAlpha(brand.nexdoBlue, 0.28), borderWidth: 1 }]} testID={`alternative-pill-${alternative.name}`}>
        <Text style={[styles.captionBold, { color: selected ? '#FFFFFF' : brand.nexdoBlue }]}>{selected ? 'Selected' : 'Replace'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sheet: { flex: 1 },
  sheetShape: { borderTopLeftRadius: 38, borderTopRightRadius: 38, overflow: 'hidden' },
  dim: { backgroundColor: 'rgba(0, 0, 0, 0.25)' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, minHeight: 68 },
  grabber: { position: 'absolute', top: 6, alignSelf: 'center', left: '50%', marginLeft: -18, width: 36, height: 5, borderRadius: 2.5 },
  side: { width: 60 },
  trailing: { alignItems: 'flex-end' },
  barTitle: { flex: 1, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  centered: { textAlign: 'center' },
  errorBody: { paddingHorizontal: 40 },
  errorTitle: { fontSize: 22, lineHeight: 28, fontWeight: '700', marginTop: 8 },
  retryWrap: { alignItems: 'center' },
  retry: { borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '600' },
  // `VStack(alignment: .leading, spacing: 18).padding(.horizontal, 18).padding(.top, 12).padding(.bottom, 116)`
  content: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 116, gap: 18 },
  card: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  // `HStack(spacing: 13) … .padding(15)`
  originalCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15 },
  originalArt: { width: 56, height: 58, alignItems: 'center', justifyContent: 'center' },
  originalText: { flex: 1, gap: 4, alignItems: 'flex-start' },
  originalBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  heading: { gap: 3 },
  // `HStack(spacing: 11) … .padding(.horizontal, 14).padding(.vertical, 11)`
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 11 },
  rowText: { flex: 1, gap: 3, marginRight: 4 },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  reasonIcon: { marginTop: 2 },
  shrink: { flexShrink: 1 },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  // `Divider().padding(.leading, 70)`
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 70 },
  // `HStack(alignment: .top, spacing: 10) … .padding(16)`, radius 18
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 16, borderRadius: 18 },
  tipText: { flex: 1, gap: 3 },
  // `VStack(spacing: 7) … .padding(.horizontal, 18).padding(.top, 10).padding(.bottom, 8)`
  actionBar: { gap: 7, paddingHorizontal: 18, paddingTop: 10 },
  replace: { minHeight: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  half: { opacity: 0.5 },
  add: { minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  body: { fontSize: 17, lineHeight: 22 },
  subheadline: { fontSize: 15, lineHeight: 20 },
  subheadlineSemibold: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  subheadlineBold: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 16 },
  captionSemibold: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  captionBold: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
});
