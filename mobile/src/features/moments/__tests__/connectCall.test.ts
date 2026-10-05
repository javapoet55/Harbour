import {
  CONNECT_NOTICES,
  connectStatusLabel,
  connectTimeFromDate,
  connectTimeToDate,
  createMomentConnectModel,
  isDirty,
  isVerified,
  mergedStatus,
  type MomentConnectState,
  type MomentConnectStatus,
} from '../connectCall';

/**
 * `MomentConnectModel` (ios/App/MomentConnectCall.swift:35-162). Swift has no unit tests for it; these
 * pin the request shapes and the draft rules the Manage Moment page relies on.
 */

function state(momentId: string, overrides: Partial<MomentConnectState> = {}): MomentConnectState {
  return {
    momentId,
    enabled: false,
    time: '09:00',
    timeZone: 'America/Los_Angeles',
    recipientPhone: '+16505550123',
    passed: false,
    isToday: false,
    nextCallAt: '2026-10-10T16:00:00.000Z',
    preview: { userLocal: 'Sat 10 Oct, 9:00 AM', recipientLocal: 'Sat 10 Oct, 9:00 AM', userOk: true, recipientOk: true },
    lastCall: null,
    ...overrides,
  };
}

function status(moments: MomentConnectState[], overrides: Partial<MomentConnectStatus> = {}): MomentConnectStatus {
  return { available: true, callerId: { phone: '+16505550100', status: 'VERIFIED' }, userTimeZone: 'America/Los_Angeles', moments, ...overrides };
}

function setup(answers: Record<string, unknown>) {
  const request = jest.fn(async (operation: string, input: unknown) => {
    const answer = answers[operation];
    if (answer instanceof Error) throw answer;
    return typeof answer === 'function' ? (answer as (input: unknown) => unknown)(input) : answer;
  });
  const model = createMomentConnectModel({ request: request as never }, ['m1', 'm2']);
  return { model, request };
}

test('load asks for the page\'s moments and seeds drafts and previews from the server', async () => {
  const { model, request } = setup({ connectStatus: status([state('m1'), state('m2', { enabled: true, time: '18:30' })]) });
  await model.getState().load();
  expect(request).toHaveBeenCalledWith('connectStatus', { momentIds: ['m1', 'm2'] });
  expect(model.getState().drafts.m2).toEqual({ enabled: true, time: '18:30', timeZone: 'America/Los_Angeles' });
  expect(model.getState().previews.m1.userLocal).toBe('Sat 10 Oct, 9:00 AM');
  expect(isVerified(model.getState().status)).toBe(true);
});

test('a reload keeps a draft the user is editing and replaces the others', async () => {
  const { model } = setup({ connectStatus: status([state('m1'), state('m2')]) });
  await model.getState().load();
  model.getState().setDraft('m1', { enabled: true, time: '10:15', timeZone: 'America/Los_Angeles' });
  expect(isDirty(model.getState(), 'm1')).toBe(true);
  expect(isDirty(model.getState(), 'm2')).toBe(false);
  await model.getState().load();
  expect(model.getState().drafts.m1.time).toBe('10:15');
});

test('a preview lands only if the draft has not changed again meanwhile; failures keep the old one', async () => {
  let release: (value: unknown) => void = () => undefined;
  const { model, request } = setup({
    connectStatus: status([state('m1')]),
    connectPreview: () => new Promise((resolve) => (release = resolve)),
  });
  await model.getState().load();
  model.getState().setDraft('m1', { enabled: true, time: '10:00', timeZone: 'America/Los_Angeles' });
  const pending = model.getState().refreshPreview('m1');
  model.getState().setDraft('m1', { enabled: true, time: '11:00', timeZone: 'America/Los_Angeles' });
  release({ time: '10:00', timeZone: 'America/Los_Angeles', nextCallAt: '', preview: { userLocal: 'stale', recipientLocal: '', userOk: true, recipientOk: true } });
  await pending;
  expect(request).toHaveBeenCalledWith('connectPreview', { momentId: 'm1', enabled: true, time: '10:00', timeZone: 'America/Los_Angeles' });
  expect(model.getState().previews.m1.userLocal).toBe('Sat 10 Oct, 9:00 AM');
  expect(model.getState().error).toBeNull();
});

