import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '@/server/db';
import { log } from '@/lib/logger';
import { nutritionCallConfig } from '@/server/nutrition/config';
import { xmlEscape } from '@/server/nutrition/twilio';
import { twilioApi } from '@/server/moment-calls/twilio';
import { completeTask } from '@/server/tasks';

/**
 * Reminder calls: at a reminder's time Nexdo phones the user's verified number and reads the reminder
 * (title and notes) aloud. The person can press 1 to hear it again or 2 to mark it done.
 */

/** A reminder time that was missed (for example while the worker restarted) is still called this late. */
export const REMINDER_CALL_GRACE_MINUTES = 15;
/** One more try after a missed or busy call. */
export const REMINDER_CALL_RETRY_MINUTES = 5;
export const MAX_REMINDER_CALL_ATTEMPTS = 2;
const ACTIVE = ['DIALING', 'IN_PROGRESS'];
const isUnique = (e: unknown) => !!e && typeof e === 'object' && 'code' in e && (e as { code: unknown }).code === 'P2002';

export function reminderCallsConfig() {
  const cfg = nutritionCallConfig();
  const configured = !!(cfg.appUrl && cfg.twilio.accountSid && cfg.twilio.authToken && cfg.twilio.from);
  return { ...cfg, available: process.env.REMINDER_CALLS_ENABLED !== 'false' && configured };
}

/** The number Nexdo may call: one the user proved they own, by the check-in code call or caller-ID verification. */
export async function reminderCallPhone(userId: string): Promise<string | null> {
  const [settings, identity] = await Promise.all([
    prisma.nutritionCallSettings.findUnique({ where: { userId }, select: { phoneE164: true, phoneVerifiedAt: true } }),
    prisma.callerIdentity.findUnique({ where: { userId }, select: { phoneE164: true, status: true } }),
  ]);
  if (settings?.phoneE164 && settings.phoneVerifiedAt) return settings.phoneE164;
  if (identity?.status === 'VERIFIED') return identity.phoneE164;
  return null;
}

export async function reminderCallSetup(userId: string) {
  const settings = await prisma.nutritionCallSettings.findUnique({ where: { userId }, select: { phoneE164: true } });
  const phone = await reminderCallPhone(userId);
  return { available: reminderCallsConfig().available, phone: phone ?? settings?.phoneE164 ?? null, verified: !!phone };
}

/** Thrown by task creation when a call is asked for but cannot be placed. */
export async function assertReminderCallsUsable(userId: string) {
  if (!reminderCallsConfig().available) throw new Error('REMINDER_CALLS_UNAVAILABLE');
  if (!await reminderCallPhone(userId)) throw new Error('REMINDER_CALL_PHONE_UNVERIFIED');
}

