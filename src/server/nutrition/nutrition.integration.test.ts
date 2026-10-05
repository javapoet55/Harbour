// End-to-end service test on the SQLite test database: settings, phone verification, scheduling,
// dialing, TwiML, the worker session, every tool, completion, no-answer policies and the food log.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('node:crypto', async orig => ({ ...(await orig<typeof import('node:crypto')>()), randomInt: () => 123456 }));
let sidCounter = 0;
const dialMock = vi.fn(async () => ({ sid: `CA_test_${++sidCounter}` }));
const codeCall = vi.fn(async (req: { to: string; code: string }) => ({ sid: req.to ? 'CA_code' : '' }));
vi.mock('@/server/nutrition/twilio', async orig => ({ ...(await orig<typeof import('@/server/nutrition/twilio')>()), createTwilioCall: (...a: unknown[]) => dialMock(...(a as [])), placeCodeCall: (req: { to: string; code: string }) => codeCall(req) }));
const push = vi.fn(async () => ({ status: 'SENT' }));
const sms = vi.fn(async (message?: { to: string; text: string }) => ({ id: message ? 's' : '', status: 'SENT' }));
vi.mock('@/providers', async orig => ({ ...(await orig<typeof import('@/providers')>()), pushProvider: { name: 'test', send: (...a: unknown[]) => push(...(a as [])) }, smsProvider: { name: 'test', send: (...a: unknown[]) => sms(...(a as [])) } }));

import { prisma } from '@/server/db';
import { readSettings, startPhoneVerification, updateSettings, verifyPhone } from '@/server/nutrition/settings';
import { addEntry, dayLog, deleteEntry, periodSummary, updateEntry } from '@/server/nutrition/log';
import { completeCall, dialCall, executeTool, handleCallStatus, requestCallNow, runNutritionTick, sessionForCall, twimlForCall } from '@/server/nutrition/calls';
import { NutritionError } from '@/server/nutrition/errors';
import { settleLateLookups } from '@/server/nutrition/fast-lookup';
import { dailyInsight, handleInsight } from '@/server/nutrition/insights';
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
    expect(codeCall).toHaveBeenCalledTimes(1);                       // the code is read aloud by phone call, not SMS
    expect(codeCall.mock.calls[0][0]).toMatchObject({ to: '+14155550123', code: '123456', from: '+15550000000' });
    expect(sms).not.toHaveBeenCalled();
  });
  it('keeps the verified number and does not throttle when the code send fails', async () => {
    codeCall.mockImplementationOnce(async () => ({ error: 'twilio down', sid: '' }));
    expect(await code(startPhoneVerification(userId, 'America/Los_Angeles', '+14155550124', new Date('2026-09-27T20:01:00Z')))).toBe('CODE_UNAVAILABLE');
    const s = await prisma.nutritionCallSettings.findUniqueOrThrow({ where: { userId } });
    expect(s).toMatchObject({ phoneE164: '+14155550123', enabled: true });   // the failed send did not wipe verification or calls
    expect(s.phoneVerifiedAt).not.toBeNull();
    // The failed send never wrote phoneCodeSentAt, so an immediate retry is allowed, and re-sending
    // to the already-verified number leaves the verification in place.
    await expect(startPhoneVerification(userId, 'America/Los_Angeles', '+14155550123', new Date('2026-09-27T20:01:30Z'))).resolves.toMatchObject({ sent: false, alreadyVerified: true });
    expect((await readSettings(userId, 'x')).phoneVerified).toBe(true);
  });
});

