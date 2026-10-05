import { z } from 'zod';
import { prisma } from '@/server/db';
import { pushProvider } from '@/providers';
import { log } from '@/lib/logger';
import { portionGrams, type FoodItemInput, type FoodLookup } from './calories';
import { applyLateLookup, caloriesWithinBudget, cancelLateLookup } from './fast-lookup';
import { isRealtimeVoice, DEFAULT_VOICE, LATE_DIAL_GRACE_MINUTES, MANUAL_CALL_COOLDOWN_MINUTES, MEALS, nutritionCallConfig, RETRY_DELAY_MINUTES } from './config';
import { NutritionError } from './errors';
import { keyWords } from './text';
import { dailyInsight, handleInsight } from './insights';
import { defaultLookup } from './log';
import { nutritionCallSession } from './session';
import { dueCall, localDateIn, withinCallWindow } from './time';
import { callToken, createTwilioCall, hangupTwiml, streamTwiml } from './twilio';

type Call = NonNullable<Awaited<ReturnType<typeof prisma.nutritionCall.findUnique>>>;
const TERMINAL = ['COMPLETED', 'NO_ANSWER', 'VOICEMAIL', 'FAILED', 'CANCELLED', 'SKIPPED', 'EXPIRED'];
const MAX_ATTEMPTS_PER_DAY = 4;
/**
 * "Call me now" calls are numbered from 101 so they never take attempt 1, which is reserved for the
 * scheduled daily call (a test call in the afternoon must not block that evening's call).
 */
export const MANUAL_ATTEMPT_BASE = 100;
const attemptNumber = (attempt: number) => attempt % MANUAL_ATTEMPT_BASE;
const isUniqueViolation = (e: unknown) => !!e && typeof e === 'object' && 'code' in e && (e as { code: unknown }).code === 'P2002';

export function callsConfigured(cfg = nutritionCallConfig()) {
  return !!(cfg.appUrl && cfg.workerUrl && cfg.workerSecret && cfg.twilio.accountSid && cfg.twilio.authToken && cfg.twilio.from);
}

/** Minute tick: queue today's due calls, dial queued calls, retire stale rows. Idempotent under overlap. */
export async function runNutritionTick(now = new Date(), dial: (id: string) => Promise<unknown> = dialCall) {
  const cfg = nutritionCallConfig();
  if (!callsConfigured(cfg)) return { status: 'not_configured' as const };
  let queued = 0, dialed = 0, expired = 0, stale = 0;
  const settings = await prisma.nutritionCallSettings.findMany({
    where: { enabled: true, phoneVerifiedAt: { not: null }, phoneE164: { not: null } },
    select: { userId: true, localTime: true, timeZone: true },
  });
  for (const s of settings) {
    const due = dueCall(s.localTime, s.timeZone, now);
    if (!due) continue;
    try {
      await prisma.nutritionCall.create({ data: { userId: s.userId, localDate: due.localDate, attempt: 1, scheduledFor: due.scheduledFor } });
      queued++;
    } catch (e) { if (!isUniqueViolation(e)) throw e; }
  }
  const graceStart = new Date(now.getTime() - LATE_DIAL_GRACE_MINUTES * 60_000);
  expired = (await prisma.nutritionCall.updateMany({ where: { status: 'QUEUED', scheduledFor: { lt: graceStart } }, data: { status: 'EXPIRED' } })).count;
  const ready = await prisma.nutritionCall.findMany({ where: { status: 'QUEUED', scheduledFor: { lte: now, gte: graceStart } }, select: { id: true }, orderBy: { scheduledFor: 'asc' }, take: 50 });
  for (const c of ready) { await dial(c.id); dialed++; }
  // A call can never legitimately run past its time limit plus ringing time.
  const cutoff = new Date(now.getTime() - (cfg.maxSeconds + 10 * 60) * 1000);
  const stuck = await prisma.nutritionCall.findMany({ where: { status: { in: ['DIALING', 'IN_PROGRESS'] }, updatedAt: { lt: cutoff } }, select: { id: true } });
  for (const c of stuck) { await finalizeCall(c.id, { status: 'FAILED', endReason: 'stale' }); stale++; }
  return { status: 'ok' as const, queued, dialed, expired, stale };
}

