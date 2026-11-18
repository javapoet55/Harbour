import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { MonthCalendar } from '../../components/MonthCalendar';
import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { addDays, dayKey, startOfDay } from '../../lib/taskQuery';
import { Segment } from '../pomodoro/charts';
import { useTheme } from '../../theme';

/**
 * The Calorie Tracker's building blocks (ios/App/CalorieTrackerView.swift:421-455, `:653-661`,
 * `:932-950`). Since ce6d20a Swift follows the phone's theme: the ink is `nexdoInk`, the page
 * `systemBackground`, the cards `secondarySystemGroupedBackground`, and the controls `wellnessAccent`.
 */

/** iOS `.indigo` (light), the filled step, the ring track and the chart bars. */
export const SYSTEM_INDIGO = '#5856D6';
export const GRADIENT = ['#AF52DE', SYSTEM_INDIGO, '#007AFF'] as const;

/** The tracker's colours in the current scheme. Text without a colour takes the theme's ink. */
export function useCalorieColors() {
  const { scheme, colors } = useTheme();
  const dark = scheme === 'dark';
  return {
    dark,
    /** `Color.nexdoInk`. */
    ink: colors.ink,
    /** `.secondary`. */
    secondary: colors.secondaryLabel,
    placeholder: colors.placeholder,
    separator: colors.separator,
    danger: colors.danger,
    /** `Color.wellnessAccent`: switches, the radio checks, the unfilled step numbers, the insight's button. */
    accent: colors.wellnessAccent,
    /** The app tint on a plain button (the food editor's Cancel and Add); the dark-mode `link` on Android. */
    link: colors.link,
    /** `systemBackground`. */
    background: dark ? '#000000' : '#FFFFFF',
    /** `secondarySystemGroupedBackground`: cards, fields and the date sheet. */
    card: dark ? '#1C1C1E' : '#FFFFFF',
    /** A system fill: the segmented track, the stepper and the date pill. */
    fill: dark ? 'rgba(118, 118, 128, 0.24)' : 'rgba(118, 118, 128, 0.12)',
    segmentOn: dark ? '#636366' : '#FFFFFF',
    disabledIcon: colors.placeholder,
  };
}

export type CalorieColors = ReturnType<typeof useCalorieColors>;

export type IconName = keyof typeof Ionicons.glyphMap;

/** `card(_:)`: 16 padding, 14 spacing, `secondarySystemGroupedBackground` on a 22 radius, a faint indigo stroke and shadow. */
export function Card({ children, testID }: { children: ReactNode; testID?: string }) {
  const colors = useCalorieColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]} testID={testID}>
      {children}
    </View>
  );
}

/** `primary(_:disabled:action:)`: the gradient button, at 45% while disabled. */
export function Primary({ title, onPress, disabled = false, testID }: { title: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} testID={testID}>
      <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[styles.primary, disabled && styles.disabled]}>
        <Text style={styles.primaryText}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

