import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { androidChip, brand, isAndroid, useTheme } from '../theme';
import { DISTANT_FUTURE, type TaskDateFilter } from '../lib/taskQuery';
import { TaskSymbol, type TaskSymbolName } from './TaskSymbol';
import { Text } from './Text';

/**
 * The small pieces of `TasksView` (ios/App/RootView.swift:1620-1907), each kept as its own component
 * so it can be render-tested. Every one is a private `var`/`func` on the Swift view rather than a
 * separate struct, so the line references below point into `TasksView` itself.
 */

/**
 * The accent used across the Tasks screen (RootView.swift:1684): `LinearGradient([Color(red: 0.68,
 * green: 0.20, blue: 1), .nexdoIndigo, Color(red: 0.36, green: 0.46, blue: 1)], leading→trailing)`.
 */
export const TASK_ACCENT = ['#AD33FF', brand.nexdoIndigo, '#5C75FF'] as const;

/**
 * `TasksView.taskTab(_:projects:)` (RootView.swift:1773-1780) inside its track (`:1695-1700`): two
 * full-width capsules in an `HStack(spacing: 0)`, padded 4 on a `nexdoIndigo` 6% capsule. The selected
 * one is white text on `TASK_ACCENT`; the other is ink on clear. It replaced the segmented picker, on
 * Android too (where `SegmentRow` drew it before).
 */
export function TaskTabs({ projects, onChange }: { projects: boolean; onChange: (projects: boolean) => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.tabTrack, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.06) }]} testID="tasks-segments">
      {(['Tasks', 'Projects'] as const).map((label) => {
        const selected = (label === 'Projects') === projects;
        const text = (
          <Text numberOfLines={1} style={[styles.tabLabel, { color: selected ? '#FFFFFF' : theme.colors.ink }]}>
            {label}
          </Text>
        );
        return (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => onChange(label === 'Projects')}
            style={styles.tabCell}
            testID={`segment-${label}`}
          >
            {selected ? (
              <LinearGradient colors={[...TASK_ACCENT]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.tab} testID={`segment-${label}-selected`}>
                {text}
              </LinearGradient>
            ) : (
              <View style={styles.tab}>{text}</View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** `TasksView.headerButton` (RootView.swift:1748-1756): a 44pt tinted square. */
export function HeaderButton({ icon, label, onPress }: { icon: TaskSymbolName; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.headerButton, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.06), borderColor: withAlpha(brand.nexdoIndigo, 0.14) }]}
    >
      <TaskSymbol name={icon} size={20} color={theme.colors.link} />
    </Pressable>
  );
}

/** `TasksView.datePills` (RootView.swift:1783-1806). */
export function DatePill({
  filter,
  count,
  selected,
  onPress,
}: {
  filter: TaskDateFilter;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  // The All pill shows no count in Swift: `if filter != .all`.
  const showsCount = filter !== 'All';
  const content = (
    <>
      <Text style={[styles.pillLabel, { color: selected ? '#FFFFFF' : theme.colors.secondary }]}>{filter}</Text>
      {showsCount ? (
        <View style={[styles.pillCount, { backgroundColor: selected ? 'rgba(255,255,255,0.25)' : withAlpha(brand.nexdoIndigo, 0.08) }]}>
          <Text style={[styles.pillCountLabel, { color: selected ? '#FFFFFF' : theme.colors.secondary }]}>{String(count)}</Text>
        </View>
      ) : null}
    </>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${filter}, ${count} tasks`}
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={`date-pill-${filter}`}
    >
      {selected ? (
        <LinearGradient colors={[...TASK_ACCENT]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[styles.pill, isAndroid() && androidChip]} testID={`date-pill-${filter}-surface`}>
          {content}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.pill,
            isAndroid() && androidChip,
            { backgroundColor: theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(brand.nexdoIndigo, 0.16) },
          ]}
          testID={`date-pill-${filter}-surface`}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
}

/** `TasksView.creationCard` (RootView.swift:1812-1832). */
export function CreationCard({
  title,
  subtitle,
  icon,
  isVoice,
  onPress,
  testID,
}: {
  title: string;
  subtitle: string;
  icon: TaskSymbolName;
  isVoice: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  // Android stacks the two cards full width (docs/android-polish.md §2), so the title has the room
  // to show in full and is never cut to one line.
  const android = isAndroid();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      onPress={onPress}
      testID={testID}
      style={[
        styles.creationCard,
        android && styles.androidCreationCard,
        {
          backgroundColor: isVoice ? withAlpha(brand.nexdoIndigo, 0.05) : withAlpha(theme.colors.surface, 0.7),
          borderColor: withAlpha(brand.nexdoIndigo, 0.16),
        },
      ]}
    >
      {isVoice ? (
        <LinearGradient colors={[...TASK_ACCENT]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.creationIcon}>
          <TaskSymbol name={icon} size={24} color="#FFFFFF" />
        </LinearGradient>
      ) : (
        // `Color.nexdoBlue` on `Color.nexdoBlue.opacity(0.15)` (RootView.swift:1835-1838).
        <View style={[styles.creationIcon, { backgroundColor: withAlpha(brand.nexdoBlue, 0.15) }]} testID={testID ? `${testID}-icon` : undefined}>
          <TaskSymbol name={icon} size={24} color={brand.nexdoBlue} />
        </View>
      )}
      <View style={styles.creationText}>
        <Text numberOfLines={android ? undefined : 1} style={[styles.creationTitle, { color: theme.colors.ink }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[styles.creationSubtitle, { color: theme.colors.secondary }]}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * `sectionDate(_:)` (RootView.swift:1969-1974): `DateFormatter` with `"EEEE, MMM d"` in the account
 * zone, e.g. "Wednesday, Sep 16". Null for the unscheduled bucket (`group.date != .distantFuture`).
 */
export function sectionDateLabel(date: number, timeZone: string): string | null {
  if (date === DISTANT_FUTURE) return null;
  const format = (zone?: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'long', month: 'short', day: 'numeric' }).formatToParts(new Date(date));
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = format(timeZone);
  } catch {
    parts = format();
  }
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('weekday')}, ${get('month')} ${get('day')}`;
}

/**
 * The section header row (RootView.swift:1899-1911): a calendar glyph, the title over the day's date,
 * and the count on the right, on a white 65% rounded card.
 *
 * Dark mode: Swift's card is a fixed `Color.white.opacity(0.65)` under `nexdoInk`, which is white in
 * dark, so the title would vanish. Dark uses the surface at the same 65% instead.
 */
export function SectionHeader({ title, date, count }: { title: string; date?: string | null; count: number }) {
  const theme = useTheme();
  const card = theme.scheme === 'dark' ? withAlpha(theme.colors.surface, 0.65) : SECTION_CARD_LIGHT;
  return (
    <View style={[styles.sectionHeader, { backgroundColor: card }]} testID="section-header">
      <View style={styles.sectionIcon}>
        <TaskSymbol name="calendar" size={22} color={brand.nexdoBlue} />
      </View>
      <View style={styles.sectionText}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.colors.ink }]}>
          {title}
        </Text>
        {date ? <Text style={[styles.sectionDate, { color: theme.colors.secondary }]}>{date}</Text> : null}
      </View>
      <Text style={[styles.sectionCount, { color: theme.colors.secondary }]}>
        {count} {count === 1 ? 'task' : 'tasks'}
      </Text>
    </View>
  );
}

