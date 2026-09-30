import { formatInTimeZone } from 'date-fns-tz';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { pushProvider } from '@/providers';
import { log } from '@/lib/logger';
import { MomentError } from '@/server/moments/domain';
import { DEFAULT_VOICE, isRealtimeVoice, NUTRITION_CALL_MODEL, nutritionCallConfig } from '@/server/nutrition/config';
import { callToken } from '@/server/nutrition/twilio';
import { voiceAudioInput } from '@/server/voice/audio-input';
import { callerIdStatus, verifiedCallerId } from './caller-id';
import { connectZone, CONNECT_GRACE_MINUTES, nanpZone, dueConnect, inWindow, nextConnectAt, previewConnect, suggestConnectTime, toE164, validConnectTime, validZone } from './rules';
import { agentTwiml, bridgeTwiml, hangup, sayAndHangup, twilioApi } from './twilio';

type Moment = NonNullable<Awaited<ReturnType<typeof prisma.importantMoment.findUnique>>>;
const TERMINAL = ['CONNECTED', 'DECLINED', 'CALL_BACK_SCHEDULED', 'MISSED', 'RECIPIENT_NO_ANSWER', 'FAILED', 'CANCELLED', 'EXPIRED', 'ENDED'];
const MANUAL_ATTEMPT_BASE = 100;
const MAX_CALLBACKS = 3;
const isUnique = (e: unknown) => !!e && typeof e === 'object' && 'code' in e && (e as { code: unknown }).code === 'P2002';

export function momentCallsConfig() {
  const cfg = nutritionCallConfig();
  const configured = !!(cfg.appUrl && cfg.workerUrl && cfg.workerSecret && cfg.twilio.accountSid && cfg.twilio.authToken && cfg.twilio.from);
  return { ...cfg, available: process.env.MOMENT_CALLS_ENABLED === 'true' && configured };
}
const occasion = (m: Pick<Moment, 'type' | 'title'>) =>
  m.type === 'birthday' ? 'birthday' : m.type === 'anniversary' ? 'anniversary' : m.type === 'getWellSoon' ? 'get-well wish' : m.title.toLowerCase();
const recipientName = (m: Pick<Moment, 'firstName' | 'title'>) => m.firstName.trim() || m.title;
/** The recipient's number; a bare 10-digit number is read as +1 only for moments in a US/Canada time zone. */
const recipientPhone = (m: Pick<Moment, 'phone' | 'timeZoneID'>) => toE164(m.phone, nanpZone(m.timeZoneID));

async function userZone(userId: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } })).timeZone;
}
async function notify(userId: string, title: string, body: string) {
  await pushProvider.send({ userId, title, body }).catch(() => undefined);
}

// ---------- Settings (Manage Moment screen) ----------

export async function connectStatus(userId: string, momentIds?: string[], now = new Date()) {
  const zoneOfUser = await userZone(userId);
  const moments = await prisma.importantMoment.findMany({ where: { userId, ...(momentIds ? { id: { in: momentIds } } : {}) } });
  const calls = await prisma.momentConnectCall.findMany({ where: { userId, momentId: { in: moments.map(m => m.id) } }, orderBy: { createdAt: 'desc' } });
  return {
    available: momentCallsConfig().available,
    callerId: await callerIdStatus(userId, now),
    userTimeZone: zoneOfUser,
    moments: moments.map(m => {
      const zone = connectZone(m);
      const time = m.connectEnabled ? m.connectTime : suggestConnectTime(m, zoneOfUser, now);
      const next = nextConnectAt({ ...m, connectTime: time }, now);
      const today = formatInTimeZone(now, zone, 'yyyy-MM-dd');
      const last = calls.find(c => c.momentId === m.id);
      return {
        momentId: m.id, enabled: m.connectEnabled, time, timeZone: zone,
        recipientPhone: recipientPhone(m), passed: !m.yearly && next.date < today, isToday: next.date === today,
        nextCallAt: next.at.toISOString(), preview: previewConnect(next.at, zoneOfUser, zone),
        lastCall: last ? { status: last.status, date: last.occurrenceDate, at: last.updatedAt.toISOString() } : null,
      };
    }),
  };
}

const connectInput = z.object({ momentId: z.string().min(1).max(40), enabled: z.boolean(), time: z.string().optional(), timeZone: z.string().optional() }).strict();

