import type { NexdoTask } from '../api/types';
import { buildActionQueue, notificationDate, type TaskAction } from './todayActionQueue';

const ZONE = 'Asia/Kolkata';
/** 2026-09-16 09:00 in Asia/Kolkata. */
const NOW = Date.parse('2026-09-16T03:30:00.000Z');
const MINUTE = 60_000;

function task(overrides: Partial<NexdoTask> & { id: string }): NexdoTask {
  return { title: 'A task', status: 'PLANNED', priority: 'NORMAL', durationMin: 30, ...overrides };
}

function action(overrides: Partial<TaskAction> & { id: string; taskId: string }): TaskAction {
  return {
    contactName: 'Damien',
    status: 'scheduled',
    scheduledAt: NOW,
    sourceTitle: 'Call Damien',
    ...overrides,
  };
}

function queue(actions: TaskAction[], tasks: NexdoTask[]) {
  return buildActionQueue({ actions, tasks, now: NOW, timeZone: ZONE });
}

/** `TodayActionQueue` (ios/Sources/NexdoCore/TodayActionQueue.swift). */
describe('notificationDate', () => {
  it('prefers a snooze over the original schedule', () => {
    expect(notificationDate(action({ id: 'a', taskId: 't1', scheduledAt: NOW, snoozedUntil: NOW + 30 * MINUTE }))).toBe(
      NOW + 30 * MINUTE,
    );
  });

  it('is null when neither is set', () => {
    expect(notificationDate(action({ id: 'a', taskId: 't1', scheduledAt: null }))).toBeNull();
  });
});

