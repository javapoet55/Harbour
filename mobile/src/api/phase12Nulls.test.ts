import { createApiClient, type ApiClient } from './client';
import { endpoints } from './index';
import { calendarEventApi } from './calendarEvent';
import { bugReportApi, feedbackApi } from './feedback';
import { followUpApi, followUpScheduleBody } from './followUp';
import { nutritionApi } from './nutrition';
import { pomodoroApi } from './pomodoro';
import { shoppingEmailApi, shoppingOffersApi, shoppingStoresApi } from './shopping';
import { bugSubmission, includeScreenshot, newBugDraft, type BugDiagnostics } from '../features/bugReport/model';
import { validateSettings } from '../lib/profileSettings';
import { toggleWorkingDay } from '../features/tasks/workingDays';
import { createMomentConnectModel, type ConnectOperation } from '../features/moments/connectCall';
import type { PomodoroSession } from '../features/pomodoro/model';

/**
 * Every Phase 12 write, audited for the bug api/taskAgent.test.ts covers: a null sent where the
 * server's zod field is `.optional()` without `.nullable()`. zod accepts a MISSING key there and
 * rejects an explicit null with a 400, and Swift's `Codable` omits a nil field — so iOS never sends
 * one and only the RN client can.
 *
 * Each endpoint below declares the null paths its body is allowed to carry, with the server schema
 * that makes each one safe. An empty list means the body must carry no null at all. A new null, or a
 * server field that stops being nullable, fails here.
 */

jest.mock('./index', () => ({ ...jest.requireActual('./index'), getApi: () => mockClient }));

// `mock`-prefixed so babel-plugin-jest-hoist allows the factory above to close over it.
let mockClient: ApiClient;
let lastBody: unknown;

beforeEach(() => {
  lastBody = undefined;
  const doFetch = (async (_url: string, init: { body?: string }) => {
    lastBody = init.body === undefined ? undefined : JSON.parse(init.body);
    return { status: 200, redirected: false, url: '', type: 'basic', headers: { get: () => null }, text: async () => '{}' };
  }) as unknown as typeof globalThis.fetch;
  mockClient = createApiClient({ baseUrl: 'https://api.example.com', fetch: doFetch });
});

/** Every path whose value is null, at any depth, as `a.b[0].c`. */
function nullPaths(value: unknown, path = ''): string[] {
  if (value === null) return [path];
  if (Array.isArray(value)) return value.flatMap((item, index) => nullPaths(item, `${path}[${index}]`));
  if (typeof value === 'object' && value !== undefined) return Object.entries(value as object).flatMap(([key, item]) => nullPaths(item, path ? `${path}.${key}` : key));
  return [];
}

async function nullsIn(send: (client: ApiClient) => Promise<unknown>): Promise<string[]> {
  await send(mockClient);
  return nullPaths(lastBody);
}

/** A stopped session, the shape `PomodoroStore` saves with every optional timestamp unset. */
const session: PomodoroSession = {
  id: '11111111-1111-4111-8111-111111111111',
  category: 'focus',
  name: '',
  durationMinutes: 25,
  autoBreak: true,
  playSound: true,
  keepAwake: true,
  phase: 'stopped',
  paused: false,
  deadline: null,
  pausedRemaining: null,
  focusSeconds: 300,
  breakSeconds: 0,
  startedAt: 1_700_000_000,
  updatedAt: 1_700_000_300,
  finishedAt: 1_700_000_300,
  revision: 2,
};

