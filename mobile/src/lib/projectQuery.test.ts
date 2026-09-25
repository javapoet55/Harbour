import type { NexdoProject } from '../api/types';
import {
  isValidProjectName,
  projectColor,
  projectColorName,
  projectProgress,
  projectResults,
  searchMatches,
} from './projectQuery';

function project(overrides: Partial<NexdoProject> & { id: string }): NexdoProject {
  return {
    name: 'A project',
    color: '#8875ff',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    completedTaskCount: 0,
    totalTaskCount: 0,
    ...overrides,
  };
}

/** `ProjectQuery.validName` (ios/Sources/NexdoCore/Projects.swift:22). */
describe('isValidProjectName', () => {
  it('rejects an empty or space-only name', () => {
    expect(isValidProjectName('')).toBe(false);
    expect(isValidProjectName('   ')).toBe(false);
  });

  it('accepts 1 to 80 characters, measured after trimming', () => {
    expect(isValidProjectName('a')).toBe(true);
    expect(isValidProjectName('x'.repeat(80))).toBe(true);
    expect(isValidProjectName('x'.repeat(81))).toBe(false);
    expect(isValidProjectName(`  ${'x'.repeat(80)}  `)).toBe(true);
  });
});

/** `ProjectStyle.color(_:)` (ios/App/ProjectsView.swift:6-9). */
describe('projectColor', () => {
  it('normalises a hex value with or without the hash', () => {
    expect(projectColor('#8875FF')).toBe('#8875ff');
    expect(projectColor('35bce6')).toBe('#35bce6');
  });

  it('falls back to the first swatch for an unparseable value', () => {
    expect(projectColor('not-a-colour')).toBe('#8875ff');
    expect(projectColor('')).toBe('#8875ff');
  });
});

describe('projectColorName', () => {
  it('names the palette swatches and labels anything else Custom color', () => {
    expect(projectColorName('#8875ff')).toBe('Purple');
    expect(projectColorName('#67be66')).toBe('Green');
    expect(projectColorName('#123456')).toBe('Custom color');
  });
});

/** `NexdoProject.progress` (Projects.swift:10). */
describe('projectProgress', () => {
  it('is zero when the project has no tasks, rather than dividing by zero', () => {
    expect(projectProgress(project({ id: 'p' }))).toBe(0);
  });

  it('is the completed fraction, capped at 1', () => {
    expect(projectProgress(project({ id: 'p', completedTaskCount: 1, totalTaskCount: 4 }))).toBe(0.25);
    expect(projectProgress(project({ id: 'p', completedTaskCount: 9, totalTaskCount: 4 }))).toBe(1);
  });
});

/** `ProjectQuery.results` (Projects.swift:23-40). */
describe('projectResults', () => {
  const projects = [
    project({ id: 'b', name: 'Home move', updatedAt: '2026-09-10T00:00:00.000Z', totalTaskCount: 4, completedTaskCount: 1 }),
    project({ id: 'a', name: 'apartment hunt', updatedAt: '2026-09-12T00:00:00.000Z', totalTaskCount: 2, completedTaskCount: 2 }),
    project({ id: 'c', name: 'Zürich trip', updatedAt: '2026-09-05T00:00:00.000Z', totalTaskCount: 9, completedTaskCount: 0 }),
  ];

  it('sorts by most recently updated, newest first', () => {
    expect(projectResults(projects, '', 'Recently updated').map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by name, ignoring case and diacritics', () => {
    expect(projectResults(projects, '', 'Name').map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by most tasks, descending', () => {
    expect(projectResults(projects, '', 'Most tasks').map((item) => item.id)).toEqual(['c', 'b', 'a']);
  });

  it('sorts by highest completion, descending', () => {
    expect(projectResults(projects, '', 'Highest completion').map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('breaks every tie by id, so the order is stable', () => {
    const tied = [
      project({ id: 'z', name: 'Same', updatedAt: '2026-09-01T00:00:00.000Z' }),
      project({ id: 'a', name: 'Same', updatedAt: '2026-09-01T00:00:00.000Z' }),
    ];
    for (const sort of ['Recently updated', 'Name', 'Most tasks', 'Highest completion'] as const) {
      expect(projectResults(tied, '', sort).map((item) => item.id)).toEqual(['a', 'z']);
    }
  });

  it('filters by name, ignoring case and diacritics', () => {
    expect(projectResults(projects, 'zurich', 'Name').map((item) => item.id)).toEqual(['c']);
    expect(projectResults(projects, 'HOME', 'Name').map((item) => item.id)).toEqual(['b']);
  });

  it('returns everything for a blank search', () => {
    expect(projectResults(projects, '   ', 'Name')).toHaveLength(3);
  });

  it('does not mutate the array it is given', () => {
    const input = [...projects];
    projectResults(input, '', 'Name');
    expect(input.map((item) => item.id)).toEqual(['b', 'a', 'c']);
  });
});

/** `CalendarSearch.matches` (CalendarDates.swift:4-7). */
describe('searchMatches', () => {
  it('matches everything for an empty or space-only query', () => {
    expect(searchMatches('No project', '')).toBe(true);
    expect(searchMatches('No project', '   ')).toBe(true);
  });

  it('matches a substring case-insensitively', () => {
    expect(searchMatches('No project', 'PROJ')).toBe(true);
    expect(searchMatches('No project', 'zzz')).toBe(false);
  });
});
