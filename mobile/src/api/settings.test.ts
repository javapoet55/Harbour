import type { ProfileSettingsInput } from './types';
import { createApiClient } from './client';
import { endpoints } from './index';

/**
 * The wire shape of the account calls, pinned against the three authorities they must agree with:
 *
 * - `settingsSchema` (src/app/api/settings/route.ts:34-42) — one PATCH for name, timeZone, photo,
 *   `preference` and `nextAction`, every key optional.
 * - `src/app/api/account/route.ts:8` — DELETE, no body.
 * - `AppModel.saveProfileSettings` / `synchronizeDeviceTimeZone` / `saveProfilePhoto` /
 *   `syncProfileCalendars` / `deleteAccount` (ios/App/NexdoApp.swift:225-295, 739-744).
 */

const ORIGIN = 'https://api.example.com';

function clientFor(body: string) {
  const doFetch = jest.fn(async () => ({
    status: 200,
    redirected: false,
    url: '',
    type: 'basic',
    headers: { get: () => null },
    text: async () => body,
  })) as unknown as jest.Mock & typeof globalThis.fetch;
  return { fetch: doFetch, api: createApiClient({ baseUrl: ORIGIN, fetch: doFetch }) };
}

function sentRequest(fetch: jest.Mock) {
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
  return { url, init, body: init.body === undefined ? undefined : (JSON.parse(String(init.body)) as Record<string, unknown>) };
}

const INPUT: ProfileSettingsInput = {
  name: 'Ada Lovelace',
  timeZone: 'Asia/Kolkata',
  preference: {
    workStart: '09:00',
    workEnd: '17:00',
    quietStart: '21:00',
    quietEnd: '07:00',
    confirmationLevel: 'CHANGES_AND_DELETES',
    voiceEnabled: true,
    personalizationEnabled: false,
    pushEnabled: true,
    emailEnabled: true,
    smsEnabled: false,
    morningSummary: true,
    eveningSummary: true,
    phoneNumber: null,
  },
  nextAction: { enabled: true, switchingThreshold: 25 },
};

it('PATCHes the whole settings form to /api/settings in one request', async () => {
  const { fetch, api } = clientFor(JSON.stringify({ ok: true }));

  await endpoints.updateSettings(INPUT, api);

  const { url, init, body } = sentRequest(fetch);
  expect(url).toBe(`${ORIGIN}/api/settings`);
  expect(init.method).toBe('PATCH');
  expect(init.credentials).toBe('include');
  expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  // Exactly the four top-level keys the schema names — no photo key on a settings save.
  expect(Object.keys(body ?? {}).sort()).toEqual(['name', 'nextAction', 'preference', 'timeZone']);
  expect(body).toEqual(INPUT as unknown as Record<string, unknown>);
});

/** `synchronizeDeviceTimeZone()` sends the zone ALONE (NexdoApp.swift:229). */
it('PATCHes only { timeZone } for a time-zone sync', async () => {
  const { fetch, api } = clientFor(JSON.stringify({ ok: true }));

  await endpoints.updateSettings({ timeZone: 'Europe/London' }, api);

  const { url, body } = sentRequest(fetch);
  expect(url).toBe(`${ORIGIN}/api/settings`);
  expect(body).toEqual({ timeZone: 'Europe/London' });
});

/**
 * The photo is a data-URL STRING on the same PATCH — not multipart, not a separate upload route.
 * `saveProfilePhoto` builds `["photo": photo ?? NSNull()]` (NexdoApp.swift:255).
 */
it('PATCHes { photo } as a base64 data URL, and null to remove it', async () => {
  const saved = 'data:image/jpeg;base64,YWJj';

  const first = clientFor(JSON.stringify({ ok: true, profile: { id: 'u1', photo: saved } }));
  const receipt = await endpoints.updatePhoto(saved, first.api);
  const sent = sentRequest(first.fetch);
  expect(sent.url).toBe(`${ORIGIN}/api/settings`);
  expect(sent.init.method).toBe('PATCH');
  expect(sent.init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  expect(sent.body).toEqual({ photo: saved });
  expect(receipt.profile).toEqual({ id: 'u1', photo: saved });

  const second = clientFor(JSON.stringify({ ok: true, profile: { id: 'u1', photo: null } }));
  await endpoints.updatePhoto(null, second.api);
  expect(sentRequest(second.fetch).body).toEqual({ photo: null });
});

it('POSTs /api/calendar/sync with no body', async () => {
  const { fetch, api } = clientFor(JSON.stringify({ results: [] }));

  await endpoints.syncCalendars(api);

  const { url, init, body } = sentRequest(fetch);
  expect(url).toBe(`${ORIGIN}/api/calendar/sync`);
  expect(init.method).toBe('POST');
  expect(body).toBeUndefined();
});

it('DELETEs /api/account with no body', async () => {
  const { fetch, api } = clientFor(JSON.stringify({ ok: true }));

  await endpoints.deleteAccount(api);

  const { url, init, body } = sentRequest(fetch);
  expect(url).toBe(`${ORIGIN}/api/account`);
  expect(init.method).toBe('DELETE');
  expect(body).toBeUndefined();
});