/** A plain `Button("…")`, centred with `.frame(maxWidth: .infinity)` unless `inline`. */
export function TextButton({
  title,
  onPress,
  destructive = false,
  disabled = false,
  inline = false,
  bold = false,
  small = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  inline?: boolean;
  bold?: boolean;
  small?: boolean;
  testID?: string;
}) {
  const colors = useCalorieColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={inline ? 8 : 0}
      onPress={onPress}
      style={inline ? null : styles.wideButton}
      testID={testID}
    >
      <Text
        style={[
          small ? styles.captionBold : styles.body,
          bold && styles.bold,
          { color: destructive ? colors.danger : colors.ink },
          disabled && styles.disabledText,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

/**
 * `icon(_:_:)`: a 46pt rounded tile at 12% of its colour. A number is SF Symbols' `N.circle.fill`, which
 * Ionicons does not have: a filled circle with the number in white.
 */
export function IconTile({ name, color }: { name: IconName | number; color: string }) {
  return (
    <View accessible={false} style={[styles.iconTile, { backgroundColor: withAlpha(color, 0.12) }]}>
      {typeof name === 'number' ? (
        <View style={[styles.numberCircle, { backgroundColor: color }]}>
          <Text style={styles.numberText}>{String(name)}</Text>
        </View>
      ) : (
        <Ionicons color={color} name={name} size={24} />
      )}
    </View>
  );
}

/** `feature(_:_:_:_:)`: the icon tile beside a headline and a secondary line. */
export function Feature({ icon, color, title, detail, testID }: { icon: IconName | number; color: string; title: string; detail: string; testID?: string }) {
  const colors = useCalorieColors();
  return (
    <View style={styles.feature} testID={testID}>
      <IconTile color={color} name={icon} />
      <View style={[styles.grow, styles.featureText]}>
        <Text style={styles.headline}>{title}</Text>
        <Text style={[styles.subheadline, { color: colors.secondary }]}>{detail}</Text>
      </View>
    </View>
  );
}

/** `steps(_:)`: Time, Goals, Confirm, the current one filled; the others' numbers in `wellnessAccent`. */
export function Steps({ current }: { current: number }) {
  const colors = useCalorieColors();
  return (
    <View style={styles.steps} testID="calorie-steps">
      {['Time', 'Goals', 'Confirm'].map((title, index) => {
        const on = index === current;
        return (
          <View accessibilityState={{ selected: on }} key={title} style={styles.step}>
            <View style={[styles.stepNumber, { backgroundColor: on ? SYSTEM_INDIGO : withAlpha(SYSTEM_INDIGO, 0.08) }]}>
              <Text style={[styles.headline, { color: on ? '#FFFFFF' : colors.accent }]}>{String(index + 1)}</Text>
            </View>
            <Text style={styles.caption}>{title}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** `Picker(…).pickerStyle(.segmented)`. */
export function Segmented<T extends string>({ options, value, onChange, testID }: { options: readonly { value: T; title: string }[]; value: T; onChange: (next: T) => void; testID: string }) {
  const colors = useCalorieColors();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.fill }]} testID={testID}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, on && [styles.segmentOn, { backgroundColor: colors.segmentOn }]]}
            testID={`${testID}-${option.value}`}
          >
            <Text style={[styles.segmentText, on && styles.semibold]}>{option.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** `Stepper(_:value:in:step:)`: the label, and − / + in one capsule. */
export function Stepper({ label, value, min, max, step, onChange, testID }: { label: string; value: number; min: number; max: number; step: number; onChange: (next: number) => void; testID: string }) {
  const atMin = value <= min;
  const atMax = value >= max;
  const colors = useCalorieColors();
  return (
    <View style={styles.stepperRow}>
      <Text style={[styles.body, styles.grow]}>{label}</Text>
      <View style={[styles.stepper, { backgroundColor: colors.fill }]}>
        <Pressable
          accessibilityLabel={`${label}, decrement`}
          accessibilityRole="button"
          accessibilityState={{ disabled: atMin }}
          disabled={atMin}
          onPress={() => onChange(Math.max(min, value - step))}
          style={styles.stepperButton}
          testID={`${testID}-decrement`}
        >
          <Ionicons color={atMin ? colors.disabledIcon : colors.ink} name="remove" size={20} />
        </Pressable>
        <View style={[styles.stepperDivider, { backgroundColor: colors.separator }]} />
        <Pressable
          accessibilityLabel={`${label}, increment`}
          accessibilityRole="button"
          accessibilityState={{ disabled: atMax }}
          disabled={atMax}
          onPress={() => onChange(Math.min(max, value + step))}
          style={styles.stepperButton}
          testID={`${testID}-increment`}
        >
          <Ionicons color={atMax ? colors.disabledIcon : colors.ink} name="add" size={20} />
        </Pressable>
      </View>
    </View>
  );
}

/** A linear `ProgressView(value:)` in its tint. */
export function ProgressBar({ value, color, testID }: { value: number; color: string; testID?: string }) {
  const fraction = Math.max(0, Math.min(1, value));
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }} style={styles.track} testID={testID}>
      <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

/**
 * The Today ring (`:721-725`): a 16-wide indigo track at 6%, and the share of the goal eaten drawn from
 * 12 o'clock in a blue → cyan → green gradient running bottom-left to top-right. Nothing is drawn at 0.
 */
export function CalorieRing({ ratio, children }: { ratio: number; children: ReactNode }) {
  const size = 170;
  const stroke = 16;
  const count = 180;
  const radius = (size - stroke) / 2;
  const length = (2 * Math.PI * radius) / count + 1.2;
  const shown = Math.round(Math.max(0, Math.min(1, ratio)) * count);
  const stops = [
    [0, 122, 255],
    [50, 173, 230],
    [52, 199, 89],
  ];
  const colorAt = (angle: number) => {
    // The segment's place along the bottom-left → top-right axis of the UNROTATED ring: Swift strokes the
    // gradient first and then `.rotationEffect(.degrees(-90))`, so the gradient turns with the ring. A
    // segment `angle` clockwise from 12 o'clock on screen sat `angle` clockwise from 3 o'clock before it,
    // at (cos, sin) with y down; bottom-left → top-right reads x − y. 12 o'clock is teal, 3 o'clock blue.
    const radians = (angle * Math.PI) / 180;
    const t = Math.max(0, Math.min(1, (Math.cos(radians) - Math.sin(radians) + 2) / 4));
    const scaled = t * 2;
    const index = Math.min(1, Math.floor(scaled));
    const local = scaled - index;
    const [r, g, b] = stops[index].map((value, channel) => Math.round(value + (stops[index + 1][channel] - value) * local));
    return `rgb(${r}, ${g}, ${b})`;
  };
  return (
    <View style={{ width: size, height: size }} testID="calorie-ring">
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, borderWidth: stroke, borderColor: withAlpha(SYSTEM_INDIGO, 0.06) }]} />
      {Array.from({ length: shown }, (_, index) => {
        const angle = (index / count) * 360;
        return <Segment angle={angle} color={colorAt(angle)} key={index} length={length} size={size} stroke={stroke} />;
      })}
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

/** `ChartBars` (`:932-950`): bars against the larger of the goal and the tallest day, 120 tall at most. */
export function ChartBars({ values, labels, goal }: { values: number[]; labels: string[]; goal: number }) {
  const top = Math.max(goal, ...values, 1);
  return (
    <View
      accessibilityLabel={`Calories chart: ${values.map((value, index) => `${labels[index] ?? ''} ${value} kcal`).join(', ')}`}
      accessible
      style={styles.chart}
      testID="calorie-chart"
    >
      <View style={styles.chartRow}>
        {values.map((value, index) => (
          <View key={index} style={styles.chartColumn}>
            <LinearGradient colors={['#32ADE6', SYSTEM_INDIGO]} style={[styles.bar, { height: Math.max(4, (value / top) * 120) }]} />
            <Text style={styles.caption}>{index < labels.length ? labels[index] : ''}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * `dateSelector` (`:653-661`): previous day, a compact date picker limited to today and earlier, next
 * day (never past today). `at` is the selected instant; days move in `zone`.
 */
export function DateSelector({ at, zone, onChange, now }: { at: number; zone: string; onChange: (next: number) => void; now: number }) {
  const [open, setOpen] = useState(false);
  const label = new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(at));
  const clamp = (next: number) => (dayKey(next, zone) > dayKey(now, zone) ? now : next);
  const colors = useCalorieColors();
  return (
    <View style={styles.dateRow}>
      <Pressable accessibilityLabel="Previous day" accessibilityRole="button" onPress={() => onChange(addDays(at, -1, zone) + (at - startOfDay(at, zone)))} style={styles.dateArrow} testID="calorie-previous-day">
        <Ionicons color={colors.ink} name="chevron-back" size={20} />
      </Pressable>
      <Pressable accessibilityLabel={`Date, ${label}`} accessibilityRole="button" onPress={() => setOpen(true)} style={[styles.datePill, { backgroundColor: colors.fill }]} testID="calorie-date">
        <Text style={styles.body}>{label}</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Next day"
        accessibilityRole="button"
        onPress={() => onChange(clamp(addDays(at, 1, zone) + (at - startOfDay(at, zone))))}
        style={styles.dateArrow}
        testID="calorie-next-day"
      >
        <Ionicons color={colors.ink} name="chevron-forward" size={20} />
      </Pressable>
      <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <Pressable onPress={() => setOpen(false)} style={styles.scrim}>
          <View style={[styles.calendar, { backgroundColor: colors.card }]}>
            <MonthCalendar
              now={now}
              onSelect={(next) => {
                onChange(clamp(next));
                setOpen(false);
              }}
              selected={at}
              system
              timeZone={zone}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

export const styles = StyleSheet.create({
  grow: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  card: {
    gap: 14,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: withAlpha(SYSTEM_INDIGO, 0.08),
    shadowColor: SYSTEM_INDIGO,
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    // No `elevation`: Android draws it at full strength in `shadowColor` and shows it through the 90% fill
    // (an outline and a grey inner panel). The 1pt stroke carries the edge, as on Pomodoro's cards.
  },
  primary: { padding: 16, borderRadius: 16, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  disabledText: { opacity: 0.35 },
  wideButton: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 4 },
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22 },
  subheadline: { fontSize: 15, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },
  captionBold: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  bold: { fontWeight: '700' },
  semibold: { fontWeight: '600' },
  iconTile: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  numberCircle: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: '#FFFFFF', fontSize: 14, lineHeight: 17, fontWeight: '700' },
  // `VStack(alignment: .leading, spacing: 6)` (CalorieTrackerView.swift:445).
  featureText: { gap: 6 },
  feature: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 8 },
  steps: { flexDirection: 'row', padding: 14, borderRadius: 18, backgroundColor: withAlpha(SYSTEM_INDIGO, 0.04) },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  stepNumber: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  segmented: { flexDirection: 'row', padding: 2, borderRadius: 9 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 7 },
  segmentOn: {
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segmentText: { fontSize: 13, lineHeight: 18 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // iOS 26's Stepper is a capsule (`calorie-setup-goals`).
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 999 },
  stepperButton: { width: 47, height: 32, alignItems: 'center', justifyContent: 'center' },
  stepperDivider: { width: StyleSheet.hairlineWidth, height: 18 },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(118, 118, 128, 0.2)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  // `HStack(alignment: .bottom).frame(height: 155)`: the row is as tall as its tallest column and the
  // frame centres it, so short bars sit mid-card, not on its floor (`calorie-dashboard-week`).
  chart: { height: 155, justifyContent: 'center' },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  chartColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  bar: { alignSelf: 'stretch', borderRadius: 5 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateArrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  datePill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  scrim: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0, 0, 0, 0.2)' },
  calendar: { borderRadius: 16, padding: 12 },
});
