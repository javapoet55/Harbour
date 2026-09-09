import type { CalendarConnection } from '@/generated/prisma';
import type { CalendarProvider, CalendarWrite } from './types';
import { decryptCredential, encryptCredential } from '@/lib/credentials';
import { prisma } from '@/server/db';
import { zonedDateTime } from '@/lib/time';

export type OAuthProvider = 'google' | 'microsoft';
type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
type GoogleEvent = { id?: string; summary?: string; description?: string; location?: string; status?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } };
type MicrosoftEvent = { id?: string; subject?: string; bodyPreview?: string; isAllDay?: boolean; isCancelled?: boolean; '@removed'?: unknown; start?: { dateTime?: string }; end?: { dateTime?: string }; location?: { displayName?: string } };

const GOOGLE_SCOPE = 'openid email https://www.googleapis.com/auth/calendar';
const MICROSOFT_SCOPE = 'openid email offline_access User.Read Calendars.ReadWrite';

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function oauthConfig(provider: OAuthProvider) {
  if (provider === 'google') return {
    clientId: required('GOOGLE_CALENDAR_CLIENT_ID'),
    clientSecret: required('GOOGLE_CALENDAR_CLIENT_SECRET'),
    redirectUri: required('GOOGLE_CALENDAR_REDIRECT_URI'),
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: GOOGLE_SCOPE,
  };
  return {
    clientId: required('MICROSOFT_CALENDAR_CLIENT_ID'),
    clientSecret: required('MICROSOFT_CALENDAR_CLIENT_SECRET'),
    redirectUri: required('MICROSOFT_CALENDAR_REDIRECT_URI'),
    authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: MICROSOFT_SCOPE,
  };
}

export function oauthAuthorizationUrl(provider: OAuthProvider, state: string) {
  const cfg = oauthConfig(provider);
  const url = new URL(cfg.authorize);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', cfg.scope);
  url.searchParams.set('state', state);
  if (provider === 'google') {
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
  } else url.searchParams.set('response_mode', 'query');
  return url.toString();
}

async function tokenRequest(provider: OAuthProvider, params: Record<string, string>) {
  const cfg = oauthConfig(provider);
  const response = await fetch(cfg.token, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, scope: cfg.scope, ...params }),
  });
  const payload = await response.json() as TokenResponse;
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || 'OAuth token exchange failed');
  return payload;
}

export async function connectCalendar(provider: OAuthProvider, userId: string, code: string) {
  const tokens = await tokenRequest(provider, { grant_type: 'authorization_code', code });
  const headers = { Authorization: `Bearer ${tokens.access_token}` };
  let accountEmail = '';
  let calendarId = 'primary';
  let calendarName = 'Primary';
  if (provider === 'google') {
    const [profileRes, calendarRes] = await Promise.all([
      fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers }),
      fetch('https://www.googleapis.com/calendar/v3/calendars/primary', { headers }),
    ]);
    if (!profileRes.ok || !calendarRes.ok) throw new Error('Unable to read Google account calendar');
    const profile = await profileRes.json() as { email?: string };
    const calendar = await calendarRes.json() as { id?: string; summary?: string };
    accountEmail = profile.email || calendar.id || '';
    calendarId = calendar.id || 'primary';
    calendarName = calendar.summary || 'Google Calendar';
  } else {
    const [profileRes, calendarRes] = await Promise.all([
      fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', { headers }),
      fetch('https://graph.microsoft.com/v1.0/me/calendar', { headers }),
    ]);
    if (!profileRes.ok || !calendarRes.ok) throw new Error('Unable to read Microsoft account calendar');
    const profile = await profileRes.json() as { mail?: string; userPrincipalName?: string };
    const calendar = await calendarRes.json() as { id?: string; name?: string };
    accountEmail = profile.mail || profile.userPrincipalName || '';
    calendarId = calendar.id || 'primary';
    calendarName = calendar.name || 'Outlook Calendar';
  }
  return prisma.calendarConnection.upsert({
    where: { userId_provider_calendarId: { userId, provider, calendarId } },
    update: {
      accountEmail, calendarName, status: 'connected', syncToken: null,
      accessToken: encryptCredential(tokens.access_token),
      refreshToken: encryptCredential(tokens.refresh_token),
      tokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
    },
    create: {
      userId, provider, accountEmail, calendarId, calendarName, visible: true, writeEnabled: true,
      accessToken: encryptCredential(tokens.access_token), refreshToken: encryptCredential(tokens.refresh_token),
      tokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
    },
  });
}

async function accessToken(connection: CalendarConnection) {
  const current = decryptCredential(connection.accessToken);
  if (current && connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() > Date.now() + 60_000) return current;
  const refresh = decryptCredential(connection.refreshToken);
  if (!refresh) throw new Error('Calendar authorization expired; reconnect the account');
  const tokens = await tokenRequest(connection.provider as OAuthProvider, { grant_type: 'refresh_token', refresh_token: refresh });
  await prisma.calendarConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: encryptCredential(tokens.access_token),
      refreshToken: encryptCredential(tokens.refresh_token || refresh),
      tokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000), status: 'connected',
    },
  });
  return tokens.access_token;
}

