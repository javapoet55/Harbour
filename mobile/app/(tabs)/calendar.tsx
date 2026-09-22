import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CalendarEvent } from '../../src/api';
import { TaskSymbol, Text } from '../../src/components';
import { CalendarSegments, CalendarSummaryCard, CalendarTimelineRow, withAlpha } from '../../src/components/CalendarParts';
import { TodayBackdrop } from '../../src/components/TodayShell';
import {
  CALENDAR_MODES,
  CALENDAR_RANGES,
  calendarEventMatches,
  calendarKey,
  calendarOverdue,
  calendarSearchMatches,
  itemCount,
  shiftSelected,
  taskOccursOn,
  taskScheduledOn,
  visibleDays,
  type CalendarMode,
  type CalendarRange,
} from '../../src/lib/calendarDates';
import { calendarRows } from '../../src/lib/calendarRows';
import { durationLabel } from '../../src/lib/focusClock';
import { serverTime } from '../../src/lib/taskLabels';
import { isDone, parseServerDate } from '../../src/lib/taskQuery';
import { useCalendarAgenda } from '../../src/query/useCalendar';
import { useTasks } from '../../src/query/useTasks';
import { useScheduleIntelligence } from '../../src/query/useToday';
import { useSession } from '../../src/store/session';
import { androidGroup, brand, isAndroid, useTheme } from '../../src/theme';

/**
 * Port of `CalendarView` (ios/App/CalendarView.swift), built from `body` at `:72-176`.
 *
 * Child view files followed: `TodayBackdrop` (`RootView.swift:1534`), `TaskDetailsView`
 * (`ios/App/TaskDetailsView.swift`, the Phase 3 task detail), `CalendarEventEditor`
 * (`CalendarView.swift:503`, its own route here), `AddTaskByVoiceView`
 * (`ios/App/AddTaskByVoiceView.swift`, the Phase 3 voice shell), `AskNexdoView`
 * (`ios/App/AskNexdoView.swift`, Phase 6).
 *
 * `body` order: header, search field (when open), segments, then either the intelligence card
 * (Schedule) or the date navigation and grid (Week/Month), the failure line, the loading line, and
 * the mode-specific content.
 *
 * MODES, which differ from the brief: Swift offers **Schedule / Week / Month**, not a month grid plus
 * a week strip plus a day agenda. Schedule mode shows a rolling range (Next 3 days / Next 7 days /
 * This week); Week and Month show a date grid with ONE selected day's items beneath it.
 */
/**
 * Android: whether "Add by Voice" and "Add Manually" each fit on one line in half the creation row,
 * at the base size. A card is (row - gap) / 2 wide; its title gets that less the card's padding and
 * border, the 38pt icon and the gap beside it. Unmeasured, it keeps the two-up row.
 */
export function creationTitlesFit({ row, voice, manual }: { row: number; voice: number; manual: number }): boolean {
  if (row <= 0 || voice <= 0 || manual <= 0) return true;
  const title = (row - CREATION_GAP) / 2 - CREATION_PADDING * 2 - 2 - CREATION_ICON - CREATION_GAP_INSIDE;
  return voice <= title && manual <= title;
}
const CREATION_GAP = 10;
const CREATION_PADDING = 8;
const CREATION_ICON = 38;
const CREATION_GAP_INSIDE = 8;

