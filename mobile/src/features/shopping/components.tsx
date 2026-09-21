import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Component, type ReactNode } from 'react';
import { Animated, Image, PanResponder, Pressable, StyleSheet, View, type GestureResponderHandlers, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

import type { GroceryItem } from '../../api/shopping';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { brand, linearGradientStops, useTheme } from '../../theme';
import { systemColors, type IconName } from '../moments/components';
import { amountLabel, artworkFor, type GroceryAsset } from './model';

/** The five bundled illustrations (ios/Media.xcassets/grocery-*.imageset), downscaled from 1254 px to 256 px: they draw at 44 dp, 176 px even at xxxhdpi. */
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

/**
 * The SF Symbols `listTile` uses that Ionicons has no single glyph for: `doc.badge.plus` is a page with
 * a plus badge at its lower leading corner, and `arrow.counterclockwise` is Ionicons' circular arrow
 * mirrored.
 */
export type ListSymbol = IconName | 'doc.badge.plus' | 'arrow.counterclockwise';

/** `listTile(_:color:)` (ShoppingViews.swift:139-142): a `.title2` symbol on a 48pt tile at 12%. */
export function ListTile({ icon, color }: { icon: ListSymbol; color: string }) {
  let glyph;
  if (icon === 'doc.badge.plus') {
    glyph = (
      <View>
        <Ionicons name="document-outline" size={24} color={color} />
        <View style={[styles.badge, { backgroundColor: color }]}>
          <Ionicons name="add" size={10} color="#FFFFFF" />
        </View>
      </View>
    );
  } else if (icon === 'arrow.counterclockwise') {
    glyph = <Ionicons name="refresh" size={24} color={color} style={styles.mirrored} />;
  } else glyph = <Ionicons name={icon} size={24} color={color} />;
  return <View style={[styles.listTile, { backgroundColor: withAlpha(color, 0.12) }]}>{glyph}</View>;
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
 * `GroceryRow` (ios/App/ShoppingViews.swift:612-642): a square checkbox, the artwork and text as an
 * edit button, and a blue star that opens Item Alternatives — three separate targets. Shopping Detail
 * passes `readOnly: false` even for a completed list (`:274`); saving one creates a new list (`:365-373`).
 */
export function GroceryRow({
  row,
  readOnly = false,
  onToggle,
  onEdit,
  onAlternatives,
}: {
  row: GroceryItem;
  readOnly?: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAlternatives: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {/* `checkmark.square.fill` in nexdoBlue / `square` in nexdoSecondary at 65%, `.title3`. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={row.checked ? `Uncheck ${row.name}` : `Check ${row.name}`}
        accessibilityState={{ disabled: readOnly, checked: row.checked }}
        disabled={readOnly}
        onPress={onToggle}
        hitSlop={8}
        testID={`grocery-check-${row.id}`}
      >
        <Ionicons name={row.checked ? 'checkbox' : 'square-outline'} size={22} color={row.checked ? brand.nexdoBlue : withAlpha(theme.colors.secondary, 0.65)} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${row.name}`} disabled={readOnly} onPress={onEdit} style={styles.rowBody} testID={`grocery-edit-${row.id}`}>
        <GroceryArtwork item={row} />
        <View style={styles.rowText}>
          <Text style={[styles.name, { color: theme.colors.ink, textDecorationLine: row.checked ? 'line-through' : 'none' }]}>{row.name}</Text>
          <Text style={[styles.caption, { color: theme.colors.secondary }]} testID={`grocery-amount-${row.id}`}>
            {amountLabel(row)}
          </Text>
          {row.notes !== '' ? (
            <Text numberOfLines={1} style={[styles.caption2, { color: theme.colors.secondaryLabel }]}>
              {row.notes}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show alternatives for ${row.name}`}
        disabled={readOnly}
        onPress={onAlternatives}
        style={styles.star}
        testID={`grocery-star-${row.id}`}
      >
        <Ionicons name="star" size={19} color={brand.nexdoBlue} />
      </Pressable>
    </View>
  );
}

/**
 * Where iOS starts a `List` row's separator: under the row's first `Text`. An emoji artwork IS a
 * `Text`, so its row's line starts under the emoji; a photo or an illustration is an `Image`, so the
 * line starts under the name (`shopping-detail-redesign`: 69 pt against 117 pt from the screen edge).
 */
export function grocerySeparatorInset(row: Pick<GroceryItem, 'name' | 'category' | 'imageData'>): number {
  // Row inset 18, checkbox 20, spacing 11 — then the artwork's 40 and another 11 before the name. An
  // emoji's glyph starts about 3 pt inside its 40 pt frame.
  const artwork = 18 + 20 + 11;
  return artworkFor(row).kind === 'emoji' ? artwork + 3 : artwork + 40 + 11;
}

/** `categoryLabel(_:)` (ShoppingViews.swift:397-399). */
export function categoryLabel(category: string): string {
  if (category === 'Dairy & Eggs') return 'Dairy';
  if (category === 'Meat & Seafood') return 'Meat';
  return category;
}

/** `categoryChip(_:count:)` (ShoppingViews.swift:388-396): "Label (N)", solid blue when selected. */
export function CategoryChip({ category, count, selected, onPress }: { category: string; count: number; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? brand.nexdoBlue : withAlpha(brand.nexdoIndigo, 0.06) }]}
      testID={`chip-${category}`}
    >
      <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : theme.colors.secondary }]}>{`${categoryLabel(category)} (${count})`}</Text>
    </Pressable>
  );
}

