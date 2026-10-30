import AsyncStorage from '@react-native-async-storage/async-storage';

import type { NexdoTask } from '../../../api/types';
import { resolvedCreationDate, spacedCreationStart } from '../creationSpacing';
import { loadTaskDisplayOrders, moveTask, movingId, orderedTasks, reorderTasks, saveTaskDisplayOrders, sortedIds, TASK_DISPLAY_ORDERS_KEY } from '../displayOrder';
import { DEFAULT_WORKING_DAYS, doNowWindowTitle, scheduleExpandLabel, toggleWorkingDay, visibleScheduleItems, workingDayLocked } from '../workingDays';

/** The cases are Swift's own (d568989): TaskDisplayOrderTests.swift and TaskCreationSpacingTests.swift. */

describe('TaskDisplayOrder', () => {
  // taskDisplayOrderMovesAcrossTimesAndSurvivesReload
  it('moves across times and survives a reload', () => {
    const chronological = ['early', 'middle', 'late'];
    const saved = movingId('late', 'early', chronological);
    expect(saved).toEqual(['late', 'early', 'middle']);
    expect(sortedIds(chronological, saved!)).toEqual(saved);
    expect(movingId('late', 'middle', saved!)).toEqual(['early', 'middle', 'late']);
  });

  // taskDisplayOrderPreservesFilteredAndNewItems
  it('keeps filtered and new items, and refuses a move it cannot make', () => {
    expect(sortedIds(['b', 'new'], ['a', 'b', 'deleted'])).toEqual(['b', 'new']);
    expect(movingId('other-day', 'b', ['b'])).toBeNull();
    expect(movingId('b', 'b', ['b'])).toBeNull();
  });

  const group = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'moment:m1:2026-10-10' }];

  it('saves per account, and a group’s new order replaces just its own ids', () => {
    const orders = { u1: ['x', 'a', 'y'], u2: ['c', 'b', 'a'] };
    const next = reorderTasks(orders, 'u1', 'c', 'a', group);
    expect(next).toEqual({ u1: ['x', 'y', 'c', 'a', 'b', 'moment:m1:2026-10-10'], u2: ['c', 'b', 'a'] });
    expect(orderedTasks(group, next!, 'u1').map((task) => task.id)).toEqual(['c', 'a', 'b', 'moment:m1:2026-10-10']);
    expect(orderedTasks(group, next!, 'u2').map((task) => task.id)).toEqual(['c', 'b', 'a', 'moment:m1:2026-10-10']);
  });

  it('never moves a Moment, nor drops anything on one, and needs an account', () => {
    expect(reorderTasks({}, 'u1', 'moment:m1:2026-10-10', 'a', group)).toBeNull();
    expect(reorderTasks({}, 'u1', 'a', 'moment:m1:2026-10-10', group)).toBeNull();
    expect(reorderTasks({}, null, 'a', 'b', group)).toBeNull();
  });

  it('moves up and down past Moments, and not off either end', () => {
    expect(orderedTasks(group, moveTask({}, 'u1', 'c', -1, group)!, 'u1').map((task) => task.id)).toEqual(['a', 'c', 'b', 'moment:m1:2026-10-10']);
    expect(moveTask({}, 'u1', 'c', 1, group)).toBeNull();
    expect(moveTask({}, 'u1', 'a', -1, group)).toBeNull();
  });

  it('round-trips the saved orders, and treats anything unreadable as none', async () => {
    await saveTaskDisplayOrders({ u1: ['b', 'a'] });
    expect(await loadTaskDisplayOrders()).toEqual({ u1: ['b', 'a'] });
    await AsyncStorage.setItem(TASK_DISPLAY_ORDERS_KEY, '{"u1":"oops","u2":["a"]}');
    expect(await loadTaskDisplayOrders()).toEqual({ u2: ['a'] });
    await AsyncStorage.setItem(TASK_DISPLAY_ORDERS_KEY, 'not json');
    expect(await loadTaskDisplayOrders()).toEqual({});
  });
});

function spacingTask(id: string, at: string | null, duration = 30, status = 'PLANNED'): NexdoTask {
  return { id, title: id, status, priority: 'NORMAL', durationMin: duration, notes: null, startAt: at, dueAt: null };
}

