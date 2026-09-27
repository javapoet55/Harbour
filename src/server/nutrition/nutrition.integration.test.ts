// End-to-end service test on the SQLite test database: settings, phone verification, scheduling,
// dialing, TwiML, the worker session, every tool, completion, no-answer policies and the food log.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('node:crypto', async orig => ({ ...(await orig<typeof import('node:crypto')>()), randomInt: () => 123456 }));
let sidCounter = 0;
const dialMock = vi.fn(async () => ({ sid: `CA_test_${++sidCounter}` }));
vi.mock('@/server/nutrition/twilio', async orig => ({ ...(await orig<typeof import('@/server/nutrition/twilio')>()), createTwilioCall: (...a: unknown[]) => dialMock(...(a as [])) }));
const push = vi.fn(async () => ({ status: 'SENT' }));
const sms = vi.fn(async (message?: { to: string; text: string }) => ({ id: message ? 's' : '', status: 'SENT' }));
vi.mock('@/providers', async orig => ({ ...(await orig<typeof import('@/providers')>()), pushProvider: { name: 'test', send: (...a: unknown[]) => push(...(a as [])) }, smsProvider: { name: 'test', send: (...a: unknown[]) => sms(...(a as [])) } }));

import { prisma } from '@/server/db';
import { readSettings, startPhoneVerification, updateSettings, verifyPhone } from '@/server/nutrition/settings';
import { addEntry, dayLog, deleteEntry, periodSummary, updateEntry } from '@/server/nutrition/log';
import { completeCall, dialCall, executeTool, handleCallStatus, requestCallNow, runNutritionTick, sessionForCall, twimlForCall } from '@/server/nutrition/calls';
import { NutritionError } from '@/server/nutrition/errors';
import { ZodError } from 'zod';
import type { FoodFacts } from '@/server/shopping/food/model';

const banana: FoodFacts = { schemaVersion: 1, id: 'USDA:173944', name: 'Bananas, raw', source: 'USDA', sourceProductId: '173944', sourceURL: '', matchQuality: 'representative_generic', retrievedAt: '', expiresAt: '', dataCompleteness: 'partial', nutritionUnavailable: false, nutrition: { servingSize: '100 g', servingAmount: 100, servingUnit: 'g', calories: 89, protein: 1.1, carbohydrates: 22.8, totalFat: 0.3 }, contains: [], mayContain: [], allergenStatus: 'unknown', dietary: [], freeFrom: [], bestFor: [] };
const lookup = async (q: { name: string }) => (q.name === 'banana' ? banana : null);
let userId = '';

beforeAll(async () => {
  for (const [k, v] of Object.entries({ NUTRITION_CALLS_ENABLED: 'true', APP_URL: 'https://app.example.com', NUTRITION_CALL_WORKER_URL: 'wss://worker.example.com/twilio-media', VOICE_WORKER_SECRET: 'wsecret', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_VOICE_NUMBER: '+15550000000' })) vi.stubEnv(k, v);
  userId = (await prisma.user.create({ data: { email: `nutrition-${Date.now()}@example.com`, name: 'Asha Rao', passwordHash: 'x', timeZone: 'America/Los_Angeles' } })).id;
});
beforeEach(() => { dialMock.mockClear(); push.mockClear(); });
afterAll(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
const code = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e) { return e instanceof NutritionError ? e.code : String(e); } };

