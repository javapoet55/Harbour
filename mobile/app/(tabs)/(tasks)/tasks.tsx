import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { CreationCard, DatePill, HeaderButton, SectionHeader, TaskCard, TaskEmptyState, TaskSymbol, Text } from '../../../src/components';
import { ProjectsList } from '../../../src/components/ProjectsList';
import { sectionDateLabel, TaskTabs } from '../../../src/components/TaskListParts';
import { TasksTopBar, TodayBackdrop } from '../../../src/components/TodayShell';
import {
  DATE_FILTER_EMPTY_TITLE,
  TASK_DATE_FILTERS,
  TASK_HISTORY_RANGES,
  snapshot,
  type TaskDateFilter,
  type TaskHistoryRange,
} from '../../../src/lib/taskQuery';
import { sectionTitle } from '../../../src/lib/taskLabels';
import { useProjects } from '../../../src/query/useProjects';
import { useCompleteTask, useTasks, type ScheduleConflict } from '../../../src/query/useTasks';
import { useSession } from '../../../src/store/session';
import { useTaskQuery } from '../../../src/store/taskQuery';
import { androidChipScroll, isAndroid, useTheme } from '../../../src/theme';

/** The caption under the history-range picker (RootView.swift:1724). */
const HISTORY_RANGE_CAPTION: Record<TaskHistoryRange, string> = {
  'All time': 'All open and completed tasks, with open tasks first.',
  'This Month': 'Tasks scheduled within this calendar month.',
  'Last Month': 'Previous calendar month, plus upcoming open tasks.',
  'Last 2 weeks': 'History through today, plus upcoming open tasks.',
};

/**
 * `LinearGradient([Color(red: 0.973, green: 0.977, blue: 1), Color(red: 1, green: 0.914, blue: 0.969),
 * .white], topLeading → bottomTrailing)` (RootView.swift:1689-1690).
 */
const TASKS_BACKGROUND = ['#F8F9FF', '#FFE9F7', '#FFFFFF'] as const;

/**
 * Port of `TasksView` (ios/App/RootView.swift:1663-1975).
 *
 * STRUCTURE NOTE, because it differs from the brief: Tasks and Projects are ONE screen in Swift, with
 * a Tasks / Projects pill pair switching between a task list and an inline `ProjectsView()`
 * (RootView.swift:1695-1704).
 * There is no separate Projects route, and no separate task-detail route either — tapping a task
 * opens `TaskEditor` as a SHEET (RootView.swift:1699), which for an existing task renders
 * `TaskDetailsView`. The routes here follow Swift.
 *
 * Also per Swift, and against the brief: there are no swipe actions and no long-press menu on a row.
 */