test('save merges the one-moment answer and says when Nexdo will call', async () => {
  const saved = state('m1', { enabled: true, time: '10:00', preview: { userLocal: 'Sat 10 Oct, 10:00 AM', recipientLocal: 'Sat 10 Oct, 10:00 AM', userOk: true, recipientOk: true } });
  const { model, request } = setup({ connectStatus: status([state('m1'), state('m2')]), connectSave: status([saved]) });
  await model.getState().load();
  model.getState().setDraft('m1', { enabled: true, time: '10:00', timeZone: 'America/Los_Angeles' });
  await model.getState().save('m1');
  expect(request).toHaveBeenCalledWith('connectSave', { momentId: 'm1', enabled: true, time: '10:00', timeZone: 'America/Los_Angeles' });
  expect(model.getState().status?.moments.map((moment) => moment.momentId)).toEqual(['m2', 'm1']);
  expect(model.getState().notice).toBe(CONNECT_NOTICES.saved('Sat 10 Oct, 10:00 AM'));
  expect(isDirty(model.getState(), 'm1')).toBe(false);
  expect(model.getState().busy).toBe(false);
});

test('turning a call off says so; a refused save shows the server\'s message', async () => {
  const { model } = setup({ connectStatus: status([state('m1', { enabled: true })]), connectSave: status([state('m1')]) });
  await model.getState().load();
  model.getState().setDraft('m1', { enabled: false, time: '09:00', timeZone: 'America/Los_Angeles' });
  await model.getState().save('m1');
  expect(model.getState().notice).toBe(CONNECT_NOTICES.off);

  const refused = setup({ connectStatus: status([state('m1')]), connectSave: new Error('This moment has already passed.') });
  await refused.model.getState().load();
  await refused.model.getState().save('m1');
  expect(refused.model.getState().error).toBe('This moment has already passed.');
});

test('connect now, caller-ID verification and removal', async () => {
  let verified = false;
  const { model, request } = setup({
    connectStatus: () => status([state('m1')], { callerId: verified ? { phone: '+16505550100', status: 'VERIFIED' } : null }),
    connectNow: { callId: 'c1', status: 'dialing' },
    callerIdStart: { phone: '+16505550100', status: 'PENDING', validationCode: '123456' },
    callerIdStatus: () => ({ callerId: { phone: '+16505550100', status: verified ? 'VERIFIED' : 'PENDING' } }),
    callerIdRemove: { removed: true },
  });
  await model.getState().load();
  await model.getState().connectNow('m1');
  expect(request).toHaveBeenCalledWith('connectNow', { momentId: 'm1' });
  expect(model.getState().notice).toBe(CONNECT_NOTICES.calling);

  expect(await model.getState().startVerification('+1 650 555 0100')).toBe('123456');
  expect(request).toHaveBeenCalledWith('callerIdStart', { phone: '+1 650 555 0100' });
  expect(await model.getState().pollVerification()).toBe('PENDING');
  verified = true;
  expect(await model.getState().pollVerification()).toBe('VERIFIED');
  expect(isVerified(model.getState().status)).toBe(true);

  await model.getState().removeNumber();
  expect(request).toHaveBeenCalledWith('callerIdRemove', {});
  expect(model.getState().notice).toBe(CONNECT_NOTICES.removed);
});

test('merging into nothing is the answer itself', () => {
  const partial = status([state('m1')]);
  expect(mergedStatus(null, partial)).toBe(partial);
});

test('status labels', () => {
  expect(connectStatusLabel('CONNECTED')).toBe('Connected');
  expect(connectStatusLabel('QUEUED')).toBe('Call back scheduled');
  expect(connectStatusLabel('RECIPIENT_NO_ANSWER')).toBe('They didn’t pick up');
  expect(connectStatusLabel('IN_PROGRESS')).toBe('Calling…');
  expect(connectStatusLabel('EXPIRED')).toBe('Not placed');
  expect(connectStatusLabel('SOMETHING_NEW')).toBe('Call ended');
});

test('HH:mm converts to today\'s instant in the moment\'s zone and back', () => {
  const now = Date.parse('2026-10-05T20:00:00Z'); // 1 PM in Los Angeles
  const at = connectTimeToDate('18:30', 'America/Los_Angeles', now);
  expect(new Date(at).toISOString()).toBe('2026-10-06T01:30:00.000Z');
  expect(connectTimeFromDate(at, 'America/Los_Angeles')).toBe('18:30');
  expect(connectTimeFromDate(at, 'Asia/Kolkata')).toBe('07:00');
  // Missing parts default to 09:00, as Swift.
  expect(connectTimeFromDate(connectTimeToDate('', 'UTC', now), 'UTC')).toBe('09:00');
});
