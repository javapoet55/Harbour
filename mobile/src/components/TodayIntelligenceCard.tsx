import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { NexdoTask } from '../api/types';
import { standardContains } from '../lib/taskQuery';
import { attentionDescription, commitmentCount as totalCommitments, commitmentHeadline, summaryLine } from '../lib/todayQuickAccess';
import type { TodayRange, TodayScheduleItem } from '../lib/todaySchedule';
import { brand, useTheme } from '../theme';
import { scheduleExpandLabel, visibleScheduleItems } from '../features/tasks/workingDays';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * Port of `TodayIntelligenceCard` (ios/App/RootView.swift:1373-1509) and `TodayScheduleRow`
 * (`:1511-1536`).
 *
 * Phase 13 (RootView.swift:1525-1640): a `VStack(spacing: 12)` of separate cards — the gradient summary
 * (shown only when `showsSummary`), the orange **Needs attention** card when anything is overdue or a
 * schedule check is open, and the schedule list on the grouped surface. The summary and the schedule
 * are each a 24pt card with the indigo 11% stroke. The "N things need attention" capsule and the
 * "Nothing needs attention" line are gone, and so is the separate attention row further down Today.
 *
 * Phase 11: the moment count joined the total and the summary line (d444b37, e0a7bcd), and the
 * "What should I do now?" button at the foot of the schedule was removed (63d9542) — the
 * "Focus next" card on Today replaced it.
 */
