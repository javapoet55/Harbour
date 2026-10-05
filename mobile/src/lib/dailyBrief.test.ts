import type { NexdoTask } from '../api';
import {
  briefDetailCopy,
  briefHelpQuery,
  briefIsUseful,
  briefingIntent,
  briefStyle,
  briefTask,
  briefTaskTitleMatches,
  capitalized,
  visibleBriefSections,
} from './dailyBrief';

const task = (title: string, status = 'PLANNED', id = title): NexdoTask => ({ id, title, status, priority: 'NORMAL', durationMin: 30 });

/** `BriefContent` (ios/Sources/NexdoCore/AssistantPresentation.swift:27-43). */
describe('BriefContent', () => {
  // briefingDoesNotTreatEmptyStatementsAsActions (ios/Tests/NexdoCoreTests/AssistantPresentationTests.swift:40-45)
  it('does not treat empty statements as actions', () => {
    for (const value of [
      'none detected',
      'No tasks are scheduled for today.',
      'No calendar appointment conflicts are visible.',
      'There’s no overloaded block showing for today.',
      'The main risk is drift: without a chosen priority, today can slip by unused.',
      '1 task calendar link(s) changed outside Nexdo.',
    ]) {
      expect(briefIsUseful(value)).toBe(false);
    }
    expect(briefIsUseful('Review proposal — overdue')).toBe(true);
    expect(briefIsUseful('   ')).toBe(false);
  });

  // briefingTaskMatchingRequiresAnActualTitleLead (:47-52)
  it('matches a task only when its whole title leads the line', () => {
    expect(briefTaskTitleMatches('appointment', 'No calendar appointment conflicts are visible.')).toBe(false);
    expect(briefTaskTitleMatches('Bill', 'Bill Payment — scheduled work')).toBe(false);
    expect(briefTaskTitleMatches('Bill Payment', '1. Bill Payment — overdue')).toBe(true);
    expect(briefTaskTitleMatches('Review proposal', 'Review proposal is due today.')).toBe(true);
    expect(briefTaskTitleMatches('Review proposal', 'review PROPOSAL')).toBe(true);
    expect(briefTaskTitleMatches('Pay (rent)', '2) Pay (rent): due Friday')).toBe(true);
    expect(briefTaskTitleMatches('  ', 'anything')).toBe(false);
  });
});

/** `visibleSections` (ios/App/DailyBriefView.swift:9-20). */
describe('visibleBriefSections', () => {
  const tasks = [task('Contact gutter technician'), task('Pay rent', 'COMPLETED'), task('File taxes', 'CANCELLED')];

  it('drops freshness, useless lines, and priorities that name no open task', () => {
    expect(
      visibleBriefSections(
        [
          { title: 'Top priorities', items: ['Contact gutter technician is overdue.', 'Pay rent — today', 'File taxes: soon', 'Review the plumbing quote.'] },
          { title: 'Calendar Freshness', items: ['Synced.'] },
          { title: 'Focus', items: ['nothing to report'] },
          { title: 'Deadlines', items: ['Send the report by 4 PM.', 'none detected'] },
        ],
        tasks,
      ),
    ).toEqual([
      { title: 'Top priorities', items: ['Contact gutter technician is overdue.'] },
      { title: 'Deadlines', items: ['Send the report by 4 PM.'] },
    ]);
  });

  it('finds exactly one open task for a line, or none', () => {
    expect(briefTask(tasks, 'Contact gutter technician — call today')?.id).toBe('Contact gutter technician');
    expect(briefTask(tasks, 'Pay rent — today')).toBeNull();
    expect(briefTask([task('Call mum', 'PLANNED', 'a'), task('Call mum', 'PLANNED', 'b')], 'Call mum')).toBeNull();
  });
});

describe('briefingIntent', () => {
  const query = 'Give me my full day briefing for today: priorities, deadlines, conflicts, and my next move.';
  it('is the intent whose query was exactly the prompt, for the four briefing intents only', () => {
    expect(briefingIntent(query, false, false)).toBe('dailyBriefing');
    expect(briefingIntent('Find practical free time in my schedule around my calendar commitments using my availability.', false, false)).toBe('findScheduleTime');
    expect(briefingIntent('Do I have enough time to finish everything tomorrow? Consider tasks, events, deadlines, and estimated durations.', false, false)).toBeNull();
    expect(briefingIntent(`${query} `, false, false)).toBeNull();
    expect(briefingIntent(query, true, false)).toBeNull();
    expect(briefingIntent(query, false, true)).toBeNull();
    expect(briefingIntent(null, false, false)).toBeNull();
  });
});

/** `style(_:)` (DailyBriefView.swift:153-164). */
describe('briefStyle', () => {
  it('renames, illustrates and colours each kind of section', () => {
    expect(briefStyle('AI Response')).toEqual({ title: 'AI Response', artwork: 'lightbulb', tone: 'green' });
    expect(briefStyle('Top priorities')).toEqual({ title: 'Top Priorities', artwork: 'priority', tone: 'pink' });
    expect(briefStyle('Focus areas')).toEqual({ title: 'Top Priorities', artwork: 'priority', tone: 'pink' });
    expect(briefStyle('Deadlines this week')).toEqual({ title: 'Upcoming Deadlines', artwork: 'calendar', tone: 'blue' });
    expect(briefStyle('Conflicts and risks')).toEqual({ title: 'Conflicts & Risks', artwork: 'warning', tone: 'orange' });
    expect(briefStyle('Next move')).toEqual({ title: 'Next Move', artwork: 'lightbulb', tone: 'green' });
    expect(briefStyle('available TIME slots')).toEqual({ title: 'Available Time Slots', artwork: 'calendar', tone: 'blue' });
    expect(briefStyle('wins so far')).toEqual({ title: 'Wins So Far', artwork: 'lightbulb', tone: 'green' });
  });

  it('capitalizes like Foundation: whitespace-delimited words only', () => {
    expect(capitalized('free-time block')).toBe('Free-time Block');
  });
});

describe('the section page copy', () => {
  it('counts items to focus on or review, and builds the help request', () => {
    expect(briefDetailCopy('Top Priorities', 1)).toEqual({ priority: true, subtitle: '1 item to focus on', heading: 'Focus on what matters' });
    expect(briefDetailCopy('Upcoming Deadlines', 2)).toEqual({ priority: false, subtitle: '2 items to review', heading: 'Your upcoming deadlines' });
    expect(briefDetailCopy('AI Response', 1).heading).toBe('Your AI response');
    expect(briefHelpQuery('Upcoming Deadlines', ['a', 'b'])).toBe('Help me with these upcoming deadlines:\na\nb');
  });
});
