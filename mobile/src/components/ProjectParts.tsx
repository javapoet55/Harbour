import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';

import type { NexdoProject, NexdoTask } from '../api/types';
import { projectColor, projectProgress } from '../lib/projectQuery';
import { isDone } from '../lib/taskQuery';
import { useTheme } from '../theme';
import { TaskSymbol } from './TaskSymbol';
import { Text } from './Text';

/**
 * The pieces of `ios/App/ProjectsView.swift`. `ProjectStyle`, `ProjectCard`, `ProjectFolder`,
 * `ProjectSearchField` and `TaskListRow` are all in that one file.
 */

/** `ProjectStyle.accent` (ProjectsView.swift:4): a purple distinct from `nexdoIndigo`. */
export const PROJECT_ACCENT = { light: '#4029C7', dark: '#B3A3FF' } as const;

export function useProjectAccent(): string {
  const theme = useTheme();
  return theme.scheme === 'dark' ? PROJECT_ACCENT.dark : PROJECT_ACCENT.light;
}

/** `projectCardSurface()` (ProjectsView.swift:93-98): the 20pt surface with a faint accent stroke. */
export function useProjectCardSurface(): ViewStyle {
  const theme = useTheme();
  const accent = useProjectAccent();
  return {
    // `ProjectStyle.surface.opacity(0.92)`
    backgroundColor: theme.scheme === 'dark' ? 'rgba(14, 13, 27, 0.92)' : withAlpha(theme.colors.surface, 0.92),
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(accent, 0.25),
  };
}

/** `ProjectFolder` (ProjectsView.swift:90-92): a 48pt gradient circle with a folder glyph. */
export function ProjectFolder({ color }: { color?: string }) {
  const theme = useTheme();
  const base = color ? projectColor(color) : theme.colors.secondary;
  return (
    <LinearGradient
      // SwiftUI's `color.gradient` is the colour shaded into itself; approximated as a light-to-dark ramp.
      colors={[base, shade(base, 0.82)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.folder}
    >
      <TaskSymbol name="folder" size={22} color="#FFFFFF" />
    </LinearGradient>
  );
}

/** `ProjectCard` (ProjectsView.swift:76-89). */
export function ProjectCard({ project, onPress }: { project: NexdoProject; onPress: () => void }) {
  const theme = useTheme();
  const surface = useProjectCardSurface();
  const color = projectColor(project.color);
  const open = Math.max(0, project.totalTaskCount - project.completedTaskCount);
  const progress = projectProgress(project);

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${project.name}. Open: ${open}   Done: ${project.completedTaskCount}`}
      accessibilityHint="Opens project tasks"
      onPress={onPress}
      testID={`project-card-${project.id}`}
      style={[styles.card, surface]}
    >
      <View style={styles.cardTop}>
        <ProjectFolder color={project.color} />
        <TaskSymbol name="chevron.right" size={13} color={theme.colors.secondary} />
      </View>
      <Text numberOfLines={3} style={[styles.cardName, { color: theme.colors.ink }]}>
        {project.name}
      </Text>
      <Text style={[styles.cardCounts, { color: theme.colors.secondary }]}>
        {`Open: ${open}   Done: ${project.completedTaskCount}`}
      </Text>
      {/* `ProgressView(value:)` tinted with the project colour. */}
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Completion"
        accessibilityValue={{ text: `${project.completedTaskCount} of ${project.totalTaskCount} tasks completed` }}
        style={[styles.track, { backgroundColor: withAlpha(theme.colors.secondary, 0.2) }]}
      >
        <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: color }]} />
      </View>
    </Pressable>
  );
}

/** `ProjectSearchField` (ProjectsView.swift:100-111). */
export function ProjectSearchField({
  placeholder,
  value,
  onChangeText,
  testID,
}: {
  placeholder: string;
  value: string;
  onChangeText: (next: string) => void;
  testID?: string;
}) {
  const theme = useTheme();
  const surface = useProjectCardSurface();
  return (
    <View style={[styles.searchField, surface]}>
      <TaskSymbol name="magnifyingglass" size={17} color={theme.colors.secondary} />
      <TextInput
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.secondary}
        value={value}
        onChangeText={onChangeText}
        autoCorrect={false}
        returnKeyType="search"
        style={[theme.typography.body, styles.searchInput, { color: theme.colors.ink }]}
        testID={testID}
      />
      {value.length > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChangeText('')} style={styles.clear}>
          <TaskSymbol name="xmark.circle.fill" size={20} color={theme.colors.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * `TaskListRow` (ProjectsView.swift:316-335) — the row the project detail uses, which is NOT the same
 * as the Tasks tab's `taskCard`: it has no completion button, and it surfaces a "Critical" line.
 */
export function TaskListRow({ task, subtitle, onPress }: { task: NexdoTask; subtitle: string; onPress: () => void }) {
  const theme = useTheme();
  const done = isDone(task);
  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={task.title}
      accessibilityHint="Opens task details"
      onPress={onPress}
      testID={`project-task-${task.id}`}
      style={[styles.listRow, { backgroundColor: withAlpha(theme.colors.surface, 0.88), borderColor: withAlpha(theme.colors.secondary, 0.16) }]}
    >
      <TaskSymbol name={done ? 'checkmark.circle.fill' : 'circle'} size={22} color={theme.colors.secondary} />
      <View style={styles.listRowText}>
        <Text style={[theme.typography.body, { color: theme.colors.ink }, done && styles.struck]}>{task.title}</Text>
        {task.critical === true || task.priority === 'CRITICAL' ? (
          <Text style={[styles.caption, { color: theme.colors.danger }]}>Critical</Text>
        ) : null}
        {subtitle.length > 0 ? <Text style={[styles.caption, { color: theme.colors.secondary }]}>{subtitle}</Text> : null}
      </View>
      <TaskSymbol name="chevron.right" size={13} color={theme.colors.secondary} />
    </Pressable>
  );
}

/** Darken a hex colour toward black by `factor`, for the folder's gradient ramp. */
function shade(hex: string, factor: number): string {
  const value = hex.replace('#', '');
  const int = parseInt(value, 16);
  const parts = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((part) => Math.round(part * factor));
  return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
}

export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgba')) return color.replace(/[\d.]+\)$/, `${alpha})`);
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  const hex = color.replace('#', '');
  const value = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
  const int = parseInt(value, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

const styles = StyleSheet.create({
  folder: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  card: { flex: 1, gap: 10, padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // `.font(.headline).lineLimit(3).frame(minHeight: 44, alignment: .topLeading)`
  cardName: { fontSize: 17, lineHeight: 22, fontWeight: '600', minHeight: 44 },
  cardCounts: { fontSize: 15, lineHeight: 20 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  searchField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, minHeight: 50 },
  searchInput: { flex: 1, paddingVertical: 0 },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // `.padding(18).frame(minHeight: 72)`, corner radius 17.
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, minHeight: 72, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth },
  listRowText: { flex: 1, gap: 5 },
  caption: { fontSize: 12, lineHeight: 16 },
  struck: { textDecorationLine: 'line-through' },
});
