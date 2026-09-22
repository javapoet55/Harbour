import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { HeaderHeightContext } from 'expo-router/build/react-navigation/elements';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassCard } from '../../components/GlassCard';
import { KeyboardAwareScrollView } from '../../components/keyboard';
import { GlassCapsule } from '../../components/PushedHeader';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { androidGroup, brand, ElevatedSurface, FieldGroupContext, isAndroid, linearGradientStops, useTheme } from '../../theme';

/**
 * The Moments building blocks shared by more than one screen — global patterns 1, 3, 4 and 5 in
 * mobile/docs/reference/README.md.
 */

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** `NexdoTheme.gradient`: magenta → indigo → blue, leading to trailing. */
const GRADIENT = linearGradientStops([brand.nexdoMagenta, brand.nexdoIndigo, brand.nexdoBlue]);

/** SwiftUI system colours used by the Moments views (light values; they are vivid in both modes). */
export const systemColors = {
  red: '#FF3B30',
  orange: '#FF9500',
  yellow: '#FFCC00',
  green: '#34C759',
  teal: '#30B0C7',
  cyan: '#32ADE6',
  blue: '#007AFF',
  purple: '#AF52DE',
  pink: '#FF2D55',
} as const;

/** `.font(.headline)` */
export const headline = { fontSize: 17, lineHeight: 22, fontWeight: '600' as const };
/** `.font(.caption)` */
export const caption = { fontSize: 12, lineHeight: 16 };
/** `.font(.title)` */
export const title1 = { fontSize: 28, lineHeight: 34 };

/**
 * `MomentCard` (ImportantMomentsView.swift:4-11): 18pt padding, 14pt spacing, a 22pt
 * `.ultraThinMaterial` rounded rectangle (or the given gradient) stroked with `nexdoIndigo` at 18%.
 */
export function MomentCard({
  children,
  fill,
  style,
  testID,
  grouped = false,
}: {
  children: ReactNode;
  fill?: { colors: readonly [string, string, ...string[]]; start: { x: number; y: number }; end: { x: number; y: number } };
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /**
   * The card holds form rows (Manage Moment's Details, Reminder & Repeat, Recipients, Send time,
   * Delivery, Notify). On Android it drops the glass for the shared form group — field surface and
   * hairline — so its rows read like every other form's (docs/android-polish.md §3). iOS ignores it.
   */
  grouped?: boolean;
}) {
  const theme = useTheme();
  const stroke = withAlpha(brand.nexdoIndigo, 0.18);
  if (grouped && !fill && isAndroid()) {
    return (
      <View style={[styles.cardShell, androidGroup(theme), style]} testID={testID ? `${testID}-group` : undefined}>
        <View style={styles.cardContent} testID={testID}>
          <FieldGroupContext.Provider value="group">{children}</FieldGroupContext.Provider>
        </View>
      </View>
    );
  }
  if (fill) {
    return (
      <View style={[styles.cardShell, { borderColor: stroke }, style]} testID={testID}>
        <LinearGradient colors={fill.colors} start={fill.start} end={fill.end} style={StyleSheet.absoluteFill} />
        <View style={styles.cardContent}>{children}</View>
      </View>
    );
  }
  return (
    <GlassCard radius={22} stroke={stroke} shadow={false} style={style}>
      <View style={styles.cardContent} testID={testID}>
        {children}
      </View>
    </GlassCard>
  );
}

/**
 * `MomentPrimary` (ImportantMomentsView.swift:12-16): a full-width gradient button, `.headline` in
 * white, 54pt tall, 18pt corners. `.buttonStyle(.plain)`; a disabled one is dimmed as every
 * disabled SwiftUI control is.
 */