describe('retained phone verification', () => {
  it.each(['voice', 'sms'])('reuses the verified number without sending %s or changing settings', async channel => {
    const owner = await prisma.user.create({ data: { email: `retained-${channel}-${crypto.randomUUID()}@example.com`, name: 'Test Customer', passwordHash: 'x', timeZone: 'UTC' } });
    const now = new Date('2026-09-27T20:00:30Z');
    await prisma.nutritionCallSettings.create({ data: {
      userId: owner.id, phoneE164: '+14155550123', phoneVerifiedAt: now,
      phoneCodeSentAt: now, enabled: true, consentAt: now, localTime: '19:00', voice: 'cedar', calorieGoal: 1800,
    } });
    const before = await prisma.nutritionCallSettings.findUniqueOrThrow({ where: { userId: owner.id } });
    const voiceCount = codeCall.mock.calls.length, smsCount = sms.mock.calls.length;
    const previous = process.env.NUTRITION_PHONE_CODE_CHANNEL;
    process.env.NUTRITION_PHONE_CODE_CHANNEL = channel;
    try {
      for (const when of [now, new Date('2027-09-27T20:00:30Z')]) {
        expect(await startPhoneVerification(owner.id, 'UTC', '  +14155550123  ', when)).toEqual({ sent: false, alreadyVerified: true, phoneVerified: true, message: 'Already verified' });
      }
      expect(await prisma.nutritionCallSettings.findUniqueOrThrow({ where: { userId: owner.id } })).toEqual(before);
      await updateSettings(owner.id, 'UTC', { enabled: false });
      expect(await startPhoneVerification(owner.id, 'UTC', '+14155550123', now)).toMatchObject({ alreadyVerified: true });
      expect((await readSettings(owner.id, 'UTC')).enabled).toBe(false);
      expect(codeCall).toHaveBeenCalledTimes(voiceCount);
      expect(sms).toHaveBeenCalledTimes(smsCount);
    } finally {
      if (previous === undefined) delete process.env.NUTRITION_PHONE_CODE_CHANNEL;
      else process.env.NUTRITION_PHONE_CODE_CHANNEL = previous;
      await prisma.user.delete({ where: { id: owner.id } });
    }
  });

  it('still verifies changed numbers and does not reuse another account’s verification', async () => {
    const owner = await prisma.user.create({ data: { email: `changed-${crypto.randomUUID()}@example.com`, name: 'Test Customer', passwordHash: 'x', timeZone: 'UTC' } });
    const other = await prisma.user.create({ data: { email: `other-${crypto.randomUUID()}@example.com`, name: 'Test Customer', passwordHash: 'x', timeZone: 'UTC' } });
    const now = new Date('2026-09-27T20:00:00Z');
    await prisma.nutritionCallSettings.create({ data: { userId: owner.id, phoneE164: '+14155550123', phoneVerifiedAt: now, enabled: true } });
    try {
      expect(await startPhoneVerification(other.id, 'UTC', '+14155550123', now)).toMatchObject({ sent: true, alreadyVerified: false });
      expect(await startPhoneVerification(owner.id, 'UTC', '+14155550124', now)).toMatchObject({ sent: true, alreadyVerified: false });
      expect(await readSettings(owner.id, 'UTC')).toMatchObject({ phone: '+14155550124', phoneVerified: false, enabled: false });
      expect(await code(updateSettings(owner.id, 'UTC', { enabled: true }))).toBe('PHONE_NOT_VERIFIED');
      expect(await verifyPhone(owner.id, 'UTC', '123456', now)).toMatchObject({ phoneVerified: true });
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    }
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

describe('fast saving during a call', () => {
  const slow = (ms: number, facts: FoodFacts | null) => async () => { await new Promise(r => setTimeout(r, ms)); return facts; };
  it('looks up a meal in parallel and saves slow foods right away, then fills in the database values', async () => {
    vi.stubEnv('NUTRITION_LOOKUP_BUDGET_MS', '60');
    const c = await prisma.nutritionCall.create({ data: { userId, localDate: '2026-10-10', attempt: 1, scheduledFor: new Date(), status: 'IN_PROGRESS' } });
    let active = 0, peak = 0;
    const lookup = async (q: { name: string }) => {
      active++; peak = Math.max(peak, active);
      await new Promise(r => setTimeout(r, q.name === 'banana' ? 250 : 20));
      active--;
      return q.name === 'banana' ? banana : null;
    };
    const started = Date.now();
    const result = await executeTool(c.id, 'log_food_items', { items: [
      { meal: 'BREAKFAST', description: 'a banana', foodName: 'banana', estimatedGrams: 118, estimatedKcal: 110 },
      { meal: 'BREAKFAST', description: 'masala dosa', foodName: 'masala dosa', estimatedGrams: 200, estimatedKcal: 380 },
    ] }, lookup) as { saved: { id: string; kcal: number }[] };
    expect(Date.now() - started).toBeLessThan(220);                 // did not wait for the 250 ms lookup
    expect(peak).toBe(2);                                            // both foods looked up at the same time
    expect(result.saved.map(s => s.kcal)).toEqual([110, 380]);       // banana: estimate for now
    const pending = await prisma.foodLogEntry.findUniqueOrThrow({ where: { id: result.saved[0].id } });
    expect(pending).toMatchObject({ status: 'DRAFT', reviewReason: 'lookup_pending', source: 'ESTIMATE' });
    await settleLateLookups();
    const filled = await prisma.foodLogEntry.findUniqueOrThrow({ where: { id: result.saved[0].id } });
    expect(filled).toMatchObject({ kcal: 105, source: 'USDA', status: 'DRAFT', reviewReason: null });
    const dosa = await prisma.foodLogEntry.findUniqueOrThrow({ where: { id: result.saved[1].id } });
    expect(dosa).toMatchObject({ status: 'NEEDS_REVIEW', reviewReason: 'no_database_match', kcal: 380 });
    expect(await executeTool(c.id, 'finish_call', { confirmed: true }, lookup)).toMatchObject({ end: true });
    expect((await prisma.foodLogEntry.findUniqueOrThrow({ where: { id: result.saved[0].id } })).status).toBe('CONFIRMED');
    vi.unstubAllEnvs();
    for (const [k, v] of Object.entries({ NUTRITION_CALLS_ENABLED: 'true', APP_URL: 'https://app.example.com', NUTRITION_CALL_WORKER_URL: 'wss://worker.example.com/twilio-media', VOICE_WORKER_SECRET: 'wsecret', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_VOICE_NUMBER: '+15550000000' })) vi.stubEnv(k, v);
  });
  it('never lets a late lookup overwrite a correction made on the call', async () => {
    vi.stubEnv('NUTRITION_LOOKUP_BUDGET_MS', '50');
    const c = await prisma.nutritionCall.create({ data: { userId, localDate: '2026-10-11', attempt: 1, scheduledFor: new Date(), status: 'IN_PROGRESS' } });
    const saved = await executeTool(c.id, 'log_food_items', { items: [{ meal: 'LUNCH', description: 'a banana', foodName: 'banana', estimatedGrams: 118, estimatedKcal: 110 }] }, slow(200, banana)) as { saved: { id: string }[] };
    const id = saved.saved[0].id;
    await executeTool(c.id, 'update_food_item', { id, foodName: 'plantain', estimatedGrams: 150, estimatedKcal: 180 }, async () => null);
    await settleLateLookups();
    expect(await prisma.foodLogEntry.findUniqueOrThrow({ where: { id } })).toMatchObject({ foodName: 'plantain', kcal: 180 });
    vi.stubEnv('NUTRITION_LOOKUP_BUDGET_MS', '800');
  });
  it('applies a calorie-only correction to an estimated item', async () => {
    const c = await prisma.nutritionCall.create({ data: { userId, localDate: '2026-10-12', attempt: 1, scheduledFor: new Date(), status: 'IN_PROGRESS' } });
    const saved = await executeTool(c.id, 'log_food_items', { items: [{ meal: 'LUNCH', description: 'chicken biryani', foodName: 'chicken biryani', estimatedGrams: 400, estimatedKcal: 700 }] }, lookup) as { saved: { id: string }[] };
    const id = saved.saved[0].id;
    const upd = await executeTool(c.id, 'update_food_item', { id, estimatedKcal: 620 }, lookup);
    expect(upd).toMatchObject({ updated: { kcal: 620 } });
    expect(await prisma.foodLogEntry.findUniqueOrThrow({ where: { id } })).toMatchObject({ kcal: 620, source: 'ESTIMATE', status: 'NEEDS_REVIEW' });
  });
});

describe('daily insight and one action', () => {
  let other = '';
  beforeAll(async () => {
    other = (await prisma.user.create({ data: { email: `insight-${Date.now()}@example.com`, name: 'Meera', passwordHash: 'x', timeZone: 'America/Los_Angeles' } })).id;
    await updateSettings(other, 'America/Los_Angeles', { goals: { Protein: 120, Fiber: 25, Calcium: 1000, Iron: 18, 'Vitamin D': 800 } });
    const full = { fiberG: 30, calciumMg: 1100, ironMg: 20, vitaminDIu: 900 };
    for (const [i, d] of ['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'].entries()) {
      await prisma.foodLogEntry.create({ data: { userId: other, localDate: d, meal: 'LUNCH', description: 'rice and curry', foodName: 'rice', kcal: 900, proteinG: 30 + i, ...full, source: 'USDA', status: 'CONFIRMED' } });
    }
    await prisma.shoppingList.create({ data: { id: `list-${Date.now()}`, userId: other, title: 'Weekend shop', date: '2026-09-26', timeZone: 'America/Los_Angeles', items: { create: [{ id: `item-${Date.now()}`, name: 'Eggs', category: 'Dairy', sortOrder: 0 }] } } });
  });
  it('spots the protein pattern and offers foods not already on the list', async () => {
    const insight = await dailyInsight(other, '2026-09-25');
    expect(insight).toMatchObject({ kind: 'GAP', nutrient: 'protein', items: ['Greek yogurt', 'Lentils'], listTitle: 'Weekend shop', state: 'open' });
    expect(insight?.text).toContain('Protein was under 72 g on 4 of your last 4 logged days');
  });
  it('adds the foods to the shopping list once, bumping the list revision', async () => {
    const insight = (await dailyInsight(other, '2026-09-25'))!;
    await expect(handleInsight(other, '2026-09-25', 'forged-key', 'add')).rejects.toBeInstanceOf(NutritionError);
    const before = await prisma.shoppingList.findFirstOrThrow({ where: { userId: other } });
    expect(await handleInsight(other, '2026-09-25', insight.key, 'add')).toEqual({ ok: true, added: ['Greek yogurt', 'Lentils'], listTitle: 'Weekend shop' });
    const after = await prisma.shoppingList.findFirstOrThrow({ where: { userId: other }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
    expect(after.items.map(i => [i.name, i.notes])).toEqual([['Eggs', ''], ['Greek yogurt', 'Suggested by NexDo'], ['Lentils', 'Suggested by NexDo']]);
    expect(after.revision).toBe(before.revision + 1);
    expect(await dailyInsight(other, '2026-09-25')).toMatchObject({ state: 'added' });
    expect((await handleInsight(other, '2026-09-25', insight.key, 'add')).added).toEqual([]);  // pressing again adds nothing
  });
  it('can be dismissed, and turned off entirely', async () => {
    await prisma.foodLogEntry.create({ data: { userId: other, localDate: '2026-09-26', meal: 'LUNCH', description: 'rice', foodName: 'rice', kcal: 900, proteinG: 30, fiberG: 30, calciumMg: 1100, ironMg: 20, vitaminDIu: 900, source: 'USDA', status: 'CONFIRMED' } });
    const next = (await dailyInsight(other, '2026-09-26'))!;
    expect(next.state).toBe('open');                                                     // a new day, a new insight
    await handleInsight(other, '2026-09-26', next.key, 'dismiss');
    expect((await dailyInsight(other, '2026-09-26'))?.state).toBe('dismissed');
    expect((await handleInsight(other, '2026-09-26', next.key, 'add')).added).toEqual([]);  // a dismissed insight stays handled
    await updateSettings(other, 'x', { insightsEnabled: false });
    expect(await dailyInsight(other, '2026-09-26')).toBeNull();
    await updateSettings(other, 'x', { insightsEnabled: true });
  });
  it('offers the insight on the call and adds the foods when the user says yes', async () => {
    await prisma.foodLogEntry.create({ data: { userId: other, localDate: '2026-09-27', meal: 'LUNCH', description: 'rice', foodName: 'rice', kcal: 900, proteinG: 30, fiberG: 30, calciumMg: 1100, ironMg: 20, vitaminDIu: 900, source: 'USDA', status: 'CONFIRMED' } });
    await prisma.shoppingItem.deleteMany({ where: { list: { userId: other }, name: { in: ['Greek yogurt', 'Lentils'] } } });
    const call = await prisma.nutritionCall.create({ data: { userId: other, localDate: '2026-09-27', attempt: 1, scheduledFor: new Date(), status: 'IN_PROGRESS' } });
    const offered = await executeTool(call.id, 'get_daily_insight', {}, lookup) as { insight: { text: string; offersShoppingItems: boolean } };
    expect(offered.insight).toMatchObject({ offersShoppingItems: true });
    expect(offered.insight.text).toMatch(/^Protein was under 72 g/);
    expect(await executeTool(call.id, 'add_insight_items', {}, lookup)).toEqual({ added: ['Greek yogurt', 'Lentils'], listTitle: 'Weekend shop' });
  });
  it('adds the foods only once when two add requests land at the same time', async () => {
    await prisma.foodLogEntry.create({ data: { userId: other, localDate: '2026-09-28', meal: 'LUNCH', description: 'rice', foodName: 'rice', kcal: 900, proteinG: 30, fiberG: 30, calciumMg: 1100, ironMg: 20, vitaminDIu: 900, source: 'USDA', status: 'CONFIRMED' } });
    await prisma.shoppingItem.deleteMany({ where: { list: { userId: other }, name: { in: ['Greek yogurt', 'Lentils'] } } });
    const insight = (await dailyInsight(other, '2026-09-28'))!;
    const [a, b] = await Promise.all([handleInsight(other, '2026-09-28', insight.key, 'add'), handleInsight(other, '2026-09-28', insight.key, 'add')]);
    expect([...a.added, ...b.added].sort()).toEqual(['Greek yogurt', 'Lentils']);
    const list = await prisma.shoppingList.findFirstOrThrow({ where: { userId: other }, include: { items: true } });
    expect(list.items.filter(i => i.name === 'Greek yogurt')).toHaveLength(1);
  });
  it('totals fiber, calcium, iron and vitamin D in the day view', async () => {
    const day = await dayLog(other, '2026-09-22');
    expect(day.totals).toMatchObject({ fiberG: 30, calciumMg: 1100, ironMg: 20, vitaminDIu: 900 });
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
    const week = await periodSummary(userId, '2026-09-24', 7);                 // a Thursday
    expect(week).toMatchObject({ startDate: '2026-09-21', endDate: '2026-09-27', daysLogged: 1, calorieGoal: 1800 }); // Mon–Sun
    expect(week.daily.map(d => d.date)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
    expect(week.daily.find(d => d.date === '2026-09-27')?.kcal).toBe(25 + 210 + 650);
  });
  it('rate-limits "call me now" and respects the calling window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T03:00:00Z'));
    const manual = await requestCallNow(userId, new Date('2026-10-05T03:00:00Z'));
    expect(manual.status).toBe('dialing');
    expect((await prisma.nutritionCall.findUniqueOrThrow({ where: { id: manual.callId } })).attempt).toBe(101);
    expect(await code(requestCallNow(userId, new Date('2026-10-05T03:05:00Z')))).toBe('CALL_COOLDOWN');
    expect(await code(requestCallNow(userId, new Date('2026-10-05T12:00:00Z')))).toBe('OUTSIDE_CALL_WINDOW'); // 05:00 PDT
    vi.useRealTimers();
  });
  it('still places the scheduled evening call on a day with an earlier "call me now" test call', async () => {
    await updateSettings(userId, 'x', { enabled: true, localTime: '20:00' });
    const manual = await prisma.nutritionCall.create({ data: { userId, localDate: '2026-10-06', attempt: 101, scheduledFor: new Date('2026-10-06T21:00:00Z'), status: 'COMPLETED' } });
    const tick = await runNutritionTick(new Date('2026-10-07T03:00:30Z'), async () => {}); // 20:00:30 PDT on Oct 6
    expect(tick).toMatchObject({ queued: 1 });
    const evening = await prisma.nutritionCall.findFirstOrThrow({ where: { userId, localDate: '2026-10-06', attempt: 1 } });
    expect(evening.status).toBe('QUEUED');
    expect(manual.attempt).toBe(101);
  });
});
