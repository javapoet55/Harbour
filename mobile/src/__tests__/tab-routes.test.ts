import fs from 'node:fs';
import path from 'node:path';

const APP = path.join(__dirname, '..', '..', 'app');

/** The URL Expo Router serves a file at: group segments in parentheses are stripped, so is `/index`. */
function urlFor(routeFile: string): string {
  const withoutExtension = routeFile.replace(/\.tsx$/, '');
  const segments = withoutExtension
    .split('/')
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')));
  const joined = segments.join('/').replace(/\/index$/, '');
  return `/${joined}`;
}

function exists(routeFile: string): boolean {
  return fs.existsSync(path.join(APP, routeFile));
}

/**
 * SwiftUI pushes a detail screen inside the selected tab's `NavigationStack`, so the tab bar stays
 * on screen. Expo Router only keeps the bar for routes that are DESCENDANTS of the `(tabs)` layout —
 * a route declared as a sibling unmounts the tab navigator and the bar disappears, silently and with
 * nothing in the logs.
 *
 * These assertions are about file placement because that is exactly what decides it. If a route is
 * moved back out of `(tabs)`, the tab bar goes with it.
 */
describe('routes Swift pushes stay inside the tab navigator', () => {
  const PUSHED: { file: string; url: string; swift: string }[] = [
    { file: '(tabs)/(tasks)/project/[id]/index.tsx', url: '/project/[id]', swift: 'NavigationLink (ProjectsView.swift:50, 54)' },
    { file: '(tabs)/(today)/today/schedule-check.tsx', url: '/today/schedule-check', swift: '.navigationDestination (RootView.swift:1190)' },
    { file: '(tabs)/(today)/today/overdue.tsx', url: '/today/overdue', swift: '.navigationDestination (RootView.swift:1193)' },
    { file: '(tabs)/(today)/today/weekly-summary.tsx', url: '/today/weekly-summary', swift: '.navigationDestination (RootView.swift:1196)' },
    // Pushed from weekly-summary, which is itself pushed.
    { file: '(tabs)/(today)/today/weekly-tasks.tsx', url: '/today/weekly-tasks', swift: 'NavigationLink (WeeklySummaryView.swift:104, 110)' },
    // Phase 11: pushed from the Quick Access tiles into Today's stack (TodayQuickAccess.swift:68, :72),
    // and on from there, so the bar stays — UI-parity pass 2.
    { file: '(tabs)/(today)/moments/index.tsx', url: '/moments', swift: 'NavigationLink (TodayQuickAccess.swift:68)' },
    { file: '(tabs)/(today)/moments/manage.tsx', url: '/moments/manage', swift: '.navigationDestination (ImportantMomentsView.swift:301)' },
    { file: '(tabs)/(today)/moments/review.tsx', url: '/moments/review', swift: 'NavigationLink (ImportantMomentsView.swift:109)' },
    { file: '(tabs)/(today)/moments/wish.tsx', url: '/moments/wish', swift: 'NavigationLink (ImportantMomentsView.swift:274)' },
    { file: '(tabs)/(today)/shopping/index.tsx', url: '/shopping', swift: 'NavigationLink (TodayQuickAccess.swift:72)' },
    { file: '(tabs)/(today)/shopping/[id].tsx', url: '/shopping/[id]', swift: 'NavigationLink (ShoppingViews.swift:107)' },
  ];

  it.each(PUSHED)('$url is under (tabs) — Swift uses $swift', ({ file }) => {
    expect(exists(file)).toBe(true);
    expect(file.startsWith('(tabs)/')).toBe(true);
  });

  it.each(PUSHED)('$url keeps its URL after the move', ({ file, url }) => {
    expect(urlFor(file)).toBe(url);
  });

  it('serves the two tab roots at the URLs they had before', () => {
    expect(urlFor('(tabs)/(today)/today/index.tsx')).toBe('/today');
    expect(urlFor('(tabs)/(tasks)/tasks.tsx')).toBe('/tasks');
  });

  /**
   * `(tasks)` has to stay a *group*. Renaming it to a plain `tasks` directory would prefix every
   * project route with `/tasks`, which is the trap this layout exists to avoid.
   */
  it('keeps the project routes at the top level by grouping the tasks tab', () => {
    expect(urlFor('(tabs)/(tasks)/project/new.tsx')).toBe('/project/new');
    expect(urlFor('(tabs)/(tasks)/project/[id]/edit.tsx')).toBe('/project/[id]/edit');
  });

  /**
   * Swift presents these as `.sheet` or `.fullScreenCover`, which cover the tab bar on iOS too, so
   * they are correct as siblings of `(tabs)` and must not be swept into a tab stack.
   */
  it.each([
    ['task/new.tsx', '.sheet (RootView.swift:1700)'],
    ['task/[id].tsx', '.sheet (RootView.swift:1703)'],
    ['task/filters.tsx', '.sheet (RootView.swift:1708)'],
    ['task/voice-capture.tsx', '.fullScreenCover (RootView.swift:1701)'],
    ['account/index.tsx', '.sheet (RootView.swift:1702)'],
    ['action/[id].tsx', '.sheet (RootView.swift:59)'],
    ['calendar/conflicts.tsx', '.sheet (CalendarView.swift:163)'],
    ['today/do-now.tsx', '.sheet (RootView.swift:1180)'],
    ['today/weather.tsx', '.sheet (RootView.swift:1337)'],
    // Phase 11: Needs attention is a `[.medium, .large]` sheet (RootView.swift:1188-1191), and
    // Reschedule all is a sheet over it (TodayAttentionSheet.swift:87-98). Both are root form sheets.
    ['attention.tsx', '.sheet (RootView.swift:1188)'],
    ['reschedule-all.tsx', '.sheet (TodayAttentionSheet.swift:87)'],
  ])('%s is presented as a sheet in Swift, so it covers the bar — %s', (file) => {
    // do-now and weather moved with the Today stack but are declared `presentation: 'modal'`, which
    // covers the bar; everything else is a sibling of `(tabs)`.
    const inTabs = exists(path.join('(tabs)', '(today)', file));
    expect(inTabs || exists(file)).toBe(true);
  });

  it('presents Needs attention and Reschedule all from the ROOT stack, so they cover the bar', () => {
    expect(exists('attention.tsx')).toBe(true);
    expect(exists('reschedule-all.tsx')).toBe(true);
    expect(exists('(tabs)/(today)/today/attention.tsx')).toBe(false);
    const root = fs.readFileSync(path.join(APP, '_layout.tsx'), 'utf8');
    expect(root).toMatch(/name="attention" options=\{SHEET_OPTIONS\}/);
    expect(root).toMatch(/name="reschedule-all" options=\{SHEET_OPTIONS\}/);
  });
});

/**
 * The reminder notification routing from Phase 8 does not touch any of the five moved routes — it
 * opens `/action/[id]`, which is a `.sheet` in Swift (RootView.swift:59-62) and stayed where it was.
 * Asserted rather than assumed, because "it doesn't touch these" was a premise of moving them.
 */
describe('reminder notification routing is unaffected by the move', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'actions', 'useActionNotifications.ts'), 'utf8');

  it('routes a notification tap to /action/[id]', () => {
    expect(source).toContain("pathname: '/action/[id]'");
  });

  it('names none of the moved routes', () => {
    for (const moved of ['/project/', '/today/attention', '/today/schedule-check', '/today/overdue', '/today/weekly-summary']) {
      expect(source).not.toContain(moved);
    }
  });

  it('still resolves /action/[id] to a route file outside the tab stacks', () => {
    expect(exists('action/[id].tsx')).toBe(true);
    expect(exists('(tabs)/action/[id].tsx')).toBe(false);
  });
});
