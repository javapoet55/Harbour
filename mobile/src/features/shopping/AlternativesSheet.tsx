import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GroceryItem, GroceryList, ShoppingAlternative, ShoppingAlternativesResponse } from '../../api/shopping';
import { AddTaskByVoiceView } from '../../components/AddTaskByVoiceView';
// The xmark sits on iOS 26's glass circle (`shopping-alternatives-v2`), as the pushed bars' buttons do.
import { GlassCircle } from '../../components/PushedHeader';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { brand, linearGradientStops, textStyles, useTheme } from '../../theme';
import { systemColors } from '../moments/components';
import { useAccessibilityTextSize } from '../wellness/useAccessibilityTextSize';
import { GroceryArtwork } from './components';
import { foodVoiceContext, foodVoiceItem } from './foodVoice';
import { alternativeId, alternativeItem, amountLabel } from './model';
import {
  allergenLabels,
  alternativeValue,
  comparison,
  comparisonFactor,
  difference,
  goalSupported,
  hasSource,
  isOriginalItem,
  nutrientUnit,
  nutrientValue,
  SHOPPING_GOALS,
  sortedNutrients,
  type ShoppingGoal,
  type ShoppingNutrient,
  type ShoppingNutrition,
  type ShoppingNutritionSortColumn,
} from './productFacts';
import { shoppingStore } from './store';

/**
 * `ShoppingAlternativesView` (ios/App/ShoppingAlternativesView.swift:3-216), its panels
 * (ShoppingAlternativesDesign.swift) and `ShoppingAlternativeDetails` (:261-503), opened from a food
 * row's ★ (ShoppingViews.swift:384-387).
 *
 * The original card with its favourite star, "Why these?", the goal chips with "More", the compact
 * rows (favourite, Replace, the goals the source data supports, a nutrition line), the label reminder,
 * and "View in Cart (N)". Replace asks first and ends on "Item replaced!"; a row opens Item Details
 * pushed inside the sheet: the two items side by side, "Ask AI about this item", the sortable
 * nutrition table, allergens and best-for when the source has them, and Replace / Add to Cart Instead.
 *
 * Load errors are shown with "Try again", which skips the five-minute cache (`refresh: retry > 0`);
 * there is no local fallback. The analytics events Swift logs are not sent (§22: analytics deferred).
 */

export type AlternativeActions = {
  /** `persistAlternative` (ShoppingViews.swift:468-480) through `ShoppingSwap`: true when saved. */
  onReplace: (alternative: ShoppingAlternative) => Promise<boolean>;
  onAdd: (alternative: ShoppingAlternative) => Promise<boolean>;
  /** `favorite(_:alternativeID:)` (:493-503): `null` stars the original item. */
  onFavorite: (alternativeId: string | null) => Promise<boolean>;
};

const BLUE = brand.nexdoBlue;
const GRADIENT = linearGradientStops([brand.nexdoMagenta, brand.nexdoIndigo, brand.nexdoBlue]);
/** `NexdoGradientButtonStyle`: blue → indigo → magenta (`shopping-alternatives-v2`). */
const CART_GRADIENT = linearGradientStops([brand.nexdoBlue, brand.nexdoIndigo, brand.nexdoMagenta]);

// ---------------------------------------------------------------------------------------------
// Artwork (ShoppingAlternativesView.swift:233-259; ShoppingAlternativesDesign.swift:125-145)

const SWAP_ART: Record<'half' | 'lactosefree' | '2percent' | '1percent' | 'whole', ImageSourcePropType> = {
  half: require('../../../assets/alternatives/swap-half.png'),
  lactosefree: require('../../../assets/alternatives/swap-lactosefree.png'),
  '2percent': require('../../../assets/alternatives/swap-2percent.png'),
  '1percent': require('../../../assets/alternatives/swap-1percent.png'),
  whole: require('../../../assets/alternatives/swap-whole.png'),
};

const BREAD_ART: Record<'plain' | 'whole' | 'multi' | 'sourdough' | 'rye' | 'lowcarb', ImageSourcePropType> = {
  plain: require('../../../assets/alternatives/bread-plain.png'),
  whole: require('../../../assets/alternatives/bread-whole.png'),
  multi: require('../../../assets/alternatives/bread-multi.png'),
  sourdough: require('../../../assets/alternatives/bread-sourdough.png'),
  rye: require('../../../assets/alternatives/bread-rye.png'),
  lowcarb: require('../../../assets/alternatives/bread-lowcarb.png'),
};

/** `AlternativeArtwork.asset` (:237-244): the milk illustrations, never for plant milks. */
export function swapArt(name: string): keyof typeof SWAP_ART | null {
  const value = name.toLowerCase();
  if (value.includes('half-and-half')) return 'half';
  if (!value.includes('milk') || ['oat', 'soy', 'almond', 'coconut', 'plant'].some((word) => value.includes(word))) return null;
  if (value.includes('lactose')) return 'lactosefree';
  if (value.includes('2%') || value.includes('low-fat')) return '2percent';
  if (value.includes('1%')) return '1percent';
  return 'whole';
}

/** `BreadPackArtwork.region` (ShoppingAlternativesDesign.swift:128-133). */
export function breadArt(name: string): keyof typeof BREAD_ART {
  const value = name.toLowerCase();
  if (value.includes('whole')) return 'whole';
  if (value.includes('multi')) return 'multi';
  if (value.includes('sourdough')) return 'sourdough';
  if (value.includes('rye')) return 'rye';
  if (value.includes('low-carb')) return 'lowcarb';
  return 'plain';
}

/** Only an https product picture from `images.openfoodfacts.org` (:248). */
export function productImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^https:\/\/images\.openfoodfacts\.org(\/|$)/.test(value) ? value : null;
}

export function AlternativeArtwork({ item, productImageURL, width, height }: { item: GroceryItem; productImageURL?: string | null; width: number; height: number }) {
  const [failed, setFailed] = useState(false);
  const uri = item.imageData ? null : productImageUrl(productImageURL);
  const swap = item.imageData ? null : swapArt(item.name);
  const illustration = swap ? (
    <Image resizeMode="contain" source={SWAP_ART[swap]} style={{ width, height }} />
  ) : !item.imageData && item.name.toLowerCase().includes('bread') ? (
    <Image resizeMode="cover" source={BREAD_ART[breadArt(item.name)]} style={[{ width, height }, styles.bread]} />
  ) : (
    <View style={[{ width, height }, styles.centred]}>
      <GroceryArtwork item={item} />
    </View>
  );
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width, height }}>
      {uri && !failed ? <Image onError={() => setFailed(true)} resizeMode="contain" source={{ uri }} style={{ width, height }} testID="alternative-product-image" /> : illustration}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Formatting

const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** `value(_:nutrient:)` (:449): a whole number with its unit, or "—". */
export function nutrientText(value: number | null, nutrient: ShoppingNutrient): string {
  if (value === null) return '—';
  const unit = nutrientUnit(nutrient);
  return whole.format(Math.round(value)) + (unit === '' ? '' : ` ${unit}`);
}

