import { desiredNotifications, makeTaskAction, reconcileActions, releaseActions, transition, type StoredTaskAction } from './taskAction';
import { detectTaskAction } from './taskActionDetector';

/** Ports of ios/Tests/NexdoCoreTests/TaskActionReminderFixesTests.swift:84-115. */

const NOW = Date.parse('2026-09-24T09:00:00Z');
const ZONE = 'America/Los_Angeles';

let counter = 0;
const newId = () => `a${++counter}`;

function action(at: number): StoredTaskAction {
  const detection = detectTaskAction('Call electrician', NOW, ZONE);
  if (!detection) throw new Error('fixture');
  return makeTaskAction({ id: newId(), taskId: `t${counter}`, title: 'Call electrician', detection, scheduledAt: at });
}

const waiting = (value: StoredTaskAction) => transition(value, 'awaitingApproval', NOW).action;

// onlyAWaitingActionIsReleased
it.each(['approved', 'executing', 'completed', 'failed', 'cancelled'] as const)('never releases an action that is %s', (status) => {
  let value = waiting(action(NOW + 3_600_000));
  if (status === 'executing' || status === 'completed' || status === 'failed') {
    value = transition(transition(value, 'approved', NOW).action, 'executing', NOW).action;
  }
  if (status !== 'executing') value = transition(value, status, NOW).action;
  expect(value.status).toBe(status);
  expect(releaseActions([value], new Set(), NOW)[0].status).toBe(status);
});

// theNextSyncRepairsStuckActionsButNeverOneOnScreen
it('repairs stuck actions on the next sync, but never one on screen', () => {
  const stuck = waiting(action(NOW + 3_600_000));
  const open = waiting(action(NOW + 3_600_000));
  const due = waiting(action(NOW - 60_000));
  const released = releaseActions([stuck, open, due], new Set([open.id]), NOW);
  expect(released.map((item) => item.status)).toEqual(['scheduled', 'awaitingApproval', 'awaitingApproval']);
  expect(desiredNotifications(released, NOW).map((item) => item.actionId)).toEqual([stuck.id]);
});

// aNewFutureScheduleRebuildsAStuckActionAtTheNewTime
it('rebuilds a stuck action at a new future time', () => {
  const past = '2026-09-24T08:50:00Z';
  const future = '2026-09-24T11:00:00Z';
  const task = (startAt: string) => ({ id: 't1', title: 'Call electrician', status: 'PLANNED', priority: 'NORMAL', durationMin: 30, startAt });
  const first = reconcileActions({ previous: [], tasks: [task(past)], now: NOW, timeZone: ZONE, newId }).map(waiting);
  const next = reconcileActions({ previous: first, tasks: [task(future)], now: NOW, timeZone: ZONE, newId });
  expect(next[0].scheduledAt).toBe(Date.parse(future));
  expect(desiredNotifications(next, NOW).map((item) => item.fireAt)).toEqual([Date.parse(future)]);
});
