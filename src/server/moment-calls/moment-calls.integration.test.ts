// "Connect me on the day": caller-ID verification, settings, scheduling, the agent's decision and the bridge.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Api = { method: string; path: string; params?: URLSearchParams };
const twilio: Api[] = [];
let callerIdsInTwilio: { sid: string; phone_number: string }[] = [];
let sidCounter = 0;
vi.mock('@/server/moment-calls/twilio', async orig => ({
  ...(await orig<typeof import('@/server/moment-calls/twilio')>()),
  twilioApi: async (_c: unknown, method: string, path: string, params?: URLSearchParams) => {
    twilio.push({ method, path, params });
    if (method === 'GET' && path === '/OutgoingCallerIds.json') return { ok: true, data: { outgoing_caller_ids: callerIdsInTwilio.filter(c => c.phone_number === params?.get('PhoneNumber')) } };
    if (method === 'POST' && path === '/OutgoingCallerIds.json') return { ok: true, data: { validation_code: '482915', phone_number: params?.get('PhoneNumber') } };
    if (method === 'POST' && path === '/Calls.json') return { ok: true, data: { sid: `CA_moment_${++sidCounter}` } };
    return { ok: true, data: {} };
  },
}));
const push = vi.fn(async (message?: unknown) => ({ id: message ? 'p' : '', status: 'SENT' }));
vi.mock('@/providers', async orig => ({ ...(await orig<typeof import('@/providers')>()), pushProvider: { name: 'test', send: (m: unknown) => push(m) } }));

import { prisma } from '@/server/db';
import { MomentError } from '@/server/moments/domain';
import { callerIdStatus, recordCallerIdResult, removeCallerId, startCallerIdVerification } from '@/server/moment-calls/caller-id';
import { afterAgent, callStatus, connectNow, connectStatus, dialResult, executeMomentTool, runMomentCallTick, saveConnect, sessionForMomentCall, twimlForCall } from '@/server/moment-calls/service';

let userId = '', momId = '';
const err = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e) { return e instanceof MomentError ? e.message : String(e); } };

beforeAll(async () => {
  for (const [k, v] of Object.entries({ MOMENT_CALLS_ENABLED: 'true', APP_URL: 'https://app.example.com', NUTRITION_CALL_WORKER_URL: 'wss://worker.example.com/twilio-media', VOICE_WORKER_SECRET: 'wsecret', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_VOICE_NUMBER: '+16502855482' })) vi.stubEnv(k, v);
  userId = (await prisma.user.create({ data: { email: `connect-${Date.now()}@example.com`, name: 'Ravi Kumar', passwordHash: 'x', timeZone: 'America/Los_Angeles' } })).id;
  momId = (await prisma.importantMoment.create({ data: { userId, type: 'birthday', title: 'Mom’s Birthday', firstName: 'Mom', phone: '+91 98765 43210', occurrenceDate: '1960-10-02', timeZoneID: 'Asia/Kolkata', yearly: true, sourceKey: `manual:${Date.now()}` } })).id;
});
beforeEach(() => { twilio.length = 0; push.mockClear(); });
afterAll(() => { vi.unstubAllEnvs(); });

describe('verify my number for caller ID', () => {
  it('requires a proper number, returns Twilio’s code and confirms from the callback', async () => {
    expect(await err(startCallerIdVerification(userId, '650 555'))).toContain('country code');
    callerIdsInTwilio = [{ sid: 'PN_old', phone_number: '+16505550123' }];   // verified earlier in the console
    const started = await startCallerIdVerification(userId, '(650) 555-0123', new Date('2026-09-28T01:00:00Z'));
    expect(started).toEqual({ phone: '+16505550123', status: 'PENDING', validationCode: '482915' });
    expect(twilio.map(t => `${t.method} ${t.path}`)).toEqual(['GET /OutgoingCallerIds.json', 'DELETE /OutgoingCallerIds/PN_old.json', 'POST /OutgoingCallerIds.json']);
    expect(twilio[2].params?.get('StatusCallback')).toBe(`https://app.example.com/api/moment-calls/caller-id-status?userId=${userId}`);
    callerIdsInTwilio = [];
    expect(await err(startCallerIdVerification(userId, '+16505550123', new Date('2026-09-28T01:00:30Z')))).toContain('wait a minute');
    await recordCallerIdResult(userId, { VerificationStatus: 'success', OutgoingCallerIdSid: 'PN_new', To: '+16505550123' });
    expect(await callerIdStatus(userId)).toEqual({ phone: '+16505550123', status: 'VERIFIED' });
  });
  it('never lets a second account claim a number another user verified', async () => {
    const other = await prisma.user.create({ data: { email: `other-${Date.now()}@example.com`, name: 'Other', passwordHash: 'x', timeZone: 'UTC' } });
    expect(await err(startCallerIdVerification(other.id, '+16505550123'))).toContain('another Nexdo account');
  });
});