describe('settings and phone verification', () => {
  it('refuses to enable calls before the phone is verified, then enables with consent', async () => {
    expect((await readSettings(userId, 'America/Los_Angeles')).enabled).toBe(false);
    expect(await code(updateSettings(userId, 'America/Los_Angeles', { enabled: true }))).toBe('PHONE_NOT_VERIFIED');
    expect(await code(startPhoneVerification(userId, 'America/Los_Angeles', '555-1234'))).toBe('INVALID_PHONE');
    await startPhoneVerification(userId, 'America/Los_Angeles', '+14155550123', new Date('2026-09-27T20:00:00Z'));
    expect(await code(startPhoneVerification(userId, 'America/Los_Angeles', '+14155550123', new Date('2026-09-27T20:00:30Z')))).toBe('CODE_THROTTLED');
    expect(await code(verifyPhone(userId, 'x', '000000', new Date('2026-09-27T20:01:00Z')))).toBe('INVALID_CODE');
    expect((await verifyPhone(userId, 'x', '123456', new Date('2026-09-27T20:01:00Z'))).phoneVerified).toBe(true);
    const s = await updateSettings(userId, 'x', { enabled: true, voice: 'cedar', localTime: '20:00', noAnswer: 'RETRY_ONCE', calorieGoal: 1800 });
    expect(s).toMatchObject({ enabled: true, voice: 'cedar', noAnswer: 'RETRY_ONCE', calorieGoal: 1800, phone: '+14155550123' });
    expect((await prisma.nutritionCallSettings.findUnique({ where: { userId } }))?.consentAt).not.toBeNull();
    await expect(updateSettings(userId, 'x', { voice: 'fable' })).rejects.toBeInstanceOf(ZodError);
    expect((sms.mock.calls[0][0] as { to: string; text: string })).toEqual({ to: '+14155550123', text: 'Your NexDo check-in code is 123456. It expires in 10 minutes.' });
  });
});

