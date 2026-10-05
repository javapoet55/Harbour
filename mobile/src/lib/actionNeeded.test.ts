import { actionChannels, isValidRecipient, resolveActionNeeded } from './actionNeeded';
import { makeTaskAction, type StoredTaskAction } from './taskAction';

/** Port of ios/Tests/NexdoCoreTests/ActionNeededStateTests.swift. */

const none = { loaded: true, failed: false, business: false, hasResults: false, hasRecipient: false, hasPhone: false, hasEmail: false };

test('a business action routes to the search or the existing shortlist', () => {
  expect(resolveActionNeeded({ ...none, business: true })).toEqual({ kind: 'findBusiness' });
  expect(resolveActionNeeded({ ...none, business: true, hasResults: true })).toEqual({ kind: 'chooseBusiness' });
  // A stale selected business with no usable contact details must remain recoverable.
  expect(resolveActionNeeded({ ...none, business: true, hasResults: true, hasRecipient: true })).toEqual({ kind: 'chooseBusiness' });
});

test('a personal action offers recovery and only the available channels', () => {
  expect(resolveActionNeeded(none)).toEqual({ kind: 'chooseContact' });
  expect(resolveActionNeeded({ ...none, business: true, hasResults: true, hasRecipient: true, hasPhone: true })).toEqual({ kind: 'ready', channels: ['call', 'message'] });
  expect(actionChannels(false, true)).toEqual(['email']);
  expect(actionChannels(true, true)).toEqual(['call', 'message', 'email']);
});

test('the lookup has loading and retry states', () => {
  expect(resolveActionNeeded({ ...none, loaded: false })).toEqual({ kind: 'loading' });
  expect(resolveActionNeeded({ ...none, loaded: false, failed: true })).toEqual({ kind: 'retry' });
});

test('manual recipient validation', () => {
  expect(isValidRecipient({ name: 'Sam', phone: '+1 (925) 555-0100', email: '' })).toBe(true);
  expect(isValidRecipient({ name: 'Sam', phone: '', email: 'sam@example.com' })).toBe(true);
  for (const [name, phone, email] of [
    ['', '9255550100', ''],
    ['Sam', '', ''],
    ['Sam', 'abc123', ''],
    ['Sam', '12', ''],
    ['Sam', '', 'bad@'],
    ['Sam', '', 'sam @example.com'],
  ]) {
    expect(isValidRecipient({ name, phone, email })).toBe(false);
  }
});

test('recipient persistence is backward compatible', () => {
  let action: StoredTaskAction = makeTaskAction({
    id: 'a1',
    taskId: 'task',
    title: 'Contact plumber',
    detection: { intent: 'contact', contactName: 'plumber', preferredAction: null, scheduledAt: null, context: null } as never,
    scheduledAt: null,
  });
  const roundTrip = (value: StoredTaskAction) => JSON.parse(JSON.stringify(value)) as StoredTaskAction;
  expect(roundTrip(action).businessCandidateID ?? null).toBeNull();
  action = { ...action, businessCandidateID: 'chosen-place' };
  expect(roundTrip(action)).toEqual(action);
  action = { ...action, businessCandidateID: null, manualRecipient: { name: 'Sam', phone: '9255550100', email: '' } };
  expect(roundTrip(action)).toEqual(action);
});