/** `difference(_:)` (:450-457). */
export function differenceText(value: ReturnType<typeof comparison>, nutrient: ShoppingNutrient): string {
  const change = difference(value, nutrient);
  switch (change.kind) {
    case 'lower':
      return `↓ ${nutrientText(change.amount, nutrient)}`;
    case 'higher':
      return `↑ ${nutrientText(change.amount, nutrient)}`;
    case 'same':
      return '= Same';
    default:
      return '—';
  }
}

/** `differenceColor(_:)` (:441-448). */
function differenceColor(value: ReturnType<typeof comparison>, nutrient: ShoppingNutrient): string {
  const kind = difference(value, nutrient).kind;
  const watched = ['Saturated Fat', 'Sugar', 'Sodium'].includes(nutrient);
  if (kind === 'lower' && watched) return systemColors.green;
  if (kind === 'higher' && ['Protein', 'Fiber'].includes(nutrient)) return systemColors.green;
  if (kind === 'higher' && watched) return systemColors.red;
  return BLUE;
}

/** `nutritionSummary(_:)` (:236-238): "50 cal · 3g protein · 2g fat · 5g carbs". */
export function nutritionSummary(facts: ShoppingNutrition): string {
  const parts: [ShoppingNutrient, string][] = [
    ['Calories', 'cal'],
    ['Protein', 'protein'],
    ['Total Fat', 'fat'],
    ['Carbohydrates', 'carbs'],
  ];
  return parts
    .map(([nutrient, label]) => {
      const value = nutrientValue(nutrient, facts);
      return value === null ? null : `${whole.format(Math.round(value))}${nutrientUnit(nutrient)} ${label}`;
    })
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/** `ShoppingGoal.icon` (ShoppingAlternativesDesign.swift:16-25). */
const GOAL_ICON: Record<ShoppingGoal, keyof typeof Ionicons.glyphMap> = {
  'Lower fat': 'leaf-outline',
  'Lower sugar': 'cube-outline',
  'Lower calorie': 'speedometer-outline',
  'Higher protein': 'barbell-outline',
  'Lactose-free': 'water-outline',
  'Plant-based': 'leaf',
  'Lower price': 'pricetag-outline',
  'Gluten-free': 'cafe-outline',
  'High fiber': 'nutrition-outline',
  'Low sodium': 'water',
  'No artificial ingredients': 'ribbon-outline',
};

/** `usageIcon(_:)` (:493-495). */
function usageIcon(usage: string): keyof typeof Ionicons.glyphMap {
  switch (usage.toLowerCase()) {
    case 'coffee':
      return 'cafe-outline';
    case 'cereal':
      return 'restaurant-outline';
    case 'cooking':
      return 'flame-outline';
    case 'baking':
      return 'gift-outline';
    case 'smoothies':
      return 'beer-outline';
    default:
      return 'restaurant-outline';
  }
}

// ---------------------------------------------------------------------------------------------
// Shared pieces

/** `AlternativesBackdrop` (ShoppingAlternativesDesign.swift:3-7). */
function Backdrop() {
  const theme = useTheme();
  return (
    <LinearGradient
      colors={[theme.colors.background, withAlpha(BLUE, 0.06), withAlpha(systemColors.pink, 0.05)]}
      end={{ x: 1, y: 1 }}
      pointerEvents="none"
      start={{ x: 0, y: 0 }}
      style={StyleSheet.absoluteFill}
    />
  );
}

/** `AlternativeBlueButtonStyle` (:8-15). */
function BlueButton({ title, onPress, disabled = false, icon, testID }: { title: string; onPress: () => void; disabled?: boolean; icon?: keyof typeof Ionicons.glyphMap; testID: string }) {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.blue, icon && styles.blueRow, { backgroundColor: BLUE, opacity: disabled ? 0.4 : 1 }]}
      testID={testID}
    >
      {icon ? <Ionicons color="#FFFFFF" name={icon} size={17} /> : null}
      <Text style={[styles.headline, { color: '#FFFFFF' }]}>{title}</Text>
    </Pressable>
  );
}

/** A `.sheet` over the alternatives: a bar with the title and an xmark. */
function Panel({ visible, title, onClose, children, footer, testID }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; testID: string }) {
  const theme = useTheme({ elevated: true });
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} visible={visible}>
      <SafeAreaView edges={Platform.OS === 'ios' ? ['left', 'right'] : ['top', 'left', 'right']} style={[styles.fill, { backgroundColor: theme.colors.background }]} testID={testID}>
        <Backdrop />
        <View style={styles.bar}>
          <View style={styles.barSide} />
          <Text accessibilityRole="header" numberOfLines={1} style={[styles.headline, styles.barTitle, { color: theme.colors.ink }]}>
            {title}
          </Text>
          <Pressable accessibilityLabel="Close" accessibilityRole="button" hitSlop={8} onPress={onClose} style={[styles.barSide, styles.barTrailing]} testID={`${testID}-close`}>
            <GlassCircle>
              <Ionicons color={theme.colors.link} name="close" size={24} />
            </GlassCircle>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.panelContent}>{children}</ScrollView>
        {footer ? <View style={[styles.panelFooter, { paddingBottom: 20 + insets.bottom }]}>{footer}</View> : null}
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// The sheet

type PanelState = { kind: 'goals' } | { kind: 'why' } | { kind: 'confirm'; alternative: ShoppingAlternative } | null;

export function ShoppingAlternativesSheet({ list, original, onClose, ...actions }: { list: GroceryList; original: GroceryItem | null; onClose: () => void } & AlternativeActions) {
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
        {original ? <AlternativesBody key={original.id} list={list} original={original} onClose={onClose} {...actions} /> : null}
      </View>
    </Modal>
  );
}