/** Preview a time without saving (the screen updates as the user changes time or time zone). */
export async function connectPreview(userId: string, raw: unknown, now = new Date()) {
  const input = connectInput.parse(raw);
  const moment = await prisma.importantMoment.findFirst({ where: { id: input.momentId, userId } });
  if (!moment) throw new MomentError('Moment not found.', 404);
  const zone = input.timeZone && validZone(input.timeZone) ? input.timeZone : connectZone(moment);
  const time = input.time && validConnectTime(input.time) ? input.time : moment.connectTime;
  const next = nextConnectAt({ ...moment, connectTime: time, connectTimeZone: zone }, now);
  return { time, timeZone: zone, nextCallAt: next.at.toISOString(), preview: previewConnect(next.at, await userZone(userId), zone) };
}

export async function saveConnect(userId: string, raw: unknown, now = new Date()) {
  const input = connectInput.parse(raw);
  const moment = await prisma.importantMoment.findFirst({ where: { id: input.momentId, userId } });
  if (!moment) throw new MomentError('Moment not found.', 404);
  if (!input.enabled) {
    await prisma.$transaction([
      prisma.importantMoment.update({ where: { id: moment.id }, data: { connectEnabled: false } }),
      prisma.momentConnectCall.updateMany({ where: { momentId: moment.id, status: 'QUEUED' }, data: { status: 'CANCELLED', error: 'turned_off' } }),
    ]);
    return connectStatus(userId, [moment.id], now);
  }
  if (!momentCallsConfig().available) throw new MomentError('Connect calls aren’t available yet.', 503);
  if (!await verifiedCallerId(userId)) throw new MomentError('Verify your number first so they see it’s you.', 409);
  if (!recipientPhone(moment)) throw new MomentError(`Add ${recipientName(moment)}’s phone number with its country code, for example +91 98765 43210.`);
  const time = input.time ?? moment.connectTime;
  const zone = input.timeZone ?? connectZone(moment);
  if (!validConnectTime(time)) throw new MomentError('Choose a valid call time.');
  if (!validZone(zone)) throw new MomentError('Choose a valid time zone.');
  const next = nextConnectAt({ ...moment, connectTime: time, connectTimeZone: zone }, now);
  if (!moment.yearly && next.date < formatInTimeZone(now, zone, 'yyyy-MM-dd')) throw new MomentError('This moment has already passed.');
  const preview = previewConnect(next.at, await userZone(userId), zone);
  if (!preview.userOk) throw new MomentError(`That’s ${preview.userLocal} for you. Nexdo calls you first, so choose a time between 8:00 AM and 9:30 PM your time.`);
  await prisma.importantMoment.update({ where: { id: moment.id }, data: { connectEnabled: true, connectTime: time, connectTimeZone: zone } });
  return connectStatus(userId, [moment.id], now);
}

/** "Connect now" from the app (missed call, or trying again): rings the user, then bridges straight away. */
export async function connectNow(userId: string, raw: unknown, now = new Date()) {
  const { momentId } = z.object({ momentId: z.string().min(1).max(40) }).parse(raw);
  const moment = await prisma.importantMoment.findFirst({ where: { id: momentId, userId } });
  if (!moment) throw new MomentError('Moment not found.', 404);
  if (!momentCallsConfig().available) throw new MomentError('Connect calls aren’t available yet.', 503);
  if (!await verifiedCallerId(userId)) throw new MomentError('Verify your number first so they see it’s you.', 409);
  if (!recipientPhone(moment)) throw new MomentError(`Add ${recipientName(moment)}’s phone number with its country code.`);
  if (!inWindow(await userZone(userId), now)) throw new MomentError('Calls can only be placed between 8:00 AM and 9:30 PM your time.', 409);
  const date = formatInTimeZone(now, connectZone(moment), 'yyyy-MM-dd');
  const recent = await prisma.momentConnectCall.findFirst({ where: { momentId, direct: true, createdAt: { gt: new Date(now.getTime() - 60_000) } } });
  if (recent) throw new MomentError('A call was just placed. Please wait a minute.', 429);
  const last = await prisma.momentConnectCall.findFirst({ where: { momentId, occurrenceDate: date, attempt: { gt: MANUAL_ATTEMPT_BASE } }, orderBy: { attempt: 'desc' } });
  const call = await prisma.momentConnectCall.create({ data: {
    userId, momentId, occurrenceDate: date, attempt: Math.max(MANUAL_ATTEMPT_BASE, last?.attempt ?? 0) + 1,
    scheduledFor: now, direct: true, decision: 'CONNECT',
  } });
  return { callId: call.id, status: (await dialUser(call.id)).status };
}

// ---------- Scheduler ----------

