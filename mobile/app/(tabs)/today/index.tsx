import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { useCoordinator } from '../../../src/actions/coordinator';
import { GlassCard, TaskSymbol, Text } from '../../../src/components';
import { TodayActionsView } from '../../../src/components/TodayActions';
import { PersistentNextCard, ProtectedTimeCard } from '../../../src/components/TodayNextAction';
import { FocusSessionStrip } from '../../../src/components/FocusSessionStrip';
import { AttentionCard } from '../../../src/components/AttentionCard';
import { TodayIntelligenceCard } from '../../../src/components/TodayIntelligenceCard';
import { NEXDO_GRADIENT, TasksTopBar, TodayBackdrop } from '../../../src/components/TodayShell';
import {
  buildSchedule,
  dateLabel,
  greeting,
  rangeTitle,
  scheduleCounts,
  TODAY_RANGES,
  type TodayRange,
} from '../../../src/lib/todaySchedule';
import { buildActionQueue } from '../../../src/lib/todayActionQueue';
import {
  invalidateNextAction,
  useDismissNextAction,
  useNextAction,
  useProtectedTime,
  useRespondToProtectedTime,
} from '../../../src/query/useNextAction';
import { useTasks } from '../../../src/query/useTasks';
import { canStartRecommendation, useAgenda, useScheduleIntelligence, useWeather } from '../../../src/query/useToday';
import { useFocus } from '../../../src/store/focus';
import { useSession } from '../../../src/store/session';
import { brand, useTheme } from '../../../src/theme';

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

  // `TodayActionQueue(actions:tasks:now:timeZone:)` (RootView.swift:1137). Swift rebuilds it inside a
  // `TimelineView(.periodic(by: 60))`, so the relative labels tick over once a minute.
  const actions = useCoordinator((state) => state.actions);
  const [queueNow, setQueueNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setQueueNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

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

  // Sections 7 and 8 (RootView.swift:1095-1126), both `range == .today` only.
  const queryClient = useQueryClient();
  const startFocus = useFocus((state) => state.startFocus);
  const focusBusy = useFocus((state) => state.busy);
  const nextAction = useNextAction(range === 1 && profile !== null);
  const protectedTime = useProtectedTime(range === 1 && profile !== null);
  const respond = useRespondToProtectedTime();
  const dismissNext = useDismissNextAction();
  const recommendation = nextAction.data?.recommendation ?? null;
  const bestAction = recommendation?.nextAction?.bestAction ?? null;
  const queue = useMemo(
    () => buildActionQueue({ actions, tasks: loadedTasks?.tasks ?? [], now: queueNow, timeZone }),
    [actions, loadedTasks, queueNow, timeZone],
  );
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
          // `.sheet(isPresented: $showingAccount) { AccountView() }` (RootView.swift:1181).
          onAccount={() => router.push('/account')}
          photo={profile?.photo}
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
          The Weekly Summary card (RootView.swift:1070-1089), and the compact **Daily Briefing** row
          Swift shows INSTEAD when the action queue has immediate actions (`:1063-1070`).
        */}
        {queue.hasImmediateActions ? (
          <View style={[styles.briefingRow, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.12) }]}>
            <Pressable
              accessibilityLabel="Daily Briefing"
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/ask', params: { prompt: DAILY_BRIEFING_PROMPT } })}
              style={styles.briefingButton}
              testID="today-daily-briefing"
            >
              <TaskSymbol name="chart.bar.xaxis" size={17} color={theme.colors.tint} />
              <Text style={[styles.summaryTitle, { color: theme.colors.tint }]}>Daily Briefing</Text>
            </Pressable>
            <View style={styles.grow} />
            <Pressable
              accessibilityLabel="Weekly Summary"
              accessibilityRole="button"
              onPress={() => router.push('/today/weekly-summary')}
              testID="today-weekly-summary-compact"
            >
              <Text style={[styles.caption, { color: theme.colors.tint }]}>Weekly Summary</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Opens your weekly progress report"
            onPress={() => router.push('/today/weekly-summary')}
            testID="today-weekly-summary"
          >
            {/* `.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20))` with an
                indigo 12% stroke and no shadow (RootView.swift:1084-1085). An opaque `surface` fill
                reads as flat white against the lavender backdrop; measured, Swift's card sits at
                (238, 237, 240) with the backdrop showing through. */}
            <GlassCard radius={20} shadow={false} stroke={withAlpha(brand.nexdoIndigo, 0.12)}>
              <View style={styles.summaryCard}>
                {/* `.background(NexdoTheme.gradient, in: RoundedRectangle(cornerRadius: 14))`
                    (RootView.swift:1076) — the brand gradient, not a flat indigo fill. */}
                <LinearGradient
                  colors={[...NEXDO_GRADIENT]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.summaryIcon}
                >
                  <TaskSymbol name="chart.bar.xaxis" size={20} color="#FFFFFF" />
                </LinearGradient>
                <View style={styles.grow}>
                  <Text style={[styles.summaryTitle, { color: theme.colors.ink }]}>Weekly Summary</Text>
                  <Text style={[styles.caption, { color: theme.colors.secondary }]}>
                    Review progress, focus time, and accomplishments
                  </Text>
                </View>
                <TaskSymbol name="chevron.right" size={15} color={theme.colors.secondary} />
              </View>
            </GlassCard>
          </Pressable>
        )}

        {/* `FocusSessionStrip` renders itself only while a session is live. */}
        <FocusSessionStrip />

        {/* Section 6: `TodayActionsView` (RootView.swift:1136-1143). Renders nothing when the queue is
            empty, which is what an account with no contact-shaped tasks sees. */}
        <TodayActionsView
          now={queueNow}
          onOpen={(action, channel) => useCoordinator.getState().open(action.id, channel ?? action.preferredAction ?? null)}
          onTask={(taskId) => router.push(`/task/${taskId}`)}
          onViewAll={() => router.push('/action/queue')}
          queue={queue}
          timeZone={timeZone}
        />

        {/* Section 7: the protected-time proposal (RootView.swift:1095-1106). Today only. */}
        {range === 1 && protectedTime.data ? (
          <ProtectedTimeCard
            busy={respond.isPending}
            onRespond={(accept) => {
              const proposal = protectedTime.data;
              if (!proposal) return;
              respond.mutate(
                { proposal, accept },
                {
                  // `if !receipt.warnings.isEmpty { error = … }` and the catch (NexdoApp.swift:57-59).
                  onSuccess: (warning) => {
                    if (warning !== null) Alert.alert('Unable to complete request', warning);
                  },
                  onError: (cause) => Alert.alert('Unable to complete request', cause.message),
                },
              );
            }}
            proposal={protectedTime.data}
            timeZone={timeZone}
          />
        ) : null}

        {/* Section 8: the persistent next-action card (RootView.swift:1108-1126). Today only. */}
        {range === 1 && bestAction && recommendation ? (
          <PersistentNextCard
            availableWindowMinutes={recommendation.nextAction?.availableWindowMinutes ?? 0}
            best={bestAction}
            busy={focusBusy}
            canStart={canStartRecommendation(recommendation)}
            onDismiss={() => {
              const id = nextAction.data?.contextActionId;
              if (id) dismissNext.mutate({ contextActionId: id });
            }}
            onOtherOptions={() => router.push('/today/do-now')}
            onStart={() => {
              // `startRecommendedFocus(_:)` (NexdoApp.swift:611-616).
              const task = loadedTasks?.tasks.find((item) => item.id === bestAction.taskId);
              if (!task) {
                Alert.alert('Unable to complete request', 'Your tasks changed. Refresh Tasks and try again.');
                return;
              }
              void startFocus(task, bestAction.focusMinutes, true)
                .catch((cause: unknown) => Alert.alert('Unable to complete request', cause instanceof Error ? cause.message : 'Please try again.'))
                .finally(() => invalidateNextAction(queryClient));
            }}
          />
        ) : null}

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

/** `onPlanWeek(…)` on the Daily Briefing button (RootView.swift:1065). */
const DAILY_BRIEFING_PROMPT =
  "Give me today's daily briefing, prioritizing my due contact actions and upcoming calendar commitments.";

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
  // The compact Daily Briefing row (RootView.swift:1063-1070): `.padding(16)`, corner radius 20.
  briefingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  briefingButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  summaryIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16 },
  grow: { flex: 1 },
  // `.padding(18)`, corner radius 24 (RootView.swift:1163-1165).
  attentionCard: { gap: 12, padding: 18, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth },
  attentionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attentionTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
});
