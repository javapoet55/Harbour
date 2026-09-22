import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { useCoordinator } from '../../../../src/actions/coordinator';
import { GlassCard, Text } from '../../../../src/components';
import { KeyboardAwareScrollView } from '../../../../src/components/keyboard';
import { TodayActionsView } from '../../../../src/components/TodayActions';
import { FocusNextCard, ProtectedTimeCard } from '../../../../src/components/TodayNextAction';
import { FocusSessionStrip } from '../../../../src/components/FocusSessionStrip';
import { TodayAttentionRow } from '../../../../src/components/TodayAttentionRow';
import { TodayIntelligenceCard } from '../../../../src/components/TodayIntelligenceCard';
import { TodayQuickAccess } from '../../../../src/components/TodayQuickAccess';
import { TasksTopBar, TodayBackdrop } from '../../../../src/components/TodayShell';
import { overdueResults } from '../../../../src/lib/overdueTasks';
import { todayMoments, upcomingMomentCount } from '../../../../src/features/moments/domain';
import { useMomentList } from '../../../../src/features/moments/store';
import { shoppingSubtitle, showsAttentionRow } from '../../../../src/lib/todayQuickAccess';
import {
  buildSchedule,
  dateLabel,
  greeting,
  rangeTitle,
  scheduleCounts,
  TODAY_RANGES,
  type TodayRange,
} from '../../../../src/lib/todaySchedule';
import { buildActionQueue } from '../../../../src/lib/todayActionQueue';
import {
  invalidateNextAction,
  useDismissNextAction,
  useNextAction,
  useProtectedTime,
  useRespondToProtectedTime,
} from '../../../../src/query/useNextAction';
import { useQuickAccessShopping } from '../../../../src/query/useQuickAccess';
import { useTasks } from '../../../../src/query/useTasks';
import { canStartRecommendation, useAgenda, useScheduleIntelligence, useWeather } from '../../../../src/query/useToday';
import { useFocus } from '../../../../src/store/focus';
import { useSession } from '../../../../src/store/session';
import { brand, useTheme } from '../../../../src/theme';

/**
 * Port of `TodayView` (ios/App/RootView.swift:925), built from `body` at `:1032-1203` as of Phase 11
 * (commits d444b37, e0a7bcd, 86a2b49, 63d9542).
 *
 * Child view files followed: `TodayBackdrop` (`RootView.swift:1538`), `TodayTopBar` (`:1298`),
 * `TodayQuickAccess` (`ios/App/TodayQuickAccess.swift:4-97`), `TodayIntelligenceCard` (`:1373`),
 * `TodayScheduleRow` (`:1511`), `TodayActionsView` (`ios/App/TodayActionsView.swift:9`),
 * `TodayAttentionSheet` (`ios/App/TodayAttentionSheet.swift:4`), `DoNowView`
 * (`ios/App/DoNowView.swift:3`), `FocusSessionStrip` (`ios/App/FocusSessionStrip.swift:25`).
 *
 * Sections in `body` order:
 *   1. `TodayBackdrop()` — full, not subtle
 *   2. `TodayTopBar(name:temperature:add:account:)` (`:1041-1046`)
 *   3. the greeting and the date (`:1048-1058`)
 *   4. the `TodayRange` segmented row (`:1060-1076`)
 *   5. `TodayQuickAccess` (`:1078`) — replaced the Weekly Summary card and the Daily Briefing row
 *   6. `TodayIntelligenceCard` (`:1080-1096`), with the moment count
 *   7. `TodayActionsView` — Today only (`:1098-1100`)
 *   8. the protected-time proposal — Today only (`:1102-1113`)
 *   9. the "Focus next" card — Today only (`:1115-1144`)
 *  10. the "Needs attention" row — Today only, when anything needs attention (`:1146-1166`)
 *
 * Presented from here: Needs attention as a form sheet (`:1188-1191`), which replaced both the pushed
 * `attentionDetails` list and the inline "Needs your attention" section.
 */