export function TodayIntelligenceCard({
  range,
  appointments,
  taskCount,
  momentCount = 0,
  overdueCount = 0,
  otherAttentionCount = 0,
  schedule,
  searchSchedule,
  showsSummary = true,
  onOpenTask,
  onAttention,
  onCalendar,
}: {
  range: TodayRange;
  appointments: number;
  taskCount: number;
  /** `range == .today ? moments.today.count : 0` (RootView.swift:1084). */
  momentCount?: number;
  /** `OverdueTasks.results(model.tasks, now:).count`, whatever the range. */
  overdueCount?: number;
  /** Today's schedule checks: `today.attention` other than `"overdue"`. */
  otherAttentionCount?: number;
  schedule: TodayScheduleItem[];
  /** The whole selected range, which search looks through rather than the visible three. */
  searchSchedule: TodayScheduleItem[];
  showsSummary?: boolean;
  onOpenTask: (task: NexdoTask) => void;
  onAttention: () => void;
  onCalendar: () => void;
}) {
  const theme = useTheme();
  const [showingSearch, setShowingSearch] = useState(false);
  const [searchText, setSearchText] = useState('');

  const searching = showingSearch && searchText.trim().length > 0;
  // `scheduleExpanded` (RootView.swift:1502), and `.onChange(of: range) { scheduleExpanded = false }`
  // (`:1645`): kept as the range it was expanded for, so picking another range folds it again.
  const [expandedRange, setExpandedRange] = useState<TodayRange | null>(null);
  const expanded = expandedRange === range;

  /**
   * `visibleSchedule` (RootView.swift:1507-1515, d568989): three rows, or all of them once expanded,
   * or every keyword match when searching.
   */
  const visibleSchedule = searching
    ? searchSchedule.filter((item) => {
        if (!item.task) return false;
        const keywords = searchText.split(/\s+/).filter(Boolean);
        return keywords.every(
          (word) => standardContains(item.task!.title, word) || standardContains(item.task!.notes ?? '', word),
        );
      })
    : visibleScheduleItems(schedule, false, expanded);
  const expandLabel = scheduleExpandLabel(schedule.length, searching, expanded);

  // `commitmentCount` (`:1403`): appointments + tasks + moments.
  const commitmentCount = totalCommitments(taskCount, appointments, momentCount);

  const cardBorder = { borderColor: withAlpha(brand.nexdoIndigo, 0.11) };
  // `.orange`, the system colour.
  const orange = theme.scheme === 'dark' ? '#FF9F0A' : '#FF9500';

  return (
    <View style={styles.stack} testID="today-intelligence">
      {showsSummary ? (
        <LinearGradient
          colors={[withAlpha(brand.nexdoBlue, 0.08), withAlpha(brand.nexdoMagenta, 0.09)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.card, styles.summary, cardBorder]}
          testID="today-summary-card"
        >
          <View style={styles.labelRow}>
            <TaskSymbol name="sparkles" size={15} color={theme.colors.link} />
            <Text style={[styles.eyebrow, { color: theme.colors.link }]}>
              {range === 1 ? 'Your day, in focus' : `Your next ${range} days`}
            </Text>
          </View>
          <Text accessibilityRole="header" style={[styles.headline, { color: theme.colors.ink }]} testID="today-commitments">
            {commitmentHeadline(commitmentCount, range === 1)}
          </Text>
          {/* `.lineLimit(1).minimumScaleFactor(0.7)` (e0a7bcd). `adjustsFontSizeToFit` is iOS-only (style
              map); on Android the line is one clipped line, which the 384dp phone does not reach. */}
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            numberOfLines={1}
            style={[styles.subheadline, { color: theme.colors.secondary }]}
            testID="today-summary-line"
          >
            {summaryLine(taskCount, appointments, momentCount)}
          </Text>
        </LinearGradient>
      ) : null}

      {/* `if showsSummary && (overdueCount + otherAttentionCount > 0)` (:1546-1567): every range, since
          Today always passes `showsSummary: true`. */}
      {showsSummary && overdueCount + otherAttentionCount > 0 ? (
        <Pressable
          accessibilityHint="Opens overdue tasks and schedule checks to complete or reschedule"
          accessibilityLabel={`Needs attention, ${attentionDescription(overdueCount, otherAttentionCount)}`}
          accessibilityRole="button"
          onPress={onAttention}
          // `.padding(16)`, `Color.orange.opacity(0.07)` in a radius-20 shape, stroked `orange.opacity(0.5)`.
          style={[styles.attention, { backgroundColor: withAlpha(orange, 0.07), borderColor: withAlpha(orange, 0.5) }]}
          testID="today-attention-summary"
        >
          {/* The triangle at `.title2` in a 48pt tile, `orange.opacity(0.12)`, radius 14. */}
          <View style={[styles.attentionTile, { backgroundColor: withAlpha(orange, 0.12) }]}>
            <TaskSymbol color={orange} name="exclamationmark.triangle.fill" size={22} />
          </View>
          <View style={styles.attentionLabels}>
            <Text style={[styles.heading, { color: theme.colors.ink }]}>Needs attention</Text>
            <Text style={[styles.subheadline, { color: theme.colors.secondary }]} testID="today-attention-subtitle">
              {attentionDescription(overdueCount, otherAttentionCount)}
            </Text>
          </View>
          <TaskSymbol color={theme.colors.secondary} name="chevron.right" size={17} />
        </Pressable>
      ) : null}

      <View style={[styles.card, styles.scheduleHalf, cardBorder, { backgroundColor: theme.colors.surface }]} testID="today-schedule-card">
        <View style={styles.scheduleHeader}>
          <Text style={[styles.heading, { color: theme.colors.ink }]}>
            {showsSummary ? 'On your schedule' : 'Later Today'}
          </Text>
          <View style={styles.grow} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showingSearch ? 'Close task search' : 'Search tasks'}
            accessibilityHint="Search tasks in the selected date range"
            onPress={() => {
              setShowingSearch((open) => !open);
              if (showingSearch) setSearchText('');
            }}
            testID="today-search-toggle"
            style={[styles.searchToggle, { backgroundColor: withAlpha(theme.colors.ink, 0.08) }]}
          >
            <TaskSymbol name="magnifyingglass" size={17} color={theme.colors.ink} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Open Calendar" onPress={onCalendar} testID="today-view-day" style={styles.viewDay}>
            <TaskSymbol name="chevron.down" size={12} color={theme.colors.link} />
            <Text style={[styles.caption, { color: theme.colors.link }]}>View day</Text>
          </Pressable>
        </View>

        {showingSearch ? (
          <View style={[styles.searchField, { backgroundColor: withAlpha(theme.colors.ink, 0.06) }]}>
            <TextInput
              accessibilityLabel="Search tasks by keywords"
              placeholder="Search tasks by keywords"
              placeholderTextColor={theme.colors.secondary}
              value={searchText}
              onChangeText={setSearchText}
              autoCorrect={false}
              returnKeyType="search"
              style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}
              testID="today-search-input"
            />
            {searchText.length > 0 ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear task search" onPress={() => setSearchText('')}>
                <TaskSymbol name="xmark.circle.fill" size={18} color={theme.colors.secondary} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {visibleSchedule.length === 0 ? (
          <View accessible style={styles.empty} testID="today-schedule-empty">
            <TaskSymbol name="calendar" size={22} color={theme.colors.link} />
            <Text style={[styles.heading, { color: theme.colors.ink }]}>
              {searching ? 'No matching tasks' : 'Your schedule is clear'}
            </Text>
            <Text style={[styles.subheadline, styles.centred, { color: theme.colors.secondary }]}>
              {searching ? 'Try different keywords or select a wider date range.' : 'Add a task or enjoy the open space.'}
            </Text>
          </View>
        ) : (
          <>
            {visibleSchedule.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} /> : null}
                <TodayScheduleRow item={item} onPress={() => (item.task ? onOpenTask(item.task) : onCalendar())} />
              </View>
            ))}
            {/* "View N more" / "Show less" expands the card in place (RootView.swift:1624-1633). */}
            {expandLabel ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={expandLabel}
                accessibilityHint={expanded ? 'Shows the first three schedule items' : 'Shows all schedule items here'}
                onPress={() => {
                  // `withAnimation(.easeInOut(duration: 0.2))`.
                  LayoutAnimation.configureNext(LayoutAnimation.create(200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
                  setExpandedRange(expanded ? null : range);
                }}
                style={styles.viewMore}
                testID="today-schedule-expand"
              >
                <Text style={[styles.subheadline, styles.semibold, { color: theme.colors.link }]}>{expandLabel}</Text>
              </Pressable>
            ) : null}
          </>
        )}

      </View>
    </View>
  );
}