export async function runMomentCallTick(now = new Date(), dial: (id: string) => Promise<unknown> = dialUser) {
  if (!momentCallsConfig().available) return { status: 'not_configured' as const };
  let queued = 0, dialed = 0;
  const moments = await prisma.importantMoment.findMany({ where: { connectEnabled: true, enabled: true }, include: { user: { select: { timeZone: true } } } });
  for (const m of moments) {
    if (m.snoozedUntil && m.snoozedUntil > now) continue;
    const due = dueConnect(m, now);
    if (!due || !inWindow(m.user.timeZone, now)) continue;
    try { await prisma.momentConnectCall.create({ data: { userId: m.userId, momentId: m.id, occurrenceDate: due.date, attempt: 1, scheduledFor: due.at } }); queued++; }
    catch (e) { if (!isUnique(e)) throw e; }
  }
  const graceStart = new Date(now.getTime() - CONNECT_GRACE_MINUTES * 60_000);
  const expired = (await prisma.momentConnectCall.updateMany({ where: { status: 'QUEUED', scheduledFor: { lt: graceStart } }, data: { status: 'EXPIRED' } })).count;
  const ready = await prisma.momentConnectCall.findMany({ where: { status: 'QUEUED', scheduledFor: { lte: now, gte: graceStart } }, select: { id: true }, take: 50 });
  for (const c of ready) { await dial(c.id); dialed++; }
  const stale = (await prisma.momentConnectCall.updateMany({ where: { status: { in: ['DIALING', 'IN_PROGRESS', 'CONNECTING'] }, updatedAt: { lt: new Date(Date.now() - 3 * 3600_000) } }, data: { status: 'FAILED', error: 'stale', endedAt: new Date() } })).count; // updatedAt is wall-clock
  return { status: 'ok' as const, queued, dialed, expired, stale };
}

export async function dialUser(callId: string) {
  const cfg = momentCallsConfig();
  const claimed = await prisma.momentConnectCall.updateMany({ where: { id: callId, status: 'QUEUED' }, data: { status: 'DIALING' } });
  if (!claimed.count) return { status: 'not_claimed' as const };
  const call = await prisma.momentConnectCall.findUniqueOrThrow({ where: { id: callId }, include: { moment: true } });
  const userPhone = await verifiedCallerId(call.userId);
  if (!userPhone || !recipientPhone(call.moment)) {
    await prisma.momentConnectCall.update({ where: { id: callId }, data: { status: 'FAILED', error: userPhone ? 'recipient_phone_missing' : 'caller_id_unverified', endedAt: new Date() } });
    if (!userPhone) await notify(call.userId, `Couldn’t call about ${recipientName(call.moment)}`, 'Verify your number again in NexDo so they see it’s you.');
    return { status: 'failed' as const };
  }
  const params = new URLSearchParams({
    To: userPhone, From: cfg.twilio.from, Method: 'POST',
    Url: `${cfg.appUrl}/api/moment-calls/twiml?callId=${encodeURIComponent(callId)}`,
    StatusCallback: `${cfg.appUrl}/api/moment-calls/status?callId=${encodeURIComponent(callId)}`, StatusCallbackMethod: 'POST',
    MachineDetection: 'Enable', Timeout: '25', TimeLimit: '7200',
  });
  params.append('StatusCallbackEvent', 'completed');
  const result = await twilioApi<{ sid?: string }>({ accountSid: cfg.twilio.accountSid, authToken: cfg.twilio.authToken }, 'POST', '/Calls.json', params);
  if (!result.ok || !result.data.sid) {
    await prisma.momentConnectCall.update({ where: { id: callId }, data: { status: 'FAILED', error: `twilio_${result.ok ? 'no_sid' : result.status}`, endedAt: new Date() } });
    log('warn', 'moment_call.dial_failed', { status: result.ok ? 0 : result.status });
    return { status: 'failed' as const };
  }
  await prisma.momentConnectCall.update({ where: { id: callId }, data: { twilioCallSid: result.data.sid } });
  return { status: 'dialing' as const };
}

// ---------- Twilio webhooks ----------

async function loadCall(callId: string, callSid?: string) {
  const call = await prisma.momentConnectCall.findUnique({ where: { id: callId }, include: { moment: true } });
  if (!call || (call.twilioCallSid && callSid && call.twilioCallSid !== callSid)) return null;
  return call;
}

