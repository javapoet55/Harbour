import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CalendarRow } from '../lib/calendarRows';
import { rowSymbol, rowTone } from '../lib/calendarRows';
import { brand, useTheme } from '../theme';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * The pieces of `CalendarView` (ios/App/CalendarView.swift): `badge` (`:456`), `summaryCard`
 * (`:341-347`), `segments` (`:239-249`) and `timeline` (`:436-454`). All are private funcs on the
 * view; they are components here so each can be render-tested.
 */

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
    <View style={[styles.summaryCard, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.075) }]} testID={testID}>
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
  const tone = rowTone(row, timeZone, now);
  const colour = tone === 'critical' ? '#FF3B30' : tone === 'late' ? '#FF9500' : theme.colors.link;
  const late = tone === 'late';
  const critical = tone === 'critical';

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
        <View style={styles.badges}>
          {completedOnly ? <CalendarBadge text={row.event !== null ? 'Past event' : 'Completed'} tone="green" /> : null}
          {late ? <CalendarBadge text="Overdue" tone="orange" /> : null}
          {critical ? <CalendarBadge text="Critical" tone="red" /> : null}
          {row.deadline ? <CalendarBadge text="Deadline" tone="indigo" /> : null}
        </View>
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
});
