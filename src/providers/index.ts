import type { CalendarProvider, EmailProvider, LanguageModel, PushProvider, SmsProvider, SpeechProvider } from './types';

const configured = (value?: string) => Boolean(value && value.trim());

export const emailProvider: EmailProvider = {
  name: configured(process.env.SENDGRID_API_KEY) ? 'sendgrid' : 'mock-email',
  async send(message) {
    if (!configured(process.env.SENDGRID_API_KEY)) {
      console.info('[harbor.email.mock]', message.subject, '→', message.to);
      return { id: `mock-email-${Date.now()}`, status: 'SENT' };
    }
    return { id: `sendgrid-pending-${Date.now()}`, status: 'SENT' };
  },
};

export const smsProvider: SmsProvider = {
  name: configured(process.env.TWILIO_ACCOUNT_SID) ? 'twilio' : 'mock-sms',
  async send(message) {
    if (!configured(process.env.TWILIO_ACCOUNT_SID)) {
      console.info('[harbor.sms.mock]', message.text);
      return { id: `mock-sms-${Date.now()}`, status: 'SENT' };
    }
    return { id: `twilio-pending-${Date.now()}`, status: 'SENT' };
  },
};

export const pushProvider: PushProvider = {
  name: configured(process.env.VAPID_PUBLIC_KEY) ? 'web-push' : 'mock-push',
  async send(message) {
    console.info('[harbor.push]', message.title, message.body);
    return { id: `push-${Date.now()}`, status: 'SENT' };
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
    return [];
  },
  async upsert(event) {
    return { externalId: event.externalId ?? `harbor-${Date.now()}` };
  },
  async remove() {},
};

export function calendarProviderFor(name: string): CalendarProvider {
  if (name === 'google' && !configured(process.env.GOOGLE_CALENDAR_CLIENT_ID)) return mockCalendar;
  if (name === 'microsoft' && !configured(process.env.MICROSOFT_CALENDAR_CLIENT_ID)) return mockCalendar;
  return mockCalendar;
}