export default function Calendar() {
  const theme = useTheme();
  // The event detail is a `.sheet` (CalendarView.swift:168); iOS resolves its backgrounds one level
  // up inside a sheet, so the modal below takes the elevated palette (style map section 3).
  const sheetTheme = useTheme({ elevated: true });
  // `.toolbar(.hidden, for: .navigationBar)` (CalendarView.swift:138) leaves the SwiftUI scroll view
  // inset by the safe area. React Native insets nothing, so the wordmark drew under the status bar.
  const insets = useSafeAreaInsets();
  const profile = useSession((state) => state.profile);

  const [mode, setMode] = useState<CalendarMode>('Schedule');
  const [range, setRange] = useState<CalendarRange>('Next 3 days');
  const [selected, setSelected] = useState(() => Date.now());
  const [now] = useState(() => Date.now());
  const android = isAndroid();
  // Android: the creation row's width and each creation title's width at the base size, to decide
  // whether "Add by Voice" and "Add Manually" fit two-up on one line each (docs/android-polish.md §10).
  // Held here, not in `IntelligenceCard`, which is re-created on every render.
  const [creationFit, setCreationFit] = useState({ row: 0, voice: 0, manual: 0 });
  const measureCreation = (key: 'row' | 'voice' | 'manual', width: number) =>
    setCreationFit((current) => (current[key] === width ? current : { ...current, [key]: width }));
  const creationTwoUp = !android || creationTitlesFit(creationFit);
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [rangeOpen, setRangeOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [eventDetail, setEventDetail] = useState<CalendarEvent | null>(null);

  // The four filters (CalendarView.swift:19-22).
  const [showTasks, setShowTasks] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [completedOnly, setCompletedOnly] = useState(false);

  const tasks = useTasks();
  const intelligence = useScheduleIntelligence();

  const zone = profile?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const days = useMemo(() => visibleDays(mode, range, selected, zone), [mode, range, selected, zone]);
  const from = calendarKey(days[0], zone);

  const agenda = useCalendarAgenda(from, days.length);
  const data = agenda.data ?? null;

  const hasSearch = searchText.trim().length > 0;
  const filtersActive = !showTasks || !showEvents || criticalOnly || completedOnly;

  /** `matches(_:)` (CalendarView.swift:50-53). */
  const taskMatches = (task: Parameters<typeof taskOccursOn>[0]) =>
    showTasks &&
    (!criticalOnly || task.critical === true || task.priority === 'CRITICAL') &&
    calendarSearchMatches(task.title, searchText);

  /** `tasks(_:)` (CalendarView.swift:54-56). */
  const tasksFor = (day: number) =>
    (data?.tasks ?? []).filter((task) => taskMatches(task) && taskOccursOn(task, calendarKey(day, zone), zone, completedOnly));

  /** `events(_:)` (CalendarView.swift:57-62): critical-only hides events entirely. */
  const eventsFor = (day: number) => {
    if (!showEvents || criticalOnly) return [];
    return (data?.events ?? []).filter(
      (event) =>
        calendarSearchMatches(event.title, searchText) &&
        calendarEventMatches({ event, day: calendarKey(day, zone), timeZone: zone, completedOnly, now }),
    );
  };

  const countFor = (day: number) => tasksFor(day).length + eventsFor(day).length;

  /** `openTasks` and `backlog` (CalendarView.swift:45, 63). */
  const openTasks = (tasks.data?.tasks ?? []).filter((task) => !isDone(task) && task.status !== 'CANCELLED');
  const backlog = openTasks.filter(
    (task) => taskMatches(task) && (!task.startAt || calendarOverdue(task, zone, now)),
  );

  const label = (at: number, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { timeZone: zone, ...options }).format(new Date(at));

  const refresh = () => {
    void tasks.refetch();
    void agenda.refetch();
    void intelligence.refetch();
  };

  /** `dayTitle(_:_:)` (CalendarView.swift:403-407). */
  const dayTitle = (day: number, relative: boolean) => {
    if (!relative) return label(day, { weekday: 'long', month: 'short', day: 'numeric' });
    const key = calendarKey(day, zone);
    const prefix =
      key === calendarKey(now, zone)
        ? 'Today · '
        : key === calendarKey(now + 86_400_000, zone)
          ? 'Tomorrow · '
          : '';
    return prefix + label(day, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const daySection = (day: number, relative: boolean) => {
    const rows = calendarRows({ tasks: tasksFor(day), events: eventsFor(day), day, timeZone: zone, now });
    return (
      <View key={calendarKey(day, zone)} style={[styles.daySection, android && styles.androidDaySection]} testID={`calendar-day-${calendarKey(day, zone)}`}>
        <View style={[styles.dayHeader, android && styles.androidDayHeader]} testID={`calendar-day-header-${calendarKey(day, zone)}`}>
          <Text style={[styles.heading, { color: theme.colors.ink }]}>{dayTitle(day, relative)}</Text>
          <View style={styles.grow} />
          <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>{itemCount(countFor(day))}</Text>
          {!relative ? <FiltersButton /> : null}
        </View>
        <View style={[styles.divider, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.08) }]} />
        {rows.length === 0 ? (
          <Text style={[styles.subheadline, styles.emptyDay, android && styles.androidEmptyDay, { color: theme.colors.secondary }]} testID={`calendar-empty-${calendarKey(day, zone)}`}>
            {filtersActive ? 'No items match your filters.' : 'Nothing scheduled. Room to breathe.'}
          </Text>
        ) : (
          rows.map((row) => (
            <CalendarTimelineRow
              key={row.id}
              row={row}
              timeZone={zone}
              completedOnly={completedOnly}
              now={now}
              onPress={() => (row.task ? router.push(`/task/${row.task.id}`) : setEventDetail(row.event))}
            />
          ))
        )}
      </View>
    );
  };

  /** `filters` (CalendarView.swift:322-335). */
  function FiltersButton() {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Calendar filters${filtersActive ? ', active' : ''}`}
        onPress={() => setFiltersOpen((open) => !open)}
        testID="calendar-filters"
        style={[styles.filtersButton, { backgroundColor: withAlpha(theme.colors.surface, 0.8), borderColor: withAlpha(brand.nexdoIndigo, 0.18) }]}
      >
        {/* No `.font` on the glyph, so `.body`; no `.foregroundStyle`, so nexdoInk (`:332`). */}
        <TaskSymbol name="slider.horizontal.3" size={17} color={theme.colors.ink} />
      </Pressable>
    );
  }

  return (
    <View style={styles.fill}>
      <TodayBackdrop subtle />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={[styles.scroll, { paddingTop: styles.scroll.paddingTop + insets.top }]}
        refreshControl={<RefreshControl refreshing={agenda.isRefetching} onRefresh={refresh} />}
      >
        {/* `calendarHeader` (CalendarView.swift:178-196) */}
        <View style={styles.header}>
          <View style={styles.grow}>
            <Text style={[styles.title, { color: theme.colors.ink }]}>Calendar</Text>
            <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>Plan your time. Make it happen.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search calendar"
            onPress={() => setSearching(true)}
            testID="calendar-search-open"
            style={[styles.headerButton, { backgroundColor: withAlpha(brand.nexdoIndigo, 0.09) }]}
          >
            {/* `.font(.title3)` with no `.foregroundStyle`, so it inherits the view's nexdoInk (`:187`). */}
            <TaskSymbol name="magnifyingglass" size={20} color={theme.colors.ink} />
          </Pressable>
        </View>

        {/* `searchField` (CalendarView.swift:198-226) */}
        {searching ? (
          <View style={styles.searchBlock}>
            <View style={styles.searchRow}>
              {/* `.background(.background.opacity(0.9), ...)` (CalendarView.swift:217). */}
              <View style={[styles.searchField, { backgroundColor: withAlpha(theme.colors.surface, 0.9), borderColor: withAlpha(brand.nexdoIndigo, 0.18) }]}>
                <TaskSymbol name="magnifyingglass" size={17} color={theme.colors.secondary} />
                <TextInput
                  accessibilityLabel="Search calendar by keyword"
                  placeholder="Search events and tasks"
                  placeholderTextColor={theme.colors.placeholder}
                  value={searchText}
                  onChangeText={setSearchText}
                  autoCorrect={false}
                  returnKeyType="search"
                  style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}
                  testID="calendar-search-input"
                />
                {/* `.frame(width: 44, height: 44)` on the glyph (CalendarView.swift:212). */}
                {searchText.length > 0 ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Clear calendar search" onPress={() => setSearchText('')} style={styles.clearButton}>
                    <TaskSymbol name="xmark.circle.fill" size={17} color={theme.colors.secondary} />
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={() => {
                  setSearchText('');
                  setSearching(false);
                }}
                style={styles.cancel}
                testID="calendar-search-cancel"
              >
                <Text style={[theme.typography.body, { color: theme.colors.link }]}>Cancel</Text>
              </Pressable>
            </View>
            <Text style={[styles.caption, { color: theme.colors.secondary }]}>
              {`Searching ${label(days[0], { month: 'short', day: 'numeric' })}–${label(days[days.length - 1], { month: 'short', day: 'numeric', year: 'numeric' })} · Current filters apply`}
            </Text>
          </View>
        ) : null}

        <CalendarSegments options={CALENDAR_MODES} value={mode} onChange={setMode} testIDPrefix="calendar-mode" />

        {mode === 'Schedule' ? (
          !hasSearch && !completedOnly ? <IntelligenceCard /> : null
        ) : (
          <>
            {/* `dateNavigation` (CalendarView.swift:348-357) */}
            <View style={styles.dateNav}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Previous ${mode === 'Week' ? 'week' : 'month'}`}
                onPress={() => setSelected((current) => shiftSelected(mode, current, -1, zone))}
                style={styles.navButton}
                testID="calendar-previous"
              >
                <TaskSymbol name="chevron.left" size={17} color={theme.colors.ink} />
              </Pressable>
              <Text style={[styles.heading, styles.navLabel, { color: theme.colors.ink }]} testID="calendar-nav-label">
                {mode === 'Month'
                  ? label(selected, { month: 'long', year: 'numeric' })
                  : `${label(days[0], { month: 'short', day: 'numeric' })} – ${label(days[days.length - 1], { month: 'short', day: 'numeric', year: 'numeric' })}`}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Next ${mode === 'Week' ? 'week' : 'month'}`}
                onPress={() => setSelected((current) => shiftSelected(mode, current, 1, zone))}
                style={styles.navButton}
                testID="calendar-next"
              >
                <TaskSymbol name="chevron.right" size={17} color={theme.colors.ink} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Today" onPress={() => setSelected(Date.now())} style={styles.todayButton} testID="calendar-today">
                <Text style={[styles.subheadline, { color: theme.colors.link }]}>Today</Text>
              </Pressable>
            </View>

            {/* `dateGrid` (CalendarView.swift:358-381) */}
            <View style={styles.grid}>
              {/* One `LazyVGrid`: the weekday row and the date rows share `spacing: mode == .month ? 10 : 0`. */}
              <View style={[styles.gridRow, { rowGap: mode === 'Month' ? 10 : 0 }]}>
                {(mode === 'Week'
                  ? ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
                  : ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
                ).map((weekday, index) => (
                  <Text key={`${weekday}-${index}`} style={[styles.gridHeader, { color: theme.colors.secondary }]}>
                    {weekday}
                  </Text>
                ))}
                {days.map((day) => {
                  const key = calendarKey(day, zone);
                  const isSelected = key === calendarKey(selected, zone);
                  const dayTasks = tasksFor(day);
                  const outsideMonth = mode === 'Month' && key.slice(0, 7) !== calendarKey(selected, zone).slice(0, 7);
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityLabel={`${label(day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, ${data === null ? 'loading' : itemCount(countFor(day))}`}
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setSelected(day)}
                      testID={`calendar-day-${key}`}
                      style={styles.gridCell}
                    >
                      <View style={[styles.dayCircle, isSelected && { backgroundColor: SELECTED_DAY }]}>
                        <Text
                          style={[
                            theme.typography.body,
                            { color: isSelected ? '#FFFFFF' : withAlpha(theme.colors.ink, outsideMonth ? 0.4 : 1) },
                          ]}
                        >
                          {label(day, { day: 'numeric' })}
                        </Text>
                      </View>
                      <View style={styles.dots}>
                        {eventsFor(day).length > 0 || dayTasks.some((task) => taskScheduledOn(task, key, zone)) ? (
                          <View style={[styles.dot, { backgroundColor: '#007AFF' }]} />
                        ) : null}
                        {dayTasks.some((task) => calendarOverdue(task, zone, now)) ? (
                          <View style={[styles.dot, { backgroundColor: '#FF9500' }]} />
                        ) : null}
                        {dayTasks.some((task) => task.critical === true || task.priority === 'CRITICAL') ? (
                          <View style={[styles.dot, { backgroundColor: '#FF3B30' }]} />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.caption, styles.legend, { color: theme.colors.secondary }]}>
                Blue: planned · Amber: overdue · Red: critical
              </Text>
            </View>
          </>
        )}

        {agenda.isError ? (
          <View style={styles.failure}>
            <Text style={[styles.subheadline, { color: theme.colors.secondary }]} testID="calendar-failure">
              {`Couldn’t refresh this date range.${data === null ? '' : ' Showing previously loaded data.'}`}
            </Text>
            {/* `.foregroundStyle(Color.nexdoSecondary)` wraps the Button too (CalendarView.swift:85). */}
            <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={() => void agenda.refetch()} style={styles.retry} testID="calendar-retry">
              <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {agenda.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
            <Text style={[theme.typography.body, styles.centred, { color: theme.colors.secondary }]}>Loading calendar…</Text>
          </View>
        ) : null}

        {data !== null ? (
          mode === 'Schedule' ? (
            <>
              {/* `upcoming` (CalendarView.swift:311-320) */}
              <View style={styles.upcoming}>
                <Text style={[styles.sectionTitle, { color: theme.colors.ink }]}>{completedOnly ? 'Completed' : 'Upcoming'}</Text>
                <View style={styles.grow} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Date range"
                  accessibilityValue={{ text: range }}
                  onPress={() => setRangeOpen((open) => !open)}
                  testID="calendar-range"
                  style={[styles.rangeButton, { backgroundColor: withAlpha(theme.colors.surface, 0.8) }]}
                >
                  <Text style={[styles.subheadline, { color: theme.colors.ink }]}>{range}</Text>
                  {/* `.font(.caption2)`, inheriting the view's nexdoInk (CalendarView.swift:316). */}
                  <TaskSymbol name="chevron.down" size={11} color={theme.colors.ink} />
                </Pressable>
                <FiltersButton />
              </View>

              {rangeOpen ? (
                <View style={[styles.menu, { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}>
                  {CALENDAR_RANGES.map((option) => (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      accessibilityLabel={option}
                      accessibilityState={{ selected: range === option }}
                      onPress={() => {
                        setRange(option);
                        setRangeOpen(false);
                      }}
                      style={styles.menuRow}
                      testID={`calendar-range-${option}`}
                    >
                      <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{option}</Text>
                      {range === option ? <Text style={[theme.typography.body, { color: theme.colors.link }]}>✓</Text> : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {/* `summary` (CalendarView.swift:336-340) */}
              <Summary />

              {hasSearch ? <SearchResults /> : days.map((day) => daySection(day, true))}

              {/* The backlog disclosure (CalendarView.swift:98-110) */}
              {!completedOnly ? (
                <View
                  style={[styles.backlog, { backgroundColor: withAlpha(theme.colors.surface, 0.7), borderColor: withAlpha(brand.nexdoBlue, 0.18) }, androidGroup(theme)]}
                  testID="calendar-backlog-card"
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Unscheduled & overdue  ${backlog.length}`}
                    accessibilityState={{ expanded }}
                    onPress={() => setExpanded((open) => !open)}
                    testID="calendar-backlog"
                    style={styles.backlogHeader}
                  >
                    <Text style={[styles.subheadline, styles.semibold, styles.grow, { color: theme.colors.ink }]}>
                      {`Unscheduled & overdue  ${backlog.length}`}
                    </Text>
                    {/* A `DisclosureGroup` draws its chevron in the accent colour, not secondary. */}
                    <TaskSymbol name={expanded ? 'chevron.down' : 'chevron.right'} size={14} color={theme.colors.link} />
                  </Pressable>
                  {expanded ? (
                    backlog.length === 0 ? (
                      <Text style={[styles.subheadline, styles.backlogEmpty, { color: theme.colors.ink }]}>
                        No unscheduled or overdue tasks.
                      </Text>
                    ) : (
                      backlog.map((task) => (
                        <Pressable
                          key={task.id}
                          accessibilityRole="button"
                          accessibilityLabel={task.title}
                          onPress={() => router.push(`/task/${task.id}`)}
                          style={styles.backlogRow}
                          testID={`calendar-backlog-${task.id}`}
                        >
                          <Text style={[styles.subheadline, styles.grow, { color: theme.colors.ink }]}>{task.title}</Text>
                          {calendarOverdue(task, zone, now) ? (
                            <View style={[styles.badge, { backgroundColor: withAlpha('#FF9500', 0.12) }]}>
                              <Text style={[styles.badgeText, { color: '#FF9500' }]}>Overdue</Text>
                            </View>
                          ) : null}
                        </Pressable>
                      ))
                    )
                  ) : null}
                </View>
              ) : null}
            </>
          ) : (
            <>
              {hasSearch ? (
                <SearchResults />
              ) : (
                <>
                  {mode === 'Week' ? (
                    <CalendarSummaryCard
                      title={`Your ${label(selected, { weekday: 'long' })}`}
                      detail={`${itemCount(countFor(selected))} · ${tasksFor(selected)
                        .filter((task) => taskScheduledOn(task, calendarKey(selected, zone), zone))
                        .reduce((total, task) => total + task.durationMin, 0)} min planned`}
                      testID="calendar-week-summary"
                    />
                  ) : null}
                  {daySection(selected, false)}
                </>
              )}
            </>
          )
        ) : null}
      </ScrollView>

      {/* The filters menu (CalendarView.swift:322-335) */}
      {filtersOpen ? (
        <View style={[styles.filtersMenu, { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}>
          <FilterToggle label="Tasks" value={showTasks} onChange={setShowTasks} testID="filter-tasks" />
          <FilterToggle label="Calendar events" value={showEvents} onChange={setShowEvents} testID="filter-events" />
          <FilterToggle
            label="Completed"
            value={completedOnly}
            onChange={(next) => {
              setCompletedOnly(next);
              // `.onChange(of: completedOnly) { if enabled { criticalOnly = false } }`
              if (next) setCriticalOnly(false);
            }}
            testID="filter-completed"
          />
          <FilterToggle label="Critical only" value={criticalOnly} onChange={setCriticalOnly} testID="filter-critical" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reset filters"
            onPress={() => {
              setShowTasks(true);
              setShowEvents(true);
              setCriticalOnly(false);
              setCompletedOnly(false);
              setFiltersOpen(false);
            }}
            style={styles.menuRow}
            testID="filter-reset"
          >
            <Text style={[theme.typography.body, { color: theme.colors.link }]}>Reset filters</Text>
          </Pressable>
        </View>
      ) : null}

      {/* `.sheet(item: $eventDetail)` (CalendarView.swift:168-180): an INLINE sheet, not a route. */}
      <Modal visible={eventDetail !== null} animationType="slide" transparent onRequestClose={() => setEventDetail(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { backgroundColor: sheetTheme.colors.groupedBackground }]}>
            {/* `.navigationTitle("Event Details").navigationBarTitleDisplayMode(.inline)` with a
                trailing Done button (`:177-178`): an inline title is centred on both platforms. */}
            <View style={styles.sheetBar}>
              <View style={styles.sheetBarSide} />
              <Text accessibilityRole="header" style={[styles.heading, styles.centred, styles.grow, { color: sheetTheme.colors.ink }]}>
                Event Details
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={() => setEventDetail(null)} style={[styles.cancel, styles.sheetBarSide]} testID="event-detail-done">
                <Text style={[theme.typography.body, styles.trailing, { color: sheetTheme.colors.link }]}>Done</Text>
              </Pressable>
            </View>
            {eventDetail ? (
              <>
                {/* A `Form` on iOS 26: 16pt outer inset, 26pt corners, 16pt row inset, 56pt rows,
                    a sentence-case `.body` header inset 32pt from the screen (style map section 7). */}
                <View style={[styles.sheetSection, { backgroundColor: sheetTheme.colors.surface }]}>
                  <Text style={[styles.heading, styles.formRow, { color: sheetTheme.colors.ink }]} testID="event-detail-title">
                    {eventDetail.title}
                  </Text>
                </View>
                <Text style={[theme.typography.body, styles.sectionHeader, { color: sheetTheme.colors.secondaryLabel }]}>Calendar commitment</Text>
                <View style={[styles.sheetSection, { backgroundColor: sheetTheme.colors.surface }]}>
                  {eventDetail.allDay === true ? (
                    <Text style={[theme.typography.body, styles.formRow, { color: sheetTheme.colors.ink }]}>All day</Text>
                  ) : null}
                  <View style={[styles.formSeparator, { backgroundColor: sheetTheme.colors.listSeparator }]} />
                  <Text style={[theme.typography.body, styles.formRow, { color: sheetTheme.colors.ink }]} testID="event-detail-starts">
                    {`Starts: ${eventDateLabel(eventDetail.startAt, zone)}`}
                  </Text>
                  <View style={[styles.formSeparator, { backgroundColor: sheetTheme.colors.listSeparator }]} />
                  <Text style={[theme.typography.body, styles.formRow, { color: sheetTheme.colors.ink }]} testID="event-detail-ends">
                    {`Ends: ${eventDateLabel(eventDetail.endAt, zone)}`}
                  </Text>
                  <View style={[styles.formSeparator, { backgroundColor: sheetTheme.colors.listSeparator }]} />
                  <Text style={[theme.typography.body, styles.formRow, { color: sheetTheme.colors.secondaryLabel }]}>{zone}</Text>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );

  /** `summary` (CalendarView.swift:336-340). */
  function Summary() {
    const total = days.reduce((sum, day) => sum + countFor(day), 0);
    const deadlineIds = new Set(
      days.flatMap((day) =>
        tasksFor(day)
          .filter((task) => {
            const due = parseServerDate(task.dueAt);
            return due !== null && calendarKey(due, zone) === calendarKey(day, zone);
          })
          .map((task) => task.id),
      ),
    );
    const overdueCount = openTasks.filter((task) => calendarOverdue(task, zone, now)).length;
    const includesToday = days.some((day) => calendarKey(day, zone) === calendarKey(now, zone));
    return (
      <CalendarSummaryCard
        title={`${itemCount(total)} · ${deadlineIds.size} ${deadlineIds.size === 1 ? 'deadline' : 'deadlines'}`}
        detail={
          completedOnly
            ? 'Completed tasks and past events in the selected dates'
            : `${overdueCount} overdue tasks overall · ${includesToday ? 'Includes today' : label(days[0], { month: 'short', day: 'numeric' })}`
        }
        testID="calendar-summary"
      />
    );
  }

  /** `searchResults` (CalendarView.swift:228-237). */
  function SearchResults() {
    const matching = days.filter((day) => countFor(day) > 0);
    return (
      <View style={styles.searchResults}>
        {matching.length === 0 ? (
          <Text style={[styles.subheadline, { color: theme.colors.secondary }]} testID="calendar-no-results">
            No matching events or tasks in this date range. Try another keyword, date range, or filter.
          </Text>
        ) : null}
        {matching.map((day) => daySection(day, true))}
      </View>
    );
  }

  /** `intelligence` (CalendarView.swift:250-270), plus its creation cards (`:271-276`). */
  function IntelligenceCard() {
    const today = intelligence.data?.today ?? null;
    const current = today !== null && today.day === calendarKey(now, zone);
    return (
      // Android: the shared form group, like every other card (docs/android-polish.md §10).
      <View
        style={[styles.intelligence, { backgroundColor: withAlpha(brand.nexdoBlue, 0.045), borderColor: withAlpha(brand.nexdoBlue, 0.2) }, androidGroup(theme)]}
        testID="calendar-intelligence"
      >
        <View style={styles.intelligenceHeader}>
          <TaskSymbol name="sparkles" size={15} color="#007AFF" />
          {/* `.font(.subheadline.bold())` (CalendarView.swift:253) — bold, not semibold. */}
          <Text style={[styles.subheadline, styles.bold, styles.grow, android && styles.androidShrink, { color: '#007AFF' }]}>Schedule Intelligence</Text>
          {/* `.sheet(isPresented: $conflicts) { conflictSheet }` (CalendarView.swift:163, `:463-477`).
              It does NOT link into Ask: `CalendarView`'s `ask` state (`:14`) and the
              `AskNexdoView(initialPrompt:)` sheet it would present (`:157-160`) are dead code —
              nothing in the file ever sets `ask = true`. Verified in Phase 6.
              Phase 5 pointed this at `/today/attention`, a port of a different view; Phase 10 built
              the sheet itself. */}
          {/* Android: the link may shrink and wrap, so the header row never clips it. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Review conflicts"
            onPress={() => router.push('/calendar/conflicts')}
            style={[styles.cancel, android && styles.androidConflicts]}
            testID="calendar-conflicts"
          >
            <Text style={[styles.caption, styles.semibold, android && styles.androidConflictsLabel, { color: '#007AFF' }]}>Review conflicts</Text>
          </Pressable>
        </View>
        {current && today ? (
          <>
            {/* `Label(info.recommendation.title, systemImage: "exclamationmark.triangle")` (`:259`). */}
            <View style={styles.recommendation}>
              <TaskSymbol name="exclamationmark.triangle" size={17} color={theme.colors.ink} />
              <Text style={[styles.heading, styles.grow, { color: theme.colors.ink }]}>{today.recommendation.title}</Text>
            </View>
            <Text style={[styles.caption, { color: theme.colors.secondary }]}>
              {/* `DurationDisplay.durationLabel(info.availableMinutes)` (`:260`) — "7 hours 43 minutes". */}
              {`${today.appointments} calendar commitments today · ${durationLabel(today.availableMinutes)} of usable time remain`}
            </Text>
            <Text style={[styles.caption, { color: theme.colors.secondary }]}>{today.recommendation.explanation}</Text>
          </>
        ) : intelligence.isFetching || intelligence.isError ? null : (
          <>
            {/* `else if !model.intelligenceLoading && model.intelligenceError == nil` (`:263`). */}
            <Text style={[styles.heading, { color: theme.colors.ink }]}>Review your schedule</Text>
            <Text style={[styles.caption, { color: theme.colors.secondary }]}>Load today’s conflicts and available time.</Text>
          </>
        )}
        {/* `intelligenceStatus(allowCreation: true)` (CalendarView.swift:268, defined `:295-312`). */}
        <IntelligenceStatus current={current} />
        <View
          onLayout={android ? (event) => measureCreation('row', event.nativeEvent.layout.width) : undefined}
          style={[styles.creationRow, android && !creationTwoUp && styles.creationColumn]}
          testID="calendar-creation-row"
        >
          {/* Android: both titles measured at the base size, off to the side. */}
          {android ? (
            <View pointerEvents="none" style={styles.measure} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Text onLayout={(event) => measureCreation('voice', event.nativeEvent.layout.width)} style={[styles.caption, styles.semibold, styles.natural]} testID="calendar-creation-measure-voice">
                Add by Voice
              </Text>
              <Text onLayout={(event) => measureCreation('manual', event.nativeEvent.layout.width)} style={[styles.caption, styles.semibold, styles.natural]} testID="calendar-creation-measure-manual">
                Add Manually
              </Text>
            </View>
          ) : null}
          {/* `.fullScreenCover { AddTaskByVoiceView(calendarOnly: true) }` (CalendarView.swift:161). */}
          <CreationCard title="Add by Voice" subtitle="Tap and speak" voice onPress={() => router.push('/calendar/voice')} testID="calendar-add-voice" />
          <CreationCard title="Add Manually" subtitle="Type an event" voice={false} onPress={() => router.push('/calendar/event/new')} testID="calendar-add-manual" />
        </View>
      </View>
    );
  }

  /**
   * `intelligenceStatus(allowCreation:)` (CalendarView.swift:295-312), with `allowCreation` true:
   * the loading line, the error line with its retry, or the "Create Appointments" button when the
   * review on hand is not today's. Renders nothing when today's review is current.
   */
  function IntelligenceStatus({ current }: { current: boolean }) {
    if (intelligence.isFetching) {
      return (
        <View style={styles.loading} testID="calendar-intelligence-loading">
          <ActivityIndicator />
          <Text style={[styles.subheadline, styles.centred, { color: theme.colors.ink }]}>Reviewing your schedule…</Text>
        </View>
      );
    }
    if (intelligence.isError) {
      return (
        <View style={styles.statusBlock} testID="calendar-intelligence-error">
          <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>{(intelligence.error as Error).message}</Text>
          {intelligence.data !== undefined ? (
            <Text style={[styles.caption, { color: theme.colors.secondary }]}>Showing the last successful review.</Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry schedule intelligence"
            onPress={() => void intelligence.refetch()}
            style={styles.retry}
            testID="calendar-intelligence-retry"
          >
            <Text style={[styles.subheadline, styles.semibold, { color: theme.colors.link }]}>Retry schedule intelligence</Text>
          </Pressable>
        </View>
      );
    }
    if (!current) {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create Appointments"
          onPress={() => router.push('/calendar/event/new')}
          style={styles.retry}
          testID="calendar-create-appointments"
        >
          <Text style={[styles.subheadline, styles.semibold, { color: theme.colors.link }]}>Create Appointments</Text>
        </Pressable>
      );
    }
    return null;
  }

  /** `calendarCreationCard(_:subtitle:voice:action:)` (CalendarView.swift:277-292). */
  function CreationCard({
    title,
    subtitle,
    voice,
    onPress,
    testID,
  }: {
    title: string;
    subtitle: string;
    voice: boolean;
    onPress: () => void;
    testID: string;
  }) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={onPress}
        testID={testID}
        style={[
          styles.creationCard,
          {
            backgroundColor: voice ? withAlpha(brand.nexdoIndigo, 0.05) : theme.colors.background,
            borderColor: withAlpha(brand.nexdoIndigo, 0.18),
          },
          android && !creationTwoUp && styles.creationCardStacked,
        ]}
      >
        {/* The voice circle is a leading-to-trailing indigo-to-blue gradient (CalendarView.swift:283). */}
        {voice ? (
          <LinearGradient
            colors={[brand.nexdoIndigo, brand.nexdoBlue]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.creationIcon}
          >
            <TaskSymbol name="mic.fill" size={22} color="#FFFFFF" />
          </LinearGradient>
        ) : (
          <View style={[styles.creationIcon, { backgroundColor: withAlpha(brand.nexdoMagenta, 0.07) }]}>
            {/* `.font(.title2)` (CalendarView.swift:280). */}
            <TaskSymbol name="plus" size={22} color={theme.colors.link} />
          </View>
        )}
        <View style={styles.creationText}>
          {/* `.lineLimit(1).minimumScaleFactor(0.8)` (CalendarView.swift:287): Roboto is ~9% narrower
              than SF Pro on a 4.5% narrower screen, so "Add Manually" is the label that runs out. */}
          {/* Android draws the title at the base size: two-up only when it fits on one line, else the
              cards stack (docs/android-polish.md §10). */}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit={!android}
            minimumFontScale={android ? undefined : 0.8}
            style={[styles.caption, styles.semibold, { color: theme.colors.ink }]}
          >
            {title}
          </Text>
          <Text numberOfLines={1} style={[styles.caption2, { color: theme.colors.secondary }]}>
            {subtitle}
          </Text>
        </View>
      </Pressable>
    );
  }

  function FilterToggle({
    label: name,
    value,
    onChange,
    testID,
  }: {
    label: string;
    value: boolean;
    onChange: (next: boolean) => void;
    testID: string;
  }) {
    return (
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={name}
        accessibilityState={{ checked: value }}
        onPress={() => onChange(!value)}
        style={styles.menuRow}
        testID={testID}
      >
        <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{name}</Text>
        {value ? <Text style={[theme.typography.body, { color: theme.colors.link }]}>✓</Text> : null}
      </Pressable>
    );
  }
}