export async function dialCall(callId: string) {
  const cfg = nutritionCallConfig();
  const claimed = await prisma.nutritionCall.updateMany({ where: { id: callId, status: 'QUEUED' }, data: { status: 'DIALING' } });
  if (!claimed.count) return { status: 'not_claimed' as const };
  const call = await prisma.nutritionCall.findUniqueOrThrow({ where: { id: callId } });
  const settings = await prisma.nutritionCallSettings.findUnique({ where: { userId: call.userId } });
  if (!settings?.enabled || !settings.phoneVerifiedAt || !settings.phoneE164 || !withinCallWindow(settings.timeZone, new Date())) {
    await prisma.nutritionCall.update({ where: { id: callId }, data: { status: 'CANCELLED', endReason: 'not_eligible' } });
    return { status: 'cancelled' as const };
  }
  const result = await createTwilioCall({
    accountSid: cfg.twilio.accountSid, authToken: cfg.twilio.authToken, from: cfg.twilio.from, to: settings.phoneE164,
    twimlUrl: `${cfg.appUrl}/api/nutrition-calls/twiml?callId=${encodeURIComponent(callId)}`,
    statusUrl: `${cfg.appUrl}/api/nutrition-calls/status?callId=${encodeURIComponent(callId)}`,
    timeLimitSeconds: cfg.maxSeconds,
  });
  if ('error' in result) {
    await prisma.nutritionCall.update({ where: { id: callId }, data: { status: 'FAILED', error: result.error, endedAt: new Date() } });
    log('warn', 'nutrition.dial_failed', { error: result.error });
    return { status: 'failed' as const };
  }
  await prisma.nutritionCall.update({ where: { id: callId }, data: { twilioCallSid: result.sid } });
  return { status: 'dialing' as const };
}

/** "Call me now" from the app (for trying the feature). Subject to a cooldown and the calling window. */
export async function requestCallNow(userId: string, now = new Date()) {
  const cfg = nutritionCallConfig();
  if (!cfg.enabled || !callsConfigured(cfg)) throw new NutritionError('CALLS_UNAVAILABLE');
  const settings = await prisma.nutritionCallSettings.findUnique({ where: { userId } });
  if (!settings?.phoneVerifiedAt || !settings.phoneE164) throw new NutritionError('PHONE_NOT_VERIFIED');
  if (!withinCallWindow(settings.timeZone, now)) throw new NutritionError('OUTSIDE_CALL_WINDOW');
  const localDate = localDateIn(settings.timeZone, now);
  const last = await prisma.nutritionCall.findFirst({ where: { userId, localDate, attempt: { gt: MANUAL_ATTEMPT_BASE } }, orderBy: { attempt: 'desc' }, select: { attempt: true } });
  const attempt = Math.max(MANUAL_ATTEMPT_BASE, last?.attempt ?? 0) + 1;
  if (attempt > MANUAL_ATTEMPT_BASE + 20) throw new NutritionError('CALL_COOLDOWN');
  // Claim the cooldown atomically: two concurrent requests cannot both pass a read-then-write check.
  const claimed = await prisma.nutritionCallSettings.updateMany({
    where: { userId, OR: [{ lastManualCallAt: null }, { lastManualCallAt: { lt: new Date(now.getTime() - MANUAL_CALL_COOLDOWN_MINUTES * 60_000) } }] },
    data: { lastManualCallAt: now },
  });
  if (!claimed.count) throw new NutritionError('CALL_COOLDOWN');
  const call = await prisma.nutritionCall.create({ data: { userId, localDate, attempt, scheduledFor: now } });
  const result = await dialCall(call.id);
  return { callId: call.id, status: result.status };
}

/** TwiML for the answered call: bridge humans to the voice worker, hang up on machines. */
export async function twimlForCall(callId: string, params: Record<string, string>) {
  const cfg = nutritionCallConfig();
  const call = await prisma.nutritionCall.findUnique({ where: { id: callId } });
  if (!call || call.status !== 'DIALING' || (call.twilioCallSid && params.CallSid && call.twilioCallSid !== params.CallSid)) return hangupTwiml();
  const answeredBy = params.AnsweredBy ?? null;
  if (answeredBy && /^(machine|fax)/.test(answeredBy)) {
    await finalizeCall(callId, { status: 'VOICEMAIL', endReason: answeredBy, answeredBy });
    return hangupTwiml();
  }
  // Guard on DIALING so a late "completed" status callback (which finalizes the call) cannot race this update.
  const bridged = await prisma.nutritionCall.updateMany({
    where: { id: callId, status: 'DIALING' },
    data: { status: 'IN_PROGRESS', startedAt: new Date(), answeredBy, twilioCallSid: call.twilioCallSid ?? params.CallSid ?? null },
  });
  if (!bridged.count) return hangupTwiml();
  return streamTwiml(cfg.workerUrl, callToken(cfg.workerSecret, callId));
}

