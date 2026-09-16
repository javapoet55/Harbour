import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { TaskSymbol, Text } from '../../src/components';
import { DevMenu } from '../../src/components/DevMenu';
import { FocusSessionStrip } from '../../src/components/FocusSessionStrip';
import { AttentionCard } from '../../src/components/AttentionCard';
import { TodayIntelligenceCard } from '../../src/components/TodayIntelligenceCard';
import { TasksTopBar, TodayBackdrop } from '../../src/components/TodayShell';
import {
  buildSchedule,
  dateLabel,
  greeting,
  rangeTitle,
  scheduleCounts,
  TODAY_RANGES,
  type TodayRange,
} from '../../src/lib/todaySchedule';
import { useTasks } from '../../src/query/useTasks';
import { useAgenda, useScheduleIntelligence, useWeather } from '../../src/query/useToday';
import { useSession } from '../../src/store/session';
import { brand, useTheme } from '../../src/theme';

/**
 * Port of `TodayView` (ios/App/RootView.swift), built from `body` at `:1017-1198`.
 *
 * Child view files followed: `TodayBackdrop` (`RootView.swift:1534`), `TodayTopBar` (`:1283`),
 * `TodayIntelligenceCard` (`:1358`), `TodayScheduleRow` (`:1507`), `DoNowView`
 * (`ios/App/DoNowView.swift:3`), `FocusSessionStrip` (`ios/App/FocusSessionStrip.swift:25`).
 *
 * Sections in `body` order:
 *   1. `TodayBackdrop()` — full, not subtle
 *   2. `TodayTopBar(name:temperature:add:account:)`
 *   3. the greeting and the date
 *   4. the `TodayRange` segmented row
 *   5. the Weekly Summary card, or the Daily Briefing row when the queue has immediate actions
 *   6. `TodayActionsView` — Today only  [RUN B]
 *   7. the protected-time proposal — Today only  [RUN B]
 *   8. the "What should I do now?" recommendation card — Today only  [RUN B]
 *   9. `TodayIntelligenceCard`
 *  10. the "Needs your attention" list — Today only  [RUN B]
 *
 * RUN A SCOPE: sections 6-8 and 10 all hang off state this run does not build yet —
 * `TaskActionCoordinator` (Phase 8), `model.protectedTime` and `model.persistentNext`
 * (`/api/protected-time` and the next-action service), and `scheduleIntelligence.attention`. They are
 * Run B, and are marked below so the order is preserved when they land.
 */