export function MomentPrimary({ title, onPress, disabled = false, testID = 'wish-primary' }: { title: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={disabled ? styles.disabled : null}
    >
      <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.primary}>
        <Text style={[headline, styles.primaryLabel]}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

/**
 * `MomentSegments` (ImportantMomentsView.swift:615-629): NOT the system segmented control. The
 * selected segment is filled with the brand gradient and white text; the others are indigo text, all
 * inside a pale material capsule.
 */
export function MomentSegments<T extends string>({
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  testIDPrefix: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segments, { backgroundColor: theme.colors.glassFill }]}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option}
            onPress={() => onChange(option)}
            style={styles.segment}
            testID={`${testIDPrefix}-${option}`}
          >
            {selected ? <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[StyleSheet.absoluteFill, styles.segmentFill]} /> : null}
            <Text style={[styles.segmentLabel, { color: selected ? '#FFFFFF' : theme.colors.link }]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** `MomentIconTile`'s colour (ImportantMomentsView.swift:43-45). */
export function momentColor(type: string): string {
  switch (type) {
    case 'birthday':
      return systemColors.red;
    case 'anniversary':
      return systemColors.purple;
    case 'festival':
      return systemColors.orange;
    case 'getWellSoon':
      return systemColors.teal;
    default:
      return brand.nexdoIndigo;
  }
}

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => alive && setReduce(value))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return reduce;
}

/**
 * `MomentIconTile` (ImportantMomentsView.swift:38-75): a 64pt tile of the occasion colour at 16%,
 * the symbol springing from 78% on appear unless Reduce Motion is on. Anniversary draws two
 * overlapping hearts; a Diwali festival draws a flame over a lamp bowl.
 */
export function MomentIconTile({ type, title = '' }: { type: string; title?: string }) {
  const color = momentColor(type);
  const reduceMotion = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(type === 'summary' ? 1 : 0.78));
  useEffect(() => {
    if (type === 'summary') return;
    if (reduceMotion) {
      scale.setValue(1);
      return;
    }
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 12, speed: 6 }).start();
  }, [reduceMotion, scale, type]);

  let symbol: ReactNode;
  if (type === 'anniversary') {
    symbol = (
      <View style={styles.hearts}>
        <Ionicons name="heart-outline" size={30} color={color} style={{ position: 'absolute', left: 3, top: 5 }} />
        <Ionicons name="heart-outline" size={30} color={color} style={{ position: 'absolute', left: 17, top: 14 }} />
      </View>
    );
  } else if (type === 'festival' && title.toLowerCase().includes('diwali')) {
    symbol = (
      <View style={styles.diya}>
        <Ionicons name="flame" size={25} color={color} />
        <View style={[styles.bowl, { backgroundColor: color }]} />
      </View>
    );
  } else {
    const name: IconName =
      type === 'birthday' ? 'gift' : type === 'festival' ? 'sparkles' : type === 'getWellSoon' ? 'medkit' : type === 'summary' ? 'calendar-outline' : 'star';
    symbol = <Ionicons name={name} size={32} color={color} />;
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.tile, { backgroundColor: withAlpha(color, 0.16) }]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{symbol}</Animated.View>
    </View>
  );
}

/** `MomentStatusBadge` (ImportantMomentsView.swift:76-85): a tinted capsule label. */
export function MomentStatusBadge({ title, color, icon }: { title: string; color: string; icon: IconName }) {
  return (
    <View style={[styles.badge, { backgroundColor: withAlpha(color, 0.14) }]}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[caption, styles.badgeLabel, { color }]}>{title}</Text>
    </View>
  );
}

/** A plain `Button` inheriting the root `.tint(.nexdoIndigo)`. */
export function TintButton({
  title,
  onPress,
  icon,
  destructive = false,
  disabled = false,
  testID,
  style,
  textStyle,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  destructive?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: object;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const color = destructive ? theme.colors.danger : theme.colors.link;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[styles.tintButton, disabled && styles.disabledSoft, style]}
    >
      {icon ? <Ionicons name={icon} size={17} color={color} /> : null}
      <Text style={[{ fontSize: 17, lineHeight: 22, color }, textStyle]}>{title}</Text>
    </Pressable>
  );
}

/**
 * `.buttonStyle(.bordered)`: a FILLED capsule of the tint at low opacity — not an outline (style map
 * §7). `.borderedProminent`: the solid tint.
 */