export default function Tasks() {
  const theme = useTheme();
  const profile = useSession((state) => state.profile);

  // `model.taskQuery` (NexdoApp.swift): shared with the filter sheet, which is its own route.
  const query = useTaskQuery((state) => state.query);
  const setQuery = useTaskQuery((state) => state.setQuery);
  const [showingProjects, setShowingProjects] = useState(false);
  const [searching, setSearching] = useState(false);
  const [conflict, setConflict] = useState<ScheduleConflict | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const beginSearch = useTaskQuery((state) => state.beginSearch);
  // `@FocusState private var searchFocused` (RootView.swift:1672).
  const searchField = useRef<TextInput>(null);

  const android = isAndroid();
  const tasks = useTasks();
  const projects = useProjects();
  const complete = useCompleteTask({ onConflict: setConflict });

  // Hoisted out of the render branches: narrowing `tasks` by `isLoading` collapses `data` to `never`.
  const loaded = tasks.data;
  const zone = profile?.timeZone ?? loaded?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const busy = complete.isPending;

  // `let snapshot = model.taskQuery.snapshot(model.tasks, timeZone: zone)` (RootView.swift:1639).
  const view = useMemo(() => snapshot(query, loaded?.tasks ?? [], zone), [query, loaded, zone]);

  // `.alert` from `confirmScheduleWarnings` (NexdoApp.swift:87-98).
  if (conflict) {
    const pending = conflict;
    setConflict(null);
    Alert.alert('Review this time', pending.warnings.join('\n\n'), [
      { text: 'Keep previous schedule', style: 'cancel', onPress: pending.cancel },
      { text: 'Save anyway', onPress: pending.confirm },
    ]);
  }

  const setDate = (date: TaskDateFilter) => {
    // RootView.swift:1789 — switching to All resets the history range and the status filter.
    if (date === 'All' && query.date !== 'All') {
      setQuery({ date, historyRange: 'This Month', status: 'Open' });
      return;
    }
    setQuery({ date });
  };

  // The magnifier (RootView.swift:1792-1797): opening a search resets the filters to every date,
  // status and priority (`beginSearch`); closing it clears the term only.
  const toggleSearch = () => {
    const next = !searching;
    setSearching(next);
    if (next) beginSearch();
    else setQuery({ search: '' });
    if (next) setTimeout(() => searchField.current?.focus(), 0);
    else searchField.current?.blur();
  };

  return (
    <View style={styles.fill}>
      {/* Swift's gradient has no dark variant; under it `nexdoInk` (white in dark) would sit on near
          white. Dark keeps the subtle backdrop the screen used before. */}
      {theme.scheme === 'dark' ? (
        <TodayBackdrop subtle />
      ) : (
        <LinearGradient
          colors={[...TASKS_BACKGROUND]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          testID="tasks-background"
        />
      )}
      <View style={styles.content}>
        {/* `.sheet(isPresented: $account) { AccountView() }` (RootView.swift:1702). */}
        <TasksTopBar name={profile?.name ?? ''} photo={profile?.photo} onAccount={() => router.push('/account')} />

        {/* `header` (RootView.swift:1729-1747) */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.ink }]}>
              Tasks
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.secondary }]}>Turn intent into action.</Text>
          </View>
          {!showingProjects ? (
            <View style={styles.headerButtons}>
              <HeaderButton icon="slider.horizontal.3" label="Task filters" onPress={() => router.push('/task/filters')} />
              <HeaderButton icon="magnifyingglass" label="Search tasks" onPress={toggleSearch} />
            </View>
          ) : null}
        </View>

        {/* `HStack(spacing: 0) { taskTab("Tasks") taskTab("Projects") }` (RootView.swift:1695-1701), on
            both platforms: the pill pair replaced the segmented picker and Android's `SegmentRow`. */}
        <TaskTabs
          projects={showingProjects}
          onChange={(projects) => {
            // `.onChange(of: showingProjects) { searchFocused = false }`
            searchField.current?.blur();
            setShowingProjects(projects);
          }}
        />

        {showingProjects ? (
          <ProjectsList
            tasks={loaded?.tasks ?? []}
            onOpenProject={(projectId) => router.push(`/project/${projectId}`)}
            onOpenUnassigned={() => router.push('/project/unassigned')}
            onNewProject={() => router.push('/project/new')}
            onRefresh={() => {
              void tasks.refetch();
              void projects.refetch();
            }}
            refreshing={tasks.isRefetching || projects.isRefetching}
          />
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={tasks.isRefetching} onRefresh={() => void tasks.refetch()} />}
          >
            {searching || query.search.length > 0 ? (
              <View style={[styles.searchField, { backgroundColor: theme.colors.surface }]}>
                <TaskSymbol name="magnifyingglass" size={17} color={theme.colors.secondary} />
                <TextInput
                  ref={searchField}
                  accessibilityLabel="Search tasks"
                  placeholder="Search your tasks"
                  placeholderTextColor={theme.colors.secondary}
                  value={query.search}
                  onChangeText={(search) => setQuery({ search })}
                  autoCorrect={false}
                  returnKeyType="search"
                  style={[theme.typography.body, styles.searchInput, { color: theme.colors.ink }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close search"
                  onPress={() => {
                    setQuery({ search: '' });
                    setSearching(false);
                    searchField.current?.blur();
                  }}
                  style={styles.searchClose}
                >
                  <TaskSymbol name="xmark.circle.fill" size={20} color={theme.colors.secondary} />
                </Pressable>
              </View>
            ) : null}

            {/* `creationActions` (RootView.swift:1795-1801) */}
            {/* Android stacks the two cards, one per row (docs/android-polish.md §2). */}
            <View style={[styles.creationRow, android && styles.creationColumn]} testID="creation-row">
              <CreationCard
                title="Add by Voice"
                subtitle="Tap and speak"
                icon="mic.fill"
                isVoice
                onPress={() => router.push('/task/voice-capture')}
                testID="add-by-voice"
              />
              <CreationCard
                title="Add Manually"
                subtitle="Type a task"
                icon="plus"
                isVoice={false}
                onPress={() => router.push('/task/new')}
                testID="add-manually"
              />
            </View>

            {/* `datePills` (RootView.swift:1783-1806) */}
            {/* Android: the row bleeds to the screen edges with 16 of content padding, so the last
                chip scrolls fully into view instead of being cut at the content inset. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={android ? PILL_SCROLL.style : undefined}
              contentContainerStyle={[styles.pills, android && PILL_SCROLL.contentContainerStyle]}
              testID="date-pills"
            >
              {TASK_DATE_FILTERS.map((filter) => (
                <DatePill
                  key={filter}
                  filter={filter}
                  count={view.counts[filter]}
                  selected={query.date === filter}
                  onPress={() => setDate(filter)}
                />
              ))}
            </ScrollView>

            {/* `if model.taskQuery.date == .all && search.trimmed.isEmpty { … }` (RootView.swift:1714-1726):
                the history-range picker and its caption, on the All pill and only while no search term
                is entered — a search already spans every date. */}
            {query.date === 'All' && query.search.trim() === '' ? (
              <View style={styles.historyRange}>
                <View style={styles.historyRangeRow}>
                  <Text style={[styles.historyRangeTitle, { color: theme.colors.ink }]}>History range</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`History range, ${query.historyRange}`}
                    accessibilityState={{ expanded: rangeOpen }}
                    onPress={() => setRangeOpen((open) => !open)}
                    hitSlop={8}
                    style={styles.historyRangeValue}
                    testID="history-range"
                  >
                    <Text style={[theme.typography.body, { color: theme.colors.link }]}>{query.historyRange}</Text>
                    <TaskSymbol name="chevron.up.chevron.down" size={13} color={theme.colors.link} />
                  </Pressable>
                </View>
                {rangeOpen ? (
                  <View style={[styles.rangeMenu, { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}>
                    {TASK_HISTORY_RANGES.map((range, index, all) => (
                      <Pressable
                        key={range}
                        accessibilityRole="button"
                        accessibilityLabel={range}
                        accessibilityState={{ selected: query.historyRange === range }}
                        onPress={() => {
                          setQuery({ historyRange: range });
                          setRangeOpen(false);
                        }}
                        style={[
                          styles.rangeOption,
                          index < all.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.separator },
                        ]}
                        testID={`history-range-${range}`}
                      >
                        <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{range}</Text>
                        {query.historyRange === range ? <TaskSymbol name="checkmark" size={16} color={theme.colors.link} /> : null}
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <Text style={[styles.historyRangeCaption, { color: theme.colors.secondary }]}>{HISTORY_RANGE_CAPTION[query.historyRange]}</Text>
              </View>
            ) : null}

            {/* `taskSections` (RootView.swift:1808-1842) */}
            {tasks.isLoading && (loaded?.tasks.length ?? 0) === 0 ? (
              <View style={styles.loading}>
                <ActivityIndicator />
                <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Loading tasks…</Text>
              </View>
            ) : (
              <>
                {tasks.isError ? (
                  <View style={styles.loadFailed}>
                    <Text style={[theme.typography.body, { color: theme.colors.ink }]}>Couldn’t load your tasks.</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={() => void tasks.refetch()} style={styles.retry}>
                      <Text style={[theme.typography.body, { color: theme.colors.link }]}>Retry</Text>
                    </Pressable>
                  </View>
                ) : null}

                {view.tasks.length === 0 && !tasks.isError && !tasks.isLoading ? (
                  <TaskEmptyState
                    title={query.search.length === 0 ? DATE_FILTER_EMPTY_TITLE[query.date] : 'No matching tasks'}
                    onAdd={() => router.push('/task/new')}
                  />
                ) : null}

                {view.sections.map((section) => (
                  <View key={section.id} style={styles.section}>
                    <SectionHeader
                      title={
                        section.isDone && query.status === 'All'
                          ? `Completed · ${sectionTitle(section.date, zone)}`
                          : sectionTitle(section.date, zone)
                      }
                      date={sectionDateLabel(section.date, zone)}
                      count={section.tasks.length}
                    />
                    {section.tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        timeZone={zone}
                        project={projects.data?.projects.find((item) => item.id === task.projectId)}
                        busy={busy}
                        onToggle={() => complete.mutate(task)}
                        onOpen={() => router.push(`/task/${task.id}`)}
                      />
                    ))}
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

/** Android: the shared chip row, cancelling `content`'s 20 so it scrolls to the screen edges. */
const PILL_SCROLL = androidChipScroll(20);

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // `.padding(.horizontal, 20)` with `VStack(spacing: 16)` (RootView.swift:1691, 1749).
  content: { flex: 1, paddingHorizontal: 20, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerText: { flex: 1, gap: 2 },
  // `.font(.system(.largeTitle, weight: .bold))`
  title: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  subtitle: { fontSize: 15, lineHeight: 20 },
  headerButtons: { flexDirection: 'row', gap: 10 },
  list: { gap: 12, paddingBottom: 24 },
  searchField: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, borderRadius: 16 },
  searchInput: { flex: 1, paddingVertical: 0 },
  searchClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  creationRow: { flexDirection: 'row', gap: 12 },
  creationColumn: { flexDirection: 'column' },
  grow: { flex: 1 },
  pills: { gap: 7 },
  // `VStack(alignment: .leading, spacing: 6)` (RootView.swift:1670).
  historyRange: { gap: 6 },
  historyRangeRow: { flexDirection: 'row', alignItems: 'center' },
  historyRangeTitle: { flex: 1, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  historyRangeValue: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  historyRangeCaption: { fontSize: 12, lineHeight: 16 },
  rangeMenu: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  rangeOption: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 16 },
  loading: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 30 },
  loadFailed: { alignItems: 'center', gap: 8, padding: 16 },
  retry: { minHeight: 44, justifyContent: 'center' },
  section: { gap: 8 },
});