function AlternativesBody({ list, original, onClose, onReplace, onAdd, onFavorite }: { list: GroceryList; original: GroceryItem; onClose: () => void } & AlternativeActions) {
  const theme = useTheme({ elevated: true });
  const insets = useSafeAreaInsets();
  const [result, setResult] = useState<ShoppingAlternativesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [goal, setGoal] = useState<ShoppingGoal | null>(null);
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<PanelState>(null);
  const [detail, setDetail] = useState<ShoppingAlternative | null>(null);
  const [completed, setCompleted] = useState<ShoppingAlternative | null>(null);

  // `savedOriginal` and `cartCount` (:20-21): the item as the list holds it now.
  const savedOriginal = list.items.find((item) => item.id === original.id) ?? original;
  const cartCount = list.items.some((item) => item.id === original.id) ? list.items.length : 0;
  const originalFacts = result?.originalFacts ?? null;
  const offered = (result?.alternatives ?? []).filter((item) => !isOriginalItem(item, original));
  const visible = offered.filter((item) => goal === null || goalSupported(goal, item, originalFacts));

  // `.task(id: retry) { await load() }` (:93): a retry skips the cache.
  const loadedFor = useRef(-1);
  useEffect(() => {
    if (loadedFor.current === retry) return;
    loadedFor.current = retry;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await shoppingStore.getState().alternatives(original, retry > 0);
        if (!cancelled) setResult(response);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const timer = setTimeout(() => void run(), 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [retry, original]);

  /** `favorite(_:)` (:150-152). */
  const favorite = (id: string | null) => {
    setSaving(true);
    void onFavorite(id).then((saved) => {
      setSaving(false);
      if (!saved) setError(shoppingStore.getState().error ?? 'Couldn’t save favorite. Please try again.');
    });
  };

  /** `apply(_:add:)` (:178-184). */
  const apply = async (alternative: ShoppingAlternative, add: boolean): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const saved = await (add ? onAdd(alternative) : onReplace(alternative));
    setSaving(false);
    if (saved) {
      if (add) {
        setPanel(null);
        onClose();
      } else {
        // `savedReplacement`, shown once the confirmation panel is gone.
        setPanel(null);
        setCompleted(alternative);
      }
    } else setError(shoppingStore.getState().error ?? 'Couldn’t save this change. Please try again.');
  };

  const favoriteButton = (id: string | null, active: boolean) => (
    <Pressable
      accessibilityLabel={active ? 'Remove favorite' : 'Add favorite'}
      accessibilityRole="button"
      accessibilityState={{ disabled: saving }}
      disabled={saving}
      onPress={() => favorite(id)}
      style={styles.square44}
      testID={`alternatives.favorite.${id ?? 'original'}`}
    >
      <Ionicons color={BLUE} name={active ? 'star' : 'star-outline'} size={20} />
    </Pressable>
  );

  if (detail) {
    return (
      <AlternativeDetails
        alternative={detail}
        error={error}
        favorite={(savedOriginal.favoriteAlternatives ?? []).includes(alternativeId(detail))}
        onAdd={() => apply(detail, true)}
        onBack={() => setDetail(null)}
        onFavorite={() => favorite(alternativeId(detail))}
        onReplace={() => setPanel({ kind: 'confirm', alternative: detail })}
        original={original}
        originalFacts={originalFacts}
        panel={panel}
        renderPanels={() => panels()}
      />
    );
  }

  function panels() {
    return (
      <>
        <GoalPicker
          onApply={(value) => setGoal(value)}
          onClose={() => setPanel(null)}
          original={original}
          selected={goal}
          visible={panel?.kind === 'goals'}
        />
        <WhyPanel onClose={() => setPanel(null)} visible={panel?.kind === 'why'} />
        <Panel
          onClose={() => {
            if (saving) return;
            setPanel(null);
            setError(null);
          }}
          testID="alternatives-confirm"
          title=""
          visible={panel?.kind === 'confirm'}
        >
          {panel?.kind === 'confirm' ? (
            <View style={styles.confirm}>
              <View style={[styles.confirmIcon, { backgroundColor: withAlpha(BLUE, 0.08) }]}>
                <Ionicons color={BLUE} name="swap-horizontal" size={34} />
              </View>
              <Text style={[styles.title2, { color: theme.colors.ink }]}>Replace item?</Text>
              <Text style={[textStyles.body, styles.center, { color: theme.colors.secondary }]}>{`Replace “${original.name}” with “${panel.alternative.name}”?`}</Text>
              <View style={[styles.surface, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.1) }]}>
                <ReplacementItem amount={amountLabel(original)} item={original} />
                <Ionicons color={BLUE} name="arrow-down" size={17} style={styles.selfCenter} />
                <ReplacementItem amount={amountLabel(original)} item={alternativeItem(panel.alternative, 'preview')} />
              </View>
              {error ? (
                <Text style={[textStyles.body, { color: theme.colors.danger }]} testID="alternative.saveError">
                  {error}
                </Text>
              ) : null}
              <BlueButton disabled={saving} onPress={() => void apply(panel.alternative, false)} testID="alternatives.confirm" title={saving ? 'Replacing…' : 'Replace'} />
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => {
                  setPanel(null);
                  setError(null);
                }}
                style={styles.minHeight}
                testID="alternatives-cancel"
              >
                <Text style={[textStyles.body, { color: theme.colors.link }]}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}
        </Panel>
        <SuccessScreen
          onClose={() => {
            setCompleted(null);
            onClose();
          }}
          original={original.name}
          replacement={completed?.name ?? ''}
          visible={completed !== null}
        />
      </>
    );
  }

  return (
    <View style={styles.fill}>
      <Backdrop />
      <View style={styles.bar}>
        <View style={styles.barSide} />
        <Text accessibilityRole="header" style={[styles.headline, styles.barTitle, { color: theme.colors.ink }]}>
          Item Alternatives
        </Text>
        <Pressable accessibilityLabel="Close alternatives" accessibilityRole="button" hitSlop={8} onPress={onClose} style={[styles.barSide, styles.barTrailing]} testID="alternatives-close">
          <GlassCircle>
              <Ionicons color={theme.colors.link} name="close" size={24} />
            </GlassCircle>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 100 + insets.bottom }]}>
        {/* `originalCard` (:95-104). */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]} testID="alternatives-original">
          <AlternativeArtwork height={50} item={original} width={46} />
          <View style={[styles.grow, styles.gap4]}>
            <Text style={[styles.headline, { color: theme.colors.ink }]}>{original.name}</Text>
            <Text style={[styles.caption, { color: theme.colors.secondary }]}>{amountLabel(original)}</Text>
            <Text style={[styles.tag, { color: BLUE, backgroundColor: withAlpha(BLUE, 0.1) }]}>Original Item</Text>
          </View>
          {favoriteButton(null, savedOriginal.favorite === true)}
        </View>
        <View style={styles.headingRow}>
          <Text style={[textStyles.subheadline, styles.bold, styles.grow, { color: theme.colors.ink }]}>AI Recommended Alternatives</Text>
          <Pressable accessibilityRole="button" onPress={() => setPanel({ kind: 'why' })} style={styles.why} testID="alternatives.whyThese">
            <Ionicons color={theme.colors.ink} name="bulb-outline" size={14} />
            <Text style={[styles.caption, { color: theme.colors.ink }]}>Why these?</Text>
          </Pressable>
        </View>
        <Text style={[styles.caption, styles.pullUp, { color: theme.colors.secondary }]}>Practical swaps based on the item in your list.</Text>
        {loading ? (
          <View style={styles.progress} testID="alternatives-loading">
            <ActivityIndicator />
            <Text style={[textStyles.body, { color: theme.colors.secondaryLabel }]}>Finding useful alternatives…</Text>
          </View>
        ) : null}
        {result ? (
          <>
            {/* `goalChips` (:105-124). */}
            <View style={styles.goalRow}>
              <ScrollView contentContainerStyle={styles.goalChips} horizontal showsHorizontalScrollIndicator={false} style={styles.grow}>
                {(['Lower fat', 'Lower sugar', 'Lower calorie'] as const).map((value) => {
                  const on = goal === value;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      key={value}
                      onPress={() => setGoal(on ? null : value)}
                      style={[styles.goalChip, { backgroundColor: on ? BLUE : theme.colors.surface, borderColor: withAlpha(BLUE, 0.12) }]}
                      testID={`alternatives.goal.${value}`}
                    >
                      <Ionicons color={on ? '#FFFFFF' : theme.colors.ink} name={GOAL_ICON[value]} size={13} />
                      <Text style={[styles.caption, styles.medium, { color: on ? '#FFFFFF' : theme.colors.ink }]}>{value}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable accessibilityRole="button" onPress={() => setPanel({ kind: 'goals' })} style={[styles.goalChip, styles.more, { backgroundColor: withAlpha(theme.colors.surface, 0.8) }]} testID="alternatives.moreGoals">
                <Ionicons color={theme.colors.ink} name="ellipsis-horizontal" size={13} />
                <Text style={[styles.caption, { color: theme.colors.ink }]}>More</Text>
              </Pressable>
            </View>
            {goal ? (
              <View style={styles.headingRow}>
                <Text style={[styles.caption, styles.grow, { color: theme.colors.secondary }]} testID="alternatives.goalStatus">
                  {visible.length === 0 ? `No verified matches for ${goal.toLowerCase()}.` : `${visible.length} matches · ${goal}`}
                </Text>
                <Pressable accessibilityRole="button" onPress={() => setGoal(null)} style={styles.minHeight} testID="alternatives.showAll">
                  <Text style={[styles.caption, { color: theme.colors.secondary }]}>Show all</Text>
                </Pressable>
              </View>
            ) : null}
            {visible.length === 0 ? <EmptyState filtered={offered.length > 0} onAction={() => (offered.length > 0 ? setGoal(null) : onClose())} original={original} /> : null}
            {visible.map((item) => {
              const id = alternativeId(item);
              const labels = SHOPPING_GOALS.filter((value) => goalSupported(value, item, originalFacts)).slice(0, 2);
              const nutrition = item.facts && hasSource(item.facts) ? item.facts.nutrition : null;
              return (
                <View key={id} style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: withAlpha(BLUE, 0.06) }]} testID={`alternative-row-${item.name}`}>
                  <Pressable accessibilityLabel={`View ${item.name}`} accessibilityRole="button" onPress={() => setDetail(item)}>
                    <AlternativeArtwork height={68} item={alternativeItem(item, id)} productImageURL={item.facts?.imageURL} width={56} />
                  </Pressable>
                  <View style={[styles.grow, styles.gap4]}>
                    <View style={styles.rowTop}>
                      <Pressable accessibilityRole="button" onPress={() => setDetail(item)} style={[styles.grow, styles.minHeight]} testID={`alternatives.details.${item.name}`}>
                        <Text style={[textStyles.subheadline, styles.semibold, { color: theme.colors.ink }]}>{item.name}</Text>
                      </Pressable>
                      {favoriteButton(id, (savedOriginal.favoriteAlternatives ?? []).includes(id))}
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setPanel({ kind: 'confirm', alternative: item })}
                        style={[styles.replace, { backgroundColor: withAlpha(BLUE, 0.09) }]}
                        testID={`alternatives.select.${item.name}`}
                      >
                        <Ionicons color={theme.colors.ink} name="swap-horizontal" size={12} />
                        <Text style={[styles.caption2, styles.semibold, { color: theme.colors.ink }]}>Replace</Text>
                      </Pressable>
                    </View>
                    <View style={styles.label}>
                      <Ionicons color={systemColors.green} name="leaf" size={11} />
                      <Text style={[styles.caption2, { color: systemColors.green }]}>{labels.length === 0 ? 'Suggested alternative' : labels.join(' · ')}</Text>
                    </View>
                    <View style={styles.rowBottom}>
                      <Text style={[styles.caption2, styles.grow, { color: theme.colors.secondary }]}>
                        {nutrition ? `${nutritionSummary(nutrition)} · per ${nutrition.servingSize}` : 'Nutrition details unavailable'}
                      </Text>
                      <Pressable accessibilityLabel={`Details for ${item.name}`} accessibilityRole="button" onPress={() => setDetail(item)} style={styles.chevron}>
                        <Ionicons color={theme.colors.ink} name="chevron-forward" size={13} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
            <View style={[styles.note, { backgroundColor: withAlpha(BLUE, 0.06) }]}>
              <Ionicons color={theme.colors.secondary} name="bulb-outline" size={14} />
              <Text style={[styles.caption, styles.grow, { color: theme.colors.secondary }]}>Always check the product label for the most current nutrition and allergen information.</Text>
            </View>
          </>
        ) : null}
        {/* Android ahead of iOS (iOS 3400481): with nothing loaded, a clear state with Try again (there is no local
            fallback, so this is the whole screen); with alternatives on screen the error is a failed save, which a
            reload would not fix, so it stays an inline message. */}
        {error && !result ? (
          <View style={[styles.loadFailure, { backgroundColor: theme.colors.surface }]} testID="alternatives.loadFailure">
            <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.loadFailureIcon, { backgroundColor: withAlpha(systemColors.orange, 0.1) }]}>
              <Ionicons color={systemColors.orange} name="warning" size={34} />
            </View>
            <Text style={[styles.headline, { color: theme.colors.ink }]}>Couldn’t load alternatives</Text>
            <Text style={[textStyles.subheadline, styles.textCenter, { color: theme.colors.secondary }]} testID="alternatives.error">
              {error}
            </Text>
            <View style={styles.fullWidth}>
              <BlueButton icon="refresh" onPress={() => setRetry((value) => value + 1)} testID="alternatives-retry" title="Try again" />
            </View>
          </View>
        ) : error ? (
          <Text style={[textStyles.subheadline, { color: theme.colors.danger }]} testID="alternatives.error">
            {error}
          </Text>
        ) : null}
      </ScrollView>
      {/* "View in Cart (N)" (:66-70). */}
      <View style={[styles.cartBar, { paddingBottom: 16 + insets.bottom, backgroundColor: theme.colors.glassFill }]}>
        <Pressable accessibilityLabel={`View in Cart (${cartCount})`} accessibilityRole="button" onPress={onClose} testID="alternatives.cart">
          <LinearGradient colors={CART_GRADIENT} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.cartButton}>
            <Ionicons color="#FFFFFF" name="cart-outline" size={18} />
            <Text style={[styles.headline, { color: '#FFFFFF' }]}>{`View in Cart (${cartCount})`}</Text>
          </LinearGradient>
        </Pressable>
      </View>
      {panels()}
    </View>
  );
}

