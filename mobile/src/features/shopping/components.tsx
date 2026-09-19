import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import type { GroceryItem } from '../../api/shopping';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { brand, textStyles, useTheme } from '../../theme';
import { systemColors, type IconName } from '../moments/components';
import { amountLabel, artworkFor, type GroceryAsset } from './model';

/** The five bundled illustrations (ios/Media.xcassets/grocery-*.imageset), copied unchanged. */
export const GROCERY_ASSETS: Record<GroceryAsset, ImageSourcePropType> = {
  banana: require('../../../assets/grocery/banana.png'),
  eggs: require('../../../assets/grocery/eggs.png'),
  milk: require('../../../assets/grocery/milk.png'),
  onion: require('../../../assets/grocery/onion.png'),
  tomato: require('../../../assets/grocery/tomato.png'),
};

/**
 * `GroceryArtwork` (ios/App/ShoppingViews.swift:363-402): the attached photo, else the bundled
 * illustration, else an emoji — 40×44, in its own colours, hidden from accessibility.
 */
export function GroceryArtwork({ item }: { item: Pick<GroceryItem, 'name' | 'category' | 'imageData'> }) {
  const artwork = artworkFor(item);
  return (
    <View style={styles.artwork} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="grocery-artwork">
      {artwork.kind === 'photo' ? (
        <Image source={{ uri: `data:image/jpeg;base64,${artwork.base64}` }} style={styles.photo} testID="grocery-artwork-photo" />
      ) : artwork.kind === 'asset' ? (
        <Image source={GROCERY_ASSETS[artwork.asset]} resizeMode="contain" style={styles.fill} testID={`grocery-artwork-${artwork.asset}`} />
      ) : (
        <Text style={styles.emoji} testID="grocery-artwork-emoji">
          {artwork.emoji}
        </Text>
      )}
    </View>
  );
}

/** `listTile(_:color:)` (ShoppingViews.swift:139-142): a 48pt symbol tile at 12%. */
export function ListTile({ icon, color }: { icon: IconName; color: string }) {
  return (
    <View style={[styles.listTile, { backgroundColor: withAlpha(color, 0.12) }]}>
      <Ionicons name={icon} size={24} color={color} />
    </View>
  );
}

/** `shoppingIcon` (ShoppingViews.swift:30): the green cart on a 56pt tile. */
export function ShoppingIcon() {
  return (
    <View style={[styles.shoppingIcon, { backgroundColor: withAlpha(systemColors.green, 0.14) }]}>
      <Ionicons name="cart" size={28} color={systemColors.green} />
    </View>
  );
}

/**
 * `GroceryRow` (ShoppingViews.swift:335-361): the check circle and the rest of the row are TWO
 * buttons — check/uncheck and edit.
 */
export function GroceryRow({ row, readOnly, onToggle, onEdit }: { row: GroceryItem; readOnly: boolean; onToggle: () => void; onEdit: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={row.checked ? `Uncheck ${row.name}` : `Check ${row.name}`}
        accessibilityState={{ disabled: readOnly, checked: row.checked }}
        disabled={readOnly}
        onPress={onToggle}
        hitSlop={6}
        testID={`grocery-check-${row.id}`}
      >
        <Ionicons name={row.checked ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={row.checked ? systemColors.green : brand.nexdoIndigo} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${row.name}`}
        disabled={readOnly}
        onPress={onEdit}
        style={styles.rowBody}
        testID={`grocery-edit-${row.id}`}
      >
        <GroceryArtwork item={row} />
        <View style={styles.rowText}>
          <Text style={[textStyles.body, { color: theme.colors.label, textDecorationLine: row.checked ? 'line-through' : 'none' }]}>{row.name}</Text>
          {row.notes !== '' ? <Text style={[styles.caption, { color: theme.colors.secondaryLabel }]}>{row.notes}</Text> : null}
        </View>
        <Text style={[textStyles.subheadline, { color: theme.colors.secondaryLabel }]}>{amountLabel(row)}</Text>
      </Pressable>
    </View>
  );
}

/** `ProgressView(value:total:)` tinted `nexdoIndigo`. */
export function ProgressBar({ value, total }: { value: number; total: number }) {
  const theme = useTheme();
  const fraction = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  return (
    <View style={[styles.track, { backgroundColor: theme.colors.segmentTrack }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: value }}>
      <View style={[styles.bar, { width: `${fraction * 100}%`, backgroundColor: brand.nexdoIndigo }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  artwork: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  photo: { width: 40, height: 44, borderRadius: 8 },
  fill: { width: 40, height: 44 },
  emoji: { fontSize: 29, lineHeight: 36 },
  listTile: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  shoppingIcon: { width: 56, height: 56, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowText: { flex: 1 },
  caption: { fontSize: 12, lineHeight: 16 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  bar: { height: 4, borderRadius: 2 },
});
