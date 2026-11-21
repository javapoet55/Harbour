import { describe, expect, it } from 'vitest';
import { DISTANT_FUTURE } from './task-query';
import {
  folderResults, folderTasks, lifeReminderLabel, moveTask, movingId, orderedTasks, parseTaskDisplayOrders, reorderTasks,
  resolveCreationDate, sectionTitle, sortedIds, spacedCreationStart, taskRowIcon, taskSubtitle, validFolderName, type Folder,
} from './task-list';

const ZONE = 'Asia/Kolkata';
/** 2026-09-16 09:00 in Asia/Kolkata. */
const NOW = Date.parse('2026-09-16T03:30:00.000Z');
const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe('manual order', () => {
  it('keeps the saved order and appends new ids', () => {
    expect(sortedIds(['a', 'b', 'c'], ['c', 'x', 'a'])).toEqual(['c', 'a', 'b']);
  });

  it('moves the source into the target position', () => {
    expect(movingId('a', 'c', ['a', 'b', 'c'])).toEqual(['b', 'c', 'a']);
    expect(movingId('c', 'a', ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
    expect(movingId('a', 'a', ['a', 'b'])).toBeNull();
    expect(movingId('a', 'z', ['a', 'b'])).toBeNull();
  });

  it('reorders one group without disturbing another group’s saved order', () => {
    const orders = { me: ['x', 'y', 'b', 'a'] };
    const next = reorderTasks(orders, 'me', 'a', 'b', [{ id: 'a' }, { id: 'b' }]);
    expect(next).toEqual({ me: ['x', 'y', 'a', 'b'] });
    expect(ids(orderedTasks([{ id: 'a' }, { id: 'b' }], next!, 'me'))).toEqual(['a', 'b']);
  });

  it('saves nothing without an account', () => {
    expect(reorderTasks({}, '', 'a', 'b', [{ id: 'a' }, { id: 'b' }])).toBeNull();
  });

  it('moves up and down and stops at the edges', () => {
    const group = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(moveTask({}, 'me', 'b', -1, group)).toEqual({ me: ['b', 'a', 'c'] });
    expect(moveTask({}, 'me', 'b', 1, group)).toEqual({ me: ['a', 'c', 'b'] });
    expect(moveTask({}, 'me', 'a', -1, group)).toBeNull();
    expect(moveTask({}, 'me', 'c', 1, group)).toBeNull();
  });

  it('treats unreadable storage as no saved order', () => {
    expect(parseTaskDisplayOrders('not json')).toEqual({});
    expect(parseTaskDisplayOrders('[1]')).toEqual({});
    expect(parseTaskDisplayOrders(JSON.stringify({ me: ['a'], bad: [1], worse: 'x' }))).toEqual({ me: ['a'] });
    expect(parseTaskDisplayOrders(null)).toEqual({});
  });
});

describe('creation', () => {
  const open = (startAt: string, durationMin = 30, status = 'PLANNED') => ({ status, startAt, durationMin });

  it('keeps the proposed start when nothing is near it', () => {
    expect(spacedCreationStart(NOW, 30, [open('2026-09-16T08:00:00.000Z')])).toBe(NOW);
  });

  it('moves past an overlapping task and leaves a 15-minute gap', () => {
    // Existing task 09:00–09:30 local; the new one starts at 09:45.
    expect(spacedCreationStart(NOW, 30, [open('2026-09-16T03:30:00.000Z')])).toBe(NOW + 45 * 60_000);
  });

  it('chains past back-to-back tasks', () => {
    const tasks = [open('2026-09-16T03:30:00.000Z'), open('2026-09-16T04:15:00.000Z')];
    expect(spacedCreationStart(NOW, 30, tasks)).toBe(NOW + 90 * 60_000);
  });

  it('ignores completed and cancelled tasks', () => {
    const tasks = [open('2026-09-16T03:30:00.000Z', 30, 'COMPLETED'), open('2026-09-16T03:30:00.000Z', 30, 'CANCELLED')];
    expect(spacedCreationStart(NOW, 30, tasks)).toBe(NOW);
  });

  it('resolves Today, Tomorrow and a picked date at the current clock time', () => {
    expect(resolveCreationDate('Today', '', ZONE, NOW)).toBe(NOW);
    expect(new Date(resolveCreationDate('Tomorrow', '', ZONE, NOW)).toISOString()).toBe('2026-09-17T03:30:00.000Z');
    expect(new Date(resolveCreationDate('Select Date', '2026-10-02', ZONE, NOW)).toISOString()).toBe('2026-10-02T03:30:00.000Z');
    expect(resolveCreationDate('Select Date', '', ZONE, NOW)).toBe(NOW);
  });
});

describe('row appearance', () => {
  it('reads the icon from whole words and their endings', () => {
    expect(taskRowIcon('Email the landlord')).toBe('envelope');
    expect(taskRowIcon('Calling the dentist')).toBe('phone');
    expect(taskRowIcon('Find a plumber')).toBe('wrench');
    expect(taskRowIcon('Fix laptop')).toBe('laptop');
    expect(taskRowIcon('Team meeting')).toBe('calendar');
    expect(taskRowIcon('Recall the brief')).toBe('document');
    expect(taskRowIcon('Buy milk')).toBe('document');
  });

  it('labels smart reminders', () => {
    expect(lifeReminderLabel('expiration')).toBe('Expires');
    expect(lifeReminderLabel('returnItem')).toBe('Return');
    expect(lifeReminderLabel(null)).toBeNull();
    expect(lifeReminderLabel('other')).toBeNull();
  });

  it('titles sections relative to today in the account zone', () => {
    const today = Date.parse('2026-09-15T18:30:00.000Z');
    const day = 24 * 3_600_000;
    expect(sectionTitle(today, ZONE, DISTANT_FUTURE, NOW)).toBe('Today');
    expect(sectionTitle(today - day, ZONE, DISTANT_FUTURE, NOW)).toBe('Yesterday');
    expect(sectionTitle(today + day, ZONE, DISTANT_FUTURE, NOW)).toBe('Tomorrow');
    expect(sectionTitle(today + 3 * day, ZONE, DISTANT_FUTURE, NOW)).toBe('Saturday, Sep 19');
    expect(sectionTitle(DISTANT_FUTURE, ZONE, DISTANT_FUTURE, NOW)).toBe('Unscheduled');
  });

  it('writes the time and estimate', () => {
    expect(taskSubtitle({ startAt: '2026-09-16T03:30:00.000Z', durationMin: 30 }, ZONE)).toBe('9:00 AM · 30 min');
    expect(taskSubtitle({ startAt: null, dueAt: '2026-09-16T09:00:00.000Z', durationMin: 120 }, ZONE)).toBe('2:30 PM · 2 hr');
    expect(taskSubtitle({ startAt: null, dueAt: null, durationMin: 45 }, ZONE)).toBe('Unscheduled · 45 min');
  });
});

describe('folders', () => {
  const folder = (id: string, name: string, updatedAt: string, completed: number, total: number): Folder => ({ id, name, color: '#8875ff', createdAt: updatedAt, updatedAt, completedTaskCount: completed, totalTaskCount: total });
  const folders = [folder('1', 'Zebra', '2026-09-01', 1, 4), folder('2', 'apple', '2026-09-03', 3, 3), folder('3', 'Émile', '2026-09-02', 0, 9)];

  it('sorts four ways', () => {
    expect(ids(folderResults(folders, '', 'Recently updated'))).toEqual(['2', '3', '1']);
    expect(ids(folderResults(folders, '', 'Name'))).toEqual(['2', '3', '1']);
    expect(ids(folderResults(folders, '', 'Most tasks'))).toEqual(['3', '1', '2']);
    expect(ids(folderResults(folders, '', 'Highest completion'))).toEqual(['2', '1', '3']);
  });

  it('searches names without regard to case or accents', () => {
    expect(ids(folderResults(folders, 'emile', 'Name'))).toEqual(['3']);
    expect(ids(folderResults(folders, '  ZEB ', 'Name'))).toEqual(['1']);
  });

  it('validates names', () => {
    expect(validFolderName('  Home  ')).toBe(true);
    expect(validFolderName('   ')).toBe(false);
    expect(validFolderName('x'.repeat(81))).toBe(false);
  });

  it('lists one folder’s tasks, open first then by title', () => {
    const task = (id: string, title: string, status: string, projectId: string | null, priority = 'NORMAL') => ({ id, title, status, projectId, priority });
    const tasks = [task('a', 'Write', 'COMPLETED', 'p'), task('b', 'Call', 'PLANNED', 'p'), task('c', 'Book', 'PLANNED', 'p', 'HIGH'), task('d', 'Other', 'PLANNED', null), task('e', 'Gone', 'CANCELLED', 'p')];
    expect(ids(folderTasks(tasks, 'p', '', 'All', 'All'))).toEqual(['c', 'b', 'a']);
    expect(ids(folderTasks(tasks, 'p', '', 'Open', 'All'))).toEqual(['c', 'b']);
    expect(ids(folderTasks(tasks, 'p', '', 'Completed', 'All'))).toEqual(['a']);
    expect(ids(folderTasks(tasks, 'p', '', 'Open', 'HIGH'))).toEqual(['c']);
    expect(ids(folderTasks(tasks, 'p', 'cal', 'Open', 'All'))).toEqual(['b']);
    expect(ids(folderTasks(tasks, null, '', 'Open', 'All'))).toEqual(['d']);
  });
});