function ReplacementItem({ item, amount }: { item: GroceryItem; amount: string }) {
  const theme = useTheme();
  return (
    <View style={styles.replacementItem}>
      <AlternativeArtwork height={62} item={item} width={58} />
      <View style={styles.grow}>
        <Text style={[styles.headline, { color: theme.colors.ink }]}>{item.name}</Text>
        <Text style={[styles.caption, { color: theme.colors.secondary }]}>{amount}</Text>
      </View>
    </View>
  );
}

/** `emptyState(filtered:)` (:154-162). */
function EmptyState({ filtered, original, onAction }: { filtered: boolean; original: GroceryItem; onAction: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.empty} testID="alternatives.empty">
      <View style={[styles.emptyArt, { backgroundColor: withAlpha(BLUE, 0.08) }]}>
        <Ionicons color={withAlpha(BLUE, 0.25)} name="search" size={72} />
        <View style={styles.emptyItem}>
          <AlternativeArtwork height={85} item={original} width={75} />
        </View>
      </View>
      <Text style={[styles.title3, { color: theme.colors.ink }]}>{filtered ? 'No matching alternatives yet' : 'No alternatives found yet'}</Text>
      <Text style={[textStyles.subheadline, styles.center, { color: theme.colors.secondary }]}>
        {filtered ? 'Try another goal or view all suggestions. We only show matches supported by available product data.' : 'We’re working on finding the best alternatives for this item. Please check back later.'}
      </Text>
      <Pressable accessibilityRole="button" onPress={onAction} style={[styles.bordered, { backgroundColor: withAlpha(BLUE, 0.12) }]} testID="alternatives-empty-action">
        <Text style={[textStyles.body, { color: BLUE }]}>{filtered ? 'Show all alternatives' : 'OK'}</Text>
      </Pressable>
    </View>
  );
}