const firstName = (name: string) => name.trim().split(/\s+/)[0]?.slice(0, 40) || '';
const clip = (text: string, max: number) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max).replace(/\s+\S*$/, '')}…`;
};

/** What the call says. Kept short enough to follow by ear; long notes are cut at a word boundary. */
export function reminderSpeech(input: { name: string; title: string; notes: string; at: Date; timeZone: string }) {
  const who = firstName(input.name);
  const when = formatInTimeZone(input.at, input.timeZone, 'h:mm a');
  const notes = clip(input.notes, 600);
  return {
    greeting: `Hi${who ? ` ${who}` : ''}, this is NexDo with your ${when} reminder.`,
    body: `${clip(input.title, 200).replace(/[.!?…]*$/, '')}.${notes ? ` Details: ${notes}` : ''}`,
  };
}

const doc = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
const say = (text: string) => `<Say voice="Polly.Joanna">${xmlEscape(text)}</Say>`;
const hangup = () => doc('<Hangup/>');

export function reminderTwiml(speech: { greeting: string; body: string }, gatherUrl: string, opts: { repeat?: boolean } = {}) {
  const intro = opts.repeat ? say('Here it is again.') : `<Pause length="1"/>${say(speech.greeting)}`;
  return doc(`${intro}${say(speech.body)}<Gather numDigits="1" timeout="6" action="${xmlEscape(gatherUrl)}" method="POST">${say('Press 1 to hear it again, or press 2 to mark it done.')}</Gather>${say('Goodbye.')}<Hangup/>`);
}
/** An answering machine gets the reminder once, after the beep. */
export const voicemailTwiml = (speech: { greeting: string; body: string }) => doc(`${say(speech.greeting)}${say(speech.body)}${say('Goodbye.')}<Hangup/>`);

// ---------- Scheduler ----------

/** Queues a call for each reminder that has come due, then dials what is ready. Run every minute. */
export async function runReminderCallTick(now = new Date(), dial: (id: string) => Promise<unknown> = dialReminderCall) {
  const cfg = reminderCallsConfig();
  if (!cfg.available) return { status: 'not_configured' as const };
  const graceStart = new Date(now.getTime() - REMINDER_CALL_GRACE_MINUTES * 60_000);
  const due = await prisma.task.findMany({
    where: { notifyCall: true, deletedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] }, reminderAt: { lte: now, gte: graceStart } },
    select: { id: true, userId: true, reminderAt: true },
    take: 200,
  });
  let queued = 0, dialed = 0;
  for (const task of due) {
    try {
      await prisma.reminderCall.create({ data: { userId: task.userId, taskId: task.id, fireAt: task.reminderAt!, scheduledFor: task.reminderAt!, attempt: 1 } });
      queued++;
    } catch (e) { if (!isUnique(e)) throw e; }
  }
  const expired = (await prisma.reminderCall.updateMany({ where: { status: 'QUEUED', scheduledFor: { lt: graceStart } }, data: { status: 'EXPIRED', endedAt: now } })).count;
  const ready = await prisma.reminderCall.findMany({ where: { status: 'QUEUED', scheduledFor: { lte: now, gte: graceStart } }, select: { id: true }, orderBy: { scheduledFor: 'asc' }, take: 50 });
  for (let i = 0; i < ready.length; i += 5) {
    await Promise.all(ready.slice(i, i + 5).map(async (c) => { await dial(c.id); dialed++; }));
  }
  // A call Twilio never reported back on is closed so it cannot block anything forever.
  const stale = (await prisma.reminderCall.updateMany({ where: { status: { in: ACTIVE }, updatedAt: { lt: new Date(Date.now() - 30 * 60_000) } }, data: { status: 'FAILED', error: 'stale', endedAt: new Date() } })).count;
  return { status: 'ok' as const, queued, dialed, expired, stale };
}

/** Claims a queued call and places it. Re-checks the task first, in case it was done, deleted or moved. */
export async function dialReminderCall(callId: string) {
  const cfg = reminderCallsConfig();
  const claimed = await prisma.reminderCall.updateMany({ where: { id: callId, status: 'QUEUED' }, data: { status: 'DIALING' } });
  if (!claimed.count) return { status: 'not_claimed' as const };
  const call = await prisma.reminderCall.findUniqueOrThrow({ where: { id: callId }, include: { task: true } });
  const task = call.task;
  if (!task.notifyCall || task.deletedAt || ['COMPLETED', 'CANCELLED'].includes(task.status) || task.reminderAt?.getTime() !== call.fireAt.getTime()) {
    await prisma.reminderCall.update({ where: { id: callId }, data: { status: 'CANCELLED', error: 'task_changed', endedAt: new Date() } });
    return { status: 'cancelled' as const };
  }
  const phone = await reminderCallPhone(call.userId);
  if (!phone) {
    await prisma.reminderCall.update({ where: { id: callId }, data: { status: 'FAILED', error: 'phone_unverified', endedAt: new Date() } });
    return { status: 'failed' as const };
  }
  const q = `callId=${encodeURIComponent(callId)}`;
  const params = new URLSearchParams({
    To: phone, From: cfg.twilio.from, Method: 'POST',
    Url: `${cfg.appUrl}/api/reminder-calls/twiml?${q}`,
    StatusCallback: `${cfg.appUrl}/api/reminder-calls/status?${q}`, StatusCallbackMethod: 'POST',
    // Waits for a voicemail greeting to finish so the message lands after the beep; people are answered at once.
    MachineDetection: 'DetectMessageEnd', Timeout: '30', TimeLimit: '240',
  });
  params.append('StatusCallbackEvent', 'completed');
  const result = await twilioApi<{ sid?: string }>({ accountSid: cfg.twilio.accountSid, authToken: cfg.twilio.authToken }, 'POST', '/Calls.json', params);
  if (!result.ok || !result.data.sid) {
    await prisma.reminderCall.update({ where: { id: callId }, data: { status: 'FAILED', error: `twilio_${result.ok ? 'no_sid' : result.status}`, endedAt: new Date() } });
    log('warn', 'reminder_call.dial_failed', { status: result.ok ? 0 : result.status });
    return { status: 'failed' as const };
  }
  await prisma.reminderCall.update({ where: { id: callId }, data: { twilioCallSid: result.data.sid } });
  return { status: 'dialing' as const };
}

// ---------- Twilio webhooks (signature checked by the routes) ----------

async function loadCall(callId: string, callSid?: string) {
  if (!callId) return null;
  const call = await prisma.reminderCall.findUnique({ where: { id: callId }, include: { task: true, user: { select: { name: true, timeZone: true } } } });
  if (!call || (call.twilioCallSid && callSid && call.twilioCallSid !== callSid)) return null;
  return call;
}
type LoadedCall = NonNullable<Awaited<ReturnType<typeof loadCall>>>;
const speechFor = (call: LoadedCall) => reminderSpeech({ name: call.user.name, title: call.task.title, notes: call.task.notes, at: call.fireAt, timeZone: call.user.timeZone });
const gatherUrl = (callId: string) => `${reminderCallsConfig().appUrl}/api/reminder-calls/gather?callId=${encodeURIComponent(callId)}`;

/** The call was answered (after answering-machine detection). */
export async function reminderCallTwiml(callId: string, params: Record<string, string>) {
  const call = await loadCall(callId, params.CallSid);
  if (!call || call.status !== 'DIALING') return hangup();
  const sid = call.twilioCallSid ?? params.CallSid ?? null;
  if (params.AnsweredBy && /^(machine|fax)/.test(params.AnsweredBy)) {
    await prisma.reminderCall.update({ where: { id: callId }, data: { status: 'VOICEMAIL', error: params.AnsweredBy, twilioCallSid: sid, startedAt: new Date(), endedAt: new Date() } });
    return params.AnsweredBy === 'fax' ? hangup() : voicemailTwiml(speechFor(call));
  }
  await prisma.reminderCall.update({ where: { id: callId }, data: { status: 'IN_PROGRESS', startedAt: new Date(), twilioCallSid: sid } });
  return reminderTwiml(speechFor(call), gatherUrl(callId));
}

/** A key press after the reminder: 1 hears it again, 2 marks the reminder done. */
export async function reminderCallGather(callId: string, params: Record<string, string>) {
  const call = await loadCall(callId, params.CallSid);
  if (!call || call.status !== 'IN_PROGRESS') return hangup();
  if (params.Digits === '1') return reminderTwiml(speechFor(call), gatherUrl(callId), { repeat: true });
  if (params.Digits === '2') {
    try {
      await completeTask(call.userId, call.taskId, true);
      return doc(`${say('Done. I’ve marked it complete. Goodbye.')}<Hangup/>`);
    } catch (error) {
      log('warn', 'reminder_call.complete_failed', { error: error instanceof Error ? error.message : 'unknown' });
      return doc(`${say('I couldn’t mark it done right now. You can do that in NexDo. Goodbye.')}<Hangup/>`);
    }
  }
  return doc(`${say('Goodbye.')}<Hangup/>`);
}

/** Final status of the call. A missed or busy first call is tried once more a few minutes later. */
export async function reminderCallStatus(callId: string, params: Record<string, string>) {
  const call = await loadCall(callId, params.CallSid);
  if (!call || !ACTIVE.includes(call.status)) return;
  const status = params.CallStatus;
  const now = new Date();
  if (['no-answer', 'busy', 'canceled', 'failed'].includes(status)) {
    await prisma.reminderCall.update({ where: { id: callId }, data: { status: status === 'failed' ? 'FAILED' : 'MISSED', error: status, endedAt: now } });
    if (status !== 'failed' && call.attempt < MAX_REMINDER_CALL_ATTEMPTS) {
      try {
        await prisma.reminderCall.create({ data: { userId: call.userId, taskId: call.taskId, fireAt: call.fireAt, attempt: call.attempt + 1, scheduledFor: new Date(now.getTime() + REMINDER_CALL_RETRY_MINUTES * 60_000) } });
      } catch (e) { if (!isUnique(e)) throw e; }
    }
  } else if (status === 'completed') {
    await prisma.reminderCall.update({ where: { id: callId }, data: { status: call.status === 'IN_PROGRESS' ? 'COMPLETED' : 'MISSED', endedAt: now } });
  }
}

