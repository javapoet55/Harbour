import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  task: { findMany: vi.fn() },
  reminderCall: { create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  nutritionCallSettings: { findUnique: vi.fn() },
  callerIdentity: { findUnique: vi.fn() },
}));
const twilio = vi.hoisted(() => ({ twilioApi: vi.fn() }));
const tasks = vi.hoisted(() => ({ completeTask: vi.fn() }));
vi.mock('@/server/db', () => ({ prisma: db }));
vi.mock('@/server/moment-calls/twilio', () => twilio);
vi.mock('@/server/tasks', () => tasks);

import {
  dialReminderCall, reminderCallGather, reminderCallPhone, reminderCallStatus, reminderCallTwiml, reminderSpeech, reminderTwiml, runReminderCallTick,
} from './reminder-calls';

const NOW = new Date('2026-11-21T17:30:00Z');
const task = { id: 't1', userId: 'u1', title: 'Call the dentist', notes: 'Ask about Tuesday & bring the <insurance> card', status: 'PLANNED', deletedAt: null, notifyCall: true, reminderAt: NOW };
const loaded = (over: Record<string, unknown> = {}) => ({
  id: 'c1', userId: 'u1', taskId: 't1', fireAt: NOW, attempt: 1, status: 'DIALING', twilioCallSid: 'CA1',
  task, user: { name: 'Sri Kumar', timeZone: 'America/New_York' }, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(process.env, { APP_URL: 'https://app-dev.nexdoapp.com', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_VOICE_NUMBER: '+16502855482' });
  delete process.env.REMINDER_CALLS_ENABLED;
  db.reminderCall.updateMany.mockResolvedValue({ count: 1 });
  db.reminderCall.findMany.mockResolvedValue([]);
  db.task.findMany.mockResolvedValue([]);
});

describe('reminderSpeech', () => {
  it('greets by first name, says the local time, then reads the title and notes', () => {
    const speech = reminderSpeech({ name: 'Sri Kumar', title: 'Call the dentist', notes: 'Ask about Tuesday', at: NOW, timeZone: 'America/New_York' });
    expect(speech.greeting).toBe('Hi Sri, this is NexDo with your 12:30 PM reminder.');
    expect(speech.body).toBe('Call the dentist. Details: Ask about Tuesday');
  });
  it('leaves out empty notes and cuts very long notes at a word', () => {
    expect(reminderSpeech({ name: '', title: 'Water plants!', notes: '  ', at: NOW, timeZone: 'UTC' })).toEqual({ greeting: 'Hi, this is NexDo with your 5:30 PM reminder.', body: 'Water plants.' });
    const long = reminderSpeech({ name: 'A', title: 'x', notes: 'word '.repeat(300), at: NOW, timeZone: 'UTC' }).body;
    expect(long.length).toBeLessThan(620);
    expect(long.endsWith('word…')).toBe(true);
  });
});

describe('reminderTwiml', () => {
  it('escapes the reminder text and offers repeat or done', () => {
    const xml = reminderTwiml({ greeting: 'Hi', body: 'Tom & <Jerry>' }, 'https://x/api/reminder-calls/gather?callId=c1&a=1');
    expect(xml).toContain('Tom &amp; &lt;Jerry&gt;');
    expect(xml).toContain('action="https://x/api/reminder-calls/gather?callId=c1&amp;a=1"');
    expect(xml).toContain('Press 1 to hear it again, or press 2 to mark it done.');
    expect(xml).not.toContain('<Jerry>');
  });
});

describe('reminderCallPhone', () => {
  it('prefers the number verified by code call, then a verified caller ID, never an unverified one', async () => {
    db.nutritionCallSettings.findUnique.mockResolvedValue({ phoneE164: '+15550001111', phoneVerifiedAt: NOW });
    db.callerIdentity.findUnique.mockResolvedValue({ phoneE164: '+15550002222', status: 'VERIFIED' });
    expect(await reminderCallPhone('u1')).toBe('+15550001111');
    db.nutritionCallSettings.findUnique.mockResolvedValue({ phoneE164: '+15550001111', phoneVerifiedAt: null });
    expect(await reminderCallPhone('u1')).toBe('+15550002222');
    db.callerIdentity.findUnique.mockResolvedValue({ phoneE164: '+15550002222', status: 'PENDING' });
    expect(await reminderCallPhone('u1')).toBeNull();
  });
});

describe('runReminderCallTick', () => {
  it('does nothing when Twilio is not configured or the feature is off', async () => {
    process.env.REMINDER_CALLS_ENABLED = 'false';
    expect(await runReminderCallTick(NOW)).toEqual({ status: 'not_configured' });
    expect(db.task.findMany).not.toHaveBeenCalled();
  });
  it('queues one call per due reminder, ignores duplicates, and dials ready calls', async () => {
    db.task.findMany.mockResolvedValue([{ id: 't1', userId: 'u1', reminderAt: NOW }, { id: 't2', userId: 'u1', reminderAt: NOW }]);
    db.reminderCall.create.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    db.reminderCall.updateMany.mockResolvedValue({ count: 0 });
    db.reminderCall.findMany.mockResolvedValue([{ id: 'c1' }]);
    const dial = vi.fn().mockResolvedValue({});
    const result = await runReminderCallTick(NOW, dial);
    expect(result).toMatchObject({ status: 'ok', queued: 1, dialed: 1 });
    expect(dial).toHaveBeenCalledWith('c1');
    const where = db.task.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ notifyCall: true, deletedAt: null, reminderAt: { lte: NOW, gte: new Date(NOW.getTime() - 15 * 60_000) } });
  });
});

