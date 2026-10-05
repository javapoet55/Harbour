import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { withAlpha } from '../../components/SignInBackdrop';
import { Text } from '../../components/Text';
import { MenuPicker, PopoverMenu, usePopoverMenu } from '../moments/form';
import { pomodoroAnalytics, POMODORO_PERIOD_TITLES, POMODORO_PERIODS, type PomodoroAnalytics, type PomodoroPeriod } from './analytics';
import { CategoryDonut, FocusChart } from './charts';
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  changeLine,
  dashboardTime,
  dayTitle,
  focusRateLabel,
  METRICS_DEFINITION,
  sessionStatus,
  sharePercent,
  shortTime,
  startedLabel,
} from './format';
import { isActive, POMODORO_CATEGORY_TITLES, type PomodoroSession } from './model';
import { currentSession, type PomodoroState } from './store';
import { focusedSeconds, restedSeconds } from './analytics';

/**
 * `PomodoroDashboard` (ios/App/PomodoroDashboard.swift): Overview, Sessions and Insights over the part 1
 * analytics (weeks Monday to Sunday). `.preferredColorScheme(.light)` — always light. Recomputed every
 * 30 seconds, as Swift's `TimelineView(.periodic(by: 30))`.
 */

export type DashboardTab = 'Overview' | 'Sessions' | 'Insights';
const TABS: DashboardTab[] = ['Overview', 'Sessions', 'Insights'];

const INK = '#0D0A40'; // Color(red: 0.05, green: 0.04, blue: 0.25)
const INDIGO = '#5856D6';
const SECONDARY = 'rgba(60, 60, 67, 0.6)';
const GRADIENT = ['#AF52DE', INDIGO, '#007AFF'] as const;

export type DashboardProps = {
  state: Pick<PomodoroState, 'sessions' | 'currentID' | 'loadingHistory' | 'syncMessage'>;
  restore: () => Promise<void>;
  initialTab?: DashboardTab;
  onClose: () => void;
  onStart: () => void;
  zone?: string;
  now?: () => number;
};

function useClock(now: () => number, every: number): number {
  const [at, setAt] = useState(now);
  useEffect(() => {
    const timer = setInterval(() => setAt(now()), every);
    return () => clearInterval(timer);
  }, [now, every]);
  return at;
}