describe('TaskCreationSpacing', () => {
  // sequentialTasksHaveFifteenMinutesAfterEnd
  it('leaves fifteen minutes after each task', () => {
    const date = Date.parse('2026-10-10T09:47:00-07:00');
    const first = spacingTask('first', '2026-10-10T09:46:00-07:00');
    const next = spacedCreationStart(date, 30, [first]);
    expect(next).toBe(Date.parse('2026-10-10T10:31:00-07:00'));
    const second = spacingTask('second', new Date(next).toISOString(), 45);
    expect(spacedCreationStart(date, 30, [second, first])).toBe(Date.parse('2026-10-10T11:31:00-07:00'));
  });

  // spacingKeepsAvailableSlotsAndIgnoresInactiveTasks
  it('keeps a free slot, and ignores done, cancelled and undated tasks', () => {
    const date = Date.parse('2026-10-10T09:00:00Z');
    expect(spacedCreationStart(date, 30, [spacingTask('later', '2026-10-10T09:45:00Z')])).toBe(date);
    const ignored = [spacingTask('done', '2026-10-10T09:00:00Z', 30, 'COMPLETED'), spacingTask('cancelled', '2026-10-10T09:00:00Z', 30, 'CANCELLED'), spacingTask('undated', null)];
    expect(spacedCreationStart(date, 30, ignored)).toBe(date);
  });

  /**
   * Capture `tasks-creation-spacing` (Mac, 0bb8212): "Parity follow up with the bank" at 12:22 PM for 30
   * minutes, then "Follow up with Parity Bank" added a few minutes later lands at 1:07 PM — 15 minutes
   * after the first one ends. The title has no time of its own, so the pill's default is spaced.
   */
  it('reproduces the captured 12:22 PM → 1:07 PM spacing', () => {
    const first = spacingTask('first', '2026-10-12T12:22:00+05:30', 30);
    const proposed = Date.parse('2026-10-12T12:25:00+05:30');
    expect(resolvedCreationDate({ detectedAt: null, dateExplicitlyChosen: false, proposed, creating: true, durationMin: 30, tasks: [first] })).toBe(
      Date.parse('2026-10-12T13:07:00+05:30'),
    );
  });

  it('uses a time from the title as written, and never moves an edit', () => {
    const tasks = [spacingTask('busy', '2026-10-10T09:00:00Z')];
    const proposed = Date.parse('2026-10-10T09:00:00Z');
    const detectedAt = Date.parse('2026-10-10T09:10:00Z');
    expect(resolvedCreationDate({ detectedAt, dateExplicitlyChosen: false, proposed, creating: true, durationMin: 30, tasks })).toBe(detectedAt);
    expect(resolvedCreationDate({ detectedAt, dateExplicitlyChosen: true, proposed, creating: true, durationMin: 30, tasks })).toBe(Date.parse('2026-10-10T09:45:00Z'));
    expect(resolvedCreationDate({ detectedAt: null, dateExplicitlyChosen: false, proposed, creating: false, durationMin: 30, tasks })).toBe(proposed);
  });
});

describe('working days', () => {
  it('toggles a day, sorted, and never turns the last one off', () => {
    expect(DEFAULT_WORKING_DAYS).toBe('0,1,2,3,4,5,6');
    expect(toggleWorkingDay('1,2,3,4,5', 6, true)).toBe('1,2,3,4,5,6');
    expect(toggleWorkingDay(DEFAULT_WORKING_DAYS, 6, false)).toBe('0,1,2,3,4,5');
    expect(toggleWorkingDay('6,0', 3, true)).toBe('0,3,6');
    expect(toggleWorkingDay('1,2', 2, false)).toBe('1');
    expect(toggleWorkingDay('1', 1, false)).toBe('1');
    // Unset reads as the server's default, every day (Phase 14).
    expect(toggleWorkingDay(undefined, 0, false)).toBe('1,2,3,4,5,6');
    expect(workingDayLocked('1', 1)).toBe(true);
    expect(workingDayLocked('1,2', 1)).toBe(false);
  });

  it('names an excluded day before the hours on Do Now', () => {
    const label = (minutes: number) => `${minutes} min`;
    expect(doNowWindowTitle({ outsideWorkingDay: true, outsideWorkingHours: true, availableWindowMinutes: 0 }, label)).toBe('Today isn’t a selected working day');
    expect(doNowWindowTitle({ outsideWorkingDay: false, outsideWorkingHours: true, availableWindowMinutes: 0 }, label)).toBe('Outside your working hours');
    expect(doNowWindowTitle({ availableWindowMinutes: 25 }, label)).toBe('You have 25 min free now');
  });

  it('shows three schedule items and expands in place', () => {
    const items = [1, 2, 3, 4, 5];
    expect(visibleScheduleItems(items, false, false)).toEqual([1, 2, 3]);
    expect(visibleScheduleItems(items, false, true)).toEqual(items);
    expect(visibleScheduleItems(items, true, false)).toEqual(items);
    expect(scheduleExpandLabel(5, false, false)).toBe('View 2 more');
    expect(scheduleExpandLabel(5, false, true)).toBe('Show less');
    expect(scheduleExpandLabel(3, false, false)).toBeNull();
    expect(scheduleExpandLabel(5, true, false)).toBeNull();
  });
});