/** The width of the revealed Delete action. */
const SWIPE_ACTION = 82;

/**
 * `.swipeActions { Button("Delete", role: .destructive) { … } }` (ShoppingViews.swift:275): swipe left
 * to reveal Delete, or all the way across to delete at once, as a full swipe does on iOS. Built on
 * `PanResponder` and `Animated`, so it needs no native module. Screen readers get it as the "Delete"
 * custom action, the way iOS offers a swipe action to VoiceOver.
 */
type SwipeProps = { children: ReactNode; onDelete: () => void; testID?: string };

/**
 * A class, because the recogniser is created once and keeps mutable gesture state (the row width, the
 * resting offset) that must never trigger a render — exactly what instance fields are for.
 */
export class SwipeToDelete extends Component<SwipeProps, { revealed: boolean }> {
  state = { revealed: false };
  private offset = new Animated.Value(0);
  private base = 0;
  private width = 0;

  private settle = (to: number) => {
    this.base = to;
    this.setState({ revealed: to !== 0 });
    Animated.spring(this.offset, { toValue: to, useNativeDriver: true, bounciness: 0 }).start();
  };

  private responder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderGrant: () => this.setState({ revealed: true }),
    onPanResponderMove: (_, gesture) => this.offset.setValue(Math.min(0, this.base + gesture.dx)),
    onPanResponderRelease: (_, gesture) => {
      const at = this.base + gesture.dx;
      if (this.width > 0 && at < -this.width * 0.6) {
        this.base = 0;
        Animated.timing(this.offset, { toValue: -this.width, duration: 160, useNativeDriver: true }).start(() => this.props.onDelete());
      } else this.settle(at < -SWIPE_ACTION / 2 ? -SWIPE_ACTION : 0);
    },
    onPanResponderTerminate: () => this.settle(0),
  });

  render() {
    const { children, onDelete, testID } = this.props;
    return (
      <View
        accessibilityActions={[{ name: 'delete', label: 'Delete' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'delete') onDelete();
        }}
        onLayout={(event) => {
          this.width = event.nativeEvent.layout.width;
        }}
        style={styles.swipe}
        testID={testID}
      >
        {this.state.revealed ? (
          <View style={styles.swipeActions}>
            <SwipeDeleteButton
              onPress={() => {
                this.settle(0);
                onDelete();
              }}
              testID={testID ? `${testID}-delete` : undefined}
            />
          </View>
        ) : null}
        <SwipeSurface offset={this.offset} handlers={this.responder.panHandlers}>
          {children}
        </SwipeSurface>
      </View>
    );
  }
}

function SwipeDeleteButton({ onPress, testID }: { onPress: () => void; testID?: string }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Delete" onPress={onPress} style={[styles.swipeDelete, { backgroundColor: theme.colors.danger }]} testID={testID}>
      <Text style={styles.swipeDeleteText}>Delete</Text>
    </Pressable>
  );
}

function SwipeSurface({ children, offset, handlers }: { children: ReactNode; offset: Animated.Value; handlers: GestureResponderHandlers }) {
  const theme = useTheme();
  return (
    <Animated.View {...handlers} style={{ backgroundColor: theme.colors.surface, transform: [{ translateX: offset }] }}>
      {children}
    </Animated.View>
  );
}