export function PomodoroDashboard({ state, restore, initialTab = 'Overview', onClose, onStart, zone = Intl.DateTimeFormat().resolvedOptions().timeZone, now = Date.now }: DashboardProps) {
  const insets = useSafeAreaInsets();
  const at = useClock(now, 30_000);
  const [tab, setTab] = useState<DashboardTab>(initialTab);
  const [period, setPeriodState] = useState<PomodoroPeriod>('today');
  const [trendPeriod, setTrendPeriodState] = useState<PomodoroPeriod>('week');
  const [picked, setPicked] = useState<number | null>(null);
  // `.onChange(of: period / trendPeriod) { selectedDate = nil }`
  const setPeriod = (next: PomodoroPeriod) => {
    setPeriodState(next);
    setPicked(null);
  };
  const setTrendPeriod = (next: PomodoroPeriod) => {
    setTrendPeriodState(next);
    setPicked(null);
  };
  const [selectedSession, setSelectedSession] = useState<PomodoroSession | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const menuAnchor = useRef<View>(null);
  const menu = usePopoverMenu(menuAnchor);

  const stats = useMemo(() => pomodoroAnalytics({ sessions: state.sessions, period, now: at, timeZone: zone }), [state.sessions, period, at, zone]);
  const all = useMemo(() => pomodoroAnalytics({ sessions: state.sessions, period: 'all', now: at, timeZone: zone }), [state.sessions, at, zone]);
  const trend = useMemo(() => pomodoroAnalytics({ sessions: state.sessions, period: trendPeriod, now: at, timeZone: zone }), [state.sessions, trendPeriod, at, zone]);
  const current = currentSession(state);
  const running = current !== undefined && isActive(current);

  const definitions = () => Alert.alert('Your focus metrics', METRICS_DEFINITION, [{ text: 'Got it', style: 'cancel' }]);
  const refresh = async () => {
    setRefreshing(true);
    await restore();
    setRefreshing(false);
  };

  const startButton = (
    <Pressable accessibilityRole="button" onPress={onStart} testID="pomodoro-dashboard-start">
      <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.primary}>
        <Ionicons color="#FFFFFF" name={running ? 'timer' : 'play'} size={17} />
        <Text style={styles.primaryText}>{running ? 'Return to Timer' : 'Start Focus Session'}</Text>
      </LinearGradient>
    </Pressable>
  );

  return (
    <View style={styles.fill} testID="pomodoro-dashboard">
      <LinearGradient colors={[withAlpha('#AF52DE', 0.04), '#FFFFFF', withAlpha('#007AFF', 0.05)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: 16 + insets.top, paddingBottom: 16 + insets.bottom }]}
        refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor={INDIGO} colors={[INDIGO]} />}
      >
        {/* `header` (:72-81) */}
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={tab === 'Overview' ? 'Close dashboard' : 'Back to overview'}
            accessibilityRole="button"
            onPress={() => (tab === 'Overview' ? onClose() : setTab('Overview'))}
            style={[styles.circleButton, { backgroundColor: withAlpha(INDIGO, 0.06) }]}
            testID="pomodoro-dashboard-back"
          >
            <Ionicons color={INDIGO} name="chevron-back" size={20} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.title2}>
            {tab === 'Overview' ? 'Pomodoro' : tab}
          </Text>
          <View collapsable={false} ref={menuAnchor}>
            <Pressable accessibilityLabel="Dashboard options" accessibilityRole="button" onPress={menu.open} style={[styles.circleButton, { backgroundColor: withAlpha(INDIGO, 0.06) }]} testID="pomodoro-dashboard-menu">
              <Ionicons color={INDIGO} name="ellipsis-horizontal" size={20} />
            </Pressable>
          </View>
        </View>
        <PopoverMenu
          items={[
            { key: 'refresh', title: 'Refresh', onPress: () => void restore(), testID: 'pomodoro-menu-refresh' },
            { key: 'about', title: 'About these metrics', onPress: definitions, testID: 'pomodoro-menu-about' },
          ]}
          menu={menu}
          testID="pomodoro-dashboard-options"
        />

        {/* `tabs` (:82-91): "Insights" reads "Categories" while it is selected. */}
        <View style={styles.tabs}>
          {TABS.map((item) => {
            const on = tab === item;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                key={item}
                onPress={() => {
                  setTab(item);
                  setPicked(null);
                }}
                style={styles.grow}
                testID={`pomodoro-tab-${item.toLowerCase()}`}
              >
                {on ? (
                  <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.tab}>
                    <Text style={[styles.tabText, { color: '#FFFFFF' }]}>{item === 'Insights' ? 'Categories' : item}</Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.tab, { backgroundColor: withAlpha(INDIGO, 0.04) }]}>
                    <Text style={[styles.tabText, { color: INK }]}>{item}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {state.loadingHistory ? (
          <View style={styles.loading}>
            <ActivityIndicator color={INDIGO} />
            <Text style={styles.caption}>Updating sessions…</Text>
          </View>
        ) : null}
        {state.syncMessage ? <Text style={[styles.caption, { color: SECONDARY }]}>{state.syncMessage}</Text> : null}

        {tab === 'Overview' ? (
          <>
            <PeriodPicker period={period} onChange={setPeriod} />
            <Overview stats={stats} zone={zone} picked={picked} onPick={setPicked} />
            {startButton}
          </>
        ) : null}
        {tab === 'Sessions' ? <SessionHistory stats={all} now={at} zone={zone} onSelect={setSelectedSession} startButton={startButton} /> : null}
        {tab === 'Insights' ? (
          <>
            <CategoryCard stats={trend} title={POMODORO_PERIOD_TITLES[trendPeriod]} />
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={[styles.headline, styles.grow]}>Focus Trend</Text>
                <MenuPicker
                  hideLabel
                  label="Trend period"
                  onChange={setTrendPeriod}
                  options={POMODORO_PERIODS.map((value) => ({ value, title: POMODORO_PERIOD_TITLES[value] }))}
                  testID="pomodoro-trend-period"
                  value={trendPeriod}
                />
              </View>
              <FocusChart breaks={false} buckets={trend.buckets} onPick={setPicked} period={trend.period} picked={picked} testID="pomodoro-trend-chart" zone={zone} />
            </View>
          </>
        ) : null}
      </ScrollView>

      <SessionDetail
        current={current}
        onClose={() => setSelectedSession(null)}
        onReturn={() => {
          setSelectedSession(null);
          onStart();
        }}
        session={selectedSession}
        zone={zone}
        now={at}
      />
    </View>
  );
}