async function api(url: string, token: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  if (!response.ok) {
    const error = new Error(`Calendar provider returned ${response.status}`);
    Object.assign(error, { status: response.status });
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

function googleProvider(connection: CalendarConnection, token: string, fallbackTimeZone: string): CalendarProvider {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendarId)}/events`;
  return {
    name: 'google',
    async list(from, to, syncToken) {
      const url = new URL(base);
      url.searchParams.set('singleEvents', 'true'); url.searchParams.set('showDeleted', 'true');
      if (syncToken) url.searchParams.set('syncToken', syncToken);
      else {
        url.searchParams.set('timeMin', from.toISOString()); url.searchParams.set('timeMax', to.toISOString());
      }
      const events: CalendarWrite[] = [];
      let nextSyncToken = syncToken || undefined;
      while (url) {
        const page = await api(url.toString(), token) as { items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string; timeZone?: string };
        for (const item of page.items || []) {
          const start = item.start?.date ? zonedDateTime(item.start.date, '00:00', page.timeZone || fallbackTimeZone) : new Date(item.start?.dateTime || 0);
          const end = item.end?.date ? zonedDateTime(item.end.date, '00:00', page.timeZone || fallbackTimeZone) : new Date(item.end?.dateTime || 0);
          events.push({ externalId: item.id, title: item.summary || '(Untitled)', notes: item.description || '', startAt: new Date(start), endAt: new Date(end), allDay: Boolean(item.start?.date), location: item.location || '', deleted: item.status === 'cancelled' });
        }
        nextSyncToken = page.nextSyncToken || nextSyncToken;
        if (!page.nextPageToken) break;
        url.searchParams.set('pageToken', page.nextPageToken);
      }
      return { events, syncToken: nextSyncToken };
    },
    async upsert(event) {
      const body = JSON.stringify({ summary: event.title, description: event.notes, location: event.location, start: { dateTime: event.startAt.toISOString() }, end: { dateTime: event.endAt.toISOString() } });
      const result = event.externalId
        ? await api(`${base}/${encodeURIComponent(event.externalId)}`, token, { method: 'PATCH', body })
        : await api(base, token, { method: 'POST', body });
      return { externalId: (result as { id: string }).id };
    },
    async remove(id) { await api(`${base}/${encodeURIComponent(id)}`, token, { method: 'DELETE' }); },
  };
}

function microsoftProvider(connection: CalendarConnection, token: string): CalendarProvider {
  const eventsBase = `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(connection.calendarId)}/events`;
  return {
    name: 'microsoft',
    async list(from, to, syncToken) {
      let url = syncToken || `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(connection.calendarId)}/calendarView/delta?startDateTime=${encodeURIComponent(from.toISOString())}&endDateTime=${encodeURIComponent(to.toISOString())}`;
      const events: CalendarWrite[] = [];
      let delta = syncToken || undefined;
      while (url) {
        const page = await api(url, token, { headers: { Prefer: 'outlook.timezone="UTC"' } }) as { value?: MicrosoftEvent[]; '@odata.nextLink'?: string; '@odata.deltaLink'?: string };
        for (const item of page.value || []) {
          const removed = Boolean(item['@removed']);
          const utc = (value?: string) => new Date(value ? (value.endsWith('Z') ? value : `${value}Z`) : from);
          events.push({ externalId: item.id, title: item.subject || '(Untitled)', notes: item.bodyPreview || '', startAt: utc(item.start?.dateTime), endAt: utc(item.end?.dateTime), allDay: Boolean(item.isAllDay), location: item.location?.displayName || '', deleted: removed || item.isCancelled });
        }
        url = page['@odata.nextLink'] || '';
        delta = page['@odata.deltaLink'] || delta;
      }
      return { events, syncToken: delta };
    },
    async upsert(event) {
      const body = JSON.stringify({ subject: event.title, body: { contentType: 'text', content: event.notes || '' }, start: { dateTime: event.startAt.toISOString().replace(/Z$/, ''), timeZone: 'UTC' }, end: { dateTime: event.endAt.toISOString().replace(/Z$/, ''), timeZone: 'UTC' }, location: { displayName: event.location || '' } });
      const result = event.externalId
        ? await api(`${eventsBase}/${encodeURIComponent(event.externalId)}`, token, { method: 'PATCH', body })
        : await api(eventsBase, token, { method: 'POST', body });
      return { externalId: (result as { id: string }).id };
    },
    async remove(id) { await api(`${eventsBase}/${encodeURIComponent(id)}`, token, { method: 'DELETE' }); },
  };
}

export async function calendarProviderFor(connection: CalendarConnection) {
  if (connection.provider === 'mock' && process.env.NODE_ENV === 'production') throw new Error('Mock calendars are disabled in production');
  if (connection.provider === 'mock') return {
    name: 'mock',
    async list() { return { events: [], syncToken: `mock-${Date.now()}` }; },
    async upsert(event: CalendarWrite) { return { externalId: event.externalId || `mock-${Date.now()}` }; },
    async remove() {},
  } satisfies CalendarProvider;
  const token = await accessToken(connection);
  if (connection.provider === 'google') {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: connection.userId }, select: { timeZone: true } });
    return googleProvider(connection, token, user.timeZone);
  }
  if (connection.provider === 'microsoft') return microsoftProvider(connection, token);
  throw new Error(`Unsupported calendar provider: ${connection.provider}`);
}