describe('connect settings on a moment', () => {
  it('previews 9:00 AM Mom’s time and what it means for the user', async () => {
    const status = await connectStatus(userId, [momId], new Date('2026-09-27T12:00:00Z'));
    expect(status).toMatchObject({ available: true, callerId: { status: 'VERIFIED' }, userTimeZone: 'America/Los_Angeles' });
    expect(status.moments[0]).toMatchObject({ enabled: false, time: '09:00', timeZone: 'Asia/Kolkata', recipientPhone: '+919876543210', nextCallAt: '2026-10-02T03:30:00.000Z' });
    expect(status.moments[0].preview).toMatchObject({ recipientLocal: 'Fri 2 Oct, 9:00 AM', userLocal: 'Thu 1 Oct, 8:30 PM', userOk: true });
  });
  it('refuses times outside the user’s calling hours and saves valid ones', async () => {
    const tooLate = await err(saveConnect(userId, { momentId: momId, enabled: true, time: '11:30', timeZone: 'Asia/Kolkata' }, new Date('2026-09-27T12:00:00Z')));
    expect(tooLate).toContain('11:00 PM for you');                                      // 11:30 AM IST = 11:00 PM PDT
    const saved = await saveConnect(userId, { momentId: momId, enabled: true, time: '09:00', timeZone: 'Asia/Kolkata' }, new Date('2026-09-27T12:00:00Z'));
    expect(saved.moments[0]).toMatchObject({ enabled: true, time: '09:00' });
  });
});

