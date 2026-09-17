import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';

import type { WeeklySummary } from '../../../src/api';
import { TaskSymbol, Text } from '../../../src/components';
import {
  addingWeek,
  apiDay,
  focusLabel,
  longDay,
  planPrompt,
  startOfWeek,
  weekRangeLabel,
  weekdayInitial,
} from '../../../src/lib/weeklySummary';
import { useWeeklySummary } from '../../../src/query/useToday';
import { useSession } from '../../../src/store/session';
import { brand, useTheme } from '../../../src/theme';

/**
 * Port of `WeeklySummaryView` (ios/App/WeeklySummaryView.swift), built from `body` at `:24-42` and
 * the `content` builder at `:44-73`.
 *
 * Child views followed, all private structs in the SAME file: `MetricCard` (`:231`),
 * `CompletionMetricCard` (`:336`), `WeeklySummaryBackdrop` (`:341`), `WeeklySummaryTasksView`
 * (`:241`, its own route here). `weeklyCard()` is a private `View` extension in that file too.
 *
 * Section order from `content`: week selector, summary card, metrics grid, chart card,
 * accomplishments card, insight card (only when present), then a pinned "Plan next week" button.
 */
export default function WeeklySummaryScreen() {
  const theme = useTheme();
  const profile = useSession((state) => state.profile);
  const timeZone = profile?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Read once per mount: "the current week" must not drift mid-render.
  const [currentWeek] = useState(() => startOfWeek(Date.now(), timeZone));
  const [weekStart, setWeekStart] = useState(currentWeek);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const query = useWeeklySummary(apiDay(weekStart, timeZone));
  const summary = query.data ?? null;

  const canMoveForward = weekStart < currentWeek;

  /** `moveWeek(_:)` (WeeklySummaryView.swift:189-194): never past the current week. */
  const moveWeek = (amount: number) => {
    const target = addingWeek(amount, weekStart, timeZone);
    if (target > currentWeek) return;
    setWeekStart(target);
    setSelectedDay(null);
  };

  const rangeLabel = weekRangeLabel(weekStart, timeZone);

  return (
    <View style={styles.fill}>
      {/* `WeeklySummaryBackdrop` (WeeklySummaryView.swift:341-343) */}
      <LinearGradient
        colors={theme.scheme === 'dark' ? ['#08141F', '#240821'] : ['#E0F5FF', '#FFE8FA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {query.isLoading && summary === null ? (
        <View style={styles.centre}>
          <ActivityIndicator />
          <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Loading weekly summary…</Text>
        </View>
      ) : query.isError && summary === null ? (
        <View style={styles.centre} testID="weekly-error">
          <TaskSymbol name="exclamationmark.triangle.fill" size={38} color={theme.colors.secondary} />
          <Text style={[styles.cardTitle, { color: theme.colors.ink }]}>Couldn’t load this week</Text>
          <Text style={[theme.typography.body, styles.centred, { color: theme.colors.secondary }]}>
            {query.error instanceof Error ? query.error.message : 'Please try again.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry"
            onPress={() => void query.refetch()}
            style={[styles.prominent, { backgroundColor: theme.colors.tint }]}
            testID="weekly-retry"
          >
            <Text style={[styles.prominentLabel, { color: '#FFFFFF' }]}>Retry</Text>
          </Pressable>
        </View>
      ) : summary ? (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
          >
            {/* `weekSelector` (WeeklySummaryView.swift:75-89) */}
            <View style={[styles.weekSelector, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.12) }]}>
              <Pressable accessibilityRole="button" accessibilityLabel="Previous week" onPress={() => moveWeek(-1)} style={styles.weekArrow} testID="weekly-previous">
                <Text style={[styles.arrowGlyph, { color: theme.colors.tint }]}>‹</Text>
              </Pressable>
              <Text numberOfLines={1} style={[styles.weekLabel, { color: theme.colors.ink }]} testID="weekly-range">
                {rangeLabel}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next week"
                accessibilityState={{ disabled: !canMoveForward }}
                disabled={!canMoveForward}
                onPress={() => moveWeek(1)}
                style={[styles.weekArrow, !canMoveForward && styles.dimmed]}
                testID="weekly-next"
              >
                <Text style={[styles.arrowGlyph, { color: theme.colors.tint }]}>›</Text>
              </Pressable>
            </View>

            {/* `summaryCard(_:)` (:91-100) */}
            <Card>
              <View style={styles.summaryRow}>
                <TaskSymbol name="sparkles" size={28} color={brand.nexdoPurple} />
                <View style={styles.grow}>
                  <Text accessibilityRole="header" style={[styles.headline, { color: theme.colors.ink }]} testID="weekly-headline">
                    {summary.headline}
                  </Text>
                  <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>{summary.summary}</Text>
                </View>
              </View>
            </Card>

            {/* `metricsGrid(_:)` (:102-119) */}
            <View style={styles.grid}>
              <MetricCard
                icon="checkmark.circle.fill"
                color="#34C759"
                value={`${summary.metrics.completed} of ${summary.metrics.planned}`}
                label="Tasks completed"
                hint={`Opens completed tasks for ${rangeLabel}`}
                onPress={() => router.push({ pathname: '/today/weekly-tasks', params: { start: apiDay(weekStart, timeZone), filter: 'Completed' } })}
                testID="weekly-metric-completed"
              />
              <CompletionMetricCard rate={summary.metrics.completionRate ?? null} />
              <MetricCard
                icon="exclamationmark.circle"
                color="#FF3B30"
                value={summary.metrics.overdue === null || summary.metrics.overdue === undefined ? 'Unavailable' : String(summary.metrics.overdue)}
                label="Overdue tasks"
                hint={`Opens overdue tasks for ${rangeLabel}`}
                onPress={() => router.push({ pathname: '/today/weekly-tasks', params: { start: apiDay(weekStart, timeZone), filter: 'Overdue' } })}
                testID="weekly-metric-overdue"
              />
              <MetricCard
                icon="clock"
                color={brand.nexdoPurple}
                value={focusLabel(summary.metrics.focusMinutes)}
                label="Recorded focus time"
                testID="weekly-metric-focus"
              />
            </View>

            {/* `chartCard(_:)` (:121-156) */}
            <Card>
              <Text style={[styles.cardTitle, { color: theme.colors.ink }]}>Planned vs completed</Text>
              {summary.days.every((day) => day.planned === 0 && day.completed === 0) ? (
                <View accessible style={styles.chartEmpty} testID="weekly-chart-empty">
                  <TaskSymbol name="chart.bar.xaxis" size={28} color={theme.colors.secondary} />
                  <Text style={[styles.cardTitle, { color: theme.colors.ink }]}>No task activity</Text>
                  <Text style={[theme.typography.body, styles.centred, { color: theme.colors.secondary }]}>
                    There are no planned or completed tasks in this week’s cohort.
                  </Text>
                </View>
              ) : (
                <>
                  <BarChart days={summary.days} timeZone={summary.timeZone} />
                  <View style={styles.dayRow}>
                    {summary.days.map((day) => (
                      <Pressable
                        key={day.date}
                        accessibilityRole="button"
                        accessibilityLabel={longDay(day.date, summary.timeZone)}
                        accessibilityValue={{ text: `${day.planned} planned, ${day.completed} completed` }}
                        accessibilityState={{ selected: selectedDay === day.date }}
                        onPress={() => setSelectedDay(day.date)}
                        testID={`weekly-day-${day.date}`}
                        style={[
                          styles.dayButton,
                          selectedDay === day.date && { backgroundColor: withAlpha(brand.nexdoIndigo, 0.15) },
                        ]}
                      >
                        <Text style={[styles.dayLetter, { color: theme.colors.ink }]}>
                          {weekdayInitial(day.date, summary.timeZone)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {selectedDay !== null ? (
                    <SelectedDayLine days={summary.days} day={selectedDay} timeZone={summary.timeZone} />
                  ) : null}
                </>
              )}
            </Card>

            {/* `accomplishmentsCard(_:)` (:158-169) */}
            <Card>
              <Text style={[styles.cardTitle, { color: theme.colors.ink }]}>Top accomplishments</Text>
              {summary.accomplishments.length === 0 ? (
                <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>
                  No completed tasks in this week’s planned cohort.
                </Text>
              ) : null}
              {summary.accomplishments.map((item) => (
                <Pressable
                  key={item.id}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  accessibilityHint="Opens task details"
                  onPress={() => router.push(`/task/${item.id}`)}
                  testID={`weekly-accomplishment-${item.id}`}
                  style={styles.accomplishment}
                >
                  <TaskSymbol name="checkmark.circle.fill" size={20} color="#34C759" />
                  <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{item.title}</Text>
                  <TaskSymbol name="chevron.right" size={12} color={theme.colors.secondary} />
                </Pressable>
              ))}
            </Card>

            {/* `insightCard(_:)` (:177-179), only when the server sent one. */}
            {summary.productivityInsight ? (
              <Card>
                <View style={styles.summaryRow}>
                  <TaskSymbol name="sparkles" size={17} color={theme.colors.tint} />
                  <Text style={[styles.insight, styles.grow, { color: theme.colors.tint }]} testID="weekly-insight">
                    {summary.productivityInsight}
                  </Text>
                </View>
              </Card>
            ) : null}
          </ScrollView>

          {/* `planButton(_:)` (:181-187), pinned by `.safeAreaInset(edge: .bottom)`. */}
          <View style={[styles.planBar, { backgroundColor: theme.colors.surface }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Opens Ask Nexdo with this summary. No tasks are changed without approval."
              onPress={() => router.push({ pathname: '/ask', params: { prompt: planPrompt(summary, weekStart, timeZone) } })}
              testID="weekly-plan"
            >
              <LinearGradient
                colors={[brand.nexdoMagenta, brand.nexdoIndigo, brand.nexdoBlue]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.planButton}
              >
                <Text style={[styles.planLabel, { color: '#FFFFFF' }]}>Plan next week with Nexdo AI →</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </>
      ) : null}

      {/* `ShareLink(item: shareText)` in the toolbar (:33-35). */}
      {summary ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share weekly summary"
          onPress={() => void Share.share({ message: `${summary.headline}\n\n${summary.summary}` })}
          style={styles.share}
          testID="weekly-share"
        >
          <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Share</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** `weeklyCard()`, the private `View` extension in WeeklySummaryView.swift. */
function Card({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.12) }]}>
      {children}
    </View>
  );
}

/** `MetricCard` (WeeklySummaryView.swift:231-239). */
function MetricCard({
  icon,
  color,
  value,
  label,
  onPress,
  hint,
  testID,
}: {
  icon: 'checkmark.circle.fill' | 'exclamationmark.circle' | 'clock';
  color: string;
  value: string;
  label: string;
  onPress?: () => void;
  hint?: string;
  testID?: string;
}) {
  const theme = useTheme();
  const body = (
    <>
      <View style={styles.metricTop}>
        <TaskSymbol name={icon} size={22} color={color} />
        {onPress ? <TaskSymbol name="chevron.right" size={12} color={theme.colors.secondary} /> : null}
      </View>
      <Text style={[styles.metricValue, { color: theme.colors.ink }]}>{value}</Text>
      <Text style={[styles.caption, { color: theme.colors.secondary }]}>{label}</Text>
    </>
  );

  const style = [styles.metricCard, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.12) }];
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={`${value} ${label}`} accessibilityHint={hint} onPress={onPress} testID={testID} style={style}>
      {body}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={`${value} ${label}`} style={style} testID={testID}>
      {body}
    </View>
  );
}

/** `CompletionMetricCard` (WeeklySummaryView.swift:336-339). The ring is a bar; see Visual gaps. */
function CompletionMetricCard({ rate }: { rate: number | null }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${rate === null ? 'Unavailable' : `${rate}%`} completion rate`}
      style={[styles.metricCard, { backgroundColor: theme.colors.surface, borderColor: withAlpha(brand.nexdoIndigo, 0.12) }]}
      testID="weekly-metric-rate"
    >
      <View style={[styles.ringTrack, { backgroundColor: withAlpha(brand.nexdoBlue, 0.18) }]}>
        <View style={[styles.ringFill, { width: `${Math.max(0, Math.min(100, rate ?? 0))}%`, backgroundColor: brand.nexdoBlue }]} />
      </View>
      <Text style={[styles.metricValue, { color: theme.colors.ink }]}>{rate === null ? 'Unavailable' : `${rate}%`}</Text>
      <Text style={[styles.caption, { color: theme.colors.secondary }]}>Completion rate</Text>
    </View>
  );
}

/**
 * The `Chart` with two `BarMark` series (WeeklySummaryView.swift:127-137).
 *
 * VISUAL GAP: Swift Charts has no React Native equivalent, and no charting dependency is added, so
 * this is a hand-built grouped bar chart — same data, same two colours, same 220pt height, without
 * the axis chrome or the legend Swift draws.
 */
function BarChart({ days, timeZone }: { days: { date: string; planned: number; completed: number }[]; timeZone: string }) {
  const theme = useTheme();
  const peak = Math.max(1, ...days.map((day) => Math.max(day.planned, day.completed)));
  return (
    <View accessibilityLabel="Planned versus completed tasks by day" style={styles.chart} testID="weekly-chart">
      {days.map((day) => (
        <View key={day.date} style={styles.chartColumn}>
          <View style={styles.chartBars}>
            <View style={[styles.bar, { height: `${(day.planned / peak) * 100}%`, backgroundColor: withAlpha(brand.nexdoBlue, 0.42) }]} />
            <View style={[styles.bar, { height: `${(day.completed / peak) * 100}%`, backgroundColor: brand.nexdoPurple }]} />
          </View>
          <Text style={[styles.chartAxis, { color: theme.colors.secondary }]}>{weekdayInitial(day.date, timeZone)}</Text>
        </View>
      ))}
    </View>
  );
}

function SelectedDayLine({
  days,
  day,
  timeZone,
}: {
  days: { date: string; planned: number; completed: number }[];
  day: string;
  timeZone: string;
}) {
  const theme = useTheme();
  const found = days.find((each) => each.date === day);
  if (!found) return null;
  return (
    <Text style={[styles.caption, { color: theme.colors.secondary }]} testID="weekly-selected-day">
      {`${longDay(found.date, timeZone)}: ${found.planned} planned, ${found.completed} completed`}
    </Text>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const int = parseInt(value, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

export type { WeeklySummary };

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // `.padding(.horizontal, 18).padding(.top, 12).padding(.bottom, 28)` with `VStack(spacing: 16)`.
  scroll: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 28, gap: 16 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  centred: { textAlign: 'center' },
  card: { gap: 12, padding: 18, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth },
  cardTitle: { fontSize: 20, lineHeight: 25, fontWeight: '700' },
  weekSelector: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  weekArrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowGlyph: { fontSize: 26, lineHeight: 30, fontWeight: '600' },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600' },
  dimmed: { opacity: 0.35 },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  headline: { fontSize: 22, lineHeight: 28, fontWeight: '700', marginBottom: 7 },
  grow: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: { flexGrow: 1, flexBasis: '46%', minWidth: 150, minHeight: 112, gap: 8, padding: 18, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth },
  metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricValue: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 16 },
  ringTrack: { height: 7, borderRadius: 4, overflow: 'hidden' },
  ringFill: { height: 7, borderRadius: 4 },
  chart: { flexDirection: 'row', height: 220, gap: 6 },
  chartColumn: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', gap: 6 },
  chartBars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 3, width: '100%', justifyContent: 'center' },
  bar: { width: 10, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 2 },
  chartAxis: { fontSize: 12, lineHeight: 16 },
  chartEmpty: { alignItems: 'center', gap: 9, minHeight: 180, justifyContent: 'center' },
  dayRow: { flexDirection: 'row', gap: 4 },
  dayButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  dayLetter: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  accomplishment: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  insight: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  planBar: { paddingHorizontal: 18, paddingVertical: 12 },
  planButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14 },
  planLabel: { fontSize: 17, lineHeight: 22, fontWeight: '600', textAlign: 'center' },
  share: { position: 'absolute', top: 8, right: 16, minHeight: 44, justifyContent: 'center' },
  prominent: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11, paddingHorizontal: 16 },
  prominentLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
});
