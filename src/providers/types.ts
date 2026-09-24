/** `from` overrides the configured sender address for this message only. */
export type EmailMessage = { to: string; subject: string; text: string; html?: string; from?: string };
export type SmsMessage = { to: string; text: string };
export type PushMessage = { userId: string; title: string; body: string; url?: string };
export type CalendarWrite = {
  title: string;
  startAt: Date;
  endAt: Date;
  notes?: string;
  externalId?: string;
  allDay?: boolean;
  location?: string;
  deleted?: boolean;
};

/** providerStatus: the provider's HTTP status on rejection. errorCode: a short machine code, never a response body. */
export type EmailSendResult = { id: string; status: 'SENT' | 'FAILED'; reason?: string; providerStatus?: number; errorCode?: string };
export interface EmailProvider {
  name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export interface SmsProvider {
  name: string;
  send(message: SmsMessage): Promise<{ id: string; status: 'SENT' | 'FAILED'; reason?: string }>;
}

export interface PushProvider {
  name: string;
  send(message: PushMessage): Promise<{ id: string; status: 'SENT' | 'FAILED'; reason?: string }>;
}

export interface CalendarProvider {
  name: string;
  list(from: Date, to: Date, syncToken?: string | null): Promise<{ events: CalendarWrite[]; syncToken?: string }>;
  upsert(event: CalendarWrite): Promise<{ externalId: string }>;
  remove(externalId: string): Promise<void>;
}

export interface SpeechProvider {
  name: string;
  transcribe?(audio: Buffer): Promise<{ text: string; confidence: number }>;
  synthesize?(text: string): Promise<{ audioUrl?: string; useBrowserTts: boolean }>;
}

export interface LanguageModel {
  name: string;
  complete(prompt: string): Promise<string>;
}
