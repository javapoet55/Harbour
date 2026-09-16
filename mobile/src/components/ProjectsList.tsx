import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { NexdoTask } from '../api/types';
import { PROJECT_SORTS, projectResults, searchMatches, type ProjectSort } from '../lib/projectQuery';
import { isDone } from '../lib/taskQuery';
import { useProjects } from '../query/useProjects';
import { useTheme } from '../theme';
import { ProjectCard, ProjectFolder, ProjectSearchField, useProjectAccent, useProjectCardSurface, withAlpha } from './ProjectParts';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * Port of `ProjectsView` (ios/App/ProjectsView.swift:12-75).
 *
 * This renders INSIDE the Tasks tab's Projects segment, exactly as Swift does
 * (`RootView.swift:1658`) — it is not a screen of its own.
 */
export function ProjectsList({
  tasks,
  onOpenProject,
  onOpenUnassigned,
  onNewProject,
  onRefresh,
  refreshing = false,
}: {
  /** The task list, for the "No project" card's open/done counts. */
  tasks: NexdoTask[];
  onOpenProject: (id: string) => void;
  onOpenUnassigned: () => void;
  onNewProject: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  const theme = useTheme();
  const accent = useProjectAccent();
  const surface = useProjectCardSurface();
  const projects = useProjects();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ProjectSort>('Recently updated');
  const [sortOpen, setSortOpen] = useState(false);

  const visible = projectResults(projects.data?.projects ?? [], search, sort);
  const loaded = projects.isSuccess;
  // `CalendarSearch.matches("No project", query: search)` (ProjectsView.swift:44, 53).
  const showsUnassigned = searchMatches('No project', search);
  const unassigned = tasks.filter((task) => task.projectId == null && task.status !== 'CANCELLED');

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.searchRow}>
        <ProjectSearchField placeholder="Search projects" value={search} onChangeText={setSearch} testID="project-search" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sort projects"
          accessibilityValue={{ text: sort }}
          onPress={() => setSortOpen((open) => !open)}
          testID="project-sort"
          style={[styles.sortButton, surface]}
        >
          <TaskSymbol name="slider.horizontal.3" size={20} color={accent} />
        </Pressable>
      </View>

      {/* `Menu { Picker("Sort projects", ...) }` (ProjectsView.swift:25-27), as an inline list. */}
      {sortOpen ? (
        <View style={[styles.sortMenu, surface]}>
          {PROJECT_SORTS.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={option}
              accessibilityState={{ selected: sort === option }}
              onPress={() => {
                setSort(option);
                setSortOpen(false);
              }}
              testID={`project-sort-${option}`}
              style={styles.sortOption}
            >
              <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{option}</Text>
              {sort === option ? <Text style={[theme.typography.body, { color: accent }]}>✓</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.ink }]}>
          Projects
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="New project" onPress={onNewProject} testID="new-project" style={styles.newProject}>
          <TaskSymbol name="plus" size={15} color={accent} />
          <Text style={[styles.newProjectLabel, { color: accent }]}>New project</Text>
        </Pressable>
      </View>

      {projects.isLoading && !loaded ? (
        <View style={styles.centre}>
          <ActivityIndicator />
          <Text style={[theme.typography.body, { color: theme.colors.secondary }]}>Loading projects…</Text>
        </View>
      ) : null}

      {projects.isError ? (
        <View style={styles.error}>
          <Text style={[styles.subheadline, { color: theme.colors.danger }]}>Couldn’t load your projects.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={onRefresh} style={styles.retry} testID="projects-retry">
            <Text style={[theme.typography.body, { color: accent }]}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {/* `ContentUnavailableView` (ProjectsView.swift:45-47) */}
      {loaded && visible.length === 0 && (search.length === 0 || !showsUnassigned) ? (
        <View style={styles.empty}>
          <TaskSymbol name="folder" size={38} color={theme.colors.secondary} />
          <Text style={[styles.emptyTitle, { color: theme.colors.ink }]}>
            {search.length === 0 ? 'Organize your tasks' : 'No matching projects'}
          </Text>
          <Text style={[styles.subheadline, styles.centred, { color: theme.colors.secondary }]}>
            {search.length === 0 ? 'Create a project to keep related tasks together.' : 'Try a different project name.'}
          </Text>
        </View>
      ) : null}

      {/* `LazyVGrid` of two flexible columns (ProjectsView.swift:48-52). */}
      <View style={styles.grid}>
        {visible.map((project) => (
          <View key={project.id} style={styles.gridCell}>
            <ProjectCard project={project} onPress={() => onOpenProject(project.id)} />
          </View>
        ))}
      </View>

      {/* The "No project" card (ProjectsView.swift:53-66). */}
      {loaded && showsUnassigned ? (
        <Pressable
          accessible
          accessibilityRole="button"
          accessibilityLabel="No project"
          accessibilityHint="Opens unassigned tasks"
          onPress={onOpenUnassigned}
          testID="project-card-unassigned"
          style={[styles.unassigned, surface]}
        >
          <ProjectFolder />
          <View style={styles.grow}>
            <Text style={[styles.cardName, { color: theme.colors.ink }]}>No project</Text>
            <Text style={[styles.subheadline, { color: theme.colors.secondary }]}>
              {`Open: ${unassigned.filter((task) => !isDone(task)).length}   Done: ${unassigned.filter(isDone).length}`}
            </Text>
          </View>
          <TaskSymbol name="chevron.right" size={15} color={theme.colors.secondary} />
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 20, paddingBottom: 20 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sortButton: { width: 48, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  sortMenu: { overflow: 'hidden' },
  sortOption: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // `.font(.title2.bold())`
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  newProject: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 },
  newProjectLabel: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  centre: { alignItems: 'center', gap: 8, padding: 16 },
  error: { gap: 8, padding: 4 },
  retry: { minHeight: 44, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  emptyTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  subheadline: { fontSize: 15, lineHeight: 20 },
  centred: { textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // Two flexible columns; `minWidth` keeps a single column on a narrow phone, as Swift's
  // `geometry.size.width < 340` check does.
  gridCell: { flexGrow: 1, flexBasis: '46%', minWidth: 150 },
  unassigned: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18 },
  cardName: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  grow: { flex: 1 },
});

export { withAlpha };
