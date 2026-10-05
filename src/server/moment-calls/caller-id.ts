import { prisma } from '@/server/db';
import { MomentError } from '@/server/moments/domain';
import { nutritionCallConfig } from '@/server/nutrition/config';
import { nanpZone, toE164 } from './rules';
import { twilioApi } from './twilio';

type CallerIdList = { outgoing_caller_ids?: { sid: string; phone_number: string; friendly_name?: string }[] };
type ValidationRequest = { validation_code?: string; phone_number?: string };
/** Tags the Twilio entry a verification request creates so only its own requester can complete it. */
const friendlyName = (userId: string) => `Nexdo:${userId}`;
const RESEND_MS = 60_000;
const POLL_WINDOW_MS = 15 * 60_000;

function creds() {
  const cfg = nutritionCallConfig();
  if (!cfg.appUrl || !cfg.twilio.accountSid || !cfg.twilio.authToken) throw new MomentError('Calling isn’t available right now.', 503);
  return { cfg, creds: { accountSid: cfg.twilio.accountSid, authToken: cfg.twilio.authToken } };
}

export type CallerIdSummary = { phone: string; status: 'PENDING' | 'VERIFIED' | 'FAILED' } | null;

async function findInTwilio(phone: string) {
  const { creds: c } = creds();
  const found = await twilioApi<CallerIdList>(c, 'GET', '/OutgoingCallerIds.json', new URLSearchParams({ PhoneNumber: phone }));
  return found.ok ? found.data.outgoing_caller_ids?.find(id => id.phone_number === phone) ?? null : null;
}

/**
 * Starts Twilio caller-ID verification: Twilio calls the number and the person who answers types the
 * returned 6-digit code. Proving the number again is required even if it was verified before in this
 * Twilio account, so one Nexdo user can never claim a number another person verified.
 */
export async function startCallerIdVerification(userId: string, rawPhone: unknown, now = new Date()) {
  const zone = (await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } }))?.timeZone ?? 'UTC';
  const phone = typeof rawPhone === 'string' ? toE164(rawPhone, nanpZone(zone)) : null;
  if (!phone) throw new MomentError('Enter your mobile number with its country code, for example +1 650 555 0123.');
  const { cfg, creds: c } = creds();
  const existing = await prisma.callerIdentity.findUnique({ where: { userId } });
  if (existing?.status === 'VERIFIED' && existing.phoneE164 === phone) return { phone, status: 'VERIFIED' as const, validationCode: null };
  if (existing?.status === 'PENDING' && now.getTime() - existing.requestedAt.getTime() < RESEND_MS) throw new MomentError('Please wait a minute before requesting another verification call.', 429);
  const owner = await prisma.callerIdentity.findFirst({ where: { phoneE164: phone, status: 'VERIFIED', NOT: { userId } } });
  if (owner) throw new MomentError('This number is already verified by another Nexdo account.', 409);
  const stale = await findInTwilio(phone);
  if (stale) await twilioApi(c, 'DELETE', `/OutgoingCallerIds/${encodeURIComponent(stale.sid)}.json`);
  if (existing?.twilioSid && existing.phoneE164 !== phone) await twilioApi(c, 'DELETE', `/OutgoingCallerIds/${encodeURIComponent(existing.twilioSid)}.json`);
  const request = await twilioApi<ValidationRequest>(c, 'POST', '/OutgoingCallerIds.json', new URLSearchParams({
    PhoneNumber: phone, FriendlyName: friendlyName(userId), CallDelay: '5',
    StatusCallback: `${cfg.appUrl}/api/moment-calls/caller-id-status?userId=${encodeURIComponent(userId)}`, StatusCallbackMethod: 'POST',
  }));
  if (!request.ok || !request.data.validation_code) throw new MomentError('We couldn’t start the verification call. Please try again shortly.', 502);
  await prisma.callerIdentity.upsert({
    where: { userId },
    create: { userId, phoneE164: phone, status: 'PENDING', requestedAt: now },
    update: { phoneE164: phone, status: 'PENDING', twilioSid: null, verifiedAt: null, requestedAt: now },
  });
  return { phone, status: 'PENDING' as const, validationCode: request.data.validation_code };
}

/** Twilio's StatusCallback after the verification call (signature checked by the route). */
export async function recordCallerIdResult(userId: string, params: Record<string, string>) {
  const record = await prisma.callerIdentity.findUnique({ where: { userId } });
  if (!record || record.status !== 'PENDING' || (params.To && params.To !== record.phoneE164)) return;
  const success = params.VerificationStatus === 'success';
  await prisma.callerIdentity.update({ where: { userId }, data: success
    ? { status: 'VERIFIED', twilioSid: params.OutgoingCallerIdSid || null, verifiedAt: new Date() }
    : { status: 'FAILED' } });
}

/** Current status; a pending request is confirmed against Twilio in case the callback was missed. */
export async function callerIdStatus(userId: string, now = new Date()): Promise<CallerIdSummary> {
  const record = await prisma.callerIdentity.findUnique({ where: { userId } });
  if (!record) return null;
  if (record.status === 'PENDING' && now.getTime() - record.requestedAt.getTime() < POLL_WINDOW_MS) {
    const found = await findInTwilio(record.phoneE164).catch(() => null);
    // Only a verified Twilio entry that this user's own request created counts: an entry another
    // user's (or an older, unrelated) verification left behind must not verify this record.
    if (found?.friendly_name === friendlyName(userId)) {
      const owner = await prisma.callerIdentity.findFirst({ where: { phoneE164: record.phoneE164, status: 'VERIFIED', NOT: { userId } } });
      if (!owner) {
        await prisma.callerIdentity.update({ where: { userId }, data: { status: 'VERIFIED', twilioSid: found.sid, verifiedAt: now } });
        return { phone: record.phoneE164, status: 'VERIFIED' };
      }
    }
  }
  return { phone: record.phoneE164, status: record.status as 'PENDING' | 'VERIFIED' | 'FAILED' };
}

/** Removes the number from Twilio and turns off every connect call for the user. */
export async function removeCallerId(userId: string) {
  const record = await prisma.callerIdentity.findUnique({ where: { userId } });
  if (record?.twilioSid) {
    const { creds: c } = creds();
    await twilioApi(c, 'DELETE', `/OutgoingCallerIds/${encodeURIComponent(record.twilioSid)}.json`);
  }
  await prisma.$transaction([
    prisma.callerIdentity.deleteMany({ where: { userId } }),
    prisma.importantMoment.updateMany({ where: { userId, connectEnabled: true }, data: { connectEnabled: false } }),
    prisma.momentConnectCall.updateMany({ where: { userId, status: 'QUEUED' }, data: { status: 'CANCELLED', error: 'caller_id_removed' } }),
  ]);
  return { removed: true };
}

export async function verifiedCallerId(userId: string) {
  const record = await prisma.callerIdentity.findUnique({ where: { userId } });
  return record?.status === 'VERIFIED' ? record.phoneE164 : null;
}