export function BorderedButton({
  title,
  onPress,
  icon,
  prominent = false,
  disabled = false,
  full = false,
  centered = false,
  testID,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  prominent?: boolean;
  disabled?: boolean;
  full?: boolean;
  /** In SwiftUI's default centred `VStack` (Wish details' actions). */
  centered?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const color = prominent ? '#FFFFFF' : theme.colors.link;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[
        styles.bordered,
        { backgroundColor: prominent ? brand.nexdoIndigo : withAlpha(brand.nexdoIndigo, 0.15) },
        full && styles.borderedFull,
        centered && styles.borderedCentered,
        disabled && styles.disabledSoft,
      ]}
    >
      {icon ? <Ionicons name={icon} size={16} color={color} /> : null}
      {/* `.borderedProminent` keeps the body weight on iOS 26 (`wish-details-scrolled`). */}
      <Text style={{ fontSize: 17, lineHeight: 22, color }}>{title}</Text>
    </Pressable>
  );
}

/** Inline magenta-red error text under a primary button (`.foregroundStyle(.red)`). */
export function ErrorText({ children, testID }: { children: string; testID?: string }) {
  const theme = useTheme();
  return (
    <Text style={{ fontSize: 17, lineHeight: 22, color: theme.colors.danger }} testID={testID}>
      {children}
    </Text>
  );
}

/** Secondary text: `.foregroundStyle(.secondary)`. */
export function Secondary({ children, style, testID, numberOfLines }: { children: ReactNode; style?: object; testID?: string; numberOfLines?: number }) {
  const theme = useTheme();
  return (
    <Text style={[{ fontSize: 17, lineHeight: 22, color: theme.colors.secondaryLabel }, style]} testID={testID} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

/** `Label(_, systemImage:)`. */
export function IconLabel({ icon, title, style, color, size = 17 }: { icon: IconName; title: string; style?: object; color?: string; size?: number }) {
  const theme = useTheme();
  return (
    <View style={styles.label}>
      {/* A plain SwiftUI `Label` draws its icon in the primary colour, not the tint (`review-wish-*`). */}
      <Ionicons name={icon} size={size} color={color ?? theme.colors.label} />
      <Text style={[{ fontSize: 17, lineHeight: 22, color: color ?? theme.colors.label, flexShrink: 1 }, style]}>{title}</Text>
    </View>
  );
}

/**
 * A SwiftUI `.sheet` holding a `NavigationStack`: a full-height modal with an inline, centred title
 * and the toolbar's buttons. Android has no detents; every sheet in the app is full height.
 */
export function MomentSheet({
  visible,
  title,
  onRequestClose,
  left,
  right,
  children,
  testID,
  plain = false,
}: {
  visible: boolean;
  title: string;
  onRequestClose: () => void;
  left?: { title: string; onPress: () => void; disabled?: boolean; testID?: string };
  right?: { title: string; onPress: () => void; disabled?: boolean; testID?: string; bold?: boolean };
  children: ReactNode;
  testID?: string;
  /** A sheet whose body is a plain `ScrollView`, not a `Form`: iOS draws it on the system background. */
  plain?: boolean;
}) {
  const theme = useTheme({ elevated: true });
  const insets = useSafeAreaInsets();
  const background = plain ? theme.colors.background : theme.colors.groupedBackgroundElevated;
  // iOS 26's `.large` sheet (`moment-manage-schedule-confirm`): its top edge just below the status bar,
  // 38pt corners, over the page dimmed behind it. Android has no page sheet, so a transparent modal
  // draws the same shape (UI-parity pass 2).
  const top = Platform.OS === 'android' ? insets.top + 8 : 0;
  return (
    <Modal
      animationType="slide"
      onRequestClose={onRequestClose}
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      statusBarTranslucent
      transparent={Platform.OS === 'android'}
      visible={visible}
    >
      {Platform.OS === 'android' ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.sheetDim]} /> : null}
      <View style={[styles.sheet, { backgroundColor: background, marginTop: top }, Platform.OS === 'android' && styles.sheetShape]} testID={testID}>
        <View style={styles.sheetBar}>
          <View style={styles.sheetSide}>
            {left ? <SheetButton {...left} /> : null}
          </View>
          <Text accessibilityRole="header" numberOfLines={1} style={[headline, { color: theme.colors.ink, textAlign: 'center', flex: 1 }]}>
            {title}
          </Text>
          <View style={[styles.sheetSide, { alignItems: 'flex-end' }]}>{right ? <SheetButton {...right} /> : null}</View>
        </View>
        {/* A sheet has no transparent bar above it: a backdrop inside must not reach up under the
            page's bar (it would cover this sheet's own bar). */}
        {/* Android: the sheet is the elevated background, so its forms take the elevated field
            surface and stay a step above it (docs/android-polish.md §3). iOS keeps its own colours. */}
        <HeaderHeightContext.Provider value={0}>{Platform.OS === 'android' ? <ElevatedSurface>{children}</ElevatedSurface> : children}</HeaderHeightContext.Provider>
      </View>
    </Modal>
  );
}

