import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CalendarRow } from '../lib/calendarRows';
import { rowSymbol, rowTone } from '../lib/calendarRows';
import { androidGroup, androidSeparator, brand, isAndroid, useTheme } from '../theme';
import { SegmentRow } from './SegmentRow';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * The pieces of `CalendarView` (ios/App/CalendarView.swift): `badge` (`:456`), `summaryCard`
 * (`:341-347`), `segments` (`:239-249`) and `timeline` (`:436-454`). All are private funcs on the
 * view; they are components here so each can be render-tested.
 */

/** Android timeline row geometry (docs/android-polish.md §10). */
const ANDROID_TIME_WIDTH = 72;
const ANDROID_RAIL_WIDTH = 8;
const ANDROID_GLYPH = 44;
const ANDROID_ROW_GAP = 10;
/** Where the text column — and so the row separator — starts. */
export const ANDROID_TEXT_INSET = ANDROID_TIME_WIDTH + ANDROID_RAIL_WIDTH + ANDROID_GLYPH + ANDROID_ROW_GAP * 3;

/** `badge(_:color:)` (CalendarView.swift:456-458). */
export function CalendarBadge({ text, tone }: { text: string; tone: 'green' | 'orange' | 'red' | 'indigo' }) {
  const theme = useTheme();
  const colour = tone === 'green' ? '#34C759' : tone === 'orange' ? '#FF9500' : tone === 'red' ? '#FF3B30' : theme.colors.link;
  return (
    <View style={[styles.badge, { backgroundColor: withAlpha(colour, 0.12) }]}>
      <Text style={[styles.badgeText, { color: colour }]}>{text}</Text>
    </View>
  );
}

/** `summaryCard(_:detail:)` (CalendarView.swift:341-347). */
export function CalendarSummaryCard({ title, detail, testID }: { title: string; detail: string; testID?: string }) {
  const theme = useTheme();
  return (
    // Android: the shared form group (docs/android-polish.md §10), as every other card.
    <View style={[styles.summaryCard, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.075) }, androidGroup(theme)]} testID={testID}>
      <TaskSymbol name="sparkles" size={22} color={theme.colors.link} />
      <View style={styles.grow}>
        <Text style={[styles.summaryTitle, { color: theme.colors.link }]}>{title}</Text>
        <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>{detail}</Text>
      </View>
    </View>
  );
}