/** Twilio status callbacks: only unanswered outcomes change state here; the worker reports finished calls. */
export async function handleCallStatus(callId: string, params: Record<string, string>) {
  const call = await prisma.nutritionCall.findUnique({ where: { id: callId } });
  if (!call || (call.twilioCallSid && params.CallSid && call.twilioCallSid !== params.CallSid)) return;
  const status = params.CallStatus;
  if (['no-answer', 'busy', 'canceled'].includes(status) && call.status === 'DIALING') await finalizeCall(callId, { status: 'NO_ANSWER', endReason: status });
  else if (status === 'failed' && !TERMINAL.includes(call.status)) await finalizeCall(callId, { status: 'FAILED', endReason: 'twilio_failed' });
  else if (status === 'completed' && !TERMINAL.includes(call.status)) {
    const duration = Number(params.CallDuration);
    // An answered call is finalized by the worker's report (it carries the transcripts), which can arrive
    // after this callback. Only record the duration; the tick retires calls the worker never reported.
    if (call.status === 'IN_PROGRESS') {
      if (Number.isFinite(duration)) await prisma.nutritionCall.update({ where: { id: callId }, data: { durationSec: Math.round(duration) } });
    // "completed" while still DIALING means the call was answered but the TwiML fetch never bridged it.
    // That is a failed session, not a no-answer — marking it NO_ANSWER would wrongly redial someone who picked up.
    } else await finalizeCall(callId, { status: 'FAILED', endReason: 'twilio_completed' });
  }
}

type Finalize = { status: string; endReason?: string; answeredBy?: string | null; durationSec?: number; noiseFilter?: string; transcript?: unknown; backupTranscript?: string[] };

/** Terminal state for a call: flags unconfirmed items, checks the backup transcript, applies the no-answer policy. */
export async function finalizeCall(callId: string, f: Finalize) {
  const call = await prisma.nutritionCall.findUnique({ where: { id: callId } });
  if (!call || TERMINAL.includes(call.status)) return call;
  const cap = (value: unknown) => { const s = JSON.stringify(value ?? null); return s.length <= 100_000 ? s : null; };
  const updated = await prisma.nutritionCall.update({ where: { id: callId }, data: {
    status: f.status, endReason: f.endReason ?? call.endReason, endedAt: new Date(),
    ...(f.answeredBy !== undefined ? { answeredBy: f.answeredBy } : {}),
    ...(f.durationSec !== undefined ? { durationSec: Math.max(0, Math.round(f.durationSec)) } : {}),
    ...(f.noiseFilter ? { noiseFilter: f.noiseFilter } : {}),
    ...(f.transcript !== undefined ? { transcriptJson: cap(f.transcript) } : {}),
    ...(f.backupTranscript ? { backupTranscriptJson: cap(f.backupTranscript) } : {}),
  } });
  await prisma.foodLogEntry.updateMany({ where: { callId, status: 'DRAFT' }, data: { status: 'NEEDS_REVIEW', reviewReason: 'not_confirmed_on_call' } });
  if (f.backupTranscript?.length) await flagUnheardItems(callId, f.backupTranscript.join(' '));
  if (['NO_ANSWER', 'VOICEMAIL'].includes(f.status)) await applyNoAnswerPolicy(updated);
  if (f.status === 'COMPLETED') {
    const settings = await prisma.nutritionCallSettings.findUnique({ where: { userId: call.userId } });
    if (settings && !settings.repeatDaily) await prisma.nutritionCallSettings.update({ where: { userId: call.userId }, data: { enabled: false } });
  }
  return updated;
}


/** Independent Flux transcript check: an item none of whose words were heard is flagged for review, never removed. */
export async function flagUnheardItems(callId: string, backupText: string) {
  const heard = new Set(keyWords(backupText));
  // Tolerate simple plurals: "rotis" heard for "roti".
  const wasHeard = (w: string) => heard.has(w) || heard.has(`${w}s`) || heard.has(`${w}es`) || (w.endsWith('s') && heard.has(w.slice(0, -1)));
  const entries = await prisma.foodLogEntry.findMany({ where: { callId, status: { in: ['CONFIRMED', 'DRAFT'] } } });
  for (const e of entries) {
    const words = keyWords(`${e.description} ${e.foodName}`);
    if (words.length && !words.some(wasHeard)) await prisma.foodLogEntry.update({ where: { id: e.id }, data: { status: 'NEEDS_REVIEW', reviewReason: 'not_heard_in_backup_transcript' } });
  }
}