/**
 * `ContentUnavailableView` (RootView.swift:1824-1830): the icon-and-title empty state with a fixed
 * description and an "Add Manually" action.
 */
export function TaskEmptyState({ title, onAdd, style }: { title: string; onAdd: () => void; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[styles.empty, style]}>
      <TaskSymbol name="checklist" size={44} color={theme.colors.secondary} />
      <Text style={[styles.emptyTitle, { color: theme.colors.ink }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: theme.colors.secondary }]}>Try another filter or add a task.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add Manually"
        onPress={onAdd}
        style={[styles.emptyAction, { borderColor: withAlpha(brand.nexdoIndigo, 0.16), backgroundColor: withAlpha(brand.nexdoIndigo, 0.06) }]}
      >
        <Text style={[theme.typography.body, { color: theme.colors.link }]}>Add Manually</Text>
      </Pressable>
    </View>
  );
}

/** `Color.white.opacity(0.65)`. */
const SECTION_CARD_LIGHT = 'rgba(255, 255, 255, 0.65)';

export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgba')) return color.replace(/[\d.]+\)$/, `${alpha})`);
  const hex = color.replace('#', '');
  const value = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
  const int = parseInt(value, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

const styles = StyleSheet.create({
  // `.padding(4)` on the capsule track; each tab `.frame(maxWidth: .infinity, minHeight: 40)`.
  tabTrack: { flexDirection: 'row', padding: 4, borderRadius: 999 },
  tabCell: { flex: 1 },
  tab: { minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  // `.font(.subheadline.weight(.semibold))`
  tabLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: StyleSheet.hairlineWidth },
  // `.padding(.horizontal, 8).frame(minHeight: 44)`, capsule.
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, minHeight: 44, borderRadius: 999 },
  pillLabel: { fontSize: 13, lineHeight: 18 },
  pillCount: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 999 },
  pillCountLabel: { fontSize: 12, lineHeight: 16 },
  // `.padding(12).frame(maxWidth: .infinity, minHeight: 72)`, corner radius 20.
  creationCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 72, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  // Android: one card per row, full width. `flex: 1` in the stacked column would share out height.
  androidCreationCard: { flex: 0, alignSelf: 'stretch' },
  creationIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  creationText: { flex: 1, gap: 5 },
  creationTitle: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  creationSubtitle: { fontSize: 12, lineHeight: 16 },
  // `HStack(spacing: 12)` with `.padding(12)` on a radius-16 card.
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16 },
  // `.font(.title2)` in a 36x40 frame.
  sectionIcon: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  sectionText: { flex: 1, gap: 2 },
  // `.font(.title3.bold())`
  sectionTitle: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  sectionDate: { fontSize: 12, lineHeight: 16 },
  sectionCount: { fontSize: 15, lineHeight: 20 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 30 },
  emptyTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', textAlign: 'center' },
  emptyBody: { fontSize: 15, lineHeight: 20, textAlign: 'center' },
  emptyAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginTop: 4 },
});
