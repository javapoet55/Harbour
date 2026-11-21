import { describe, expect, it } from 'vitest';
import { eventIdFromItem, eventIssue, eventPatch, isEditable } from './calendar-events';

const original = { title: 'Dinner', notes: '', location: 'Home', startAt: '2026-12-01T18:00:00.000Z', endAt: '2026-12-01T19:00:00.000Z' };
const same = { title: 'Dinner', notes: '', location: 'Home', startMs: Date.parse(original.startAt), endMs: Date.parse(original.endAt) };
const NOW = Date.parse('2026-11-21T00:00:00Z');

describe('event ids and ownership', () => {
  it('strips the item prefix', () => {
    expect(eventIdFromItem('event-abc')).toBe('abc');
    expect(eventIdFromItem('task-abc')).toBeNull();
  });
  it('edits only Nexdo-made events', () => {
    expect(isEditable({ source: 'harbor', connectionId: null })).toBe(true);
    expect(isEditable({ source: 'harbor', connectionId: 'c' })).toBe(false);
    expect(isEditable({ source: 'google', connectionId: null })).toBe(false);
  });
});

describe('eventPatch', () => {
  it('is empty when nothing changed', () => expect(eventPatch(original, same)).toEqual({}));
  it('sends only changed details', () => {
    expect(eventPatch(original, { ...same, title: ' Team dinner ', notes: 'x' })).toEqual({ title: 'Team dinner', notes: 'x' });
    expect(eventPatch(original, { ...same, location: '' })).toEqual({ location: '' });
  });
  it('sends both times when either moved', () => {
    expect(eventPatch(original, { ...same, endMs: same.endMs + 3_600_000 })).toEqual({ startAt: original.startAt, endAt: '2026-12-01T20:00:00.000Z' });
  });
});

describe('eventIssue', () => {
  it('needs a title', () => expect(eventIssue({ ...same, title: ' ' }, false, NOW)).toBe('Enter a title.'));
  it('lets an untouched past event be renamed', () => {
    const past = { title: 'Old', startMs: NOW - 7_200_000, endMs: NOW - 3_600_000 };
    expect(eventIssue(past, false, NOW)).toBeNull();
    expect(eventIssue(past, true, NOW)).toBe('Choose a start time in the future.');
  });
  it('checks order and length when re-timed', () => {
    expect(eventIssue({ title: 'a', startMs: NOW + 2, endMs: NOW + 1 }, true, NOW)).toBe('The event must end after it starts.');
    expect(eventIssue({ title: 'a', startMs: NOW + 1000, endMs: NOW + 1000 + 8 * 86_400_000 }, true, NOW)).toBe('An event can last at most seven days.');
    expect(eventIssue({ title: 'a', startMs: NOW + 1000, endMs: NOW + 2000 }, true, NOW)).toBeNull();
    expect(eventIssue({ title: 'a', startMs: NaN, endMs: NOW }, true, NOW)).toMatch(/doesn’t exist/);
  });
});