async function bridge(call: NonNullable<Awaited<ReturnType<typeof loadCall>>>, intro?: string) {
  const cfg = momentCallsConfig();
  const callerId = await verifiedCallerId(call.userId);
  const to = recipientPhone(call.moment);
  const name = recipientName(call.moment);
  if (!callerId || !to) {
    await prisma.momentConnectCall.update({ where: { id: call.id }, data: { status: 'FAILED', error: callerId ? 'recipient_phone_missing' : 'caller_id_unverified' } });
    return sayAndHangup(callerId ? `I don’t have a phone number for ${name}.` : 'I can’t show your number right now, so I won’t place the call. Please verify your number again in NexDo.');
  }
  await prisma.momentConnectCall.update({ where: { id: call.id }, data: { status: 'CONNECTING', decision: 'CONNECT' } });
  return bridgeTwiml({ intro, callerId, to, actionUrl: `${cfg.appUrl}/api/moment-calls/dial-result?callId=${encodeURIComponent(call.id)}` });
}

/** The user answered: machines get a hang-up; people hear the question (or go straight through for "Connect now"). */
export async function twimlForCall(callId: string, params: Record<string, string>) {
  const cfg = momentCallsConfig();
  const call = await loadCall(callId, params.CallSid);
  if (!call || call.status !== 'DIALING') return hangup();
  if (params.AnsweredBy && /^(machine|fax)/.test(params.AnsweredBy)) {
    await prisma.momentConnectCall.update({ where: { id: callId }, data: { status: 'MISSED', error: params.AnsweredBy, endedAt: new Date() } });
    await notify(call.userId, `It’s ${recipientName(call.moment)}’s ${occasion(call.moment)} today`, 'You missed the call. Open NexDo and tap Connect now.');
    return hangup();
  }
  await prisma.momentConnectCall.update({ where: { id: callId }, data: { status: 'IN_PROGRESS', startedAt: new Date(), twilioCallSid: call.twilioCallSid ?? params.CallSid ?? null } });
  if (call.direct) return bridge(call, `Connecting you to ${recipientName(call.moment)}.`);
  return agentTwiml(cfg.workerUrl, callToken(cfg.workerSecret, `moment:${callId}`), `${cfg.appUrl}/api/moment-calls/after-agent?callId=${encodeURIComponent(callId)}`);
}

/** After the voice agent hangs up its stream, Twilio continues here with the user's decision. */
export async function afterAgent(callId: string, params: Record<string, string>) {
  const call = await loadCall(callId, params.CallSid);
  if (!call) return hangup();
  if (call.decision === 'CONNECT' && call.status === 'IN_PROGRESS') return bridge(call);
  return hangup();
}

export async function dialResult(callId: string, params: Record<string, string>) {
  const call = await loadCall(callId, params.CallSid);
  if (!call) return hangup();
  const talked = Number(params.DialCallDuration);
  if (params.DialCallStatus === 'completed' && talked > 0) {
    await prisma.momentConnectCall.update({ where: { id: callId }, data: { status: 'CONNECTED', talkSeconds: Math.round(talked), endedAt: new Date() } });
    return hangup();
  }
  const name = recipientName(call.moment);
  await prisma.momentConnectCall.update({ where: { id: callId }, data: { status: 'RECIPIENT_NO_ANSWER', error: params.DialCallStatus || null, endedAt: new Date() } });
  await notify(call.userId, `${name} didn’t pick up`, 'Open NexDo and tap Connect now to try again.');
  return sayAndHangup(`${name} didn’t pick up. You can try again from NexDo.`);
}

export async function callStatus(callId: string, params: Record<string, string>) {
  const call = await loadCall(callId, params.CallSid);
  if (!call || TERMINAL.includes(call.status)) return;
  const status = params.CallStatus;
  if (['no-answer', 'busy', 'canceled', 'failed'].includes(status) && call.status === 'DIALING') {
    await prisma.momentConnectCall.update({ where: { id: callId }, data: { status: status === 'failed' ? 'FAILED' : 'MISSED', error: status, endedAt: new Date() } });
    if (status !== 'failed') await notify(call.userId, `It’s ${recipientName(call.moment)}’s ${occasion(call.moment)} today`, 'You missed the call. Open NexDo and tap Connect now.');
  } else if (status === 'completed') {
    const next = call.decision === 'NO' ? 'DECLINED' : call.decision === 'LATER' ? 'CALL_BACK_SCHEDULED' : call.status === 'DIALING' ? 'MISSED' : 'ENDED';
    await prisma.momentConnectCall.update({ where: { id: callId }, data: { status: next, endedAt: new Date() } });
  }
}

// ---------- Voice agent (worker) ----------