describe('dialReminderCall', () => {
  const call = (over = {}) => ({ id: 'c1', userId: 'u1', fireAt: NOW, task: { ...task, ...over } });
  it('cancels instead of calling when the reminder was finished or moved', async () => {
    db.reminderCall.findUniqueOrThrow.mockResolvedValue(call({ status: 'COMPLETED' }));
    expect(await dialReminderCall('c1')).toEqual({ status: 'cancelled' });
    db.reminderCall.findUniqueOrThrow.mockResolvedValue(call({ reminderAt: new Date(NOW.getTime() + 60_000) }));
    expect(await dialReminderCall('c1')).toEqual({ status: 'cancelled' });
    expect(twilio.twilioApi).not.toHaveBeenCalled();
  });
  it('never dials a number the user has not verified', async () => {
    db.reminderCall.findUniqueOrThrow.mockResolvedValue(call());
    db.nutritionCallSettings.findUnique.mockResolvedValue(null);
    db.callerIdentity.findUnique.mockResolvedValue(null);
    expect(await dialReminderCall('c1')).toEqual({ status: 'failed' });
    expect(twilio.twilioApi).not.toHaveBeenCalled();
  });
  it('places the call to the verified number with voicemail detection and callbacks', async () => {
    db.reminderCall.findUniqueOrThrow.mockResolvedValue(call());
    db.nutritionCallSettings.findUnique.mockResolvedValue({ phoneE164: '+15550001111', phoneVerifiedAt: NOW });
    twilio.twilioApi.mockResolvedValue({ ok: true, data: { sid: 'CA9' } });
    expect(await dialReminderCall('c1')).toEqual({ status: 'dialing' });
    const params = twilio.twilioApi.mock.calls[0][3] as URLSearchParams;
    expect(params.get('To')).toBe('+15550001111');
    expect(params.get('From')).toBe('+16502855482');
    expect(params.get('Url')).toBe('https://app-dev.nexdoapp.com/api/reminder-calls/twiml?callId=c1');
    expect(params.get('MachineDetection')).toBe('DetectMessageEnd');
    expect(db.reminderCall.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { twilioCallSid: 'CA9' } });
  });
  it('does not dial a call another tick already claimed', async () => {
    db.reminderCall.updateMany.mockResolvedValue({ count: 0 });
    expect(await dialReminderCall('c1')).toEqual({ status: 'not_claimed' });
  });
});

describe('webhooks', () => {
  it('reads the reminder to a person and leaves it on voicemail', async () => {
    db.reminderCall.findUnique.mockResolvedValue(loaded());
    const human = await reminderCallTwiml('c1', { CallSid: 'CA1', AnsweredBy: 'human' });
    expect(human).toContain('Hi Sri, this is NexDo with your 12:30 PM reminder.');
    expect(human).toContain('Call the dentist. Details: Ask about Tuesday &amp; bring the &lt;insurance&gt; card');
    expect(human).toContain('<Gather');
    expect(db.reminderCall.update.mock.calls[0][0].data.status).toBe('IN_PROGRESS');

    db.reminderCall.findUnique.mockResolvedValue(loaded());
    const machine = await reminderCallTwiml('c1', { CallSid: 'CA1', AnsweredBy: 'machine_end_beep' });
    expect(machine).toContain('Call the dentist.');
    expect(machine).not.toContain('<Gather');
    expect(db.reminderCall.update.mock.calls[1][0].data.status).toBe('VOICEMAIL');
  });
  it('hangs up on a request for a different Twilio call', async () => {
    db.reminderCall.findUnique.mockResolvedValue(loaded());
    expect(await reminderCallTwiml('c1', { CallSid: 'CA-other' })).toContain('<Hangup/>');
    expect(db.reminderCall.update).not.toHaveBeenCalled();
  });
  it('repeats on 1 and marks the reminder done on 2', async () => {
    db.reminderCall.findUnique.mockResolvedValue(loaded({ status: 'IN_PROGRESS' }));
    expect(await reminderCallGather('c1', { CallSid: 'CA1', Digits: '1' })).toContain('Here it is again.');
    expect(await reminderCallGather('c1', { CallSid: 'CA1', Digits: '2' })).toContain('marked it complete');
    expect(tasks.completeTask).toHaveBeenCalledWith('u1', 't1', true);
  });
  it('tries a missed call once more, five minutes later, and stops there', async () => {
    db.reminderCall.findUnique.mockResolvedValue(loaded());
    await reminderCallStatus('c1', { CallSid: 'CA1', CallStatus: 'no-answer' });
    expect(db.reminderCall.update.mock.calls[0][0].data.status).toBe('MISSED');
    expect(db.reminderCall.create.mock.calls[0][0].data).toMatchObject({ taskId: 't1', attempt: 2, fireAt: NOW });

    db.reminderCall.create.mockClear();
    db.reminderCall.findUnique.mockResolvedValue(loaded({ attempt: 2 }));
    await reminderCallStatus('c1', { CallSid: 'CA1', CallStatus: 'busy' });
    expect(db.reminderCall.create).not.toHaveBeenCalled();
  });
  it('records a finished call as completed', async () => {
    db.reminderCall.findUnique.mockResolvedValue(loaded({ status: 'IN_PROGRESS' }));
    await reminderCallStatus('c1', { CallSid: 'CA1', CallStatus: 'completed' });
    expect(db.reminderCall.update.mock.calls[0][0].data.status).toBe('COMPLETED');
  });
});
