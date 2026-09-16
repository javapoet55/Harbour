import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { TaskSymbol, Text } from '../../../src/components';
import { ProjectFolder, ProjectSearchField, TaskListRow, useProjectAccent } from '../../../src/components/ProjectParts';
import { TodayBackdrop } from '../../../src/components/TodayShell';
import { projectColor, searchMatches } from '../../../src/lib/projectQuery';
import { dayKey, isDone, parseServerDate } from '../../../src/lib/taskQuery';
import { useDeleteProject, useProject, useProjects } from '../../../src/query/useProjects';
import { useTasks } from '../../../src/query/useTasks';
import { useSession } from '../../../src/store/session';
import { useTheme } from '../../../src/theme';

/**
 * Port of `ProjectDetailView` (ios/App/ProjectsView.swift:173-294).
 *
 * `projectID` is nullable in Swift: the "No project" card opens the same screen with `nil`, listing
 * unassigned tasks. Here that is the reserved path segment `unassigned`, because a route cannot carry
 * a null id.
 */
export default function ProjectDetail() {
  const theme = useTheme();
  const accent = useProjectAccent();
  const { id } = useLocalSearchParams<{ id: string }>();
  // The "No project" folder.
  const projectID = id === 'unassigned' ? null : (id ?? null);

  const profile = useSession((state) => state.profile);
  const projects = useProjects();
  const project = useProject(projectID ?? undefined);
  const tasks = useTasks();
  const remove = useDeleteProject();

  const [search, setSearch] = useState('');
  // "Project folders open to actionable work" (ProjectsView.swift:178-180).
  const [status, setStatus] = useState<'All' | 'Open' | 'Completed'>('Open');
  const [priority, setPriority] = useState('All');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Hoisted: narrowing `tasks` by `isLoading` collapses `data` to `never`.
  const loaded = tasks.data;
  const zone = profile?.timeZone ?? loaded?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const missing = projectID !== null && projects.isSuccess && !project;

  /** `tasks` (ProjectsView.swift:187-191): filter, then sort by done-ness and title. */
  const visible = (loaded?.tasks ?? [])
    .filter(
      (task) =>
        (task.projectId ?? null) === projectID &&
        task.status !== 'CANCELLED' &&
        searchMatches(task.title, search) &&
        (status === 'All' || (status === 'Completed' ? isDone(task) : !isDone(task))) &&
        (priority === 'All' || task.priority === priority),
    )
    .sort((a, b) => {
      const leftDone = isDone(a);
      const rightDone = isDone(b);
      if (leftDone !== rightDone) return leftDone ? 1 : -1;
      if (a.title === b.title) return a.id < b.id ? -1 : 1;
      return a.title.localeCompare(b.title, 'en-US', { sensitivity: 'base' });
    });

  /** `subtitle(_:)` (ProjectsView.swift:282-286): "30 min · 2026-09-16". */
  const subtitleFor = (task: (typeof visible)[number]) => {
    const scheduled = parseServerDate(task.startAt ?? task.dueAt);
    const date = scheduled === null ? '' : ` · ${dayKey(scheduled, task.timeZone ?? zone)}`;
    return `${task.durationMin} min${date}`;
  };

  const refresh = () => {
    void tasks.refetch();
    void projects.refetch();
  };

  const confirmDelete = () => {
    if (!project) return;
    // `.confirmationDialog` (ProjectsView.swift:269-273).
    Alert.alert('Delete this project?', 'Its tasks will move to No project. No tasks will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete project',
        style: 'destructive',
        onPress: () => remove.mutate(project.id, { onSuccess: () => router.back() }),
      },
    ]);
  };

  const title = project?.name ?? 'No project';

  return (
    <View style={styles.fill}>
      <TodayBackdrop subtle />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={tasks.isRefetching} onRefresh={refresh} />}
      >
        <View style={styles.headerRow}>
          <ProjectFolder color={project?.color} />
          <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.ink }]} testID="project-title">
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add task to ${title}`}
            accessibilityState={{ disabled: remove.isPending || missing }}
            disabled={remove.isPending || missing}
            onPress={() => router.push({ pathname: '/task/new', params: projectID ? { projectId: projectID } : {} })}
            testID="project-add-task"
            style={[styles.addButton, { backgroundColor: accent }]}
          >
            <TaskSymbol name="plus" size={20} color="#FFFFFF" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Project actions"
            accessibilityState={{ disabled: remove.isPending || missing }}
            disabled={remove.isPending || missing}
            onPress={() => setMenuOpen((open) => !open)}
            testID="project-actions"
            style={styles.menuButton}
          >
            <Text style={[styles.menuGlyph, { color: accent }]}>···</Text>
          </Pressable>
        </View>

        {/* The toolbar `Menu` (ProjectsView.swift:260-268), as an inline list. */}
        {menuOpen ? (
          <View style={[styles.menu, { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}>
            <MenuRow
              label="Add task"
              onPress={() => {
                setMenuOpen(false);
                router.push({ pathname: '/task/new', params: projectID ? { projectId: projectID } : {} });
              }}
              testID="menu-add-task"
            />
            {project ? (
              <>
                <MenuRow
                  label="Edit project"
                  onPress={() => {
                    setMenuOpen(false);
                    router.push(`/project/${project.id}/edit`);
                  }}
                  testID="menu-edit-project"
                />
                <MenuRow
                  label="Delete project"
                  destructive
                  last
                  onPress={() => {
                    setMenuOpen(false);
                    confirmDelete();
                  }}
                  testID="menu-delete-project"
                />
              </>
            ) : null}
          </View>
        ) : null}

        <View style={styles.searchRow}>
          <ProjectSearchField placeholder="Search tasks" value={search} onChangeText={setSearch} testID="project-task-search" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filter project tasks"
            onPress={() => setFiltersOpen((open) => !open)}
            testID="project-filters"
            style={styles.filterButton}
          >
            <TaskSymbol name="slider.horizontal.3" size={20} color={accent} />
          </Pressable>
        </View>

        {filtersOpen ? (
          <View style={[styles.menu, { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}>
            {(['All', 'Open', 'Completed'] as const).map((option) => (
              <MenuRow
                key={option}
                label={option}
                selected={status === option}
                onPress={() => setStatus(option)}
                testID={`project-status-${option}`}
              />
            ))}
            {/* `Picker("Priority", ...)` over ["All", "LOW", "NORMAL", "HIGH", "CRITICAL"] (ProjectsView.swift:212). */}
            {['All', 'LOW', 'NORMAL', 'HIGH', 'CRITICAL'].map((option) => (
              <MenuRow
                key={option}
                label={option === 'All' ? 'All priorities' : option.charAt(0) + option.slice(1).toLowerCase()}
                selected={priority === option}
                onPress={() => setPriority(option)}
                testID={`project-priority-${option}`}
              />
            ))}
            <MenuRow
              label="Reset filters"
              last
              onPress={() => {
                setStatus('Open');
                setPriority('All');
              }}
              testID="project-reset-filters"
            />
          </View>
        ) : null}

        {tasks.isError ? (
          <View style={styles.status}>
            <Text style={[theme.typography.body, { color: theme.colors.ink }]}>Couldn’t refresh tasks. Showing saved tasks.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={refresh} style={styles.retry} testID="project-tasks-retry">
              <Text style={[theme.typography.body, { color: accent }]}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {tasks.isLoading && (loaded?.tasks.length ?? 0) === 0 ? (
          <View style={styles.centre}>
            <ActivityIndicator />
            <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Loading tasks…</Text>
          </View>
        ) : missing ? (
          <View style={styles.centre}>
            <TaskSymbol name="folder" size={38} color={theme.colors.secondary} />
            <Text style={[styles.emptyTitle, { color: theme.colors.ink }]}>Project unavailable</Text>
            <Text style={[styles.subheadline, styles.centred, { color: theme.colors.secondary }]}>
              This project may have been deleted.
            </Text>
          </View>
        ) : (
          <>
            {visible.length > 0 ? (
              <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>
                {visible.length} {visible.length === 1 ? 'task' : 'tasks'}
              </Text>
            ) : null}

            {visible.length === 0 ? (
              <>
                <View style={styles.emptyBlock}>
                  <TaskSymbol name="checklist" size={38} color={theme.colors.secondary} />
                  <Text style={[styles.emptyBody, styles.centred, { color: theme.colors.secondary }]}>
                    {search.length === 0 && status === 'Open' && priority === 'All'
                      ? 'You don’t have any open tasks.'
                      : 'No matching tasks'}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Add task to ${project?.name ?? 'project'}`}
                  onPress={() => router.push({ pathname: '/task/new', params: projectID ? { projectId: projectID } : {} })}
                  testID="project-empty-add"
                  style={[styles.addTaskCapsule, { backgroundColor: projectColor(project?.color ?? '#8875ff') }]}
                >
                  <Text style={[styles.addTaskLabel, { color: '#FFFFFF' }]}>Add task</Text>
                </Pressable>
              </>
            ) : null}

            <View style={styles.list}>
              {visible.map((task) => (
                <TaskListRow key={task.id} task={task} subtitle={subtitleFor(task)} onPress={() => router.push(`/task/${task.id}`)} />
              ))}
            </View>
          </>
        )}

        {remove.isPending ? (
          <View style={styles.centre}>
            <ActivityIndicator />
            <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Deleting project…</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function MenuRow({
  label,
  onPress,
  selected = false,
  destructive = false,
  last = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  destructive?: boolean;
  last?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const accent = useProjectAccent();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={testID}
      style={[styles.menuRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.separator }]}
    >
      <Text style={[theme.typography.body, styles.grow, { color: destructive ? theme.colors.danger : theme.colors.ink }]}>{label}</Text>
      {selected ? <Text style={[theme.typography.body, { color: accent }]}>✓</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { padding: 20, gap: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontSize: 22, lineHeight: 28, fontWeight: '700' },
  addButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  menuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  menuGlyph: { fontSize: 22, lineHeight: 26, fontWeight: '700' },
  menu: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 16 },
  grow: { flex: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filterButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  status: { gap: 6 },
  retry: { minHeight: 44, justifyContent: 'center' },
  centre: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  centred: { textAlign: 'center' },
  emptyTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  // `.frame(maxWidth: .infinity, minHeight: 260)` (ProjectsView.swift:234).
  emptyBlock: { alignItems: 'center', justifyContent: 'center', gap: 14, minHeight: 260 },
  emptyBody: { fontSize: 20, lineHeight: 25 },
  subheadline: { fontSize: 15, lineHeight: 20 },
  addTaskCapsule: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26 },
  addTaskLabel: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  list: { gap: 12 },
});
