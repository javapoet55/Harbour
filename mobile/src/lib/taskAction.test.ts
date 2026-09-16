import type { NexdoTask } from '../api/types';
import {
  desiredNotifications,
  makeTaskAction,
  NOTIFICATION_ID_PREFIX,
  reconcileActions,
  transition,
  type StoredTaskAction,
} from './taskAction';
import { detectTaskAction } from './taskActionDetector';

const NOW = Date.parse('2026-09-09T16:00:00Z');
const ZONE = 'America/Los_Angeles';

function task(overrides: Partial<NexdoTask> & { id: string }): NexdoTask {
  return {
    title: 'Contact Damien at 10 AM',
    status: 'PLANNED',
    priority: 'NORMAL',
    durationMin: 30,
    startAt: '2026-09-09T17:00:00Z',
    ...overrides,
  };
}

function action(overrides: Partial<StoredTaskAction> = {}): StoredTaskAction {
  const detection = detectTaskAction('Contact Damien at 10 AM', NOW, ZONE);
  if (!detection) throw new Error('fixture');
  return {
    ...makeTaskAction({ id: 'a1', taskId: 't1', title: 'Contact Damien at 10 AM', detection, scheduledAt: NOW + 3_600_000 }),
    ...overrides,
  };
}

let counter = 0;
const newId = () => `generated-${++counter}`;
beforeEach(() => {
  counter = 0;
});

/** `transition(to:now:)` (ios/Sources/NexdoCore/TaskAction.swift:41-63). */
describe('the action state machine', () => {
  it('refuses to execute without an explicit approval', () => {
    const fresh = action();
    expect(transition(fresh, 'executing', NOW).changed).toBe(false);
    expect(transition(fresh, 'completed', NOW).changed).toBe(false);
  });

  it('allows the approval path, and stamps executedAt', () => {
    const awaiting = transition(action(), 'awaitingApproval', NOW);
    expect(awaiting.changed).toBe(true);
    const approved = transition(awaiting.action, 'approved', NOW);
    expect(approved.changed).toBe(true);
    const executing = transition(approved.action, 'executing', NOW);
    expect(executing.changed).toBe(true);
    expect(executing.action.executedAt).toBe(NOW);
    expect(transition(executing.action, 'completed', NOW).changed).toBe(true);
  });

  it('lets anything be cancelled', () => {
    for (const status of ['pending', 'scheduled', 'awaitingApproval', 'approved', 'executing', 'completed', 'failed'] as const) {
      expect(transition(action({ status }), 'cancelled', NOW).changed).toBe(true);
    }
  });

  it('treats a move to the current status as a no-op that succeeds', () => {
    expect(transition(action({ status: 'completed' }), 'completed', NOW).changed).toBe(true);
  });

  it('reopens a cancelled or completed action for approval', () => {
    expect(transition(action({ status: 'cancelled' }), 'awaitingApproval', NOW).changed).toBe(true);
    expect(transition(action({ status: 'completed' }), 'awaitingApproval', NOW).changed).toBe(true);
  });

  it('never stamps executedAt on any other move', () => {
    expect(transition(action(), 'scheduled', NOW).action.executedAt).toBeNull();
  });
});