describe('scheduling and a full call', () => {
  let callId = '';
  it('queues exactly one call at 20:00 local even when ticks overlap', async () => {
    const now = new Date('2026-09-28T03:00:30Z'); // 20:00:30 PDT on Sep 27
    const dialed: string[] = [];
    const [a, b] = await Promise.all([runNutritionTick(now, async id => dialed.push(id)), runNutritionTick(now, async id => dialed.push(id))]);
    expect((a as { queued: number }).queued + (b as { queued: number }).queued).toBe(1);
    const calls = await prisma.nutritionCall.findMany({ where: { userId } });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ localDate: '2026-09-27', attempt: 1, status: 'QUEUED' });
    callId = calls[0].id;
    expect(await runNutritionTick(new Date('2026-09-28T02:00:00Z'), async () => {})).toMatchObject({ queued: 0 });
  });
  it('dials through Twilio with the 5-minute limit and machine detection', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-28T03:01:00Z'));
    expect(await dialCall(callId)).toEqual({ status: 'dialing' });
    expect(await dialCall(callId)).toEqual({ status: 'not_claimed' });   // a second dial never happens
    vi.useRealTimers();
    const req = (dialMock.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(req).toMatchObject({ to: '+14155550123', from: '+15550000000', timeLimitSeconds: 300, twimlUrl: `https://app.example.com/api/nutrition-calls/twiml?callId=${callId}` });
    expect((await prisma.nutritionCall.findUnique({ where: { id: callId } }))?.twilioCallSid).toBe('CA_test_1');
  });
  it('bridges a human to the worker with a signed token', async () => {
    const twiml = await twimlForCall(callId, { CallSid: 'CA_test_1', AnsweredBy: 'human' });
    expect(twiml).toContain('<Connect><Stream url="wss://worker.example.com/twilio-media">');
    expect(twiml).toContain(`name="callToken" value="${callId}.`);
    expect((await prisma.nutritionCall.findUnique({ where: { id: callId } }))?.status).toBe('IN_PROGRESS');
    expect(await twimlForCall(callId, { CallSid: 'CA_other' })).toContain('<Hangup/>');
  });
  it('gives the worker a session with the chosen voice and what is already logged', async () => {
    await addEntry(userId, { date: '2026-09-27', meal: 'BREAKFAST', description: 'coffee', kcal: 25 }, lookup);
    const s = await sessionForCall(callId, 'CA_test_1');
    expect(s.session.audio.output.voice).toBe('cedar');
    expect(s.session.instructions).toContain('Hi Asha');
    expect(s.session.instructions).toContain('"description":"coffee"');
    expect(s.session.instructions).toContain('goal of 1800 kcal');
    expect(s).toMatchObject({ maxSeconds: 300, wrapUpAtSeconds: 250 });
    expect(await code(sessionForCall(callId, 'CA_wrong'))).toBe('NOT_FOUND');
  });
  it('logs, corrects and confirms items through tools', async () => {
    const logged = await executeTool(callId, 'log_food_items', { items: [
      { meal: 'BREAKFAST', description: 'a banana', foodName: 'banana', quantity: 1, unit: 'piece', estimatedGrams: 118, estimatedKcal: 999 },
      { meal: 'LUNCH', description: 'chicken biryani, a big plate', foodName: 'chicken biryani', estimatedGrams: 400, estimatedKcal: 700 },
      { meal: 'SNACKS', description: 'a handful of almonds', foodName: 'almonds', estimatedGrams: 28, estimatedKcal: 160 },
    ] }, lookup) as { saved: { id: string; kcal: number; estimate: boolean }[]; dayTotalKcal: number };
    expect(logged.saved.map(s => [s.kcal, s.estimate])).toEqual([[105, false], [700, true], [160, true]]);
    expect(logged.dayTotalKcal).toBe(25 + 105 + 700 + 160);
    expect(await executeTool(callId, 'log_food_items', { items: [{ meal: 'DINNER' }] }, lookup)).toMatchObject({ error: 'invalid_arguments' });
    const almonds = logged.saved[2].id;
    expect(await executeTool(callId, 'remove_food_item', { id: almonds }, lookup)).toMatchObject({ removed: true, dayTotalKcal: 830 });
    const upd = await executeTool(callId, 'update_food_item', { id: logged.saved[0].id, quantity: 2, estimatedGrams: 236 }, lookup);
    expect(upd).toMatchObject({ updated: { kcal: 210 }, dayTotalKcal: 935 });
    const summary = await executeTool(callId, 'get_day_summary', {}, lookup) as { items: unknown[]; totalKcal: number; goalKcal: number };
    expect(summary).toMatchObject({ totalKcal: 935, goalKcal: 1800 });
    expect(summary.items).toHaveLength(3);
    expect(await executeTool(callId, 'finish_call', { confirmed: true }, lookup)).toEqual({ ok: true, end: true });
    const entries = await prisma.foodLogEntry.findMany({ where: { callId }, orderBy: { createdAt: 'asc' } });
    expect(entries.map(e => e.status)).toEqual(['CONFIRMED', 'NEEDS_REVIEW']); // the estimate stays flagged for review
  });
  it('stores transcripts and flags items the backup transcript never heard', async () => {
    await completeCall(callId, { durationSec: 184, endReason: 'finished', noiseFilter: 'openai_only',
      transcript: [{ role: 'user', text: 'I had two bananas and chicken biryani' }], backupTranscript: ['I had two bananas', 'and some rice for lunch'] });
    const call = await prisma.nutritionCall.findUniqueOrThrow({ where: { id: callId } });
    expect(call).toMatchObject({ status: 'COMPLETED', durationSec: 184, endReason: 'finished', noiseFilter: 'openai_only' });
    expect(JSON.parse(call.transcriptJson!)).toHaveLength(1);
    const entries = await prisma.foodLogEntry.findMany({ where: { callId }, orderBy: { createdAt: 'asc' } });
    expect(entries.map(e => [e.foodName, e.status, e.reviewReason])).toEqual([
      ['banana', 'CONFIRMED', null],
      ['chicken biryani', 'NEEDS_REVIEW', 'no_database_match'],
    ]);
    expect(await executeTool(callId, 'get_day_summary', {}, lookup)).toMatchObject({ error: 'call_not_active', end: true });
  });
});

