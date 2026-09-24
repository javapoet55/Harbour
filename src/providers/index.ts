import { observedFetch } from '@/server/health/telemetry';
import type { EmailProvider, PushProvider, SmsProvider } from './types';
import webpush from 'web-push';
import { prisma } from '@/server/db';
import { PUSH_NOT_REGISTERED } from '@/lib/escalation';

const configured = (value?: string) => Boolean(value && value.trim());

export const emailDeliveryMocked = () => !configured(process.env.SENDGRID_API_KEY);

export const emailProvider: EmailProvider = {
  name: configured(process.env.SENDGRID_API_KEY) ? 'sendgrid' : 'mock-email',
  async send(message) {
    if (!configured(process.env.SENDGRID_API_KEY)) {
      if (process.env.NODE_ENV === 'production') return { id: '', status: 'FAILED', reason: 'Email provider is not configured' };
      return { id: `mock-email-${Date.now()}`, status: 'SENT' };
    }
    // EMAIL_FROM_* take precedence; the SENDGRID_FROM_* names remain as fallbacks for existing deployments.
    const from = message.from?.trim() || process.env.EMAIL_FROM_ADDRESS?.trim() || process.env.SENDGRID_FROM_EMAIL?.trim();
    if (!from) return { id: '', status: 'FAILED', reason: 'EMAIL_FROM_ADDRESS is not configured', errorCode: 'sender_not_configured' };
    const fromName = process.env.EMAIL_FROM_NAME?.trim() || process.env.SENDGRID_FROM_NAME?.trim() || 'Nexdo';
    try {
      const response = await observedFetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalizations: [{ to: [{ email: message.to }] }], from: { email: from, name: fromName }, subject: message.subject, content: [{ type: 'text/plain', value: message.text }, ...(message.html ? [{ type: 'text/html', value: message.html }] : [])] }),
      });
      if (!response.ok) return { id: '', status: 'FAILED', reason: `SendGrid ${response.status}`, providerStatus: response.status };
      return { id: response.headers.get('x-message-id') || `sendgrid-${Date.now()}`, status: 'SENT' };
    } catch (error) { return { id: '', status: 'FAILED', reason: 'SendGrid request failed', errorCode: requestErrorCode(error) }; }
  },
};

// A network failure's code (ECONNRESET, ENOTFOUND, TIMEOUT...), never its message.
export function requestErrorCode(error: unknown) {
  if (!(error instanceof Error)) return 'REQUEST_FAILED';
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'TIMEOUT';
  const code = (error.cause as { code?: unknown } | undefined)?.code ?? (error as { code?: unknown }).code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,40}$/.test(code) ? code : 'REQUEST_FAILED';
}

export const smsProvider: SmsProvider = {
  name: configured(process.env.TWILIO_ACCOUNT_SID) ? 'twilio' : 'mock-sms',
  async send(message) {
    if (!configured(process.env.TWILIO_ACCOUNT_SID)) {
      if (process.env.NODE_ENV === 'production') return { id: '', status: 'FAILED', reason: 'SMS provider is not configured' };
      return { id: `mock-sms-${Date.now()}`, status: 'SENT' };
    }
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const from = process.env.TWILIO_FROM_NUMBER;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!from || !token) return { id: '', status: 'FAILED', reason: 'Twilio sender or auth token is not configured' };
    try {
      const response = await observedFetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: message.to, From: from, Body: message.text }),
      });
      const payload = await response.json() as { sid?: string; message?: string };
      if (!response.ok) return { id: '', status: 'FAILED', reason: `Twilio ${response.status}` };
      return { id: payload.sid || `twilio-${Date.now()}`, status: 'SENT' };
    } catch { return { id: '', status: 'FAILED', reason: 'Twilio request failed' }; }
  },
};

export const pushProvider: PushProvider = {
  name: configured(process.env.VAPID_PUBLIC_KEY) ? 'web-push' : 'mock-push',
  async send(message) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
      if (process.env.NODE_ENV === 'production') return { id: '', status: 'FAILED', reason: 'Push provider is not configured' };
      return { id: `mock-push-${Date.now()}`, status: 'SENT' };
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', publicKey, privateKey);
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: message.userId } });
    // PERMANENT_FAILURE_REASONS matches on this exact wording, so the two read it from one place.
    if (!subscriptions.length) return { id: '', status: 'FAILED', reason: PUSH_NOT_REGISTERED };
    const ids: string[] = [];
    const failures: string[] = [];
    for (const subscription of subscriptions) {
      try {
        const response = await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: message.title, body: message.body, url: message.url || '/notifications' }));
        ids.push(response.headers.location || `webpush-${Date.now()}`);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { endpoint: subscription.endpoint } });
        failures.push(`Web Push failed${status ? ` (${status})` : ''}`);
      }
    }
    return ids.length ? { id: ids.join(','), status: 'SENT', reason: failures.length ? failures.join('; ') : undefined } : { id: '', status: 'FAILED', reason: failures.join('; ') };
  },
};

export type { CalendarProvider } from './types';