describe('buildActionQueue', () => {
  it('is empty with no actions, which is the state until Phase 8', () => {
    const result = queue([], [task({ id: 't1' })]);
    expect(result.primaryAction).toBeNull();
    expect(result.nextActions).toEqual([]);
    expect(result.laterActions).toEqual([]);
    expect(result.hasImmediateActions).toBe(false);
    expect(result.recommendation).toBeNull();
  });

  it('makes the earliest DUE action primary', () => {
    const result = queue(
      [
        action({ id: 'a2', taskId: 't2', scheduledAt: NOW - 5 * MINUTE }),
        action({ id: 'a1', taskId: 't1', scheduledAt: NOW - 30 * MINUTE }),
      ],
      [task({ id: 't1' }), task({ id: 't2' })],
    );
    expect(result.primaryAction?.id).toBe('a1');
    expect(result.hasImmediateActions).toBe(true);
  });

  it('puts actions inside the 15-minute window into nextActions, and later ones into laterActions', () => {
    const result = queue(
      [
        action({ id: 'due', taskId: 't1', scheduledAt: NOW - MINUTE }),
        action({ id: 'soon', taskId: 't2', scheduledAt: NOW + 10 * MINUTE }),
        action({ id: 'later', taskId: 't3', scheduledAt: NOW + 60 * MINUTE }),
      ],
      [task({ id: 't1' }), task({ id: 't2' }), task({ id: 't3' })],
    );
    expect(result.primaryAction?.id).toBe('due');
    expect(result.nextActions.map((each) => each.id)).toEqual(['soon']);
    expect(result.laterActions.map((each) => each.id)).toEqual(['later']);
  });

  it('counts only actions strictly in the PAST as overdue', () => {
    const result = queue(
      [
        action({ id: 'past', taskId: 't1', scheduledAt: NOW - MINUTE }),
        action({ id: 'exactly-now', taskId: 't2', scheduledAt: NOW }),
      ],
      [task({ id: 't1' }), task({ id: 't2' })],
    );
    // Both are "due" (<= now), but only the past one is overdue (< now).
    expect(result.overdueCount).toBe(1);
  });

  it('drops actions for tasks that are done, cancelled or missing', () => {
    const result = queue(
      [
        action({ id: 'done', taskId: 'done' }),
        action({ id: 'cancelled', taskId: 'cancelled' }),
        action({ id: 'ghost', taskId: 'no-such-task' }),
        action({ id: 'live', taskId: 't1' }),
      ],
      [task({ id: 'done', status: 'COMPLETED' }), task({ id: 'cancelled', status: 'CANCELLED' }), task({ id: 't1' })],
    );
    expect(result.primaryAction?.id).toBe('live');
    expect(result.nextActions).toEqual([]);
  });

  it('drops completed and cancelled ACTIONS', () => {
    const result = queue(
      [
        action({ id: 'completed', taskId: 't1', status: 'completed' }),
        action({ id: 'cancelled', taskId: 't2', status: 'cancelled' }),
      ],
      [task({ id: 't1' }), task({ id: 't2' })],
    );
    expect(result.primaryAction).toBeNull();
  });

  it('excludes anything scheduled beyond today, and marks its task deferred', () => {
    // 22:00 UTC is already the 17th in Kolkata.
    const tomorrow = Date.parse('2026-09-16T22:00:00.000Z');
    const result = queue([action({ id: 'a', taskId: 't1', scheduledAt: tomorrow })], [task({ id: 't1' })]);

    expect(result.primaryAction).toBeNull();
    expect(result.laterActions).toEqual([]);
    expect(result.deferredTaskIds.has('t1')).toBe(true);
    // Deferred tasks are still RESERVED, so the schedule list does not show them twice.
    expect(result.reservedTaskIds.has('t1')).toBe(true);
  });

  it('keeps one action per task, the earliest', () => {
    const result = queue(
      [
        action({ id: 'late', taskId: 't1', scheduledAt: NOW + 5 * MINUTE }),
        action({ id: 'early', taskId: 't1', scheduledAt: NOW - 5 * MINUTE }),
      ],
      [task({ id: 't1' })],
    );
    expect(result.primaryAction?.id).toBe('early');
    expect(result.nextActions).toEqual([]);
  });

  it('breaks a time tie by task priority, then by action id', () => {
    const result = queue(
      [
        action({ id: 'b', taskId: 'normal', scheduledAt: NOW - MINUTE }),
        action({ id: 'a', taskId: 'critical', scheduledAt: NOW - MINUTE }),
      ],
      [task({ id: 'normal', priority: 'NORMAL' }), task({ id: 'critical', priority: 'CRITICAL' })],
    );
    // CRITICAL outranks NORMAL at the same instant.
    expect(result.primaryAction?.taskId).toBe('critical');
  });

  it('uses the id as the final tie-break', () => {
    const result = queue(
      [
        action({ id: 'z', taskId: 't2', scheduledAt: NOW - MINUTE }),
        action({ id: 'a', taskId: 't1', scheduledAt: NOW - MINUTE }),
      ],
      [task({ id: 't1' }), task({ id: 't2' })],
    );
    expect(result.primaryAction?.id).toBe('a');
  });

  it('honours a snooze when ordering', () => {
    const result = queue(
      [
        action({ id: 'snoozed', taskId: 't1', scheduledAt: NOW - 60 * MINUTE, snoozedUntil: NOW + 10 * MINUTE }),
        action({ id: 'due', taskId: 't2', scheduledAt: NOW - MINUTE }),
      ],
      [task({ id: 't1' }), task({ id: 't2' })],
    );
    // The snoozed one is no longer due, so the other becomes primary.
    expect(result.primaryAction?.id).toBe('due');
    expect(result.nextActions.map((each) => each.id)).toEqual(['snoozed']);
  });

  it('reserves every task it touches, immediate or later', () => {
    const result = queue(
      [
        action({ id: 'due', taskId: 't1', scheduledAt: NOW - MINUTE }),
        action({ id: 'later', taskId: 't2', scheduledAt: NOW + 60 * MINUTE }),
      ],
      [task({ id: 't1' }), task({ id: 't2' })],
    );
    expect([...result.immediateTaskIds]).toEqual(['t1']);
    expect(result.reservedTaskIds.has('t1')).toBe(true);
    expect(result.reservedTaskIds.has('t2')).toBe(true);
  });

  it('phrases the recommendation with the contact name', () => {
    const result = queue([action({ id: 'a', taskId: 't1', contactName: 'Ana', scheduledAt: NOW - MINUTE })], [task({ id: 't1' })]);
    expect(result.recommendation).toBe(
      'You have a follow-up with Ana due now. Contact them before starting your next task.',
    );
  });
});