describe('no answer, call-backs and the app food log', () => {
  it('retries once after 15 minutes on no answer when the user chose Retry once', async () => {
    const c = await prisma.nutritionCall.create({ data: { userId, localDate: '2026-09-29', attempt: 1, scheduledFor: new Date(), status: 'DIALING', twilioCallSid: 'CA_na' } });
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-30T03:00:00Z')); // 20:00 PDT
    await handleCallStatus(c.id, { CallSid: 'CA_na', CallStatus: 'no-answer' });
    vi.useRealTimers();
    expect((await prisma.nutritionCall.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('NO_ANSWER');
    const retry = await prisma.nutritionCall.findFirstOrThrow({ where: { userId, localDate: '2026-09-29', attempt: 2 } });
    expect(retry.status).toBe('QUEUED');
    expect(retry.scheduledFor.toISOString()).toBe('2026-09-30T03:15:00.000Z');
  });
  it('hangs up on voicemail and sends the missed-call notification when the user chose Notify me', async () => {
    await updateSettings(userId, 'x', { noAnswer: 'NOTIFY' });
    const c = await prisma.nutritionCall.create({ data: { userId, localDate: '2026-09-30', attempt: 1, scheduledFor: new Date(), status: 'DIALING', twilioCallSid: 'CA_vm' } });
    expect(await twimlForCall(c.id, { CallSid: 'CA_vm', AnsweredBy: 'machine_start' })).toContain('<Hangup/>');
    expect((await prisma.nutritionCall.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('VOICEMAIL');
    expect(push).toHaveBeenCalledTimes(1);
  });
  it('schedules a call-back inside the calling window only', async () => {
    const c = await prisma.nutritionCall.create({ data: { userId, localDate: '2026-10-01', attempt: 1, scheduledFor: new Date(), status: 'IN_PROGRESS' } });
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-02T03:00:00Z')); // 20:00 PDT
    expect(await executeTool(c.id, 'call_back_later', { minutes: 30 }, lookup)).toMatchObject({ scheduled: true, end: true });
    const late = await prisma.nutritionCall.create({ data: { userId, localDate: '2026-10-02', attempt: 1, scheduledFor: new Date(), status: 'IN_PROGRESS' } });
    vi.setSystemTime(new Date('2026-10-03T04:15:00Z')); // 21:15 PDT; +30 min is past 21:30
    expect(await executeTool(late.id, 'call_back_later', { minutes: 30 }, lookup)).toMatchObject({ scheduled: false, end: true });
    vi.useRealTimers();
  });
  it('supports the food log screens: day view, manual add, edit, delete and week totals', async () => {
    const day = await dayLog(userId, '2026-09-27');
    expect(day.totals.kcal).toBe(25 + 210 + 700);
    expect(day.needsReview).toBe(1);
    const added = await addEntry(userId, { date: '2026-09-27', meal: 'DINNER', description: 'banana', foodName: 'banana', grams: 100 }, lookup);
    expect(added).toMatchObject({ kcal: 89, source: 'USDA', status: 'CONFIRMED' });
    const flagged = day.entries.find(e => e.status === 'NEEDS_REVIEW')!;
    expect(await updateEntry(userId, flagged.id, { kcal: 650 })).toMatchObject({ kcal: 650, source: 'MANUAL', status: 'CONFIRMED' });
    expect(await deleteEntry(userId, added.id)).toEqual({ deleted: true });
    expect(await code(deleteEntry(userId, added.id))).toBe('NOT_FOUND');
    const week = await periodSummary(userId, '2026-09-28', 7);
    expect(week.daily.find(d => d.date === '2026-09-27')?.kcal).toBe(25 + 210 + 650);
    expect(week).toMatchObject({ daysLogged: 1, calorieGoal: 1800 });
  });
  it('rate-limits "call me now" and respects the calling window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T03:00:00Z'));
    expect((await requestCallNow(userId, new Date('2026-10-05T03:00:00Z'))).status).toBe('dialing');
    expect(await code(requestCallNow(userId, new Date('2026-10-05T03:05:00Z')))).toBe('CALL_COOLDOWN');
    expect(await code(requestCallNow(userId, new Date('2026-10-05T12:00:00Z')))).toBe('OUTSIDE_CALL_WINDOW'); // 05:00 PDT
    vi.useRealTimers();
  });
});