/** `TaskActionReconciler.reconcile` (TaskAction.swift:67-88). */
describe('reconcile', () => {
  it('creates one action per detectable task, and none for the rest', () => {
    const result = reconcileActions({
      previous: [],
      tasks: [task({ id: 't1' }), task({ id: 't2', title: 'Buy groceries' })],
      now: NOW,
      timeZone: ZONE,
      newId,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ taskId: 't1', contactName: 'Damien', type: 'contact', status: 'pending' });
  });

  it('never produces two actions for one task', () => {
    const existing = action({ id: 'a1', taskId: 't1' });
    const result = reconcileActions({ previous: [existing, { ...existing, id: 'a2' }], tasks: [task({ id: 't1' })], now: NOW, timeZone: ZONE, newId });
    expect(result).toHaveLength(1);
  });

  it('drops the action when the task is completed or cancelled', () => {
    for (const status of ['COMPLETED', 'CANCELLED']) {
      expect(reconcileActions({ previous: [action()], tasks: [task({ id: 't1', status })], now: NOW, timeZone: ZONE, newId })).toEqual([]);
    }
  });

  it('keeps the existing action when nothing relevant changed', () => {
    const existing = action({ scheduledAt: Date.parse('2026-09-09T17:00:00Z'), status: 'scheduled' });
    const result = reconcileActions({ previous: [existing], tasks: [task({ id: 't1' })], now: NOW, timeZone: ZONE, newId });
    expect(result[0]).toBe(existing);
  });

  /** "The saved task date wins over wording in an old title after rescheduling." */
  it('rebuilds when the task moved, keeping the chosen contact', () => {
    const existing = action({
      scheduledAt: Date.parse('2026-09-09T17:00:00Z'),
      status: 'scheduled',
      contactIdentifier: 'contact-7',
      snoozedUntil: NOW + 60_000,
    });
    const result = reconcileActions({
      previous: [existing],
      tasks: [task({ id: 't1', startAt: '2026-09-11T17:00:00Z' })],
      now: NOW,
      timeZone: ZONE,
      newId,
    });
    expect(result[0].scheduledAt).toBe(Date.parse('2026-09-11T17:00:00Z'));
    expect(result[0].contactIdentifier).toBe('contact-7');
    // A rebuild is a fresh action: the snooze and the status go.
    expect(result[0].status).toBe('pending');
    expect(result[0].snoozedUntil).toBeNull();
    expect(result[0].id).toBe('generated-1');
  });

  it('rebuilds when only the title changed', () => {
    const existing = action({ scheduledAt: Date.parse('2026-09-09T17:00:00Z'), contactIdentifier: 'contact-7' });
    const result = reconcileActions({
      previous: [existing],
      tasks: [task({ id: 't1', title: 'Contact Damien at 10 AM about the roof' })],
      now: NOW,
      timeZone: ZONE,
      newId,
    });
    expect(result[0].context).toBe('the roof');
    expect(result[0].contactIdentifier).toBe('contact-7');
  });

  it('starts over when the person changes, dropping the old contact', () => {
    const existing = action({ scheduledAt: Date.parse('2026-09-09T17:00:00Z'), contactIdentifier: 'contact-7' });
    const result = reconcileActions({
      previous: [existing],
      tasks: [task({ id: 't1', title: 'Contact Ana at 10 AM' })],
      now: NOW,
      timeZone: ZONE,
      newId,
    });
    expect(result[0].contactName).toBe('Ana');
    expect(result[0].contactIdentifier).toBeNull();
  });

  it('falls back to dueAt when there is no startAt', () => {
    const result = reconcileActions({
      previous: [],
      tasks: [task({ id: 't1', startAt: undefined, dueAt: '2026-09-12T17:00:00Z' })],
      now: NOW,
      timeZone: ZONE,
      newId,
    });
    expect(result[0].scheduledAt).toBe(Date.parse('2026-09-12T17:00:00Z'));
  });
});

/** `TaskActionNotificationPlan.desired` (TaskAction.swift:101-108). */
describe('the notification plan', () => {
  it('schedules only pending and scheduled actions in the future, soonest first', () => {
    const plan = desiredNotifications(
      [
        action({ id: 'late', scheduledAt: NOW + 7_200_000 }),
        action({ id: 'soon', scheduledAt: NOW + 60_000 }),
        action({ id: 'past', scheduledAt: NOW - 60_000 }),
        action({ id: 'done', scheduledAt: NOW + 60_000, status: 'completed' }),
        action({ id: 'gone', scheduledAt: NOW + 60_000, status: 'cancelled' }),
        action({ id: 'unscheduled', scheduledAt: null }),
      ],
      NOW,
    );
    expect(plan.map((item) => item.actionId)).toEqual(['soon', 'late']);
    expect(plan[0].id).toBe(`${NOTIFICATION_ID_PREFIX}soon`);
  });

  it('a snooze wins over the original schedule', () => {
    const plan = desiredNotifications([action({ id: 'a', scheduledAt: NOW - 60_000, snoozedUntil: NOW + 900_000 })], NOW);
    expect(plan[0].fireAt).toBe(NOW + 900_000);
  });

  it('takes at most 48, keeping the earliest', () => {
    const many = Array.from({ length: 60 }, (_, index) => action({ id: `a${index}`, scheduledAt: NOW + (60 - index) * 60_000 }));
    const plan = desiredNotifications(many, NOW);
    expect(plan).toHaveLength(48);
    expect(plan[0].fireAt).toBe(NOW + 60_000);
  });

  it('a zero or negative limit schedules nothing', () => {
    expect(desiredNotifications([action({ scheduledAt: NOW + 60_000 })], NOW, 0)).toEqual([]);
    expect(desiredNotifications([action({ scheduledAt: NOW + 60_000 })], NOW, -5)).toEqual([]);
  });
});