/** `AlternativesGoalPicker` (ShoppingAlternativesDesign.swift:26-78). */
function GoalPicker({ visible, original, selected, onApply, onClose }: { visible: boolean; original: GroceryItem; selected: ShoppingGoal | null; onApply: (goal: ShoppingGoal | null) => void; onClose: () => void }) {
  const theme = useTheme();
  const [draft, setDraft] = useState<ShoppingGoal | null>(selected);
  const [expanded, setExpanded] = useState(false);
  const [shown, setShown] = useState(visible);
  // `.onAppear { draft = selected }`
  if (shown !== visible) {
    setShown(visible);
    if (visible) {
      setDraft(selected);
      setExpanded(false);
    }
  }
  return (
    <Panel
      footer={
        <View style={styles.footerRow}>
          {/* `.frame(maxWidth: .infinity, minHeight: 52).buttonStyle(.bordered)`: the frame is outside the style,
              so the bordered capsule hugs "Cancel", centred in its half (`shopping-alternatives-goal-picker`). */}
          <View style={[styles.footerButton, styles.centered]}>
            <Pressable accessibilityRole="button" onPress={onClose} style={[styles.bordered, { backgroundColor: withAlpha(BLUE, 0.12) }]} testID="alternatives-goal-cancel">
              <Text style={[textStyles.body, { color: BLUE }]}>Cancel</Text>
            </Pressable>
          </View>
          <View style={styles.footerButton}>
            <BlueButton
              onPress={() => {
                onApply(draft);
                onClose();
              }}
              testID="alternatives.applyGoal"
              title="Apply"
            />
          </View>
        </View>
      }
      onClose={onClose}
      testID="alternatives-goals"
      title="Item Alternatives"
      visible={visible}
    >
      <View style={[styles.surface, styles.pickerOriginal, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.1) }]}>
        <AlternativeArtwork height={65} item={original} width={50} />
        <View style={styles.grow}>
          <Text style={[styles.headline, { color: theme.colors.ink }]}>{original.name}</Text>
          <Text style={[styles.caption, { color: theme.colors.ink }]}>{amountLabel(original)}</Text>
          <Text style={[styles.caption2, { color: BLUE }]}>Original Item</Text>
        </View>
      </View>
      <Text style={[styles.title3, { color: theme.colors.ink }]}>I’m looking for:</Text>
      {expanded ? (
        <View style={styles.gap2}>
          {SHOPPING_GOALS.map((value) => (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: draft === value }} key={value} onPress={() => setDraft(value)} style={styles.goalLine} testID={`alternatives.goal.${value}`}>
              <Ionicons color={draft === value ? BLUE : withAlpha(theme.colors.secondary, 0.4)} name={draft === value ? 'radio-button-on' : 'ellipse-outline'} size={20} />
              <Text style={[textStyles.subheadline, { color: theme.colors.ink }]}>{value}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <>
          <View style={styles.goalGrid}>
            {SHOPPING_GOALS.slice(0, 8).map((value) => {
              const on = draft === value;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  key={value}
                  onPress={() => setDraft(value)}
                  style={[styles.goalTile, { backgroundColor: on ? BLUE : theme.colors.surface, borderColor: withAlpha(BLUE, 0.18) }]}
                  testID={`alternatives.goal.${value}`}
                >
                  <Ionicons color={on ? '#FFFFFF' : theme.colors.ink} name={GOAL_ICON[value]} size={22} />
                  <Text style={[textStyles.subheadline, styles.medium, styles.center, { color: on ? '#FFFFFF' : theme.colors.ink }]}>{value}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable accessibilityRole="button" onPress={() => setExpanded(true)} style={[styles.minHeight, styles.label, styles.selfCenter]} testID="alternatives.moreOptions">
            <Ionicons color={BLUE} name="chevron-down" size={15} />
            <Text style={[textStyles.body, { color: BLUE }]}>Show more options</Text>
          </Pressable>
        </>
      )}
      {draft !== null ? (
        <Pressable accessibilityRole="button" onPress={() => setDraft(null)} style={styles.minHeight} testID="alternatives-clear-goal">
          <Text style={[textStyles.body, { color: BLUE }]}>Clear goal</Text>
        </Pressable>
      ) : null}
    </Panel>
  );
}

/** `AlternativesWhyView` (ShoppingAlternativesDesign.swift:79-106). */
function WhyPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const reason = (title: string, message: string, icon: keyof typeof Ionicons.glyphMap, color: string) => (
    <View key={title} style={styles.reason}>
      <View style={[styles.reasonIcon, { backgroundColor: withAlpha(color, 0.1) }]}>
        <Ionicons color={color} name={icon} size={20} />
      </View>
      <View style={[styles.grow, styles.gap4]}>
        <Text style={[styles.headline, { color: theme.colors.ink }]}>{title}</Text>
        <Text style={[textStyles.subheadline, { color: theme.colors.secondary }]}>{message}</Text>
      </View>
    </View>
  );
  return (
    <Panel footer={<BlueButton onPress={onClose} testID="alternatives-why-done" title="Got it" />} onClose={onClose} testID="alternatives-why" title="Why these alternatives?" visible={visible}>
      <View style={styles.whyIcon}>
        <Ionicons color={theme.colors.link} name="bulb" size={44} />
      </View>
      <Text style={[textStyles.subheadline, { color: theme.colors.secondary }]}>
        We suggest practical alternatives for the item in your list. When source data is available, we compare it against your selected goal.
      </Text>
      {reason('Matches your goal', 'Goal filters use available nutrition and explicit product-label information. Unverified matches are excluded.', 'leaf', systemColors.green)}
      {reason('Comparable nutrition', 'Nutrition is compared on compatible serving sizes. Generic USDA foods are labeled representative, not exact products.', 'bar-chart', BLUE)}
      {reason('Common substitutes', 'Suggestions help you explore familiar alternatives. Availability, taste, and prices vary by store and product.', 'leaf-outline', systemColors.orange)}
      {reason('Check dietary suitability', 'Allergens are shown when declared by a product source. Missing information never means allergen-free.', 'shield-checkmark-outline', theme.colors.link)}
      <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
      <View style={[styles.note, { backgroundColor: withAlpha(BLUE, 0.06) }]}>
        <Ionicons color={theme.colors.secondary} name="information-circle" size={15} />
        <Text style={[styles.caption, styles.grow, { color: theme.colors.secondary }]}>Always check the product label for the most current nutrition and allergen information.</Text>
      </View>
    </Panel>
  );
}

/** `AlternativesSuccess` (ShoppingAlternativesDesign.swift:107-122). */
function SuccessScreen({ visible, original, replacement, onClose }: { visible: boolean; original: string; replacement: string; onClose: () => void }) {
  const theme = useTheme();
  return (
    <Modal animationType="slide" onRequestClose={() => undefined} presentationStyle="fullScreen" visible={visible}>
      <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]} testID="alternatives-success">
        <Backdrop />
        <View style={styles.success}>
          <View style={styles.grow} />
          <LinearGradient colors={[systemColors.green, withAlpha(systemColors.green, 0.75)]} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.successMark}>
            <Ionicons color="#FFFFFF" name="checkmark" size={42} />
          </LinearGradient>
          <Text style={[styles.title, { color: theme.colors.ink }]} testID="alternatives.success">
            Item replaced!
          </Text>
          <Text style={[textStyles.body, styles.center, { color: theme.colors.secondary }]}>{`${original} has been replaced with ${replacement}.`}</Text>
          <View style={styles.grow} />
          <BlueButton onPress={onClose} testID="alternatives-success-done" title="Done" />
          <Pressable accessibilityRole="button" onPress={onClose} style={[styles.bordered, styles.cartAgain, { backgroundColor: withAlpha(BLUE, 0.12) }]} testID="alternatives-success-cart">
            <Ionicons color={BLUE} name="cart-outline" size={18} />
            <Text style={[textStyles.body, { color: BLUE }]}>View in Cart</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Alternative Item Details (:261-503)

