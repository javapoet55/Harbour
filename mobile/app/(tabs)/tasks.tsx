import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { CreationCard, DatePill, HeaderButton, SectionHeader, TaskCard, TaskEmptyState, TaskSymbol, Text } from '../../src/components';
import { TasksTopBar, TodayBackdrop } from '../../src/components/TodayShell';
import { DATE_FILTER_EMPTY_TITLE, TASK_DATE_FILTERS, snapshot, type TaskDateFilter } from '../../src/lib/taskQuery';
import { sectionTitle } from '../../src/lib/taskLabels';
import { useProjects } from '../../src/query/useProjects';
import { useCompleteTask, useTasks, type ScheduleConflict } from '../../src/query/useTasks';
import { useSession } from '../../src/store/session';
import { useTaskQuery } from '../../src/store/taskQuery';
import { useTheme } from '../../src/theme';

/**
 * Port of `TasksView` (ios/App/RootView.swift:1620-1907).
 *
 * STRUCTURE NOTE, because it differs from the brief: Tasks and Projects are ONE screen in Swift, with
 * a segmented picker switching between a task list and an inline `ProjectsView()` (RootView.swift:1657).
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

  return (
    <View style={styles.fill}>
      <TodayBackdrop subtle />
      <View style={styles.content}>
        {/* TODO(phase3-decision): Swift opens `AccountView()` as a sheet here (RootView.swift:1700).
            The account screen is Phase 7, so the button is inert rather than routing to a path that
            does not exist yet and would render the not-found screen. */}
        <TasksTopBar name={profile?.name ?? ''} onAccount={() => undefined} />

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
              <HeaderButton icon="magnifyingglass" label="Search tasks" onPress={() => setSearching((value) => !value)} />
            </View>
          ) : null}
        </View>

        {/* `Picker(...).pickerStyle(.segmented)` (RootView.swift:1650-1655) */}
        <View style={[styles.segmented, { backgroundColor: theme.colors.groupedBackground }]}>
          {(['Tasks', 'Projects'] as const).map((label) => {
            const selected = (label === 'Projects') === showingProjects;
            return (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected }}
                onPress={() => setShowingProjects(label === 'Projects')}
                testID={`segment-${label}`}
                style={[styles.segment, selected && { backgroundColor: theme.colors.surface }]}
              >
                <Text style={[styles.segmentLabel, { color: theme.colors.ink }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {showingProjects ? (
          <ProjectsPlaceholder />
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
                  }}
                  style={styles.searchClose}
                >
                  <TaskSymbol name="xmark.circle.fill" size={20} color={theme.colors.secondary} />
                </Pressable>
              </View>
            ) : null}

            {/* `creationActions` (RootView.swift:1795-1801) */}
            <View style={styles.creationRow}>
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
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
                      <Text style={[theme.typography.body, { color: theme.colors.tint }]}>Retry</Text>
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

/**
 * TODO(phase3-decision): `ProjectsView()` renders inline here in Swift (RootView.swift:1658). The
 * projects screens are not built in this commit; see the Phase 3 status section of the migration plan.
 */
function ProjectsPlaceholder() {
  const theme = useTheme();
  return (
    <View style={styles.loading}>
      <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Projects arrive later in Phase 3.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // `.padding(.horizontal, 20)` with `VStack(spacing: 20)` (RootView.swift:1641, 1727).
  content: { flex: 1, paddingHorizontal: 20, gap: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerText: { flex: 1, gap: 2 },
  // `.font(.system(.largeTitle, weight: .bold))`
  title: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  subtitle: { fontSize: 15, lineHeight: 20 },
  headerButtons: { flexDirection: 'row', gap: 10 },
  segmented: { flexDirection: 'row', borderRadius: 9, padding: 2 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 32, borderRadius: 7 },
  segmentLabel: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  list: { gap: 12, paddingBottom: 24 },
  searchField: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, borderRadius: 16 },
  searchInput: { flex: 1, paddingVertical: 0 },
  searchClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  creationRow: { flexDirection: 'row', gap: 12 },
  pills: { gap: 7 },
  loading: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 30 },
  loadFailed: { alignItems: 'center', gap: 8, padding: 16 },
  retry: { minHeight: 44, justifyContent: 'center' },
  section: { gap: 8 },
});