const tool = (name: string, description: string, properties: object, required: string[]) => ({ type: 'function', name, description, parameters: { type: 'object', additionalProperties: false, properties, required } });
export const momentCallTools = [
  tool('connect_now', 'The user wants to be connected now.', {}, []),
  tool('call_back_later', 'The user wants a call back later today.', { minutes: { type: 'integer', minimum: 10, maximum: 120 } }, ['minutes']),
  tool('decline', 'The user does not want to be connected, or this is not the user.', {}, []),
];

export async function sessionForMomentCall(callId: string, callSid?: string) {
  const call = await loadCall(callId, callSid);
  if (!call || call.status !== 'IN_PROGRESS') throw new MomentError('Not found.', 404);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: call.userId }, select: { name: true } });
  const settings = await prisma.nutritionCallSettings.findUnique({ where: { userId: call.userId }, select: { voice: true } });
  const first = user.name.trim().split(/\s+/)[0]?.slice(0, 40) || 'there';
  const name = recipientName(call.moment);
  const input = voiceAudioInput();
  const instructions = `You are NexDo's assistant calling ${first} for one reason: today is ${name}'s ${occasion(call.moment)}.
Say exactly: "Hi ${first}, it's NexDo's AI assistant. It's ${name}'s ${occasion(call.moment)} today. Want me to connect you to ${name} now?"
If they say yes, call connect_now. If they want a call back later, call call_back_later with the minutes they ask for. If they say no, or it is not ${first}, call decline.
Keep it under 30 seconds. Do not discuss anything else and never share ${name}'s number. Speak in the user's language.`;
  return {
    callId, maxSeconds: 90, wrapUpAtSeconds: 60,
    session: {
      type: 'realtime', model: NUTRITION_CALL_MODEL, output_modalities: ['audio'], max_output_tokens: 600,
      instructions, tools: momentCallTools, tool_choice: 'auto',
      audio: {
        input: { format: { type: 'audio/pcmu' }, noise_reduction: input.noise_reduction, transcription: { model: 'gpt-live-transcribe' }, turn_detection: { ...input.turn_detection, create_response: true, interrupt_response: true } },
        output: { format: { type: 'audio/pcmu' }, voice: isRealtimeVoice(settings?.voice) ? settings.voice : DEFAULT_VOICE },
      },
    },
  };
}

export async function executeMomentTool(callId: string, name: string, rawArgs: unknown, now = new Date()) {
  const call = await loadCall(callId);
  if (!call || call.status !== 'IN_PROGRESS') return { error: 'call_not_active', end: true };
  const person = recipientName(call.moment);
  if (name === 'connect_now') {
    await prisma.momentConnectCall.update({ where: { id: callId }, data: { decision: 'CONNECT' } });
    return { ok: true, end: true, say: `Say only: "Connecting you to ${person} now."` };
  }
  if (name === 'decline') {
    await prisma.momentConnectCall.update({ where: { id: callId }, data: { decision: 'NO' } });
    return { ok: true, end: true, say: 'Say a short, friendly goodbye.' };
  }
  if (name === 'call_back_later') {
    const parsed = z.object({ minutes: z.number().int().min(10).max(120) }).safeParse(rawArgs);
    if (!parsed.success) return { error: 'invalid_arguments' };
    const at = new Date(now.getTime() + parsed.data.minutes * 60_000);
    const sameDay = formatInTimeZone(at, connectZone(call.moment), 'yyyy-MM-dd') === call.occurrenceDate;
    let scheduled = false;
    if (sameDay && inWindow(await userZone(call.userId), at) && call.attempt % MANUAL_ATTEMPT_BASE <= MAX_CALLBACKS) {
      try { await prisma.momentConnectCall.create({ data: { userId: call.userId, momentId: call.momentId, occurrenceDate: call.occurrenceDate, attempt: call.attempt + 1, scheduledFor: at } }); scheduled = true; }
      catch (e) { if (!isUnique(e)) throw e; }
    }
    await prisma.momentConnectCall.update({ where: { id: callId }, data: { decision: scheduled ? 'LATER' : 'NO' } });
    return { scheduled, end: true, say: scheduled ? `Tell them you'll call back in ${parsed.data.minutes} minutes, then say goodbye.` : 'Tell them it’s too late to call back today and they can tap Connect now in NexDo, then say goodbye.' };
  }
  return { error: 'unknown_tool' };
}

/** The worker's end-of-agent report. Twilio's redirect (afterAgent) decides what happens next. */
export async function completeMomentCall(callId: string) {
  const call = await loadCall(callId);
  if (!call) throw new MomentError('Not found.', 404);
  return { ok: true };
}