export default function Today() {
  const theme = useTheme();
  const profile = useSession((state) => state.profile);

  const [range, setRange] = useState<TodayRange>(1);

  const tasks = useTasks();
  const agenda = useAgenda(5);
  const weather = useWeather();
  const intelligence = useScheduleIntelligence();

  const loadedAgenda = agenda.data;
  const loadedTasks = tasks.data;
  const timeZone =
    loadedAgenda?.timeZone ?? profile?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  // `schedule` (RootView.swift:942) — the intelligence timeline is Run B, so this is the agenda build.
  const schedule = useMemo(
    () => buildSchedule({ agenda: loadedAgenda, tasks: loadedTasks?.tasks ?? [], intelligence: intelligence.data, range }),
    [loadedAgenda, loadedTasks, intelligence.data, range],
  );
  const counts = scheduleCounts(schedule);
  // `range == .today ? (intelligence?.attention.count ?? agenda?.overdue.count ?? 0) : agenda?.overdue.count`
  const attention = intelligence.data?.today.attention ?? [];
  const attentionCount =
    range === 1 ? (intelligence.data ? attention.length : (loadedAgenda?.overdue.length ?? 0)) : (loadedAgenda?.overdue.length ?? 0);

  const refresh = () => {
    void tasks.refetch();
    void agenda.refetch();
    void weather.refetch();
    void intelligence.refetch();
  };

  return (
    <View style={styles.fill}>
      <TodayBackdrop />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={agenda.isRefetching} onRefresh={refresh} />}
      >
        <TasksTopBar
          name={profile?.name ?? ''}
          weather={{
            // `model.weather.map { Int($0.current.temperature.rounded()) }` (RootView.swift:1029)
            temperature: weather.data ? Math.round(weather.data.current.temperature_2m) : null,
            weatherCode: weather.data?.current.weather_code,
            onPress: () => router.push('/today/weather'),
          }}
          onAdd={() => router.push('/task/new')}
          // TODO(phase7): Swift opens `AccountView()` here (RootView.swift:1031).
          onAccount={() => undefined}
        />

        {/* The greeting block (RootView.swift:1034-1045) */}
        <View style={styles.greeting}>
          <Text numberOfLines={1} style={[styles.greetingLine, { color: theme.colors.ink }]} testID="today-greeting">
            {`${greeting(timeZone)}, ${firstName(profile?.name ?? '')}`}
          </Text>
          <Text style={[theme.typography.body, { color: theme.colors.secondary }]} testID="today-date">
            {dateLabel(timeZone)}
          </Text>
        </View>

        {/* The range picker (RootView.swift:1047-1068) */}
        <View style={[styles.rangeRow, { borderColor: withAlpha(brand.nexdoIndigo, 0.12), backgroundColor: theme.colors.surface }]}>
          {TODAY_RANGES.map((option) => {
            const selected = range === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityLabel={`Show ${rangeTitle(option)}`}
                accessibilityState={{ selected }}
                onPress={() => setRange(option)}
                testID={`today-range-${option}`}
                // `Color(red: 0.18, green: 0.38, blue: 0.62)` when selected.
                style={[styles.rangeOption, selected && { backgroundColor: '#2E6199' }]}
              >
                <Text style={[styles.rangeLabel, { color: selected ? '#FFFFFF' : withAlpha(theme.colors.ink, 0.82) }]}>
                  {rangeTitle(option)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/*
          The Weekly Summary card (RootView.swift:1070-1089). Swift shows a compact Daily Briefing row
          instead when the action queue has immediate actions; the queue is Run B, so this is the
          `else` branch, which is what an account with no due contact actions sees.
          TODO(phase4b): add the `queue.hasImmediateActions` branch.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens your weekly progress report"
          onPress={() => router.push('/today/weekly-summary')}
          testID="today-weekly-summary"
          style={[styles.summaryCard, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.12) }]}
        >
          <View style={[styles.summaryIcon, { backgroundColor: brand.nexdoIndigo }]}>
            <TaskSymbol name="chart.bar.xaxis" size={20} color="#FFFFFF" />
          </View>
          <View style={styles.grow}>
            <Text style={[styles.summaryTitle, { color: theme.colors.ink }]}>Weekly Summary</Text>
            <Text style={[styles.caption, { color: theme.colors.secondary }]}>
              Review progress, focus time, and accomplishments
            </Text>
          </View>
          <TaskSymbol name="chevron.right" size={15} color={theme.colors.secondary} />
        </Pressable>

        {/* `FocusSessionStrip` renders itself only while a session is live. */}
        <FocusSessionStrip />

        {/* TODO(phase4b): sections 6-8 of `body` — TodayActionsView, the protected-time proposal and
            the persistent next-action card — all sit here, before the intelligence card. */}

        <TodayIntelligenceCard
          range={range}
          appointments={counts.appointments}
          taskCount={counts.tasks}
          attentionCount={attentionCount}
          schedule={schedule}
          searchSchedule={schedule}
          onOpenTask={(task) => router.push(`/task/${task.id}`)}
          onAttention={() => router.push('/today/attention')}
          onAsk={() => router.push('/today/do-now')}
          onCalendar={() => router.push('/calendar')}
        />

        {/* Section 10 of `body`: the "Needs your attention" list (RootView.swift:1145-1166). Today only. */}
        {range === 1 && attention.length > 0 ? (
          <View style={[styles.attentionCard, { backgroundColor: theme.colors.surface, borderColor: withAlpha(theme.colors.separator, 0.3) }]}>
            <View style={styles.attentionHeader}>
              <TaskSymbol name="exclamationmark.triangle.fill" size={17} color={theme.colors.danger} />
              <Text style={[styles.attentionTitle, { color: theme.colors.danger }]}>Needs your attention</Text>
            </View>
            {[...attention]
              .sort((left, right) => (left.id === 'overdue' ? -1 : right.id === 'overdue' ? 1 : 0))
              .map((item) => (
                <AttentionCard
                  key={item.id}
                  item={item}
                  opensTasks={item.id === 'overdue' || (item.taskIds?.length ?? 0) > 0}
                  onPress={
                    item.id === 'overdue'
                      ? () => router.push('/today/overdue')
                      : () => router.push({ pathname: '/today/schedule-check', params: { id: item.id } })
                  }
                  testID={`today-attention-${item.id}`}
                />
              ))}
          </View>
        ) : null}

        {/* Not part of `body`: development-only, and renders nothing in a release build. */}
        <DevMenu showsSignOut />
      </ScrollView>
    </View>
  );
}

/** `ProfileName.firstName(from:) ?? "there"` (RootView.swift:1036). */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'there';
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgba')) return color.replace(/[\d.]+\)$/, `${alpha})`);
  const hex = color.replace('#', '');
  const value = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
  const int = parseInt(value, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // `.padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 32)` with `LazyVStack(spacing: 16)`.
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 16 },
  greeting: { gap: 3 },
  // `.font(.system(.title, design: .rounded, weight: .bold))`
  greetingLine: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  rangeRow: { flexDirection: 'row', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  rangeOption: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  rangeLabel: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  summaryIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16 },
  grow: { flex: 1 },
  // `.padding(18)`, corner radius 24 (RootView.swift:1163-1165).
  attentionCard: { gap: 12, padding: 18, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth },
  attentionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attentionTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
});