/** `segments` (CalendarView.swift:239-249): the Schedule / Week / Month picker. */
export function CalendarSegments<T extends string>({
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
  // Android (docs/android-polish.md §9): the shared `SegmentRow` sizes each segment to its label.
  if (isAndroid()) {
    return (
      <SegmentRow
        labels={options}
        selected={options.indexOf(value)}
        base={{ fontSize: 15, lineHeight: 21 }}
        labelStyle={styles.segmentLabel}
        gap={0}
        inset={0}
        style={[styles.segments, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.07) }]}
        testID={`${testIDPrefix}-row`}
        renderSegment={(index, fit, segmentStyle) => {
          const option = options[index];
          const selected = option === value;
          const label = (
            <Text numberOfLines={1} style={[styles.segmentLabel, { fontSize: fit.fontSize, lineHeight: fit.lineHeight, color: selected ? '#FFFFFF' : theme.colors.link }]}>
              {option}
            </Text>
          );
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={option}
              accessibilityState={{ selected }}
              onPress={() => onChange(option)}
              testID={`${testIDPrefix}-${option}`}
            >
              {selected ? (
                <LinearGradient colors={[brand.nexdoBlue, brand.nexdoIndigo, brand.nexdoMagenta]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[styles.segment, segmentStyle]}>
                  {label}
                </LinearGradient>
              ) : (
                <View style={[styles.segment, segmentStyle]}>{label}</View>
              )}
            </Pressable>
          );
        }}
      />
    );
  }
  return (
    <View style={[styles.segments, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.07) }]}>
      {options.map((option) => {
        const selected = option === value;
        const label = (
          <Text style={[styles.segmentLabel, { color: selected ? '#FFFFFF' : theme.colors.link }]}>{option}</Text>
        );
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityLabel={option}
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            testID={`${testIDPrefix}-${option}`}
            style={styles.segmentWrapper}
          >
            {selected ? (
              // `NexdoTheme.saveGradient`: blue → indigo → magenta.
              <LinearGradient
                colors={[brand.nexdoBlue, brand.nexdoIndigo, brand.nexdoMagenta]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.segment}
              >
                {label}
              </LinearGradient>
            ) : (
              <View style={styles.segment}>{label}</View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * `timeline(_:)` (CalendarView.swift:436-454): the time gutter, the connector rail, the glyph, the
 * title, the detail line and the badges.
 */
export function CalendarTimelineRow({
  row,
  timeZone,
  completedOnly,
  now,
  onPress,
}: {
  row: CalendarRow;
  timeZone: string;
  completedOnly: boolean;
  now: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  // Android's pressed fill, held here so it follows the finger (onPressIn / onPressOut).
  const [pressed, setPressed] = useState(false);
  const tone = rowTone(row, timeZone, now);
  const colour = tone === 'critical' ? '#FF3B30' : tone === 'late' ? '#FF9500' : theme.colors.link;
  const late = tone === 'late';
  const critical = tone === 'critical';
  const badges = (
    <View style={styles.badges}>
      {completedOnly ? <CalendarBadge text={row.event !== null ? 'Past event' : 'Completed'} tone="green" /> : null}
      {late ? <CalendarBadge text="Overdue" tone="orange" /> : null}
      {critical ? <CalendarBadge text="Critical" tone="red" /> : null}
      {row.deadline ? <CalendarBadge text="Deadline" tone="indigo" /> : null}
    </View>
  );

  if (isAndroid()) {
    // Android (docs/android-polish.md §10): every part centred on the row — the time, the rail's dot,
    // the 44pt tile, the text and the chevron — so the chevron sits in its own row rather than
    // floating at the top between rows. The whole row is the target, with a pressed fill, and the
    // separator runs from the text column to the row's right edge.
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${row.time}, ${row.title}, ${row.detail}`}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        android_ripple={{ color: theme.colors.fieldBorder }}
        testID={`calendar-row-${row.id}`}
        style={[styles.androidRow, pressed && { backgroundColor: theme.colors.fieldSurface }]}
      >
        <Text style={[styles.androidTime, { color: theme.colors.ink }]}>{row.time}</Text>
        <View style={styles.androidRail}>
          <View style={[styles.railLine, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.18) }]} />
          <View style={[styles.railDot, { backgroundColor: colour }]} testID={`calendar-row-${row.id}-dot`} />
        </View>
        <View
          style={[styles.androidGlyph, { backgroundColor: theme.colors.fieldSurface, borderColor: theme.colors.fieldBorder }]}
          testID={`calendar-row-${row.id}-glyph`}
        >
          <TaskSymbol name={rowSymbol(row, timeZone, now)} size={22} color={colour} />
        </View>
        <View style={styles.androidText}>
          <Text style={[styles.androidTitle, { color: theme.colors.ink }]}>{row.title}</Text>
          <Text style={[styles.androidDetail, { color: theme.colors.secondary }]}>{row.detail}</Text>
          {badges}
        </View>
        <View style={styles.androidChevron} testID={`calendar-row-${row.id}-chevron`}>
          <TaskSymbol name="chevron.right" size={12} color={theme.colors.secondary} />
        </View>
        <View pointerEvents="none" style={[styles.androidSeparator, androidSeparator(theme)]} testID={`calendar-row-${row.id}-separator`} />
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.time}, ${row.title}, ${row.detail}`}
      onPress={onPress}
      testID={`calendar-row-${row.id}`}
      style={styles.timelineRow}
    >
      {/* `Text(row.time).font(.caption)` (CalendarView.swift:440) carries no `.foregroundStyle`, so
          it inherits the view's `.foregroundStyle(Color.nexdoInk)` (`:138`) like every other label
          in the row — it is not the one greyed part of it. */}
      <Text style={[styles.time, { color: theme.colors.ink }]}>{row.time}</Text>
      <View style={styles.rail}>
        <View style={[styles.railLine, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.18) }]} />
        <View style={[styles.railDot, { backgroundColor: colour }]} />
      </View>
      <View style={[styles.glyph, { backgroundColor: withAlpha(colour, 0.11) }]}>
        <TaskSymbol name={rowSymbol(row, timeZone, now)} size={20} color={colour} />
      </View>
      <View style={styles.rowText}>
        <Text style={[theme.typography.body, { color: theme.colors.ink }]}>{row.title}</Text>
        <Text style={[styles.caption, { color: theme.colors.secondary }]}>{row.detail}</Text>
        {badges}
        <View style={[styles.rowDivider, { backgroundColor: theme.colors.separator }]} />
      </View>
      <TaskSymbol name="chevron.right" size={12} color={theme.colors.secondary} />
    </Pressable>
  );
}

export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgba')) return color.replace(/[\d.]+\)$/, `${alpha})`);
  const hex = color.replace('#', '');
  const value = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
  const int = parseInt(value, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, lineHeight: 13 },
  // `.padding(20)`, corner radius 16.
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, borderRadius: 16 },
  summaryTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', marginBottom: 8 },
  subheadline: { fontSize: 15, lineHeight: 21 },
  grow: { flex: 1 },
  segments: { flexDirection: 'row', borderRadius: 12 },
  segmentWrapper: { flex: 1 },
  segment: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  segmentLabel: { fontSize: 15, lineHeight: 21 },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  time: { width: 64, fontSize: 12, lineHeight: 16, paddingTop: 18 },
  rail: { width: 8, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  railLine: { position: 'absolute', top: 0, bottom: 0, width: 1 },
  railDot: { width: 8, height: 8, borderRadius: 4 },
  glyph: { width: 32, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  rowText: { flex: 1, gap: 7, paddingTop: 18, paddingBottom: 4 },
  caption: { fontSize: 12, lineHeight: 16 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rowDivider: { height: StyleSheet.hairlineWidth, marginTop: 10 },

  // Android timeline row (docs/android-polish.md §10). Every column is centred on the row.
  androidRow: { flexDirection: 'row', alignItems: 'center', gap: ANDROID_ROW_GAP, paddingVertical: 12, paddingRight: 16 },
  androidTime: { width: ANDROID_TIME_WIDTH, fontSize: 12, lineHeight: 16, textAlign: 'left' },
  // The rail runs through the row's padding too, so it is continuous from one row to the next.
  androidRail: { width: ANDROID_RAIL_WIDTH, alignSelf: 'stretch', marginVertical: -12, alignItems: 'center', justifyContent: 'center' },
  androidGlyph: { width: ANDROID_GLYPH, height: ANDROID_GLYPH, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  androidText: { flex: 1, gap: 4 },
  androidTitle: { fontSize: 17, lineHeight: 22 },
  androidDetail: { fontSize: 14, lineHeight: 19 },
  androidChevron: { alignSelf: 'center' },
  // From the text column's left edge to the row's right edge, on the row's bottom.
  androidSeparator: { position: 'absolute', left: ANDROID_TEXT_INSET, right: 0, bottom: 0 },
});