describe('the call on the day', () => {
  let callId = '';
  it('rings the user at 9:00 AM Mom’s time, from the Nexdo number, once', async () => {
    const now = new Date('2026-10-02T03:30:20Z');
    const [a, b] = await Promise.all([runMomentCallTick(now), runMomentCallTick(now)]);
    expect((a as { queued: number }).queued + (b as { queued: number }).queued).toBe(1);
    const call = await prisma.momentConnectCall.findFirstOrThrow({ where: { momentId: momId, attempt: 1 } });
    callId = call.id;
    expect(call).toMatchObject({ occurrenceDate: '2026-10-02', status: 'DIALING', twilioCallSid: expect.stringMatching(/^CA_moment_/) });
    const dial = twilio.find(t => t.path === '/Calls.json')!.params!;
    expect([dial.get('To'), dial.get('From'), dial.get('MachineDetection')]).toEqual(['+16505550123', '+16502855482', 'Enable']);
  });
  it('asks through the agent, and bridges with the user’s own number when they say yes', async () => {
    const sid = (await prisma.momentConnectCall.findUniqueOrThrow({ where: { id: callId } })).twilioCallSid!;
    const xml = await twimlForCall(callId, { CallSid: sid, AnsweredBy: 'human' });
    expect(xml).toContain(`value="moment:${callId}.`);
    expect(xml).toContain('/api/moment-calls/after-agent?callId=');
    const session = await sessionForMomentCall(callId, sid);
    expect(session.session.instructions).toContain("It's Mom's birthday today. Want me to connect you to Mom now?");
    expect(session.session.tools.map(t => t.name)).toEqual(['connect_now', 'call_back_later', 'decline']);
    expect(await executeMomentTool(callId, 'connect_now', {})).toMatchObject({ end: true, say: 'Say only: "Connecting you to Mom now."' });
    const bridge = await afterAgent(callId, { CallSid: sid });
    expect(bridge).toContain('<Dial callerId="+16505550123"');
    expect(bridge).toContain('<Number>+919876543210</Number>');
    expect(await dialResult(callId, { CallSid: sid, DialCallStatus: 'completed', DialCallDuration: '312' })).toContain('<Hangup/>');
    expect(await prisma.momentConnectCall.findUniqueOrThrow({ where: { id: callId } })).toMatchObject({ status: 'CONNECTED', talkSeconds: 312 });
  });
  it('tells the user and notifies them when Mom doesn’t pick up', async () => {
    const r = await connectNow(userId, { momentId: momId }, new Date('2026-10-02T15:00:00Z'));  // 8:00 AM PDT
    const call = await prisma.momentConnectCall.findUniqueOrThrow({ where: { id: r.callId } });
    expect(call).toMatchObject({ attempt: 101, direct: true, decision: 'CONNECT' });
    const xml = await twimlForCall(call.id, { CallSid: call.twilioCallSid!, AnsweredBy: 'human' });
    expect(xml).toContain('Connecting you to Mom.');                                    // no agent for "Connect now"
    expect(xml).toContain('<Dial callerId="+16505550123"');
    expect(await dialResult(call.id, { CallSid: call.twilioCallSid!, DialCallStatus: 'no-answer' })).toContain('Mom didn’t pick up');
    expect((await prisma.momentConnectCall.findUniqueOrThrow({ where: { id: call.id } })).status).toBe('RECIPIENT_NO_ANSWER');
    expect(push).toHaveBeenCalledTimes(1);
  });
  it('schedules a call back later the same day, and records a decline', async () => {
    const c = await prisma.momentConnectCall.create({ data: { userId, momentId: momId, occurrenceDate: '2026-10-03', attempt: 1, scheduledFor: new Date(), status: 'IN_PROGRESS', twilioCallSid: 'CA_later' } });
    expect(await executeMomentTool(c.id, 'call_back_later', { minutes: 30 }, new Date('2026-10-03T03:30:00Z'))).toMatchObject({ scheduled: true, end: true });
    expect(await prisma.momentConnectCall.findFirst({ where: { momentId: momId, occurrenceDate: '2026-10-03', attempt: 2 } })).toMatchObject({ status: 'QUEUED' });
    expect(await afterAgent(c.id, { CallSid: 'CA_later' })).toContain('<Hangup/>');
    await callStatus(c.id, { CallSid: 'CA_later', CallStatus: 'completed' });
    expect((await prisma.momentConnectCall.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('CALL_BACK_SCHEDULED');
  });
  it('hangs up on voicemail and sends a "Connect now" notification', async () => {
    const c = await prisma.momentConnectCall.create({ data: { userId, momentId: momId, occurrenceDate: '2026-10-04', attempt: 1, scheduledFor: new Date(), status: 'DIALING', twilioCallSid: 'CA_vm' } });
    expect(await twimlForCall(c.id, { CallSid: 'CA_vm', AnsweredBy: 'machine_start' })).toContain('<Hangup/>');
    expect((await prisma.momentConnectCall.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('MISSED');
    expect(push).toHaveBeenCalledTimes(1);
  });
  it('refuses to bridge without the user’s verified number, rather than showing Nexdo’s', async () => {
    const c = await prisma.momentConnectCall.create({ data: { userId, momentId: momId, occurrenceDate: '2026-10-05', attempt: 1, scheduledFor: new Date(), status: 'IN_PROGRESS', decision: 'CONNECT', twilioCallSid: 'CA_unv' } });
    await prisma.callerIdentity.update({ where: { userId }, data: { status: 'FAILED' } });
    const xml = await afterAgent(c.id, { CallSid: 'CA_unv' });
    expect(xml).toContain('won’t place the call');
    expect(xml).not.toContain('<Dial');
    await prisma.callerIdentity.update({ where: { userId }, data: { status: 'VERIFIED' } });
  });
  it('removing the number turns off connect calls', async () => {
    await removeCallerId(userId);
    expect((await prisma.importantMoment.findUniqueOrThrow({ where: { id: momId } })).connectEnabled).toBe(false);
    expect(await callerIdStatus(userId)).toBeNull();
  });
});
