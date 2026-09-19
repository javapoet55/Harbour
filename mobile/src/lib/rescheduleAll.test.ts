import type { NexdoTask } from '../api/types';
import {
  canReschedule,
  nextStart,
  rescheduleAll,
  rescheduleButtonTitle,
  rescheduleFailure,
  rescheduleWrite,
  SCHEDULE_SAVE_FAILED,
  type RescheduleWrite,
} from './rescheduleAll';

/** `TodayAttentionSheet.rescheduleAll()` (ios/App/TodayAttentionSheet.swift:102-125). */

const START = Date.parse('2026-09-16T10:00:00.000Z');

function task(id: string, durationMin: number): NexdoTask {
  return { id, title: `Task ${id}`, status: 'PLANNED', priority: 'NORMAL', durationMin, dueAt: '2026-09-01T10:00:00.000Z' };
}

describe('rescheduleAll', () => {
  it('places tasks one after another by duration, with at least a minute each', async () => {
    const writes: RescheduleWrite[] = [];
    const result = await rescheduleAll([task('a', 30), task('b', 0), task('c', 45)], START, async (write) => {
      writes.push(write);
    });

    expect(result).toBeNull();
    expect(writes.map((write) => write.schedule?.startAt)).toEqual([
      '2026-09-16T10:00:00.000Z',
      '2026-09-16T10:30:00.000Z',
      // `max(1, 0)` minutes after the second.
      '2026-09-16T10:31:00.000Z',
    ]);
    // Only the schedule changes, so the details body is empty.
    expect(writes.every((write) => Object.keys(write.details).length === 0)).toBe(true);
  });

  it('stops at the first failure, keeping earlier writes, and names the task', async () => {
    const save = jest.fn(async (write: RescheduleWrite) => {
      if (write.id === 'b') throw new Error('network');
    });
    const result = await rescheduleAll([task('a', 30), task('b', 30), task('c', 30)], START, save);

    expect(save).toHaveBeenCalledTimes(2);
    expect(result).toBe(`Couldn’t reschedule Task b: ${SCHEDULE_SAVE_FAILED}. Earlier changes were saved.`);
  });

  it('builds the schedule PATCH body the task editor sends', () => {
    expect(rescheduleWrite(task('a', 25), START)).toEqual({
      id: 'a',
      details: {},
      schedule: { startAt: '2026-09-16T10:00:00.000Z', durationMin: 25 },
    });
    expect(nextStart(START, task('a', 25))).toBe(START + 25 * 60_000);
  });

  it('formats the failure line exactly as Swift interpolates it', () => {
    expect(rescheduleFailure('Pay rent', 'Oops.')).toBe('Couldn’t reschedule Pay rent: Oops.. Earlier changes were saved.');
  });
});

describe('the Reschedule button', () => {
  it('never singularises, and reads Rescheduling… while saving', () => {
    expect(rescheduleButtonTitle(false, 1)).toBe('Reschedule 1 tasks');
    expect(rescheduleButtonTitle(false, 3)).toBe('Reschedule 3 tasks');
    expect(rescheduleButtonTitle(true, 3)).toBe('Rescheduling…');
  });

  it('is disabled while saving or busy, with no tasks, or for a start that is not in the future', () => {
    const base = { saving: false, busy: false, count: 2, start: START + 1, now: START };
    expect(canReschedule(base)).toBe(true);
    expect(canReschedule({ ...base, saving: true })).toBe(false);
    expect(canReschedule({ ...base, busy: true })).toBe(false);
    expect(canReschedule({ ...base, count: 0 })).toBe(false);
    expect(canReschedule({ ...base, start: START })).toBe(false);
  });
});