describe('nothing Phase 12 writes sends a null into a bare zod .optional()', () => {
  it('PUT /api/pomodoro: the session is sent whole, and its three unset timestamps are `.nullish()`', async () => {
    // src/server/pomodoro/sessions.ts:11-13 — `timestamp.nullish()` on each, so null is accepted.
    const nulls = await nullsIn((client) => pomodoroApi.save('u1', { ...session, deadline: null, pausedRemaining: null }, client));
    expect(nulls.sort()).toEqual(['session.deadline', 'session.pausedRemaining']);
  });

  it('POST /api/shopping/offers: `offerId` is null to clear a choice, and the server field is `.nullable()`', async () => {
    // src/app/api/shopping/offers/route.ts:9 — `offerId: z.string().nullable()`. Clearing a choice
    // REQUIRES the null; omitting it would not mean the same thing.
    expect(await nullsIn((client) => shoppingOffersApi.choose({ listId: 'l1', itemId: 'i1', offerId: null, revision: 3 }, client))).toEqual(['offerId']);
    expect(await nullsIn((client) => shoppingOffersApi.choose({ listId: 'l1', itemId: 'i1', offerId: 'o1', revision: 3 }, client))).toEqual([]);
  });

  // src/server/nutrition/settings.ts:39-47 and log.ts:48-80: every field bare `.optional()`.
  it.each([
    ['saveSettings', (client: ApiClient) => nutritionApi.saveSettings({ enabled: true, localTime: '09:00', goals: { Protein: 60 } }, client)],
    ['saveSettings (pause only)', (client: ApiClient) => nutritionApi.saveSettings({ enabled: false }, client)],
    ['sendCode', (client: ApiClient) => nutritionApi.sendCode('+15550000000', client)],
    ['verifyCode', (client: ApiClient) => nutritionApi.verifyCode('123456', client)],
    ['addEntry', (client: ApiClient) => nutritionApi.addEntry({ date: '2026-10-06', meal: 'LUNCH', description: 'Rice', kcal: 200 }, client)],
    ['updateEntry (confirm)', (client: ApiClient) => nutritionApi.updateEntry('e1', { confirm: true }, client)],
    ['updateEntry (edit)', (client: ApiClient) => nutritionApi.updateEntry('e1', { meal: 'DINNER', description: 'Dal', kcal: 300 }, client)],
    ['actOnInsight', (client: ApiClient) => nutritionApi.actOnInsight({ date: '2026-10-06', key: 'k', action: 'add' }, client)],
  ])('nutrition %s sends no null', async (_name, send) => {
    expect(await nullsIn(send)).toEqual([]);
  });

  // src/app/api/calendar/events/[id]/route.ts:10 — bare `.optional()` AND `.strict()`.
  it.each([
    ['setCompleted', (client: ApiClient) => calendarEventApi.setCompleted('e1', true, client)],
    ['update', (client: ApiClient) => calendarEventApi.update('e1', { title: 'T', notes: '', location: '' }, client)],
    ['update (retimed)', (client: ApiClient) => calendarEventApi.update('e1', { title: 'T', notes: '', location: '', startAt: '2026-10-07T17:00:00Z', endAt: '2026-10-07T18:00:00Z' }, client)],
  ])('calendar event %s sends no null', async (_name, send) => {
    expect(await nullsIn(send)).toEqual([]);
  });

  // src/server/shopping/stores.ts:5-12 — `area`, `zip`, `latitude`, `longitude` bare `.optional()`.
  it.each([
    ['search by area', (client: ApiClient) => shoppingStoresApi.search({ name: 'Safeway', area: 'Danville' }, client)],
    ['search by coordinates', (client: ApiClient) => shoppingStoresApi.search({ name: 'Safeway', latitude: 37.82, longitude: -121.99 }, client)],
    ['recognize', (client: ApiClient) => shoppingStoresApi.recognize('AAAA', client)],
    ['recommendations', (client: ApiClient) => shoppingStoresApi.recommendations({ prompt: 'p', listName: 'Groceries', itemNames: [] }, client)],
  ])('shopping stores %s sends no null', async (_name, send) => {
    expect(await nullsIn(send)).toEqual([]);
  });

  // src/server/shopping/email-domain.ts:3-13. `pickupDate` and `pickupStartHour` are `.nullable()
  // .optional()` there, but the screen holds both as plain numbers, so neither is ever null anyway.
  it.each([
    ['save', () => shoppingEmailApi.save('l1', { customerPhone: '+15550000000', recipient: 'store@example.com', recipientName: 'Safeway', timeZone: 'America/Los_Angeles', weekday: 2, hour: 10, minute: 0, consent: true, pickupDate: '2026-10-08', pickupStartHour: 9 })],
    ['save without a pickup', () => shoppingEmailApi.save('l1', { customerPhone: '+15550000000', recipient: 'store@example.com', recipientName: 'Safeway', timeZone: 'America/Los_Angeles', weekday: 2, hour: 10, minute: 0, consent: true })],
    ['pause', () => shoppingEmailApi.pause('l1')],
    ['connect', () => shoppingEmailApi.connect('l1')],
    ['confirmGmail', () => shoppingEmailApi.confirmGmail('tk')],
  ])('shopping email %s sends no null', async (_name, send) => {
    expect(await nullsIn(send)).toEqual([]);
  });

  it('POST /api/feedback sends no null', async () => {
    expect(await nullsIn((client) => feedbackApi.submit({ id: 'f1', title: 't', description: 'd', stars: 5 }, client))).toEqual([]);
  });

  // Phase 13 — src/server/follow-up.ts:4-10: every preparation field is required and none nullable,
  // so a preparation is always sent whole and a null anywhere is a 400.
  it.each([
    ['save', (client: ApiClient) => followUpApi.save('t1', { revision: 0, preparation: { company: 'Acme', purpose: 'Claim', phone: '', email: '', notes: '', draft: 'd', checklist: [{ id: 'c1', title: 'Ready', done: false }], outcomes: [{ id: 'o1', date: '2026-10-09T16:00:00Z', result: 'noAnswer', notes: '' }] } }, client)],
    ['schedule', (client: ApiClient) => followUpApi.schedule('t1', followUpScheduleBody(Date.parse('2026-10-10T16:00:00Z'), 15), client)],
  ])('follow-up %s sends no null', async (_name, send) => {
    expect(await nullsIn(send)).toEqual([]);
  });

  // src/server/feedback/bugs.ts:11-21 — `.strict()`, and `screenshot` a bare `.optional()`: a report
  // without a screenshot must omit the key.
  it.each([false, true])('POST /api/feedback/bugs sends no null (screenshot: %s)', async (withScreenshot) => {
    const metadata: BugDiagnostics = { appVersion: '1', buildNumber: '1', deviceModel: 'Pixel 8', iosVersion: '14', screen: 'app', timestamp: '2026-10-10T12:00:00Z', correlationID: '22222222-2222-4222-8222-222222222222' };
    const draft = { ...newBugDraft(() => '11111111-1111-4111-8111-111111111111'), description: 'Broken' };
    const { input } = bugSubmission(withScreenshot ? includeScreenshot(draft, 'AQI=') : draft, metadata)!;
    expect(await nullsIn((client) => bugReportApi.submit(input, client))).toEqual([]);
  });

  // d568989 — src/app/api/settings/route.ts:28-36: `workingDays` is a bare string in a `.partial()`
  // object, so it may be omitted but not null; `phoneNumber` is the one nullable preference.
  it('PATCH /api/settings carries workingDays without a null, and only phoneNumber may be null', async () => {
    const preferences = { workingDays: toggleWorkingDay('1,2,3,4,5', 6, true), workStart: '09:00', workEnd: '17:00', quietStart: '21:00', quietEnd: '07:00', confirmationLevel: 'ALWAYS', voiceEnabled: true, personalizationEnabled: true, pushEnabled: true, emailEnabled: true, smsEnabled: false, morningSummary: true, eveningSummary: false, phoneNumber: '' };
    const result = validateSettings({ name: 'Ada', preferences, nextAction: { enabled: true, switchingThreshold: 10 }, deviceTimeZone: 'America/Los_Angeles' });
    if (!result.ok) throw new Error(result.failure);
    expect(await nullsIn((client) => endpoints.updateSettings(result.input, client))).toEqual(['preference.phoneNumber']);
    expect((lastBody as { preference: { workingDays: string } }).preference.workingDays).toBe('1,2,3,4,5,6');
  });

  /**
   * The connect-call operations go out as `{ operation, input }` through the moments store, so the
   * audit is on the `input` each one builds. `connectInput` (src/server/moment-calls/service.ts:65)
   * is `.strict()` with `time` and `timeZone` bare `.optional()`, and that route answers a malformed
   * input 500 "Request failed." rather than mapping the zod error — a null there would be silent.
   */
  it('the moment connect calls send no null', async () => {
    const inputs: unknown[] = [];
    const request = async <R,>(_operation: ConnectOperation, input: unknown): Promise<R> => {
      inputs.push(input);
      throw new Error('stop'); // The bodies are the subject; the answers are not.
    };
    const model = createMomentConnectModel({ request }, ['m1']);
    model.getState().setDraft('m1', { enabled: true, time: '09:30', timeZone: 'America/Los_Angeles' });
    await model.getState().load();
    await model.getState().refreshPreview('m1');
    await model.getState().save('m1');
    await model.getState().connectNow('m1');
    await model.getState().startVerification('+15550000000');
    await model.getState().pollVerification();
    await model.getState().removeNumber();

    expect(inputs.length).toBeGreaterThanOrEqual(7);
    expect(inputs.flatMap((input) => nullPaths(input))).toEqual([]);
  });
});