/** `NexdoTheme.gradient`: magenta → indigo → blue, leading to trailing. */
export const SHOPPING_GRADIENT = linearGradientStops([brand.nexdoMagenta, brand.nexdoIndigo, brand.nexdoBlue]);

/**
 * Global pattern 13: `safeAreaInset(edge: .bottom, spacing: 0)` holding the buttons on
 * `.ultraThinMaterial`, with a half-opacity `Divider` along the top. The content scrolls underneath,
 * so the bar floats over it and the screen pads its scroll content by the bar's measured height.
 */
export function StickyActionBar({ children, onHeight, style, testID }: { children: ReactNode; onHeight?: (height: number) => void; style?: StyleProp<ViewStyle>; testID?: string }) {
  const theme = useTheme();
  return (
    <View onLayout={(event) => onHeight?.(event.nativeEvent.layout.height)} style={[styles.stickyBar, { backgroundColor: theme.colors.glassFill }, style]} testID={testID}>
      <BlurView intensity={40} tint={theme.scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[styles.stickyDivider, { backgroundColor: withAlpha(theme.colors.separator, 0.5) }]} />
      {children}
    </View>
  );
}

/**
 * `shoppingActions` (ShoppingViews.swift:312-331): Complete Shopping (gradient) and AI Powered
 * Recommendations (outlined), both disabled while the store is busy.
 */
export function ShoppingActionBar({ busy, onComplete, onRecommendations, onHeight }: { busy: boolean; onComplete: () => void; onRecommendations: () => void; onHeight?: (height: number) => void }) {
  const theme = useTheme();
  return (
    <StickyActionBar onHeight={onHeight} style={styles.actionBar} testID="shopping-actions">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Complete Shopping"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onComplete}
        style={styles.actionButton}
        testID="shopping-complete-trip"
      >
        <LinearGradient colors={SHOPPING_GRADIENT} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={[styles.actionFill, busy && styles.dimmed]}>
          <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
          <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={2} style={[styles.actionText, { color: '#FFFFFF' }]}>
            Complete Shopping
          </Text>
        </LinearGradient>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="AI Powered Recommendations"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onRecommendations}
        style={[styles.actionButton, styles.actionFill, busy && styles.dimmed, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.22), borderWidth: 1 }]}
        testID="shopping-ai-recommendations"
      >
        <Ionicons name="sparkles" size={18} color={brand.nexdoIndigo} />
        <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={2} style={[styles.actionText, { color: brand.nexdoIndigo }]}>
          AI Powered Recommendations
        </Text>
      </Pressable>
    </StickyActionBar>
  );
}

const styles = StyleSheet.create({
  artwork: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  photo: { width: 40, height: 44, borderRadius: 8 },
  fill: { width: 40, height: 44 },
  emoji: { fontSize: 29, lineHeight: 36 },
  listTile: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', left: -3, bottom: -2, width: 12, height: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  mirrored: { transform: [{ scaleX: -1 }] },
  shoppingIcon: { width: 56, height: 56, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  // `HStack(spacing: 11) … .padding(.vertical, 5)` inside the List row's own insets.
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 5 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  rowText: { flex: 1, gap: 3 },
  // `.subheadline.weight(.semibold)`, `.caption`, `.caption2`
  name: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16 },
  caption2: { fontSize: 11, lineHeight: 13 },
  star: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  // `.padding(.horizontal, 13).padding(.vertical, 8)`, `.caption.weight(.semibold)`, `Capsule()`
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  swipe: { overflow: 'hidden' },
  swipeActions: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'flex-end' },
  swipeDelete: { width: SWIPE_ACTION, alignItems: 'center', justifyContent: 'center' },
  swipeDeleteText: { color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '600' },
  stickyBar: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  stickyDivider: { position: 'absolute', left: 0, right: 0, top: 0, height: StyleSheet.hairlineWidth },
  // `HStack(spacing: 10) … .padding(.horizontal, 16).padding(.vertical, 10)`
  actionBar: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  actionButton: { flex: 1, borderRadius: 17 },
  // `.frame(maxWidth: .infinity, minHeight: 52)`, radius 17; the `Label` centred.
  actionFill: { minHeight: 52, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, gap: 8 },
  actionText: { flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  dimmed: { opacity: 0.55 },
});
