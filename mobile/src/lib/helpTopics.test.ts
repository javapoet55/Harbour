import { HELP_CATEGORIES, HELP_TOPICS, searchHelp } from './helpTopics';

/** Port of ios/Tests/NexdoCoreTests/HelpTopicsTests.swift. */

test('ten unique, answered questions per module', () => {
  expect(new Set(HELP_TOPICS.map((topic) => topic.id)).size).toBe(20);
  for (const category of HELP_CATEGORIES) {
    const topics = searchHelp('', category);
    expect(topics).toHaveLength(10);
    expect(topics.every((topic) => topic.question !== '' && topic.answer !== '')).toBe(true);
  }
});

test('search covers answers and keywords within the selected category', () => {
  expect(searchHelp('  GOOGLE  ').map((topic) => topic.id)).toContain('calendar-connect');
  expect(searchHelp('subtasks', 'Tasks').map((topic) => topic.id)).toEqual(['tasks-notes']);
  expect(searchHelp('Google', 'Tasks')).toEqual([]);
  expect(searchHelp('mark complete', 'Calendar').map((topic) => topic.id)).toContain('calendar-complete');
  expect(searchHelp('zzzz-no-topic')).toEqual([]);
  expect(searchHelp(' \n ')).toHaveLength(20);
});

test('search ignores accents, as localizedStandardContains does', () => {
  expect(searchHelp('pómodoro').map((topic) => topic.id)).toEqual(['tasks-focus']);
});
