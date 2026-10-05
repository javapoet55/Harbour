import { feedbackCounter, feedbackValid, starLabel, starsCaption } from './feedback';

/** FeedbackView.swift:14-40. */

test('valid needs both texts, their limits in UTF-16 units, and 1–5 stars', () => {
  expect(feedbackValid({ title: 'Idea', description: 'More themes', stars: 4 })).toBe(true);
  expect(feedbackValid({ title: '   ', description: 'x', stars: 4 })).toBe(false);
  expect(feedbackValid({ title: 'x', description: '\n', stars: 4 })).toBe(false);
  expect(feedbackValid({ title: 'x', description: 'y', stars: 0 })).toBe(false);
  expect(feedbackValid({ title: 'x', description: 'y', stars: 6 })).toBe(false);
  expect(feedbackValid({ title: 'a'.repeat(160), description: 'y', stars: 1 })).toBe(true);
  // 80 emoji are 160 UTF-16 units; one more is over, as the server counts it.
  expect(feedbackValid({ title: '😀'.repeat(80), description: 'y', stars: 1 })).toBe(true);
  expect(feedbackValid({ title: '😀'.repeat(81), description: 'y', stars: 1 })).toBe(false);
  expect(feedbackValid({ title: 'x', description: 'a'.repeat(5001), stars: 5 })).toBe(false);
});

test('counters, captions and star labels', () => {
  expect(feedbackCounter('😀', 160)).toEqual({ label: '2/160', over: false });
  expect(feedbackCounter('a'.repeat(161), 160).over).toBe(true);
  expect(starsCaption(0)).toBe('Choose 1 to 5 stars.');
  expect(starsCaption(3)).toBe('3 out of 5 stars');
  expect(starLabel(1)).toBe('1 star');
  expect(starLabel(2)).toBe('2 stars');
});