/** `eventDate(_:)` (CalendarView.swift:479): `EEE, MMM d, yyyy h:mm a`. */
function eventDateLabel(value: string, timeZone: string): string {
  const at = parseServerDate(value);
  if (at === null) return 'Unavailable';
  const date = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(at));
  return `${date} ${serverTime(value, timeZone)}`;
}

/** `Color(red: 0.18, green: 0.36, blue: 0.59)` on the selected day (CalendarView.swift:366). */
const SELECTED_DAY = '#2E5C96';

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // `.padding(.horizontal, 24).padding(.top, 14).padding(.bottom, 24)` with `VStack(spacing: 24)`.
  scroll: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 24, gap: 24 },
  // A bare `HStack` spaces its children by 8 (CalendarView.swift:179).
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  // The line heights are the named text styles', not `fontSize * 1.2` (style map section 2).
  subheadline: { fontSize: 15, lineHeight: 21 },
  semibold: { fontWeight: '600' },
  bold: { fontWeight: '700' },
  centred: { textAlign: 'center' },
  trailing: { textAlign: 'right' },
  caption: { fontSize: 12, lineHeight: 16 },
  caption2: { fontSize: 11, lineHeight: 13 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  sectionTitle: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  headerButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
  searchBlock: { gap: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, minHeight: 48, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  cancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  clearButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dateNav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navLabel: { flex: 1, textAlign: 'center' },
  todayButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  grid: { gap: 18 },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap' },
  // `.font(.caption2)` in a `.frame(height: 28)` (CalendarView.swift:361).
  gridHeader: { width: `${100 / 7}%`, height: 28, textAlign: 'center', textAlignVertical: 'center', fontSize: 11, lineHeight: 13 },
  gridCell: { width: `${100 / 7}%`, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 3, height: 5 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  legend: { textAlign: 'center', paddingTop: 4 },
  failure: { gap: 8 },
  retry: { minHeight: 44, justifyContent: 'center' },
  // A `ProgressView` with a label stacks the label under the spinner.
  loading: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  statusBlock: { gap: 6 },
  upcoming: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rangeButton: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12 },
  filtersButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  menu: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 16 },
  filtersMenu: { position: 'absolute', right: 24, bottom: 24, minWidth: 220, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  daySection: { gap: 0 },
  // Android (docs/android-polish.md §10): 20 above each day header, 8 below it, and room under an empty day.
  androidDaySection: { paddingTop: 20 },
  androidDayHeader: { paddingBottom: 8 },
  androidEmptyDay: { paddingTop: 12, paddingBottom: 24 },
  androidShrink: { flexShrink: 1 },
  // "Review conflicts" may shrink and wrap rather than be clipped by the title.
  androidConflicts: { flexShrink: 1, maxWidth: '50%' },
  androidConflictsLabel: { textAlign: 'right' },
  creationColumn: { flexDirection: 'column', gap: 12 },
  creationCardStacked: { flex: 0, alignSelf: 'stretch' },
  measure: { position: 'absolute', left: 0, top: 0, width: 1000, opacity: 0, flexDirection: 'row' },
  natural: { alignSelf: 'flex-start' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 16 },
  divider: { height: StyleSheet.hairlineWidth },
  emptyDay: { paddingVertical: 26 },
  searchResults: { gap: 24 },
  backlog: { padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  backlogHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  // `.padding(.vertical)` with no value is 16 (CalendarView.swift:100).
  backlogEmpty: { paddingVertical: 16 },
  backlogRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, minHeight: 44 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, lineHeight: 13 },
  intelligence: { gap: 12, padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  intelligenceHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recommendation: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  creationRow: { flexDirection: 'row', gap: 10 },
  creationCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 64, padding: 8, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  creationIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  // `VStack(alignment: .leading, spacing: 4)` (CalendarView.swift:286).
  creationText: { flex: 1, gap: 4 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  // A `Form` section is inset 16 from the screen on iOS 26 (style map section 7).
  sheet: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20, gap: 8, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  sheetBar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  sheetBarSide: { width: 72 },
  // 26pt corners, 16pt row inset; each row is 56 high with the separator between rows.
  sheetSection: { borderRadius: 26, overflow: 'hidden' },
  formRow: { minHeight: 56, paddingHorizontal: 16, textAlignVertical: 'center' },
  formSeparator: { height: 1, marginLeft: 16 },
  // 32 from the screen: 16 section inset plus 16 row inset. Sentence case, `.body`, `.secondaryLabel`.
  sectionHeader: { marginLeft: 16, marginTop: 12 },
});