async function applyNoAnswerPolicy(call: Call) {
  const settings = await prisma.nutritionCallSettings.findUnique({ where: { userId: call.userId } });
  if (!settings) return;
  if (settings.noAnswer === 'RETRY_ONCE' && call.attempt === 1) {
    const at = new Date(Date.now() + RETRY_DELAY_MINUTES * 60_000);
    if (withinCallWindow(settings.timeZone, at)) {
      try { await prisma.nutritionCall.create({ data: { userId: call.userId, localDate: call.localDate, attempt: 2, scheduledFor: at } }); }
      catch (e) { if (!isUniqueViolation(e)) throw e; }
    }
  } else if (settings.noAnswer === 'NOTIFY') {
    await pushProvider.send({ userId: call.userId, title: 'Missed your food check-in', body: 'Open NexDo to log today’s meals.' }).catch(() => undefined);
  }
}

// ---------- Worker-facing: session and tools ----------

export async function sessionForCall(callId: string, twilioCallSid?: string) {
  const cfg = nutritionCallConfig();
  const call = await prisma.nutritionCall.findUnique({ where: { id: callId }, include: { user: { select: { name: true } } } });
  if (!call || call.status !== 'IN_PROGRESS' || (twilioCallSid && call.twilioCallSid && call.twilioCallSid !== twilioCallSid)) throw new NutritionError('NOT_FOUND');
  const settings = await prisma.nutritionCallSettings.findUniqueOrThrow({ where: { userId: call.userId } });
  // Entries from the app or earlier calls today (callId is null for app entries; NOT alone would drop them).
  const logged = await prisma.foodLogEntry.findMany({ where: { userId: call.userId, localDate: call.localDate, OR: [{ callId: null }, { callId: { not: callId } }] }, orderBy: { createdAt: 'asc' }, take: 40 });
  const session = nutritionCallSession({
    firstName: call.user.name.trim().split(/\s+/)[0]?.slice(0, 40) || 'there',
    timeZone: settings.timeZone, localDate: call.localDate, calorieGoal: settings.calorieGoal,
    voice: isRealtimeVoice(settings.voice) ? settings.voice : DEFAULT_VOICE, maxSeconds: cfg.maxSeconds,
    alreadyLogged: logged.map(e => ({ meal: e.meal, description: e.description, kcal: e.kcal })),
  });
  return { callId, maxSeconds: cfg.maxSeconds, wrapUpAtSeconds: Math.max(30, cfg.maxSeconds - 50), session };
}

const itemSchema = z.object({
  meal: z.enum(MEALS), description: z.string().trim().min(1).max(200), foodName: z.string().trim().min(1).max(100),
  quantity: z.number().min(0).max(1000).optional(), unit: z.string().trim().max(30).optional(),
  estimatedGrams: z.number().min(0).max(3000).optional(), estimatedKcal: z.number().min(0).max(5000).optional(),
});
const toolSchemas = {
  log_food_items: z.object({ items: z.array(itemSchema).min(1).max(12) }),
  update_food_item: itemSchema.partial().extend({ id: z.string().min(1).max(40) }),
  remove_food_item: z.object({ id: z.string().min(1).max(40) }),
  get_day_summary: z.object({}),
  get_daily_insight: z.object({}),
  add_insight_items: z.object({}),
  finish_call: z.object({ confirmed: z.boolean() }),
  call_back_later: z.object({ minutes: z.number().int().min(10).max(120) }),
  skip_today: z.object({ reason: z.enum(['declined', 'voicemail', 'wrong_person']) }),
} as const;
export type ToolName = keyof typeof toolSchemas;
export type ToolResult = Record<string, unknown> & { end?: boolean };

async function dayTotal(userId: string, localDate: string) {
  const agg = await prisma.foodLogEntry.aggregate({ where: { userId, localDate }, _sum: { kcal: true } });
  return agg._sum.kcal ?? 0;
}