function SheetButton({ title, onPress, disabled = false, testID, bold = false }: { title: string; onPress: () => void; disabled?: boolean; testID?: string; bold?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      testID={testID}
    >
      {/* A toolbar button on iOS 26 sits on a glass capsule. */}
      <GlassCapsule>
        <Text style={{ fontSize: 17, lineHeight: 22, color: disabled ? theme.colors.placeholder : theme.colors.link, fontWeight: bold ? '600' : '400' }}>{title}</Text>
      </GlassCapsule>
    </Pressable>
  );
}

/**
 * `ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") }` — global pattern 9.
 *
 * Android has no keyboard accessory view, so the same "Done" rides on a bar pinned to the top edge of
 * the keyboard while it is up. Tapping it dismisses the keyboard; tapping outside a field does not,
 * as in Swift.
 */
/** The height of the row `KeyboardDoneBar` floats on the keyboard; a field has to stay clear of it. */
export const KEYBOARD_DONE_BAR_HEIGHT = 60;

export function KeyboardDoneBar({ onDone, testID = 'keyboard-done' }: { onDone?: () => void; testID?: string }) {
  const theme = useTheme();
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => setHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(null));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  if (height === null) return null;
  return (
    // iOS 26: no bar, just a glass "Done" capsule floating above the keyboard's trailing edge
    // (`moment-create-error-empty-title`). The row passes touches through except on the capsule.
    <View pointerEvents="box-none" style={[styles.keyboardBar, { bottom: Platform.OS === 'android' ? height : 0 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Done"
        onPress={() => {
          onDone?.();
          Keyboard.dismiss();
        }}
        hitSlop={8}
        testID={testID}
      >
        <GlassCapsule>
          <Text style={{ fontSize: 17, lineHeight: 22, color: theme.colors.link }}>Done</Text>
        </GlassCapsule>
      </Pressable>
    </View>
  );
}

/** A screen body: `ZStack { TodayBackdrop(); ScrollView { VStack(spacing:) { … }.padding(18) } }`. */
export function scrollContent(spacing: number, alignLeading = true): ViewStyle {
  return { padding: 18, gap: spacing, alignItems: alignLeading ? 'stretch' : 'center', paddingBottom: 40 };
}

// ---------------------------------------------------------------------------------------------
// MomentConfetti (ios/App/MomentConfetti.swift:10-54)

const CONFETTI_COLORS = [systemColors.pink, systemColors.purple, systemColors.blue, systemColors.cyan, systemColors.orange, systemColors.yellow];

/**
 * A single short burst on arrival: 48 pieces fall for 2.8s each, eight staggered 60ms apart, starting
 * 350ms after the push so the transition finishes first, and gone after 3.4s. It never takes a touch
 * and is hidden from accessibility; with Reduce Motion it does not play.
 *
 * Drawn with React Native's own `Animated` on the native driver — one clock, 48 interpolations — so
 * it needs no native module. Swift draws the same maths in a `Canvas` at 30 fps.
 */
export function MomentConfetti({ width, height }: { width: number; height: number }) {
  const reduceMotion = useReduceMotion();
  const [clock] = useState(() => new Animated.Value(0));
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const start = setTimeout(() => {
      setActive(true);
      Animated.timing(clock, { toValue: 3.4, duration: 3400, easing: Easing.linear, useNativeDriver: true }).start(() => setActive(false));
    }, 350);
    return () => {
      clearTimeout(start);
      clock.stopAnimation();
    };
  }, [clock, reduceMotion]);

  if (!active || reduceMotion || width === 0) return null;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      {Array.from({ length: 48 }, (_, index) => {
        const delay = (index % 8) * 0.06;
        const end = delay + 2.8;
        const seed = index;
        const baseX = (width * ((index * 37) % 101)) / 100;
        const samples = Array.from({ length: 13 }, (_, step) => step / 12);
        const translateX = clock.interpolate({
          inputRange: samples.map((p) => delay + p * 2.8),
          outputRange: samples.map((p) => baseX + Math.sin(p * 7 + seed) * 24),
          extrapolate: 'clamp',
        });
        const translateY = clock.interpolate({ inputRange: [delay, end], outputRange: [-24, height + 24], extrapolate: 'clamp' });
        const opacity = clock.interpolate({
          inputRange: [0, Math.max(delay - 0.001, 0), delay, delay + 2.8 * 0.8, end],
          outputRange: [0, 0, 1, 1, 0],
          extrapolate: 'clamp',
        });
        const rotate = clock.interpolate({ inputRange: [delay, end], outputRange: [`${seed * 31}deg`, `${seed * 31 + 480}deg`], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={index}
            style={[
              styles.confetti,
              { height: index % 3 === 0 ? 8 : 12, backgroundColor: CONFETTI_COLORS[index % CONFETTI_COLORS.length], opacity, transform: [{ translateX }, { translateY }, { rotate }] },
            ]}
          />
        );
      })}
    </View>
  );
}