/** `TodayScheduleRow` (RootView.swift:1507-1533). */
export function TodayScheduleRow({ item, onPress }: { item: TodayScheduleItem; onPress: () => void }) {
  const theme = useTheme();
  const critical = item.task?.priority === 'CRITICAL' || item.task?.critical === true;
  const isEvent = item.task === null;

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${item.timeLabel}, ${item.title}, ${item.detail}`}
      accessibilityHint={isEvent ? 'Opens Calendar' : 'Opens task details'}
      onPress={onPress}
      testID={`today-row-${item.id}`}
      style={styles.row}
    >
      <Text numberOfLines={2} style={[styles.rowTime, { color: theme.colors.scheduleBlue }]}>
        {item.timeLabel}
      </Text>
      <View style={[styles.rowIcon, { backgroundColor: withAlpha(isEvent ? brand.nexdoIndigo : '#34C759', 0.08) }]}>
        <TaskSymbol name={isEvent ? 'calendar' : 'checkmark.square.fill'} size={17} color={isEvent ? theme.colors.link : '#34C759'} />
      </View>
      <View style={styles.grow}>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: critical ? theme.colors.danger : theme.colors.ink }]}>
          {item.title}
        </Text>
        <Text style={[styles.rowDetail, { color: theme.colors.secondary }]}>{item.detail}</Text>
      </View>
      <TaskSymbol name="chevron.right" size={12} color={withAlpha(theme.colors.secondary, 0.45)} />
    </Pressable>
  );
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgba')) return color.replace(/[\d.]+\)$/, `${alpha})`);
  const hex = color.replace('#', '');
  const value = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
  const int = parseInt(value, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

const styles = StyleSheet.create({
  // `VStack(spacing: 12)`.
  stack: { gap: 12 },
  card: { borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  // `HStack(spacing: 14)`, `.padding(16)`, radius 20, a 1pt stroke.
  attention: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, borderWidth: 1 },
  attentionTile: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  // `VStack(alignment: .leading, spacing: 4)` and `Spacer(minLength: 4)`.
  attentionLabels: { flex: 1, gap: 4, marginRight: 4 },
  // `.padding(18)` with `VStack(alignment: .leading, spacing: 12)`.
  summary: { gap: 12, padding: 18 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eyebrow: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  // `.font(.system(.title, design: .rounded, weight: .bold))`
  headline: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  subheadline: { fontSize: 15, lineHeight: 20 },
  semibold: { fontWeight: '600' },
  scheduleHalf: { padding: 18 },
  scheduleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  grow: { flex: 1 },
  searchToggle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  viewDay: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, justifyContent: 'center' },
  caption: { fontSize: 12, lineHeight: 16 },
  searchField: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, marginBottom: 12 },
  empty: { alignItems: 'center', gap: 9, paddingVertical: 28 },
  centred: { textAlign: 'center' },
  divider: { height: StyleSheet.hairlineWidth, opacity: 0.55 },
  // `.padding(.vertical, 12)`
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowTime: { width: 64, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  rowIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  rowDetail: { fontSize: 11, lineHeight: 14 },
  viewMore: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