/** `periodPicker` (:92-100). */
function PeriodPicker({ period, onChange }: { period: PomodoroPeriod; onChange: (next: PomodoroPeriod) => void }) {
  return (
    <View style={styles.periods}>
      {POMODORO_PERIODS.map((item) => {
        const on = period === item;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            key={item}
            onPress={() => onChange(item)}
            style={[styles.period, { backgroundColor: on ? INDIGO : withAlpha(INDIGO, 0.05) }]}
            testID={`pomodoro-period-${item}`}
          >
            <Text style={[styles.periodText, { color: on ? '#FFFFFF' : INK }]}>{POMODORO_PERIOD_TITLES[item]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** `overview(_:)` (:101-118) and `metric(_:value:label:color:)` (:111-118). */
function Overview({ stats, zone, picked, onPick }: { stats: PomodoroAnalytics; zone: string; picked: number | null; onPick: (index: number) => void }) {
  const change = changeLine(stats.period, stats.changePercent, stats.focusSeconds);
  return (
    <View style={styles.stack16}>
      <View style={styles.card}>
        <View style={styles.focusHeader}>
          <View style={[styles.focusIcon, { backgroundColor: withAlpha(INDIGO, 0.08) }]}>
            <Ionicons color={INDIGO} name="stopwatch" size={22} />
          </View>
          <View style={styles.grow}>
            <Text style={styles.subheadline}>Focus Time</Text>
            <Text style={styles.title1} testID="pomodoro-focus-total">
              {dashboardTime(stats.focusSeconds)}
            </Text>
            {change ? (
              change.up === null ? (
                <Text style={[styles.caption, { color: SECONDARY }]}>{change.text}</Text>
              ) : (
                <View style={styles.changeRow}>
                  <Ionicons color={change.up ? '#34C759' : '#FF9500'} name={change.up ? 'arrow-up' : 'arrow-down'} size={12} />
                  <Text style={[styles.caption, { color: change.up ? '#34C759' : '#FF9500' }]} testID="pomodoro-change">
                    {change.text}
                  </Text>
                </View>
              )
            ) : null}
          </View>
        </View>
        <FocusChart breaks buckets={stats.buckets} onPick={onPick} period={stats.period} picked={picked} testID="pomodoro-overview-chart" zone={zone} />
      </View>
      <View style={styles.metrics}>
        <Metric color="#FF2D55" icon="timer" label="Sessions" testID="pomodoro-metric-sessions" value={String(stats.sessions.length)} />
        <Metric color="#FF9500" icon="cafe" label="Break Time" testID="pomodoro-metric-break" value={dashboardTime(stats.breakSeconds)} />
        <Metric color="#34C759" icon="trophy" label="Focus Rate" testID="pomodoro-metric-rate" value={focusRateLabel(stats.focusRate)} />
      </View>
      {stats.sessions.length === 0 ? <Text style={[styles.subheadline, styles.centered, { color: SECONDARY }]}>No sessions in this period yet.</Text> : null}
    </View>
  );
}

function Metric({ icon, value, label, color, testID }: { icon: 'timer' | 'cafe' | 'trophy'; value: string; label: string; color: string; testID: string }) {
  return (
    <View style={[styles.metric, { backgroundColor: withAlpha(color, 0.04) }]} testID={testID}>
      <View style={[styles.metricIcon, { backgroundColor: withAlpha(color, 0.09) }]}>
        <Ionicons color={color} name={icon} size={18} />
      </View>
      <Text adjustsFontSizeToFit minimumFontScale={0.6} numberOfLines={1} style={styles.headline}>
        {value}
      </Text>
      <Text style={[styles.caption, styles.centered]}>{label}</Text>
    </View>
  );
}

/** `categoryCard(_:)` (:153-165) with `donut` and `categoryLegend` (:166-180). */
function CategoryCard({ stats, title }: { stats: PomodoroAnalytics; title: string }) {
  return (
    <View style={styles.card} testID="pomodoro-category-card">
      <Text style={styles.headline}>Time by Category</Text>
      <Text style={[styles.caption, { color: SECONDARY }]}>{title}</Text>
      {stats.focusSeconds === 0 ? (
        <View style={styles.emptyDonut}>
          <Ionicons color={withAlpha('#AF52DE', 0.5)} name="pie-chart-outline" size={34} />
          <Text style={styles.subheadline}>No focus time in this period yet.</Text>
        </View>
      ) : (
        <View style={styles.donutRow}>
          <CategoryDonut
            center={
              <View style={styles.donutCenter}>
                <Text adjustsFontSizeToFit minimumFontScale={0.6} numberOfLines={1} style={styles.headline}>
                  {dashboardTime(stats.focusSeconds)}
                </Text>
                <Text style={styles.caption2}>Total Focus</Text>
              </View>
            }
            size={155}
            slices={stats.categories.map((item) => ({ color: CATEGORY_COLORS[item.category], seconds: item.seconds }))}
          />
          <View style={styles.legend}>
            {stats.categories.map((item) => (
              <View key={item.category} style={styles.legendRow} testID={`pomodoro-share-${item.category}`}>
                <View style={[styles.dot, { backgroundColor: CATEGORY_COLORS[item.category] }]} />
                <Text style={[styles.caption, styles.grow]}>{POMODORO_CATEGORY_TITLES[item.category]}</Text>
                <Text style={[styles.caption, styles.medium]}>{`${sharePercent(item.seconds, stats.focusSeconds)}%`}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

/** `sessionHistory(_:)` (:181-200): days newest first; the newest open until closed, the rest closed until opened. */
function SessionHistory({
  stats,
  now,
  zone,
  onSelect,
  startButton,
}: {
  stats: PomodoroAnalytics;
  now: number;
  zone: string;
  onSelect: (session: PomodoroSession) => void;
  startButton: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  if (stats.sessions.length === 0) {
    return (
      <View style={styles.stack16}>
        <View style={styles.unavailable} testID="pomodoro-history-empty">
          <Ionicons color={SECONDARY} name="timer-outline" size={44} />
          <Text style={[styles.title3, styles.bold]}>No sessions yet</Text>
          <Text style={[styles.subheadline, styles.centered, { color: SECONDARY }]}>Start a focus session to build your history.</Text>
        </View>
        {startButton}
      </View>
    );
  }
  return (
    <View style={styles.stack16}>
      {stats.days.map((day, dayIndex) => {
        const open = expanded.has(day.date) || (dayIndex === 0 && !collapsed.has(day.date));
        const title = dayTitle(day.date, now, zone);
        const toggle = () => {
          const nextExpanded = new Set(expanded);
          const nextCollapsed = new Set(collapsed);
          if (open) {
            nextExpanded.delete(day.date);
            nextCollapsed.add(day.date);
          } else {
            nextExpanded.add(day.date);
            nextCollapsed.delete(day.date);
          }
          setExpanded(nextExpanded);
          setCollapsed(nextCollapsed);
        };
        return (
          <View key={day.date} style={styles.card} testID={`pomodoro-day-${dayIndex}`}>
            <Pressable
              accessibilityLabel={`${title}, ${day.sessions.length} sessions, ${open ? 'collapse' : 'expand'}`}
              accessibilityRole="button"
              onPress={toggle}
              style={styles.row}
            >
              <Text style={[styles.subheadline, styles.bold, styles.grow]}>{title}</Text>
              <Text style={styles.caption}>{`${day.sessions.length} ${day.sessions.length === 1 ? 'session' : 'sessions'}`}</Text>
              <Ionicons color={INK} name={open ? 'chevron-up' : 'chevron-down'} size={12} />
            </Pressable>
            {open
              ? day.sessions.map((session, index) => (
                  <View key={session.id}>
                    <Pressable accessibilityRole="button" onPress={() => onSelect(session)} testID="pomodoro-history-entry">
                      <SessionRow now={now} session={session} zone={zone} />
                    </Pressable>
                    {index < day.sessions.length - 1 ? <View style={styles.divider} /> : null}
                  </View>
                ))
              : null}
          </View>
        );
      })}
    </View>
  );
}

/** `sessionRow(_:stats:)` (:201-213). */
function SessionRow({ session, now, zone }: { session: PomodoroSession; now: number; zone: string }) {
  const done = session.phase === 'completed' || session.phase === 'shortBreak';
  const icon = done ? 'checkmark-circle' : session.phase === 'stopped' ? 'stop-circle-outline' : session.paused ? 'pause-circle-outline' : 'ellipse-outline';
  const color = session.phase === 'stopped' ? '#FF9500' : done ? '#34C759' : withAlpha(INDIGO, 0.5);
  return (
    <View style={styles.sessionRow}>
      <View style={[styles.sessionIcon, { backgroundColor: CATEGORY_COLORS[session.category] }]}>
        <Ionicons color="#FFFFFF" name={CATEGORY_ICONS[session.category]} size={18} />
      </View>
      <View style={styles.grow}>
        <Text style={[styles.subheadline, styles.medium]}>{POMODORO_CATEGORY_TITLES[session.category]}</Text>
        {session.name !== '' ? (
          <Text numberOfLines={2} style={[styles.caption, { color: SECONDARY }]}>
            {session.name}
          </Text>
        ) : null}
        <Text style={[styles.caption, { color: SECONDARY }]}>{`${dashboardTime(focusedSeconds(session, now))} · ${shortTime(session.startedAt * 1000, zone)}`}</Text>
      </View>
      <Ionicons accessibilityLabel={sessionStatus(session)} color={color} name={icon} size={22} />
    </View>
  );
}

/** `sessionDetail(_:)` (:214-235): a sheet with the session's facts, and "Return to Timer" while it runs. */
function SessionDetail({
  session,
  current,
  zone,
  now,
  onClose,
  onReturn,
}: {
  session: PomodoroSession | null;
  current: PomodoroSession | undefined;
  zone: string;
  now: number;
  onClose: () => void;
  onReturn: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={session !== null}>
      {session ? (
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]} testID="pomodoro-session-detail">
          <View style={styles.sheetBar}>
            <View style={styles.sheetSide} />
            <Text accessibilityRole="header" style={[styles.headline, styles.grow, styles.centered]}>
              Session details
            </Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.sheetSide} testID="pomodoro-session-done">
              <Text style={[styles.headline, { color: INDIGO }]}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.form}>
            <Text style={styles.sectionHeader}>{POMODORO_CATEGORY_TITLES[session.category].toUpperCase()}</Text>
            <View style={styles.formCard}>
              {session.name !== '' ? <FormRow label={session.name} /> : null}
              <FormRow label="Status" value={sessionStatus(session)} />
              <FormRow label="Started" value={startedLabel(session.startedAt * 1000, zone)} />
              <FormRow label="Planned focus" value={`${session.durationMinutes} min`} />
              <FormRow label="Focus time" value={dashboardTime(focusedSeconds(session, now))} />
              <FormRow label="Break time" value={dashboardTime(restedSeconds(session, now))} last />
            </View>
            {current?.id === session.id && isActive(current) ? (
              <Pressable accessibilityRole="button" onPress={onReturn} style={styles.formCard} testID="pomodoro-session-return">
                <Text style={[styles.body, styles.formRow, { color: INDIGO }]}>Return to Timer</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </Modal>
  );
}

function FormRow({ label, value, last = false }: { label: string; value?: string; last?: boolean }) {
  return (
    <View style={[styles.formRow, !last && styles.formSeparator]}>
      <Text style={[styles.body, styles.grow]}>{label}</Text>
      {value !== undefined ? <Text style={[styles.body, { color: SECONDARY }]}>{value}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#FFFFFF' },
  grow: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 18, width: '100%', maxWidth: 620, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center' },
  circleButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  title2: { flex: 1, textAlign: 'center', fontSize: 22, lineHeight: 28, fontWeight: '700', color: INK },
  title3: { fontSize: 20, lineHeight: 25, color: INK },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: INK },
  body: { fontSize: 17, lineHeight: 22, color: INK },
  subheadline: { fontSize: 15, lineHeight: 20, color: INK },
  caption: { fontSize: 12, lineHeight: 16, color: INK },
  caption2: { fontSize: 11, lineHeight: 13, color: INK },
  bold: { fontWeight: '700' },
  medium: { fontWeight: '500' },
  centered: { textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: 4 },
  tab: { borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  periods: { flexDirection: 'row', gap: 5 },
  period: { flex: 1, borderRadius: 999, paddingVertical: 11, alignItems: 'center' },
  periodText: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  stack16: { gap: 16 },
  card: {
    gap: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: withAlpha(INDIGO, 0.06),
    shadowColor: '#007AFF',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  focusHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  focusIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metrics: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 18, borderWidth: 1, borderColor: '#FFFFFF' },
  metricIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 17, borderRadius: 16 },
  primaryText: { color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyDonut: { alignItems: 'center', gap: 12, paddingVertical: 30 },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'center' },
  donutCenter: { alignItems: 'center', gap: 3 },
  legend: { flex: 1, minWidth: 135, gap: 13 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  unavailable: { alignItems: 'center', gap: 8, paddingVertical: 30 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(60, 60, 67, 0.12)', marginTop: 12 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12 },
  sessionIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sheet: { flex: 1, backgroundColor: '#F2F2F7' },
  sheetBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 56 },
  sheetSide: { width: 64, alignItems: 'flex-end' },
  form: { padding: 16, gap: 8 },
  sectionHeader: { fontSize: 13, lineHeight: 18, color: SECONDARY, marginLeft: 16, marginTop: 8 },
  formCard: { backgroundColor: '#FFFFFF', borderRadius: 10, overflow: 'hidden' },
  formRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 16, paddingVertical: 11 },
  formSeparator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(60, 60, 67, 0.29)' },
});
