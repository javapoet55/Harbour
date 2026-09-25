import type { NexdoProject } from '../api/types';
import { standardContains } from './taskQuery';

/**
 * Port of `ProjectQuery` (ios/Sources/NexdoCore/Projects.swift:20-41) and the colour helpers in
 * `ProjectStyle` (ios/App/ProjectsView.swift:3-10).
 */

/** `ProjectQuery.palette` (Projects.swift:21). */
export const PROJECT_PALETTE = ['#8875ff', '#35bce6', '#ed4b9a', '#67be66', '#367de8', '#5b6abf'] as const;

/** `ProjectEditorView.colorName` (ProjectsView.swift:157-160). */
const COLOR_NAMES: Record<string, string> = {
  '#8875ff': 'Purple',
  '#35bce6': 'Cyan',
  '#ed4b9a': 'Pink',
  '#67be66': 'Green',
  '#367de8': 'Blue',
  '#5b6abf': 'Indigo',
};

export function projectColorName(color: string): string {
  return COLOR_NAMES[color] ?? 'Custom color';
}

/** `ProjectStyle.color(_:)` (ProjectsView.swift:6-9): an unparseable value falls back to the first swatch. */
export function projectColor(hex: string): string {
  const value = hex.replace(/#/g, '');
  return /^[0-9a-fA-F]{6}$/.test(value) ? `#${value.toLowerCase()}` : '#8875ff';
}

/** `ProjectQuery.validName` (Projects.swift:22): 1-80 characters once trimmed. */
export function isValidProjectName(name: string): boolean {
  const value = name.trim();
  // `value.utf16.count`: JavaScript string length is already UTF-16 code units.
  return value.length > 0 && value.length <= 80;
}

/** `NexdoProject.progress` (Projects.swift:10). */
export function projectProgress(project: NexdoProject): number {
  return project.totalTaskCount > 0 ? Math.min(1, project.completedTaskCount / project.totalTaskCount) : 0;
}

/** `ProjectSort` (Projects.swift:18-19). Raw values are the menu labels. */
export const PROJECT_SORTS = ['Recently updated', 'Name', 'Most tasks', 'Highest completion'] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];

/** `String.folding([.caseInsensitive, .diacriticInsensitive])` for the name sort (Projects.swift:29-31). */
function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('en-US');
}

/**
 * `ProjectQuery.results` (Projects.swift:23-40).
 *
 * Every branch falls through to `a.id < b.id` when the sort key ties, so the order is stable.
 */
export function projectResults(projects: NexdoProject[], search: string, sort: ProjectSort): NexdoProject[] {
  const term = search.trim();
  const visible = projects.filter((project) => term.length === 0 || standardContains(project.name, term));

  return [...visible].sort((a, b) => {
    switch (sort) {
      case 'Recently updated':
        // Descending: the most recent first. ISO-8601 strings compare correctly as strings.
        if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? -1 : 1;
        break;
      case 'Name': {
        const left = fold(a.name);
        const right = fold(b.name);
        if (left !== right) return left < right ? -1 : 1;
        break;
      }
      case 'Most tasks':
        if (a.totalTaskCount !== b.totalTaskCount) return a.totalTaskCount > b.totalTaskCount ? -1 : 1;
        break;
      case 'Highest completion': {
        const left = projectProgress(a);
        const right = projectProgress(b);
        if (left !== right) return left > right ? -1 : 1;
        break;
      }
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** `CalendarSearch.matches` (CalendarDates.swift:4-7): an empty query matches everything. */
export function searchMatches(title: string, query: string): boolean {
  const keyword = query.trim();
  return keyword.length === 0 || standardContains(title, keyword);
}
