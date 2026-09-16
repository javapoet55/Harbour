import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { NexdoTask } from '../api/types';
import { standardContains } from '../lib/taskQuery';
import type { TodayRange, TodayScheduleItem } from '../lib/todaySchedule';
import { brand, useTheme } from '../theme';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * Port of `TodayIntelligenceCard` (ios/App/RootView.swift:1358-1506) and `TodayScheduleRow`
 * (`:1507-1533`).
 *
 * Two stacked halves inside one 24pt rounded card: a gradient summary (shown only when
 * `showsSummary`) and a schedule list on the grouped surface.
 */
export function TodayIntelligenceCard({
  range,
  appointments,
  taskCount,
  attentionCount,
  schedule,
  searchSchedule,
  showsSummary = true,
  onOpenTask,
  onAttention,
  onAsk,
  onCalendar,
}: {
  range: TodayRange;
  appointments: number;
  taskCount: number;
  attentionCount: number;
  schedule: TodayScheduleItem[];
  /** The whole selected range, which search looks through rather than the visible seven. */
  searchSchedule: TodayScheduleItem[];
  showsSummary?: boolean;
  onOpenTask: (task: NexdoTask) => void;
  onAttention: () => void;
  onAsk: () => void;
  onCalendar: () => void;
}) {
  const theme = useTheme();
  const [showingSearch, setShowingSearch] = useState(false);
  const [searchText, setSearchText] = useState('');

  const searching = showingSearch && searchText.trim().length > 0;

  /** `visibleSchedule` (RootView.swift:1379-1386): seven rows, or every keyword match when searching. */
  const visibleSchedule = searching
    ? searchSchedule.filter((item) => {
        if (!item.task) return false;
        const keywords = searchText.split(/\s+/).filter(Boolean);
        return keywords.every(
          (word) => standardContains(item.task!.title, word) || standardContains(item.task!.notes ?? '', word),
        );
      })
    : schedule.slice(0, 7);

  const commitmentCount = appointments + taskCount;

  return (
    <View style={[styles.card, { borderColor: withAlpha(brand.nexdoIndigo, 0.11) }]} testID="today-intelligence">
      {showsSummary ? (
        <LinearGradient
          colors={[withAlpha(brand.nexdoBlue, 0.08), withAlpha(brand.nexdoMagenta, 0.09)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.summary}
        >
          <View style={styles.labelRow}>
            <TaskSymbol name="sparkles" size={15} color={theme.colors.tint} />
            <Text style={[styles.eyebrow, { color: theme.colors.tint }]}>
              {range === 1 ? 'Your day, in focus' : `Your next ${range} days`}
            </Text>
          </View>
          <Text accessibilityRole="header" style={[styles.headline, { color: theme.colors.ink }]} testID="today-commitments">
            {`${commitmentCount} commitment${commitmentCount === 1 ? '' : 's'} ${range === 1 ? 'today' : 'ahead'}`}
          </Text>
          <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>
            {`${taskCount} Task${taskCount === 1 ? '' : 's'} · ${appointments} Appointment${appointments === 1 ? '' : 's'}`}
          </Text>
          {attentionCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Shows the items that need your attention"
              onPress={onAttention}
              testID="today-attention-chip"
              style={[styles.attentionChip, { backgroundColor: '#FFE0D1' }]}
            >
              <TaskSymbol name="exclamationmark.circle" size={13} color="#A82E1F" />
              <Text style={[styles.chipLabel, { color: '#A82E1F' }]}>
                {`${attentionCount} thing${attentionCount === 1 ? ' needs' : 's need'} attention`}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.labelRow}>
              <TaskSymbol name="checkmark.circle.fill" size={13} color="#34C759" />
              <Text style={[styles.chipLabel, { color: '#34C759' }]}>Nothing needs attention</Text>
            </View>
          )}
        </LinearGradient>
      ) : null}

      <View style={[styles.scheduleHalf, { backgroundColor: theme.colors.surface }]}>
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
            <TaskSymbol name="chevron.down" size={12} color={theme.colors.tint} />
            <Text style={[styles.caption, { color: theme.colors.tint }]}>View day</Text>
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
            <TaskSymbol name="calendar" size={22} color={theme.colors.tint} />
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
            {!searching && schedule.length > 7 ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`View ${schedule.length - 7} more`} onPress={onCalendar} style={styles.viewMore} testID="today-view-more">
                <Text style={[styles.subheadline, styles.semibold, { color: theme.colors.tint }]}>
                  {`View ${schedule.length - 7} more`}
                </Text>
              </Pressable>
            ) : null}
          </>
        )}

        {/* The "What should I do now?" entry (RootView.swift:1481-1494). */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="What should I do now?"
          onPress={onAsk}
          testID="today-do-now"
          style={[styles.askCard, { backgroundColor: withAlpha(brand.nexdoBlue, 0.07), borderColor: withAlpha(brand.nexdoBlue, 0.16) }]}
        >
          <View style={styles.labelRow}>
            <TaskSymbol name="sparkles" size={15} color={theme.colors.tint} />
            <Text style={[styles.eyebrow, { color: theme.colors.tint }]}>What should I do now?</Text>
          </View>
          <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>
            Find the best task for the time you have, and start focusing.
          </Text>
        </Pressable>
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
        <TaskSymbol name={isEvent ? 'calendar' : 'checkmark.square.fill'} size={17} color={isEvent ? theme.colors.tint : '#34C759'} />
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
  card: { borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  // `.padding(18)` with `VStack(alignment: .leading, spacing: 12)`.
  summary: { gap: 12, padding: 18 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eyebrow: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  // `.font(.system(.title, design: .rounded, weight: .bold))`
  headline: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  subheadline: { fontSize: 15, lineHeight: 20 },
  semibold: { fontWeight: '600' },
  attentionChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, alignSelf: 'flex-start' },
  chipLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
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
  viewMore: { minHeight: 44, justifyContent: 'center', paddingTop: 12 },
  askCard: { gap: 8, padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, marginTop: 16 },
});
