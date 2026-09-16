import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { projectColor, projectResults } from '../lib/projectQuery';
import { useProjects } from '../query/useProjects';
import { useTheme } from '../theme';
import { ProjectFolder, useProjectAccent, useProjectCardSurface } from './ProjectParts';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * Port of `ProjectAssignmentField` (ios/App/ProjectsView.swift:295-315).
 *
 * Swift uses a `Menu` whose items are "No project" followed by every project sorted by NAME (not by
 * the list's current sort). React Native has no menu primitive, so the same options render as an
 * inline list that opens under the field — the pattern the sort control on the projects list uses too.
 */
export function ProjectAssignmentField({
  projectID,
  onChange,
}: {
  projectID: string | null;
  onChange: (next: string | null) => void;
}) {
  const theme = useTheme();
  const accent = useProjectAccent();
  const surface = useProjectCardSurface();
  const projects = useProjects();
  const [open, setOpen] = useState(false);

  const options = projectResults(projects.data?.projects ?? [], '', 'Name');
  const selected = options.find((project) => project.id === projectID);
  // `selected?.name ?? (projectID == nil ? "No project" : "Assigned project")` — a project the list
  // has not loaded yet still shows as assigned rather than silently reading "No project".
  const label = selected?.name ?? (projectID === null ? 'No project' : 'Assigned project');

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Project"
        accessibilityValue={{ text: label }}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        testID="project-field"
        style={[styles.field, surface]}
      >
        <TaskSymbol name="folder.fill" size={17} color={selected ? projectColor(selected.color) : theme.colors.secondary} />
        <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{label}</Text>
        <TaskSymbol name="chevron.right" size={13} color={theme.colors.secondary} />
      </Pressable>

      {open ? (
        <View style={[styles.menu, surface]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="No project"
            accessibilityState={{ selected: projectID === null }}
            onPress={() => {
              onChange(null);
              setOpen(false);
            }}
            testID="project-option-none"
            style={styles.option}
          >
            <TaskSymbol name="folder" size={17} color={theme.colors.secondary} />
            <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>No project</Text>
            {projectID === null ? <Text style={[theme.typography.body, { color: accent }]}>✓</Text> : null}
          </Pressable>

          {options.map((project) => (
            <Pressable
              key={project.id}
              accessibilityRole="button"
              accessibilityLabel={project.name}
              accessibilityState={{ selected: project.id === projectID }}
              onPress={() => {
                onChange(project.id);
                setOpen(false);
              }}
              testID={`project-option-${project.id}`}
              style={styles.option}
            >
              <TaskSymbol
                name={project.id === projectID ? 'checkmark' : 'folder'}
                size={17}
                color={projectColor(project.color)}
              />
              <Text style={[theme.typography.body, styles.grow, { color: theme.colors.ink }]}>{project.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {projects.isError ? (
        <View style={styles.status}>
          <Text style={[styles.caption, { color: theme.colors.secondary }]}>Couldn’t load your projects.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry projects"
            onPress={() => void projects.refetch()}
            style={styles.retry}
            testID="project-field-retry"
          >
            <Text style={[theme.typography.body, { color: accent }]}>Retry projects</Text>
          </Pressable>
        </View>
      ) : null}

      {projects.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" />
          <Text style={[styles.caption, { color: theme.colors.secondary }]}>Loading projects…</Text>
        </View>
      ) : null}
    </View>
  );
}

/** `ProjectFolder` re-exported so the editor can show the selected colour beside the label. */
export { ProjectFolder };

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  // `.padding(.horizontal, 14).frame(minHeight: 48)`
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 48 },
  menu: { overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 14 },
  grow: { flex: 1 },
  status: { gap: 4 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  caption: { fontSize: 12, lineHeight: 16 },
  retry: { minHeight: 44, justifyContent: 'center' },
});
