import type { CalendarProvider, EmailProvider, LanguageModel, PushProvider, SmsProvider, SpeechProvider } from './types';
import webpush from 'web-push';
import { prisma } from '@/server/db';

const configured = (value?: string) => Boolean(value && value.trim());

export const emailProvider: EmailProvider = {
  name: configured(process.env.SENDGRID_API_KEY) ? 'sendgrid' : 'mock-email',
  async send(message) {
    if (!configured(process.env.SENDGRID_API_KEY)) {
      console.info('[harbor.email.mock]', message.subject, '→', message.to);
      return { id: `mock-email-${Date.now()}`, status: 'SENT' };
    }
    const from = process.env.SENDGRID_FROM_EMAIL;
    if (!from) return { id: '', status: 'FAILED', reason: 'SENDGRID_FROM_EMAIL is not configured' };
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalizations: [{ to: [{ email: message.to }] }], from: { email: from, name: process.env.SENDGRID_FROM_NAME || 'Harbour' }, subject: message.subject, content: [{ type: 'text/plain', value: message.text }] }),
      });
      if (!response.ok) return { id: '', status: 'FAILED', reason: `SendGrid ${response.status}: ${(await response.text()).slice(0, 200)}` };
      return { id: response.headers.get('x-message-id') || `sendgrid-${Date.now()}`, status: 'SENT' };
    } catch (error) { return { id: '', status: 'FAILED', reason: error instanceof Error ? error.message : 'SendGrid request failed' }; }
  },
};

export const smsProvider: SmsProvider = {
  name: configured(process.env.TWILIO_ACCOUNT_SID) ? 'twilio' : 'mock-sms',
  async send(message) {
    if (!configured(process.env.TWILIO_ACCOUNT_SID)) {
      console.info('[harbor.sms.mock]', message.text);
      return { id: `mock-sms-${Date.now()}`, status: 'SENT' };
    }
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const from = process.env.TWILIO_FROM_NUMBER;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!from || !token) return { id: '', status: 'FAILED', reason: 'Twilio sender or auth token is not configured' };
    try {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: message.to, From: from, Body: message.text }),
      });
      const payload = await response.json() as { sid?: string; message?: string };
      if (!response.ok) return { id: '', status: 'FAILED', reason: payload.message || `Twilio ${response.status}` };
      return { id: payload.sid || `twilio-${Date.now()}`, status: 'SENT' };
    } catch (error) { return { id: '', status: 'FAILED', reason: error instanceof Error ? error.message : 'Twilio request failed' }; }
  },
};

export const pushProvider: PushProvider = {
  name: configured(process.env.VAPID_PUBLIC_KEY) ? 'web-push' : 'mock-push',
  async send(message) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
      console.info('[harbor.push.mock]', message.title, message.body);
      return { id: `mock-push-${Date.now()}`, status: 'SENT' };
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', publicKey, privateKey);
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: message.userId } });
    if (!subscriptions.length) return { id: '', status: 'FAILED', reason: 'No browser push subscription is registered' };
    const ids: string[] = [];
    const failures: string[] = [];
    for (const subscription of subscriptions) {
      try {
        const response = await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: message.title, body: message.body, url: message.url || '/notifications' }));
        ids.push(response.headers.location || `webpush-${Date.now()}`);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { endpoint: subscription.endpoint } });
        failures.push(error instanceof Error ? error.message : 'Web Push failed');
      }
    }
    return ids.length ? { id: ids.join(','), status: 'SENT', reason: failures.length ? failures.join('; ') : undefined } : { id: '', status: 'FAILED', reason: failures.join('; ') };
  },
};

export const speechProvider: SpeechProvider = {
  name: 'browser-speech',
  async synthesize() {
    return { useBrowserTts: true };
  },
};

export const languageModel: LanguageModel = {
  name: configured(process.env.OPENAI_API_KEY) ? 'openai' : 'extractive',
  async complete(prompt) {
    if (!configured(process.env.OPENAI_API_KEY)) {
      return prompt.slice(0, 400);
    }
    return prompt.slice(0, 400);
  },
};

export const mockCalendar: CalendarProvider = {
  name: 'harbor-local',
  async list() {
    return { events: [] };
  },
  async upsert(event) {
    return { externalId: event.externalId ?? `harbor-${Date.now()}` };
  },
  async remove() {},
};

export type { CalendarProvider };