function AlternativeDetails({
  original,
  originalFacts,
  alternative,
  favorite,
  error,
  onBack,
  onFavorite,
  onReplace,
  onAdd,
  renderPanels,
}: {
  original: GroceryItem;
  originalFacts: ShoppingAlternativesResponse['originalFacts'];
  alternative: ShoppingAlternative;
  favorite: boolean;
  error: string | null;
  onBack: () => void;
  onFavorite: () => void;
  onReplace: () => void;
  onAdd: () => Promise<void>;
  panel: PanelState;
  renderPanels: () => ReactNode;
}) {
  const theme = useTheme();
  const large = useAccessibilityTextSize();
  const [saving, setSaving] = useState(false);
  const [foodVoice, setFoodVoice] = useState(false);
  const [sortColumn, setSortColumn] = useState<ShoppingNutritionSortColumn | null>(null);
  const [ascending, setAscending] = useState(false);
  const [allergensOpen, setAllergensOpen] = useState(false);
  const [bestForOpen, setBestForOpen] = useState(false);
  const facts = alternative.facts ?? null;
  const value = comparison(originalFacts, facts);
  const altItem = alternativeItem(alternative, alternativeId(alternative));
  const dietary = facts && hasSource(facts) ? [...(facts.contains ?? []), ...(facts.freeFrom ?? []), ...(facts.mayContain ?? []), ...(facts.dietary ?? []), facts.ingredientText ?? ''] : [];
  const hasDietary = dietary.some((entry) => entry.trim() !== '');
  const usagesList = facts && hasSource(facts) ? (facts.bestFor ?? []).filter((entry) => entry.trim() !== '') : [];
  const representative = originalFacts?.matchQuality === 'representative_generic' || facts?.matchQuality === 'representative_generic';
  const serving = value.original?.servingSize ?? null;

  /** `perform(add:)` (:497-500). Replace asks first (`panel = .confirm`). */
  const perform = (add: boolean) => {
    if (saving) return;
    if (!add) {
      onReplace();
      return;
    }
    setSaving(true);
    void onAdd().finally(() => setSaving(false));
  };

  const card = (item: GroceryItem, cardFacts: typeof facts, source: boolean) => {
    const calories = source ? nutrientValue('Calories', value.original) : alternativeValue(value, 'Calories');
    return (
      <View style={[styles.compareCard, { backgroundColor: withAlpha(BLUE, 0.025), borderColor: withAlpha(brand.nexdoIndigo, 0.12) }]}>
        <Text style={[styles.caption, styles.semibold, { color: source ? BLUE : theme.colors.link }]}>{source ? 'Your item' : 'Alternative'}</Text>
        <AlternativeArtwork height={100} item={item} productImageURL={cardFacts?.imageURL} width={100} />
        <Text style={[textStyles.subheadline, styles.bold, styles.center, !large && styles.nameHeight, { color: theme.colors.ink }]} testID={source ? 'alternative.originalName' : 'alternative.targetName'}>
          {item.name}
        </Text>
        <Text style={[styles.headline, styles.center, { color: theme.colors.ink }]}>{calories === null ? 'Calories unavailable' : `${nutrientText(calories, 'Calories')} cal`}</Text>
        {serving ? <Text style={[styles.caption, { color: theme.colors.secondary }]}>{`Per ${serving}`}</Text> : null}
      </View>
    );
  };

  const sortHeader = (column: ShoppingNutritionSortColumn, width: number) => (
    <Pressable
      accessibilityLabel={`Sort by ${column}`}
      accessibilityRole="button"
      accessibilityValue={{ text: sortColumn === column ? (ascending ? 'Low to high' : 'High to low') : 'Not sorted' }}
      onPress={() => {
        if (sortColumn === column) setAscending(!ascending);
        else {
          setSortColumn(column);
          setAscending(false);
        }
      }}
      style={[styles.sortHeader, { minWidth: width }]}
      testID={`alternative.sort.${column}`}
    >
      <Text numberOfLines={1} style={[styles.table, styles.semibold, { color: theme.colors.ink }]}>{column}</Text>
      <Ionicons color={BLUE} name={sortColumn === column ? (ascending ? 'arrow-up' : 'arrow-down') : 'swap-vertical'} size={11} />
    </Pressable>
  );

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background }]} testID="alternative-details">
      <View style={styles.bar}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={onBack} style={styles.barSide} testID="alternative-details-back">
          {/* The system back and the toolbar star: ink on iOS 26's glass circles (`shopping-alternative-details`). */}
          <GlassCircle>
            <Ionicons color={theme.colors.ink} name="chevron-back" size={24} />
          </GlassCircle>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.headline, styles.barTitle, { color: theme.colors.ink }]}>
          Item Details
        </Text>
        <Pressable accessibilityLabel={favorite ? 'Remove favorite' : 'Add favorite'} accessibilityRole="button" hitSlop={8} onPress={onFavorite} style={[styles.barSide, styles.barTrailing]} testID="alternative-details-favorite">
          <GlassCircle>
            <Ionicons color={theme.colors.ink} name={favorite ? 'star' : 'star-outline'} size={22} />
          </GlassCircle>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.details}>
        {/* `itemHeader` (:338-354). */}
        <View style={styles.gap12}>
          <View style={[large ? styles.column12 : styles.row12]}>
            {card(original, originalFacts ?? null, true)}
            {card(altItem, facts, false)}
            <View pointerEvents="none" style={styles.vsLayer}>
              <View style={[styles.vs, { backgroundColor: theme.colors.background, borderColor: withAlpha(brand.nexdoIndigo, 0.12) }]}>
                <Text style={[styles.caption, styles.bold, { color: theme.colors.link }]}>VS</Text>
              </View>
            </View>
          </View>
          {representative ? <Text style={[styles.caption, styles.center, { color: theme.colors.secondary }]}>Representative food — not an exact product.</Text> : null}
        </View>
        <Pressable accessibilityRole="button" onPress={() => setFoodVoice(true)} testID="alternative.askAI">
          <LinearGradient colors={GRADIENT} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.askAI}>
            <Ionicons color="#FFFFFF" name="sparkles" size={16} />
            <Text style={[textStyles.subheadline, styles.bold, { color: '#FFFFFF' }]}>Ask AI about this item</Text>
          </LinearGradient>
        </Pressable>

        {/* `nutrition` (:389-433). */}
        <View style={styles.gap14}>
          <View style={styles.label}>
            <Text style={[styles.title3, { color: theme.colors.ink }]}>Nutrition Facts</Text>
            <Pressable
              accessibilityLabel="About nutrition data"
              accessibilityRole="button"
              onPress={() => Alert.alert('About Nutrition Facts', 'Values are based on available food-provider data. Actual products may vary. Always check the product label.', [{ text: 'Got it', style: 'cancel' }])}
              style={styles.square44}
              testID="alternative.nutritionInfo"
            >
              <Ionicons color={BLUE} name="information-circle-outline" size={20} />
            </Pressable>
          </View>
          {serving ? <Text style={[styles.caption, { color: theme.colors.secondary }]}>{`Per ${serving}`}</Text> : null}
          {value.original === null || value.alternative === null ? <Text style={[textStyles.subheadline, { color: theme.colors.secondary }]}>Nutrition details unavailable</Text> : null}
          {comparisonFactor(value) === null && value.original !== null && value.alternative !== null ? (
            <Text style={[styles.caption, { color: theme.colors.ink }]}>Serving sizes cannot be matched. Differences are unavailable.</Text>
          ) : null}
          {sortColumn ? (
            <>
              <View style={styles.headingRow}>
                <Text style={[styles.caption, styles.grow, { color: theme.colors.secondary }]}>{`${sortColumn}: ${ascending ? 'low to high' : 'high to low'}`}</Text>
                <Pressable accessibilityRole="button" onPress={() => setSortColumn(null)} testID="alternative-sort-reset">
                  <Text style={[styles.caption, { color: theme.colors.secondary }]}>Reset</Text>
                </Pressable>
              </View>
              <Text style={[styles.caption2, { color: theme.colors.secondary }]}>Sorted by displayed numbers; units vary by nutrient.</Text>
            </>
          ) : null}
          <ScrollView horizontal>
            <View>
              <View style={[styles.tableRow, { backgroundColor: withAlpha(BLUE, 0.06) }]}>
                <View style={[styles.cell, { minWidth: 100 }]}>
                  <Text numberOfLines={1} style={[styles.table, styles.semibold, { color: theme.colors.ink }]}>Nutrient</Text>
                </View>
                {sortHeader('Your item', 76)}
                {sortHeader('Alternative', 82)}
                {sortHeader('Difference', 82)}
              </View>
              {sortedNutrients(value, sortColumn, ascending).map((nutrient) => {
                const color = differenceColor(value, nutrient);
                return (
                  <View key={nutrient} style={[styles.tableRow, { borderBottomColor: withAlpha(BLUE, 0.1) }, styles.tableLine]} testID={`alternative-row-${nutrient}`}>
                    <View style={[styles.cell, { minWidth: 100 }]}>
                      <Text numberOfLines={1} style={[styles.table, { color: theme.colors.ink }]}>{nutrient}</Text>
                    </View>
                    <View style={[styles.cell, { minWidth: 76 }]}>
                      <Text numberOfLines={1} style={[styles.table, { color: theme.colors.ink }]}>{nutrientText(nutrientValue(nutrient, value.original), nutrient)}</Text>
                    </View>
                    <View style={[styles.cell, { minWidth: 82 }]}>
                      <Text numberOfLines={1} style={[styles.table, { color: theme.colors.ink }]}>{nutrientText(alternativeValue(value, nutrient), nutrient)}</Text>
                    </View>
                    <View style={[styles.difference, { backgroundColor: withAlpha(color, 0.06) }]}>
                      <Text numberOfLines={1} style={[styles.table, styles.semibold, { color }]}>{differenceText(value, nutrient)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {hasDietary ? (
          <Disclosure open={allergensOpen} onToggle={() => setAllergensOpen(!allergensOpen)} testID="alternative.tab.Allergens" title="Allergens & dietary information">
            <View style={styles.gap14} testID="alternative.allergens">
              <Text style={[styles.title3, { color: theme.colors.ink }]}>Allergen & Dietary Info</Text>
              {facts && allergenLabels(facts).length > 0 ? (
                allergenLabels(facts).map((label) => (
                  <View key={label} style={[styles.label, styles.capsule, { backgroundColor: withAlpha(BLUE, 0.08) }]}>
                    <Ionicons color={theme.colors.ink} name="information-circle-outline" size={15} />
                    <Text style={[textStyles.body, { color: theme.colors.ink }]}>{label}</Text>
                  </View>
                ))
              ) : (
                <Text style={[textStyles.body, { color: theme.colors.ink }]}>Allergen information unavailable — check product label.</Text>
              )}
              {facts && hasSource(facts) ? (
                <>
                  {(facts.mayContain ?? []).map((label) => (
                    <View key={label} style={styles.label}>
                      <Ionicons color={theme.colors.ink} name="alert-circle-outline" size={15} />
                      <Text style={[textStyles.subheadline, { color: theme.colors.ink }]}>{`May contain ${label}`}</Text>
                    </View>
                  ))}
                  {facts.ingredientText ? (
                    <>
                      <Text style={[styles.headline, { color: theme.colors.ink }]}>Ingredients</Text>
                      <Text style={[textStyles.subheadline, { color: theme.colors.ink }]}>{facts.ingredientText}</Text>
                    </>
                  ) : (
                    <Text style={[styles.caption, { color: theme.colors.secondary }]}>Ingredient information unavailable</Text>
                  )}
                  {(facts.dietary ?? []).map((label) => (
                    <View key={label} style={styles.label}>
                      <Ionicons color={theme.colors.ink} name="leaf-outline" size={15} />
                      <Text style={[textStyles.subheadline, { color: theme.colors.ink }]}>{label}</Text>
                    </View>
                  ))}
                </>
              ) : null}
              <Text style={[styles.caption, { color: theme.colors.secondary }]}>Always check the product label for the most current ingredient and allergen information. Product formulations may change.</Text>
            </View>
          </Disclosure>
        ) : null}
        {usagesList.length > 0 ? (
          <Disclosure open={bestForOpen} onToggle={() => setBestForOpen(!bestForOpen)} testID="alternative.tab.Best For" title="Best for">
            <View style={styles.gap14} testID="alternative.bestFor">
              <Text style={[styles.title3, { color: theme.colors.ink }]}>Best for</Text>
              <View style={styles.usages}>
                {usagesList.map((usage) => (
                  <View accessible key={usage} style={styles.usage}>
                    <View style={[styles.usageIcon, { backgroundColor: withAlpha(BLUE, 0.1) }]}>
                      <Ionicons color={BLUE} name={usageIcon(usage)} size={24} />
                    </View>
                    <Text style={[textStyles.subheadline, { color: theme.colors.ink }]}>{usage}</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.caption, { color: theme.colors.secondary }]}>General culinary suggestions; suitability varies by product and recipe.</Text>
            </View>
          </Disclosure>
        ) : null}
        {error ? (
          <Text style={[textStyles.body, { color: theme.colors.danger }]} testID="alternative.saveError">
            {error}
          </Text>
        ) : null}
        <View style={styles.gap10}>
          <BlueButton disabled={saving} onPress={() => perform(false)} testID="alternative.detail.replace" title="Replace with this item" />
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => perform(true)} style={[styles.minHeight, styles.selfCenter]} testID="alternative.detail.add">
            {/* A plain Button under the page's `.foregroundStyle(Color.nexdoInk)`: ink (`shopping-alternative-details-bottom`). */}
            <Text style={[styles.headline, { color: theme.colors.ink }]}>Add to Cart Instead</Text>
          </Pressable>
          {saving ? (
            <View style={styles.progress}>
              <ActivityIndicator />
              <Text style={[textStyles.body, { color: theme.colors.secondaryLabel }]}>Saving…</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
      {/* `.fullScreenCover(isPresented: $showingFoodVoice) { AddTaskByVoiceView(askMode: true, foodContext:) }` (:323-327). */}
      <Modal animationType="slide" onRequestClose={() => setFoodVoice(false)} presentationStyle="fullScreen" visible={foodVoice}>
        {foodVoice ? (
          <AddTaskByVoiceView
            askMode
            foodContext={foodVoiceContext(foodVoiceItem(original.name, original.brand, original.barcode), foodVoiceItem(alternative.name, facts?.brand, facts?.barcode))}
            onClose={() => setFoodVoice(false)}
          />
        ) : null}
      </Modal>
      {renderPanels()}
    </View>
  );
}

/** A `DisclosureGroup`: the title in the tint and a chevron that turns. */
function Disclosure({ title, open, onToggle, children, testID }: { title: string; open: boolean; onToggle: () => void; children: ReactNode; testID: string }) {
  const theme = useTheme();
  return (
    <View testID={testID}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={[styles.label, styles.minHeight]} testID={`${testID}-toggle`}>
        <Text style={[textStyles.body, styles.grow, { color: theme.colors.ink }]}>{title}</Text>
        <Ionicons color={BLUE} name={open ? 'chevron-down' : 'chevron-forward'} size={15} />
      </Pressable>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  centred: { alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  selfCenter: { alignSelf: 'center' },
  bold: { fontWeight: '700' },
  semibold: { fontWeight: '600' },
  medium: { fontWeight: '500' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 16 },
  caption2: { fontSize: 11, lineHeight: 13 },
  table: { fontSize: 13.2, lineHeight: 17 },
  gap2: { gap: 2 },
  gap4: { gap: 4 },
  gap10: { gap: 10 },
  gap12: { gap: 12 },
  gap14: { gap: 14 },
  minHeight: { minHeight: 44, justifyContent: 'center' },
  square44: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dim: { backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  sheet: { flex: 1, overflow: 'hidden' },
  sheetShape: { borderTopLeftRadius: 38, borderTopRightRadius: 38 },
  bread: { borderRadius: 12 },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 16 },
  barSide: { width: 56, minHeight: 44, justifyContent: 'center' },
  barTrailing: { alignItems: 'flex-end' },
  barTitle: { flex: 1, textAlign: 'center' },
  content: { padding: 16, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18 },
  tag: { alignSelf: 'flex-start', fontSize: 11, lineHeight: 13, fontWeight: '600', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  why: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  pullUp: { marginTop: -4 },
  progress: { alignItems: 'center', gap: 8, padding: 16 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  goalChips: { gap: 6 },
  goalChip: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  more: { borderWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 18, borderWidth: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start' },
  replace: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 7, borderRadius: 999 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowBottom: { flexDirection: 'row', alignItems: 'flex-end' },
  chevron: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 14 },
  cartBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 16 },
  cartButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: 16 },
  blue: { minHeight: 52, paddingHorizontal: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  blueRow: { flexDirection: 'row', gap: 8 },
  loadFailure: { alignItems: 'center', gap: 12, padding: 20, borderRadius: 20 },
  loadFailureIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  textCenter: { textAlign: 'center' },
  fullWidth: { alignSelf: 'stretch' },
  panelContent: { padding: 24, gap: 22 },
  panelFooter: { paddingHorizontal: 20, paddingTop: 12 },
  confirm: { alignItems: 'center', gap: 18 },
  confirmIcon: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center' },
  surface: { alignSelf: 'stretch', gap: 10, padding: 16, borderRadius: 22, borderWidth: 1 },
  replacementItem: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  empty: { alignItems: 'center', gap: 16, padding: 20 },
  emptyArt: { width: 140, height: 140, borderRadius: 70, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  emptyItem: { position: 'absolute', left: 62, top: 42 },
  bordered: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, borderRadius: 999 },
  footerRow: { flexDirection: 'row', gap: 12 },
  footerButton: { flex: 1, minHeight: 52 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  pickerOriginal: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  goalTile: { width: '47%', flexGrow: 1, minHeight: 88, padding: 4, gap: 8, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  goalLine: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 },
  whyIcon: { alignItems: 'center', padding: 24 },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  reasonIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth },
  success: { flex: 1, alignItems: 'stretch', gap: 24, padding: 28, paddingBottom: 48 },
  successMark: { width: 94, height: 94, borderRadius: 47, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  cartAgain: { minHeight: 48 },
  details: { padding: 18, gap: 24, paddingBottom: 40 },
  row12: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  column12: { gap: 12 },
  compareCard: { flex: 1, alignItems: 'center', gap: 10, padding: 14, borderRadius: 18, borderWidth: 1 },
  nameHeight: { minHeight: 44 },
  vsLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  vs: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  askAI: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 16 },
  sortHeader: { minHeight: 48, paddingHorizontal: 6, gap: 2, justifyContent: 'center' },
  tableRow: { flexDirection: 'row', alignItems: 'center' },
  tableLine: { borderBottomWidth: 0.5 },
  cell: { minHeight: 44, paddingHorizontal: 6, justifyContent: 'center' },
  difference: { minWidth: 82, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8, alignItems: 'center' },
  capsule: { alignSelf: 'flex-start', padding: 8, borderRadius: 999 },
  usages: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  usage: { width: 100, alignItems: 'center', gap: 8 },
  usageIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  disclosureBody: { paddingTop: 12 },
});