/**
 * A scroll view whose taps reach buttons while a field is focused (the keyboard stays up). On Android
 * it keeps the focused field above the keyboard and the "Done" capsule riding on it.
 */
export function MomentScroll({ children, contentContainerStyle, testID }: { children: ReactNode; contentContainerStyle?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <KeyboardAwareScrollView
      bottomOffset={KEYBOARD_DONE_BAR_HEIGHT}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={contentContainerStyle}
      testID={testID}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  cardShell: { borderRadius: 22, borderWidth: 1, overflow: 'hidden' },
  cardContent: { padding: 18, gap: 14, alignItems: 'stretch' },
  primary: { minHeight: 54, borderRadius: 18, justifyContent: 'center', paddingHorizontal: 16 },
  primaryLabel: { color: '#FFFFFF', alignSelf: 'stretch', textAlign: 'center' },
  disabled: { opacity: 0.25 },
  disabledSoft: { opacity: 0.35 },
  segments: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 18 },
  segment: { flex: 1, minHeight: 42, borderRadius: 15, justifyContent: 'center', overflow: 'hidden' },
  segmentFill: { borderRadius: 15 },
  segmentLabel: { fontSize: 15, lineHeight: 20, fontWeight: '500', textAlign: 'center', alignSelf: 'stretch' },
  tile: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  hearts: { width: 50, height: 50 },
  diya: { alignItems: 'center', gap: 1 },
  bowl: { width: 38, height: 17, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, alignSelf: 'flex-start' },
  badgeLabel: { fontWeight: '600' },
  tintButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  bordered: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start' },
  borderedFull: { alignSelf: 'stretch', minHeight: 48 },
  borderedCentered: { alignSelf: 'center' },
  label: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheet: { flex: 1 },
  sheetShape: { borderTopLeftRadius: 38, borderTopRightRadius: 38, overflow: 'hidden' },
  sheetDim: { backgroundColor: 'rgba(0, 0, 0, 0.25)' },
  sheetBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, minHeight: 64 },
  sheetSide: { width: 90 },
  keyboardBar: { position: 'absolute', left: 0, right: 0, height: KEYBOARD_DONE_BAR_HEIGHT, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 12 },
  confetti: { position: 'absolute', left: -4, top: -6, width: 8, borderRadius: 2 },
});