export default function Today() {
  const theme = useTheme();
  const profile = useSession((state) => state.profile);

  const [range, setRange] = useState<TodayRange>(1);

  const tasks = useTasks();
  const agenda = useAgenda(5);
  const weather = useWeather();
  const intelligence = useScheduleIntelligence();
  // `ImportantMomentsStore` (activated and refreshed by the root layout, RootView.swift:59-81) and the
  // Quick Access `ShoppingStore` (TodayQuickAccess.swift:16-20).
  const moments = useMomentList();
  const shopping = useQuickAccessShopping(profile !== null);

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

  // `OverdueTasks.results(model.tasks, now: context.date)` and the other attention items
  // (RootView.swift:1146-1147). `context.date` is the minute timeline, so `queueNow`.
  const overdueCount = overdueResults(loadedTasks?.tasks ?? [], queueNow).length;
  const otherCount = attention.filter((item) => item.id !== 'overdue').length;

  // `range == .today ? moments.today.count : 0` (RootView.swift:1084).
  const momentCount = range === 1 ? todayMoments(moments, queueNow).length : 0;

  const refresh = () => {
    void tasks.refetch();
    void agenda.refetch();
    void weather.refetch();
    void intelligence.refetch();
  };

  return (
    <View style={styles.fill}>
      <TodayBackdrop />
      <KeyboardAwareScrollView
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

        {/* The range picker (RootView.swift:1047-1068). The track is
            `.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14))` with an indigo
            12% stroke (`:1059-1061`) — glass, not the opaque `surface` it used to fill with. */}
        <GlassCard radius={14} shadow={false} stroke={withAlpha(brand.nexdoIndigo, 0.12)}>
        <View style={styles.rangeRow}>
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
                // `Color(red: 0.18, green: 0.38, blue: 0.62)` when selected — #2E619E. Measured off
                // the Swift render, the selected cell is a rounded rect on ALL FOUR corners at the
                // track's own 14pt radius, filling its cell exactly; it is not a square segment
                // clipped by the container. Android will not clip a child to a parent's rounded
                // corners reliably, so the radius goes on the cell.
                style={[styles.rangeOption, selected && styles.rangeSelected]}
              >
                <Text style={[styles.rangeLabel, { color: selected ? '#FFFFFF' : withAlpha(theme.colors.ink, 0.82) }]}>
                  {rangeTitle(option)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        </GlassCard>

        {/* Section 5: Quick Access (RootView.swift:1078). "Weekly" pushes Weekly Summary; Moments and
            Shopping push their screens (TodayQuickAccess.swift:64-76). */}
        <TodayQuickAccess
          momentsSubtitle={`${upcomingMomentCount(moments, queueNow)} upcoming`}
          onMoments={() => router.push('/moments')}
          onShopping={() => router.push('/shopping')}
          onWeekly={() => router.push('/today/weekly-summary')}
          shoppingSubtitle={shoppingSubtitle(shopping.lists, shopping.failed)}
        />

        {/* `FocusSessionStrip` renders itself only while a session is live. */}
        <FocusSessionStrip />

        {/* Section 6 (RootView.swift:1080-1096). */}
        <TodayIntelligenceCard
          range={range}
          appointments={counts.appointments}
          taskCount={counts.tasks}
          momentCount={momentCount}
          attentionCount={attentionCount}
          schedule={schedule}
          searchSchedule={schedule}
          onOpenTask={(task) => router.push(`/task/${task.id}`)}
          onAttention={() => router.push('/attention')}
          onCalendar={() => router.push('/calendar')}
        />

        {/* Section 7: `TodayActionsView` (RootView.swift:1098-1100), Today only. Renders nothing when the
            queue is empty, which is what an account with no contact-shaped tasks sees. */}
        {range === 1 ? (
          <TodayActionsView
            now={queueNow}
            onOpen={(action, channel) => useCoordinator.getState().open(action.id, channel ?? action.preferredAction ?? null)}
            onTask={(taskId) => router.push(`/task/${taskId}`)}
            onViewAll={() => router.push('/action/queue')}
            queue={queue}
            timeZone={timeZone}
          />
        ) : null}

        {/* Section 8: the protected-time proposal (RootView.swift:1102-1113). Today only. */}
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

        {/* Section 9: "Focus next" (RootView.swift:1115-1144). Today only, with or without a suggestion. */}
        {range === 1 ? (
          <FocusNextCard
            best={recommendation ? bestAction : null}
            busy={focusBusy}
            canStart={recommendation ? canStartRecommendation(recommendation) : false}
            onDismiss={() => {
              // `dismissPersistentNext()`: `guard let id = persistentNext?.contextActionId else { return }`.
              const id = nextAction.data?.contextActionId;
              if (id) dismissNext.mutate({ contextActionId: id });
            }}
            onOtherOptions={() => router.push('/today/do-now')}
            onStart={() => {
              // `focusStartButton` (RootView.swift:1205-1215) → `startRecommendedFocus(_:)`.
              if (!bestAction) return;
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

        {/* Section 10: the attention row (RootView.swift:1146-1166), which opens Needs attention. */}
        {range === 1 && showsAttentionRow(overdueCount, otherCount) ? (
          <TodayAttentionRow onPress={() => router.push('/attention')} other={otherCount} overdue={overdueCount} />
        ) : null}
      </KeyboardAwareScrollView>
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
  rangeRow: { flexDirection: 'row', borderRadius: 14, overflow: 'hidden' },
  rangeOption: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  rangeSelected: { backgroundColor: '#2E619E', borderRadius: 14 },
  rangeLabel: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
});