/** Executes one model tool call for an in-progress call. Errors are returned to the model as data, never thrown. */
export async function executeTool(callId: string, name: string, rawArgs: unknown, lookup: FoodLookup = defaultLookup): Promise<ToolResult> {
  const call = await prisma.nutritionCall.findUnique({ where: { id: callId } });
  if (!call || call.status !== 'IN_PROGRESS') return { error: 'call_not_active', end: true };
  if (!(name in toolSchemas)) return { error: 'unknown_tool' };
  const parsed = toolSchemas[name as ToolName].safeParse(rawArgs);
  if (!parsed.success) return { error: 'invalid_arguments', detail: parsed.error.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`) };
  const args = parsed.data as never;
  const { userId, localDate } = call;
  switch (name as ToolName) {
    case 'log_food_items': {
      const items = (args as { items: FoodItemInput[] }).items;
      // All foods in the meal are looked up at once, each within the latency budget.
      const timed = await Promise.all(items.map(item => caloriesWithinBudget(item, lookup)));
      const saved = [];
      for (const [index, item] of items.entries()) {
        const { result: r, late } = timed[index];
        const e = await prisma.foodLogEntry.create({ data: {
          userId, localDate, callId, meal: item.meal, description: item.description, foodName: r.foodName,
          quantity: item.quantity ?? null, unit: item.unit ?? null, grams: r.grams, kcal: r.kcal,
          proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG, fiberG: r.fiberG, calciumMg: r.calciumMg, ironMg: r.ironMg, vitaminDIu: r.vitaminDIu, source: r.source, sourceRef: r.sourceRef,
          status: r.needsReview && !late ? 'NEEDS_REVIEW' : 'DRAFT', reviewReason: r.reviewReason,
        } });
        if (late) applyLateLookup(e.id, late);
        saved.push({ id: e.id, food: e.foodName, kcal: e.kcal, estimate: r.source === 'ESTIMATE' });
      }
      return { saved, dayTotalKcal: await dayTotal(userId, localDate) };
    }
    case 'update_food_item': {
      const a = args as Partial<FoodItemInput> & { id: string };
      const e = await prisma.foodLogEntry.findFirst({ where: { id: a.id, userId, localDate } });
      if (!e) return { error: 'item_not_found' };
      const foodChanged = a.foodName !== undefined || a.quantity !== undefined || a.unit !== undefined || a.estimatedGrams !== undefined || a.estimatedKcal !== undefined;
      const next: FoodItemInput = {
        meal: (a.meal ?? e.meal) as FoodItemInput['meal'], description: a.description ?? e.description, foodName: a.foodName ?? e.foodName,
        quantity: a.quantity ?? e.quantity ?? undefined, unit: a.unit ?? e.unit ?? undefined, estimatedGrams: a.estimatedGrams ?? e.grams ?? undefined, estimatedKcal: a.estimatedKcal,
      };
      // A portion change without a fresh estimate scales the previous estimate instead of dropping to zero.
      if (next.estimatedKcal === undefined) {
        const newGrams = portionGrams(next).grams;
        next.estimatedKcal = e.grams && newGrams && a.foodName === undefined ? e.kcal * (newGrams / e.grams) : e.kcal;
      }
      const timed = foodChanged ? await caloriesWithinBudget(next, lookup) : null;
      if (timed) cancelLateLookup(e.id); // an earlier pending lookup must not overwrite this correction
      const r = timed?.result ?? null;
      const u = await prisma.foodLogEntry.update({ where: { id: e.id }, data: {
        meal: next.meal, description: next.description, quantity: next.quantity ?? null, unit: next.unit ?? null,
        ...(r ? { foodName: r.foodName, grams: r.grams, kcal: r.kcal, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG, fiberG: r.fiberG, calciumMg: r.calciumMg, ironMg: r.ironMg, vitaminDIu: r.vitaminDIu, source: r.source, sourceRef: r.sourceRef,
          status: r.needsReview && !timed?.late ? 'NEEDS_REVIEW' : (e.callId === callId ? 'DRAFT' : e.status), reviewReason: r.reviewReason } : {}),
      } });
      if (timed?.late) applyLateLookup(e.id, timed.late);
      return { updated: { id: u.id, food: u.foodName, kcal: u.kcal }, dayTotalKcal: await dayTotal(userId, localDate) };
    }
    case 'remove_food_item': {
      cancelLateLookup((args as { id: string }).id);
      const { count } = await prisma.foodLogEntry.deleteMany({ where: { id: (args as { id: string }).id, userId, localDate } });
      return count ? { removed: true, dayTotalKcal: await dayTotal(userId, localDate) } : { error: 'item_not_found' };
    }
    case 'get_day_summary': {
      const [entries, settings] = await Promise.all([
        prisma.foodLogEntry.findMany({ where: { userId, localDate }, orderBy: { createdAt: 'asc' } }),
        prisma.nutritionCallSettings.findUnique({ where: { userId }, select: { calorieGoal: true } }),
      ]);
      return {
        items: entries.map(e => ({ id: e.id, meal: e.meal, description: e.description, kcal: e.kcal, estimate: e.source === 'ESTIMATE' })),
        totalKcal: entries.reduce((t, e) => t + e.kcal, 0), goalKcal: settings?.calorieGoal ?? 2000,
      };
    }
    case 'get_daily_insight': {
      const insight = await dailyInsight(userId, localDate).catch(e => { log('warn', 'nutrition.insight_failed', { error: String(e) }); return null; });
      if (!insight || insight.kind !== 'GAP' || insight.state !== 'open') return { insight: null };
      return { insight: { text: insight.text, offersShoppingItems: insight.items.length > 0, items: insight.items } };
    }
    case 'add_insight_items': {
      const insight = await dailyInsight(userId, localDate).catch(e => { log('warn', 'nutrition.insight_failed', { error: String(e) }); return null; });
      // Only what get_daily_insight could have offered: an open GAP with foods to add.
      if (!insight || insight.kind !== 'GAP' || insight.state !== 'open' || !insight.items.length) return { added: [] };
      const result = await handleInsight(userId, localDate, insight.key, 'add');
      return { added: result.added, listTitle: result.listTitle };
    }
    case 'finish_call': {
      if ((args as { confirmed: boolean }).confirmed) await prisma.foodLogEntry.updateMany({ where: { callId, status: 'DRAFT' }, data: { status: 'CONFIRMED' } });
      await prisma.nutritionCall.update({ where: { id: callId }, data: { endReason: 'finished' } });
      return { ok: true, end: true };
    }
    case 'call_back_later': {
      const at = new Date(Date.now() + (args as { minutes: number }).minutes * 60_000);
      const settings = await prisma.nutritionCallSettings.findUnique({ where: { userId } });
      let scheduled = false;
      if (settings && withinCallWindow(settings.timeZone, at) && attemptNumber(call.attempt) < MAX_ATTEMPTS_PER_DAY) {
        try { await prisma.nutritionCall.create({ data: { userId, localDate, attempt: call.attempt + 1, scheduledFor: at } }); scheduled = true; }
        catch (e) { if (!isUniqueViolation(e)) throw e; }
      }
      await prisma.nutritionCall.update({ where: { id: callId }, data: { endReason: 'call_back_later' } });
      return { scheduled, end: true, say: scheduled ? 'Tell the user you will call back then.' : 'Tell the user it is too late to call back today and they can log in the app.' };
    }
    case 'skip_today': {
      const reason = (args as { reason: string }).reason;
      if (reason !== 'declined') await prisma.foodLogEntry.deleteMany({ where: { callId } });
      await prisma.nutritionCall.update({ where: { id: callId }, data: { endReason: `skipped_${reason}` } });
      return { ok: true, end: true };
    }
  }
}

export const completeInput = z.object({
  durationSec: z.number().min(0).max(3600).optional(),
  endReason: z.string().max(60).optional(),
  noiseFilter: z.enum(['krisp', 'openai_only', 'none']).optional(),
  transcript: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) })).max(400).optional(),
  backupTranscript: z.array(z.string().max(4000)).max(400).optional(),
});

/** The worker's end-of-call report. A call the model skipped is SKIPPED; everything else answered is COMPLETED. */
export async function completeCall(callId: string, raw: unknown) {
  const input = completeInput.parse(raw);
  const call = await prisma.nutritionCall.findUnique({ where: { id: callId } });
  if (!call) throw new NutritionError('NOT_FOUND');
  const status = call.endReason?.startsWith('skipped_') ? 'SKIPPED' : 'COMPLETED';
  await finalizeCall(callId, { status, endReason: call.endReason ?? input.endReason, durationSec: input.durationSec, noiseFilter: input.noiseFilter, transcript: input.transcript, backupTranscript: input.backupTranscript });
  return { ok: true };
}
